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
  // Blob URLs handed to the worker, freed once it has loaded them or failed.
  let urls = [];
  // A failed load is tried again after RETRY_MS, at most LOAD_TRIES times a session, so a
  // broken detector doesn't download its files again and again.
  const RETRY_MS = 60000;
  const LOAD_TRIES = 3;
  let loads = 0;
  let failedAt = -Infinity;

  function loadDetector() {
    if (workerReady) return workerReady;
    if (loads >= LOAD_TRIES || performance.now() - failedAt < RETRY_MS) {
      return Promise.reject(new Error('text detector unavailable'));
    }
    loads++;
    workerReady = startWorker();
    workerReady.catch(err => {
      ggs.log('lying-signs: text detector failed to load', err);
      if (loads >= LOAD_TRIES) ggs.status('lying-signs', "Sign reading isn't working on this computer");
      failedAt = performance.now();
      stopWorker();
    });
    return workerReady;
  }
  // Closes the worker (a half-started one too, so a retry doesn't leave it running) and
  // answers every waiting tile with nothing.
  function stopWorker() {
    worker?.terminate();
    worker = null;
    workerReady = null;
    freeUrls();
    for (const id of [...waiting.keys()]) settle(id, null);
  }
  function freeUrls() {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  }
  async function startWorker() {
    if (!ggs.extBase) throw new Error('extension base URL not known yet');
    const files = await fetchFiles();
    const src = URL.createObjectURL(new Blob([files.src], { type: 'text/javascript' }));
    urls.push(src);
    worker = new Worker(src);
    worker.onmessage = onResult;
    const backend = await initWorker(files);
    // It's running now: a crash later gives up on the tiles it had and loads again on demand.
    worker.onerror = err => {
      ggs.log('lying-signs: text detector crashed', err.message);
      failedAt = performance.now();
      stopWorker();
    };
    freeUrls();
    stats.backend = backend;
    ggs.debug(`lying-signs: text detector ready (${backend})`);
  }
  // The worker's source, and the runtime as blob URLs (a page can't hand a worker
  // chrome-extension:// URLs), and the model. A file that didn't come back fails the load.
  async function fetchFiles() {
    const u = f => ggs.extBase + VENDOR + f;
    const get = async url => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url.split('/').pop()}: HTTP ${r.status}`);
      return r;
    };
    const blobUrl = async (url, type) => {
      const bytes = await (await get(url)).arrayBuffer();
      const b = URL.createObjectURL(new Blob([bytes], { type }));
      urls.push(b);
      return b;
    };
    const [src, ort, mjs, wasm, model] = await Promise.all([
      get(`${ggs.extBase}src/scripts/lying-signs/worker.js`).then(r => r.text()),
      blobUrl(u('ort.webgpu.min.js'), 'text/javascript'),
      blobUrl(u('ort-wasm-simd-threaded.asyncify.mjs'), 'text/javascript'),
      blobUrl(u('ort-wasm-simd-threaded.asyncify.wasm'), 'application/wasm'),
      get(u('ch_PP-OCRv4_det.onnx')).then(r => r.arrayBuffer()),
    ]);
    return { src, ort, mjs, wasm, model };
  }
  // Sends the files to the worker; resolves with the backend it got (webgpu or wasm), or fails
  // if the worker won't start or reports an error.
  function initWorker({ ort, mjs, wasm, model }) {
    return new Promise((res, rej) => {
      const onmsg = e => {
        if (e.data.type === 'ready') {
          worker.removeEventListener('message', onmsg);
          worker.onerror = null;
          res(e.data.backend);
        } else if (e.data.type === 'error') {
          rej(new Error(e.data.message));
        }
      };
      worker.onerror = e => rej(new Error(e.message || 'worker failed to start'));
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
  // No detector: every waiting tile gets nothing (it's tried again if uploaded again). One
  // tile failing only drops that tile.
  async function pump() {
    if (inflight >= MAX_INFLIGHT || !queue.length) return;
    inflight++;
    try {
      if (
        await loadDetector().then(
          () => true,
          () => false,
        )
      )
        await runNext();
      else for (const j of queue.splice(0)) j.res(null);
    } finally {
      inflight--;
      if (queue.length && workerReady) pump();
    }
  }
  async function runNext() {
    const job = pickJob();
    // another pump may have taken the last job while the detector loaded
    if (!job) return;
    if (!job.alive()) return drop(job);
    try {
      job.res(await runDetector(job.img));
    } catch {
      stats.failed++;
      job.res(null);
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
  ggs.maps.hook('StreetViewPanorama', p => {
    try {
      p.addListener('pano_changed', pruneQueue);
    } catch {}
  });
  function pruneQueue() {
    const shown = new Set();
    for (const p of ggs.maps.panoramas()) {
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
    for (const p of ggs.maps.panoramas()) {
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
