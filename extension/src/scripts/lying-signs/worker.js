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
      m.bitmap.close();
      postMessage({ type: 'boxes', id: m.id, boxes, ms: performance.now() - t0 });
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String((err && err.stack) || err) });
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
  const stack = [];
  const px = [];
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || seen[i]) continue;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    let n = 0;
    let sum = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    px.length = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % w;
      const y = (j / w) | 0;
      n++;
      sum += prob[j];
      px.push(j);
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && bin[j - 1] && !seen[j - 1]) {
        seen[j - 1] = 1;
        stack.push(j - 1);
      }
      if (x < w - 1 && bin[j + 1] && !seen[j + 1]) {
        seen[j + 1] = 1;
        stack.push(j + 1);
      }
      if (y > 0 && bin[j - w] && !seen[j - w]) {
        seen[j - w] = 1;
        stack.push(j - w);
      }
      if (y < h - 1 && bin[j + w] && !seen[j + w]) {
        seen[j + w] = 1;
        stack.push(j + w);
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const score = sum / n;
    if (Math.min(bw, bh) < minSize || score < boxThresh) continue;
    // principal axis
    const mx = sx / n;
    const my = sy / n;
    const cxx = sxx / n - mx * mx;
    const cyy = syy / n - my * my;
    const cxy = sxy / n - mx * my;
    let angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    if (angle > Math.PI / 4)
      angle -= Math.PI / 2; // keep the long side "horizontal"
    else if (angle < -Math.PI / 4) angle += Math.PI / 2;
    // extents along that axis
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
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
    let rw = u1 - u0 + 1;
    let rh = v1 - v0 + 1;
    // Shape check: a text line is thin (at most about a quarter of the tile), long (a
    // two-letter word is about square) and fairly solid. Shirts, railings and clouds fail one
    // of these. A vertical line is turned a quarter so its length lies along the box's width,
    // and marked. A blob touching the tile's edge may be a word cut there, so it can be squarer.
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    const atEdge = x0 <= 1 || y0 <= 1 || x1 >= w - 2 || y1 >= h - 2;
    let vertical = false;
    if (rh > rw * 1.4) {
      vertical = true;
      [rw, rh] = [rh, rw];
      angle += Math.PI / 2;
    }
    if (rh > h * 0.25) continue;
    if (rw / rh < (atEdge ? 0.5 : rh < h * 0.06 ? 1.0 : 1.4)) continue;
    if (n / (rw * rh) < 0.3) continue;
    const dist = (rw * rh * unclip) / (2 * (rw + rh));
    out.push({
      cx: um * ca - vm * sa,
      cy: um * sa + vm * ca,
      w: rw + 2 * dist,
      h: rh + 2 * dist,
      angle,
      score,
      vertical,
    });
  }
  return out;
}
