// A pretend geoguessr.com page for the tests: runs the extension's page scripts in a Node vm
// with just enough of a browser around them. Timers run on a fake clock (page.tick), so a test
// can wait out a 20-second lookup in no time. Events go through window only: capture
// listeners first, then the rest, as a real click or key press reaches window.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
export const SRC = join(ROOT, 'extension');
export const read = f => readFileSync(join(ROOT, f), 'utf8');
export const manifest = JSON.parse(read('extension/manifest.json'));
// Objects from the vm come from another realm, so deep comparisons go through JSON.
export const plain = x => JSON.parse(JSON.stringify(x));

// The fake clock. Lets each timer's promises settle before the next one runs.
function makeClock() {
  let now = 1_000_000;
  let nextId = 1;
  const timers = new Map();
  const add = (fn, ms, every) => {
    const id = nextId++;
    timers.set(id, { fn, at: now + Math.max(0, ms || 0), every });
    return id;
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  };
  // [id, timer] of the next timer due by `end`, or null
  const nextDue = end => {
    let due = null;
    for (const [id, t] of timers) if (t.at <= end && (!due || t.at < due[1].at)) due = [id, t];
    return due;
  };
  async function tick(ms) {
    const end = now + ms;
    await settle();
    for (let due = nextDue(end); due; due = nextDue(end)) {
      const [id, t] = due;
      now = t.at;
      if (t.every) t.at += Math.max(1, t.every);
      else timers.delete(id);
      t.fn();
      await settle();
    }
    now = end;
    await settle();
  }
  return {
    tick,
    settle,
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms, 0),
    setInterval: (fn, ms) => add(fn, ms, ms || 1),
    clear: id => timers.delete(id),
  };
}

// A storage object like localStorage.
function storage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

// A do-nothing element with the parts the scripts touch.
export function element(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    hidden: false,
    textContent: '',
    parentNode: null,
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    hasAttribute: () => false,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }),
    append(...kids) {
      for (const k of kids) {
        k.parentNode = el;
        el.children.push(k);
      }
    },
    remove() {
      if (el.parentNode) el.parentNode.children = el.parentNode.children.filter(k => k !== el);
      el.parentNode = null;
    },
    querySelector: () => null,
    attachShadow() {
      const root = element('#shadow');
      const parts = {};
      root.querySelector = sel => {
        parts[sel] ??= element(sel);
        if (sel === 'iframe')
          parts[sel].contentWindow ??= { sent: [], postMessage: m => parts[sel].contentWindow.sent.push(m) };
        return parts[sel];
      };
      el.shadowRoot = root;
      return root;
    },
  };
  return el;
}

// opts: { path, fetch(url) -> data, a Response-like or a throw }
export function makePage({ path = '/', fetch: answer = () => ({}) } = {}) {
  const clock = makeClock();
  const listeners = [];
  const win = {};
  class Element {}
  class HTMLElement extends Element {}
  const doc = {
    head: element('head'),
    body: element('body'),
    documentElement: element('html'),
    visibilityState: 'hidden',
    createElement: tag => element(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  async function fakeFetch(url, opts) {
    const r = await answer(String(url), opts);
    if (r && typeof r.json === 'function') return r;
    return { ok: true, status: 200, json: async () => r, text: async () => JSON.stringify(r) };
  }
  class FakeDate extends Date {
    constructor(...a) {
      if (a.length) super(...a);
      else super(clock.now());
    }
    static now() {
      return clock.now();
    }
  }
  Object.assign(win, {
    window: win,
    self: win,
    document: doc,
    location: {
      pathname: path,
      origin: 'https://www.geoguessr.com',
      href: `https://www.geoguessr.com${path}`,
    },
    localStorage: storage(),
    sessionStorage: storage(),
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    innerWidth: 1600,
    innerHeight: 900,
    Element,
    HTMLElement,
    URL,
    Date: FakeDate,
    performance: { now: () => clock.now() },
    setTimeout: clock.setTimeout,
    setInterval: clock.setInterval,
    clearTimeout: clock.clear,
    clearInterval: clock.clear,
    requestAnimationFrame: fn => clock.setTimeout(() => fn(clock.now()), 16),
    cancelAnimationFrame: clock.clear,
    fetch: fakeFetch,
    postMessage() {},
    addEventListener(type, fn, capture) {
      listeners.push({ type, fn, capture: capture === true || capture?.capture === true });
    },
    removeEventListener(type, fn) {
      const i = listeners.findIndex(l => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  });
  const context = vm.createContext(win);
  // Inside the vm, window is the vm's own global, not `win`.
  const global = vm.runInContext('globalThis', context);

  // Sends an event to window. Returns it, so a test can see whether it was stopped.
  function dispatch(type, props = {}) {
    const e = {
      type,
      isTrusted: true,
      defaultPrevented: false,
      stopped: false,
      target: props.target ?? global,
      composedPath: () => [props.target ?? global],
      preventDefault() {
        e.defaultPrevented = true;
      },
      stopPropagation() {
        e.stopped = true;
      },
      stopImmediatePropagation() {
        e.stopped = true;
      },
      ...props,
    };
    const order = [...listeners.filter(l => l.capture), ...listeners.filter(l => !l.capture)];
    for (const l of order) {
      if (l.type !== type) continue;
      l.fn(e);
      if (e.stopped) break;
    }
    return e;
  }

  const page = {
    window: win,
    ggs: null,
    tick: clock.tick,
    settle: clock.settle,
    now: clock.now,
    dispatch,
    // Runs extension files (paths under extension/) in the page, in order.
    load(...files) {
      for (const f of files) vm.runInContext(read(`extension/${f}`), context, { filename: f });
      page.ggs = win.__ggs;
      return page;
    },
    // Settings as bridge.js would send them.
    settings(all) {
      dispatch('message', { source: global, data: { ggs: 'settings', settings: all, base: 'https://ext/' } });
    },
    go(pathname) {
      win.location.pathname = pathname;
      win.location.href = `https://www.geoguessr.com${pathname}`;
    },
  };
  return page;
}

// A stand-in for core/maps.js: the guess map, its Guess button, the pin and the Street View.
// state.spot is where the Street View is ({ lat, lng } or null), state.map whether the guess
// map is on screen, state.button whether its Guess button is there and takes presses.
export function fakeMaps(page) {
  const button = Object.assign(element('button'), { contains: t => t === button });
  const mapEl = element();
  const state = { map: true, spot: null, pin: null, button: true, presses: 0, spaces: 0, onPress: null };
  const mapObj = { getDiv: () => element(), getZoom: () => state.zoom ?? 3 };
  page.ggs.maps = {
    state,
    button,
    guessMapElement: () => (state.map ? mapEl : null),
    findGuessMap: () => (state.map ? mapObj : null),
    guessButton: () => (state.map && state.button ? button : null),
    lastGuess: () => state.pin,
    placing: () => false,
    panorama: () =>
      state.spot && { getPosition: () => ({ lat: () => state.spot.lat, lng: () => state.spot.lng }) },
    placeGuess(lat, lng) {
      state.pin = { lat, lng };
    },
    // A real press is a click on the button, which the page's listeners hear.
    submitGuess() {
      if (!(state.map && state.button)) return false;
      state.presses++;
      const e = page.dispatch('click', { target: button });
      if (!e.stopped) state.onPress?.();
      return true;
    },
    pressSpace() {
      state.spaces++;
    },
    debug() {},
  };
  return page.ggs.maps;
}

// Just enough of google.maps: overlays remember their map and visibility, listeners can be fired.
export function fakeGoogle(page) {
  const made = [];
  const listeners = [];
  class Overlay {
    constructor(o) {
      Object.assign(this, { visible: true, ...o });
      made.push(this);
    }
    setMap(m) {
      this.map = m;
    }
    setVisible(v) {
      this.visible = v;
    }
  }
  class Circle extends Overlay {
    getRadius() {
      return this.radius;
    }
    getCenter() {
      const c = this.center;
      return { lat: () => c.lat, lng: () => c.lng };
    }
  }
  page.window.google = {
    maps: {
      Circle,
      Marker: class extends Overlay {},
      Polygon: class extends Overlay {},
      Polyline: class extends Overlay {},
      event: {
        addListener(target, type, fn) {
          const l = { target, type, fn };
          listeners.push(l);
          return { remove: () => listeners.splice(listeners.indexOf(l), 1) };
        },
      },
    },
  };
  const fire = (type, arg) => {
    for (const l of [...listeners]) if (l.type === type) l.fn(arg);
  };
  // what's on the map and showing
  const shown = type => made.filter(o => o.map && o.visible && (!type || o.constructor.name === type));
  return { made, fire, shown };
}

// The core files most tests need, in manifest order.
export const CORE = ['src/registry.js', 'src/core/base.js'];
