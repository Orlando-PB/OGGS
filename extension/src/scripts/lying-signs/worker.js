// Text detection worker: PP-OCR DBNet on onnxruntime-web (WebGPU, falling back to wasm).
// Runs off the main thread so GeoGuessr stays smooth. main.js starts it as a blob worker,
// since a page can't start one from a chrome-extension:// URL, so every file it needs
// arrives as a blob URL or buffer in the init message.
//
// in:  { type: 'init', ort, mjs, wasm, model }   blob URLs / ArrayBuffer
//      { type: 'detect', id, bitmap, size, thresh, boxThresh }
// out: { type: 'ready', backend } | { type: 'error', message } | { type: 'boxes', id, boxes, ms }
let session = null;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// One message at a time: the WebGPU session can't run concurrently.
let chain = Promise.resolve();
self.onmessage = e => {
  chain = chain.then(() => handle(e.data));
};
async function handle(m) {
  try {
    if (m.type === 'init') {
      importScripts(m.ort);
      ort.env.wasm.wasmPaths = { mjs: m.mjs, wasm: m.wasm };
      ort.env.wasm.numThreads = 1;
      let backend = 'webgpu';
      try {
        session = await ort.InferenceSession.create(m.model, { executionProviders: ['webgpu'] });
      } catch {
        backend = 'wasm';
        session = await ort.InferenceSession.create(m.model, { executionProviders: ['wasm'] });
      }
      postMessage({ type: 'ready', backend });
    } else if (m.type === 'detect') {
      const t0 = performance.now();
      const boxes = await detect(m.bitmap, m.size, m.thresh, m.boxThresh);
      postMessage({ type: 'boxes', id: m.id, boxes, ms: performance.now() - t0 });
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String(err?.stack || err) });
  } finally {
    // a failed detection would otherwise keep the tile's pixels
    m.bitmap?.close();
  }
}

async function detect(bmp, size, thresh, boxThresh) {
  const W = bmp.width;
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size).data;
  const n = size * size;
  const f = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    // BGR, NCHW, ImageNet normalisation
    f[i] = (d[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
    f[n + i] = (d[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    f[2 * n + i] = (d[i * 4] / 255 - MEAN[0]) / STD[0];
  }
  const input = new ort.Tensor('float32', f, [1, 3, size, size]);
  const out = await session.run({ [session.inputNames[0]]: input });
  const prob = out[session.outputNames[0]].data;
  const s = W / size; // tiles are square
  return boxes(prob, size, size, thresh, boxThresh).map(b => ({
    cx: b.cx * s,
    cy: b.cy * s,
    w: b.w * s,
    h: b.h * s,
    angle: b.angle,
    score: b.score,
  }));
}

// DB post-process: binarise the probability map and take each connected blob. For each blob:
// its orientation (the principal axis of its pixels), the tight rectangle in that frame grown
// by DB's "unclip" (the map marks only the shrunken core of each text line), and the mean
// probability as its score.
function boxes(prob, w, h, thresh, boxThresh, unclip = 1.6, minSize = 3) {
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = prob[i] > thresh ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || seen[i]) continue;
    const box = blobBox(flood(i, bin, seen, prob, w, h), w, h, boxThresh, unclip, minSize);
    if (box) out.push(box);
  }
  return out;
}

// The blob of set pixels connected to `start`: its bounds, size, summed probability, the sums
// for its principal axis, and its pixels.
function flood(start, bin, seen, prob, w, h) {
  const b = { x0: w, y0: h, x1: 0, y1: 0, n: 0, sum: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, px: [] };
  const stack = [start];
  seen[start] = 1;
  const visit = j => {
    if (!bin[j] || seen[j]) return;
    seen[j] = 1;
    stack.push(j);
  };
  while (stack.length) {
    const j = stack.pop();
    const x = j % w;
    const y = (j / w) | 0;
    addPixel(b, j, x, y, prob[j]);
    if (x > 0) visit(j - 1);
    if (x < w - 1) visit(j + 1);
    if (y > 0) visit(j - w);
    if (y < h - 1) visit(j + w);
  }
  return b;
}
function addPixel(b, j, x, y, p) {
  b.n++;
  b.sum += p;
  b.px.push(j);
  b.sx += x;
  b.sy += y;
  b.sxx += x * x;
  b.syy += y * y;
  b.sxy += x * y;
  if (x < b.x0) b.x0 = x;
  if (x > b.x1) b.x1 = x;
  if (y < b.y0) b.y0 = y;
  if (y > b.y1) b.y1 = y;
}

// A blob's rotated text box, or null if it is too small, too faint or not shaped like text.
function blobBox(b, w, h, boxThresh, unclip, minSize) {
  const score = b.sum / b.n;
  if (Math.min(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) < minSize || score < boxThresh) return null;
  let angle = principalAxis(b);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const [u0, u1, v0, v1] = extents(b.px, w, ca, sa);
  let rw = u1 - u0 + 1;
  let rh = v1 - v0 + 1;
  const um = (u0 + u1) / 2;
  const vm = (v0 + v1) / 2;
  // A vertical line is turned a quarter so its length lies along the box's width, and marked.
  let vertical = false;
  if (rh > rw * 1.4) {
    vertical = true;
    [rw, rh] = [rh, rw];
    angle += Math.PI / 2;
  }
  const atEdge = b.x0 <= 1 || b.y0 <= 1 || b.x1 >= w - 2 || b.y1 >= h - 2;
  if (!textShaped(rw, rh, b.n, h, atEdge)) return null;
  const dist = (rw * rh * unclip) / (2 * (rw + rh));
  return {
    cx: um * ca - vm * sa,
    cy: um * sa + vm * ca,
    w: rw + 2 * dist,
    h: rh + 2 * dist,
    angle,
    score,
    vertical,
  };
}
function principalAxis(b) {
  const mx = b.sx / b.n;
  const my = b.sy / b.n;
  const cxx = b.sxx / b.n - mx * mx;
  const cyy = b.syy / b.n - my * my;
  const cxy = b.sxy / b.n - mx * my;
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  // keep the long side "horizontal"
  if (angle > Math.PI / 4) return angle - Math.PI / 2;
  if (angle < -Math.PI / 4) return angle + Math.PI / 2;
  return angle;
}
// The pixels' extents along the axis (u) and across it (v): [u0, u1, v0, v1].
function extents(px, w, ca, sa) {
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const j of px) {
    const x = j % w;
    const y = (j / w) | 0;
    const u = x * ca + y * sa;
    const v = -x * sa + y * ca;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  return [u0, u1, v0, v1];
}
// Shape check: a text line is thin (at most about a quarter of the tile), long (a two-letter
// word is about square) and fairly solid. Shirts, railings and clouds fail one of these. A
// blob touching the tile's edge may be a word cut there, so it can be squarer.
function textShaped(rw, rh, n, h, atEdge) {
  if (rh > h * 0.25) return false;
  const minAspect = atEdge ? 0.5 : rh < h * 0.06 ? 1.0 : 1.4;
  if (rw / rh < minAspect) return false;
  return n / (rw * rh) >= 0.3;
}
