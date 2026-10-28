// Lying signs: the text detector. worker.js (PP-OCRv4 on onnxruntime-web) runs in a blob
// worker, with its files fetched from ggs.extBase, and tiles wait in a queue that runs the
// one nearest the view first. Shared on ggs.lyingSigns as loadDetector and detect.
(() => {
  const ggs = globalThis.__ggs;
  const ls = ggs.lyingSigns;
  const stats = ls.stats;
  // Detector input size. 512-px tiles are upscaled so small text is found.
  const DET_SIZE = 768;
  const VENDOR = 'src/scripts/lying-signs/vendor/';

  // ---- worker ----
  let worker = null;
  let workerReady = null;
  let nextId = 0;
  const waiting = new Map(); // id -> resolve

  function loadDetector() {
    if (workerReady) return workerReady;
    workerReady = startWorker();
    workerReady.catch(err => {
      ggs.log('lying-signs: text detector failed to load', err);
      // Close the half-started worker so a retry doesn't leave it running.
      worker?.terminate();
      worker = null;
      workerReady = null;
    });
    return workerReady;
  }
  async function startWorker() {
    if (!ggs.extBase) throw new Error('extension base URL not known yet');
    const files = await fetchFiles();
    worker = new Worker(URL.createObjectURL(new Blob([files.src], { type: 'text/javascript' })));
    worker.onmessage = onResult;
    const backend = await initWorker(files);
    stats.backend = backend;
    ggs.debug(`lying-signs: text detector ready (${backend})`);
  }
  // The worker's source, and the runtime as blob URLs (a page can't hand a worker
  // chrome-extension:// URLs), and the model.
  async function fetchFiles() {
    const u = f => ggs.extBase + VENDOR + f;
    const blobUrl = async (url, type) => {
      const bytes = await (await fetch(url)).arrayBuffer();
      return URL.createObjectURL(new Blob([bytes], { type }));
    };
    const [src, ort, mjs, wasm, model] = await Promise.all([
      fetch(`${ggs.extBase}src/scripts/lying-signs/worker.js`).then(r => r.text()),
      blobUrl(u('ort.webgpu.min.js'), 'text/javascript'),
      blobUrl(u('ort-wasm-simd-threaded.asyncify.mjs'), 'text/javascript'),
      blobUrl(u('ort-wasm-simd-threaded.asyncify.wasm'), 'application/wasm'),
      fetch(u('ch_PP-OCRv4_det.onnx')).then(r => r.arrayBuffer()),
    ]);
    return { src, ort, mjs, wasm, model };
  }
  // Sends the files to the worker; resolves with the backend it got (webgpu or wasm).
  function initWorker({ ort, mjs, wasm, model }) {
    return new Promise((res, rej) => {
      const onmsg = e => {
        if (e.data.type === 'ready') {
          worker.removeEventListener('message', onmsg);
          res(e.data.backend);
        } else if (e.data.type === 'error') {
          rej(new Error(e.data.message));
        }
      };
      worker.addEventListener('message', onmsg);
      worker.postMessage({ type: 'init', ort, mjs, wasm, model }, [model]);
    });
  }
  function onResult(e) {
    const m = e.data;
    if (m.type === 'boxes') {
      stats.detected++;
      stats.detectMs += m.ms;
      settle(m.id, m.boxes);
    } else if (m.type === 'error') {
      stats.failed++;
      ggs.log('lying-signs: detector error', m.message);
      settle(m.id, null);
    }
  }
  function settle(id, boxes) {
    waiting.get(id)?.(boxes);
    waiting.delete(id);
  }
  async function runDetector(img) {
    const bitmap = await createImageBitmap(img);
    return new Promise(r => {
      const id = ++nextId;
      waiting.set(id, r);
      const msg = { type: 'detect', id, bitmap, size: DET_SIZE, thresh: 0.25, boxThresh: 0.45 };
      worker.postMessage(msg, [bitmap]);
    });
  }

  // ---- queue ----
  // Nearest tile to the view first. Tiles whose textures are gone, or whose panorama is no
  // longer shown, are dropped unrun. The queue is capped so moving quickly never builds a
  // backlog. A dropped tile is detected if it is uploaded again.
  const queue = []; // [{ img, res, alive, url }]
  let inflight = 0;
  const MAX_INFLIGHT = 2;
  const MAX_QUEUE = 300;

  // Resolves with the tile's boxes, or null if it was dropped or detection failed.
  function detect(img, alive, url) {
    return new Promise(res => {
      queue.push({ img, res, alive, url });
      while (queue.length > MAX_QUEUE) drop(queue.shift());
      pump();
    });
  }
  function drop(job) {
    stats.skipped = (stats.skipped || 0) + 1;
    job.res(null);
  }
  async function pump() {
    if (inflight >= MAX_INFLIGHT || !queue.length) return;
    inflight++;
    try {
      await loadDetector();
      const job = pickJob();
      // another pump may have taken the last job while the detector loaded
      if (!job) return;
      if (!job.alive()) {
        drop(job);
        return;
      }
      job.res(await runDetector(job.img));
    } catch {
      stats.failed++;
      for (const j of queue.splice(0)) j.res(null);
    } finally {
      inflight--;
      if (queue.length) pump();
    }
  }
  function pickJob() {
    let best = queue.length - 1;
    let bestD = Infinity;
    for (let i = queue.length - 1; i >= 0; i--) {
      const d = tileDistance(queue[i].url);
      if (d === null) break; // no view info: newest first
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return queue.splice(best, 1)[0];
  }

  // ---- which way you're looking, for the queue order ----
  const panos = new Set();
  ggs.maps.hook('StreetViewPanorama', p => {
    panos.add(p);
    try {
      p.addListener('pano_changed', pruneQueue);
    } catch {}
  });
  function pruneQueue() {
    const shown = new Set();
    for (const p of panos) {
      try {
        shown.add(p.getPano());
      } catch {}
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      const id = ggs.tileKey(queue[i].url)?.pano;
      if (id && !shown.has(id)) drop(queue.splice(i, 1)[0]);
    }
  }
  // Degrees between the middle of a tile and the view, or null without view info.
  function tileDistance(url) {
    const k = ggs.tileKey(url);
    if (!k) return null;
    for (const p of panos) {
      const view = viewOf(p, k.pano);
      if (view === undefined) continue;
      if (!view) return null;
      return angleTo(k, view);
    }
    return null;
  }
  // The panorama's view if it shows `id`: { pov, centre }, null without view info, or
  // undefined if it shows another panorama (or can't say).
  function viewOf(p, id) {
    try {
      if (p.getPano() !== id) return undefined;
      const pov = p.getPov();
      const centre = p.getPhotographerPov?.()?.heading;
      return pov && centre != null ? { pov, centre } : null;
    } catch {
      return undefined;
    }
  }
  function angleTo({ x, y, z }, { pov, centre }) {
    const cols = 2 ** z;
    const rows = Math.max(1, 2 ** (z - 1));
    const heading = centre + ((+x + 0.5) / cols - 0.5) * 360;
    const pitch = (0.5 - (+y + 0.5) / rows) * 180;
    const dh = Math.abs(((((heading - pov.heading) % 360) + 540) % 360) - 180);
    return Math.hypot(dh * Math.cos((pov.pitch * Math.PI) / 180), pitch - pov.pitch);
  }

  // queue sizes, for ggs.lyingSigns.debug()
  const queueState = () => ({ queue: queue.length, inflight, waiting: waiting.size });

  Object.assign(ls, { loadDetector, detect, queueState });
})();
