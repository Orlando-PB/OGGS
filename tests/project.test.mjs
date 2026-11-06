// Whole-project checks: the manifest, the script registry, the boards' iframe pages and the
// userscript build. Mistakes here broke whole scripts at once (a board's shared variable made
// const by an auto-fix, a forgotten rebuild).
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { CORE, makePage, manifest, plain, ROOT, read, SRC } from './page.mjs';

const pageScripts = manifest.content_scripts.find(c => c.world === 'MAIN').js;
const SCRIPTS = join(SRC, 'src/scripts');
const folders = readdirSync(SCRIPTS, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

function walk(dir) {
  return readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap(d => {
    const f = `${dir}/${d.name}`;
    if (d.isDirectory()) return d.name === 'vendor' ? [] : walk(f);
    return d.name.endsWith('.js') ? [f] : [];
  });
}

test('every page script parses', () => {
  for (const f of walk('src')) {
    assert.doesNotThrow(() => new vm.Script(read(`extension/${f}`), { filename: f }), f);
  }
});

test('manifest: every listed file exists, in the right order', () => {
  for (const f of pageScripts) assert.ok(existsSync(join(SRC, f)), `${f} is missing`);
  assert.deepEqual(pageScripts.slice(0, 2), ['src/registry.js', 'src/core/base.js']);
  assert.equal(pageScripts.at(-1), 'src/boot.js');
  assert.equal(new Set(pageScripts).size, pageScripts.length, 'a file is listed twice');
});

test("manifest: every script folder's files are listed, meta.js before main.js", () => {
  for (const id of folders) {
    const files = readdirSync(join(SCRIPTS, id)).filter(f => f.endsWith('.js') && f !== 'worker.js');
    for (const f of files)
      assert.ok(pageScripts.includes(`src/scripts/${id}/${f}`), `${id}/${f} isn't in the manifest`);
    const meta = pageScripts.indexOf(`src/scripts/${id}/meta.js`);
    const main = pageScripts.indexOf(`src/scripts/${id}/main.js`);
    assert.ok(meta >= 0, `${id} has no meta.js listed`);
    if (main >= 0) assert.ok(meta < main, `${id}: main.js before meta.js`);
  }
});

test("manifest: Chaos's meta.js comes after every other meta.js", () => {
  const metas = pageScripts.filter(f => f.endsWith('/meta.js'));
  assert.equal(metas.at(-1), 'src/scripts/chaos/meta.js');
});

// Every meta.js run in a page, as the popup and boot.js see them.
function registry() {
  const page = makePage().load(...CORE);
  page.load(...pageScripts.filter(f => f.endsWith('/meta.js')));
  return page.ggs.registry;
}

test('registry: ids are unique and match their folders, and each has a script behind it', () => {
  const reg = registry();
  const ids = reg.map(m => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of reg) {
    assert.ok(folders.includes(m.id), `${m.id} has no folder`);
    if (!m.ui) assert.ok(existsSync(join(SCRIPTS, m.id, 'main.js')), `${m.id} has no main.js`);
  }
});

test('registry: excludes and turnsOn name real scripts and options', () => {
  const reg = registry();
  const byId = Object.fromEntries(reg.map(m => [m.id, m]));
  for (const m of reg) {
    for (const x of m.excludes ?? []) assert.ok(byId[x], `${m.id} excludes unknown "${x}"`);
    for (const t of m.turnsOn ?? []) {
      assert.ok(byId[t.id], `${m.id} turns on unknown "${t.id}"`);
      if (t.key)
        assert.ok(
          byId[t.id].options.some(o => o.key === t.key),
          `${m.id} turns on unknown ${t.id}.${t.key}`,
        );
    }
  }
});

function checkDefault(o, where) {
  if (o.type === 'checkbox') assert.equal(typeof o.default, 'boolean', where);
  if (o.type === 'slider') {
    assert.ok(o.default >= o.min && o.default <= o.max, `${where} default out of range`);
    if (o.steps) assert.equal(o.steps.length, (o.max - o.min) / (o.step ?? 1) + 1, `${where} steps`);
  }
  if (o.type === 'select' || o.type === 'buttons') {
    const values = o.choices.map((c, i) => (typeof c === 'object' ? c.value : i));
    assert.ok(values.includes(o.default), `${where} default isn't a choice`);
  }
}

test('registry: every option default is one it can take', () => {
  for (const m of registry()) {
    const keys = m.options.map(o => o.key);
    assert.equal(new Set(keys).size, keys.length, `${m.id} repeats an option key`);
    for (const o of m.options) checkDefault(o, `${m.id}.${o.key}`);
  }
});

// Settings Orlando asked for. A change here should be on purpose.
test('registry: defaults asked for', () => {
  const cfg = id =>
    plain(
      makePage()
        .load(...CORE)
        .ggs.config(
          registry().find(m => m.id === id),
          {},
        ),
    );
  const area = registry()
    .find(m => m.id === 'radius')
    .options.find(o => o.key === 'area');
  assert.equal(area.steps[area.default - area.min], '500 km');
  assert.equal(area.steps.at(-1), 'exact');
  assert.equal(cfg('in-country').world, false, 'squashed world off by default');
  assert.equal(cfg('draw-guess').forceInside, true);
  assert.equal(cfg('flag-guess').forceInside, true);
  for (const m of registry()) assert.equal(m.defaultEnabled, false, `${m.id} is on by default`);
});

// ---- the boards' iframe pages: classic scripts sharing one global scope ----

const APPS = ['draw-guess', 'flag-guess', 'jack-guess'];
const appScripts = id => {
  const html = read(`extension/src/scripts/${id}/app/index.html`);
  return [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m =>
    join(`extension/src/scripts/${id}/app`, m[1]),
  );
};
// Names declared with `kind` at the top of a file, or at any depth with `anywhere`.
const declared = (code, kind, anywhere = false) =>
  [...code.matchAll(new RegExp(`^${anywhere ? '\\s*' : ''}${kind}\\s+([A-Za-z_$][\\w$]*)`, 'gm'))].map(
    m => m[1],
  );

test('boards: every script an app page loads exists, is shipped and is deployed', () => {
  const shipped = manifest.web_accessible_resources.flatMap(w => w.resources);
  const deploy = read('tools/deploy_server.sh');
  for (const id of APPS) {
    for (const f of appScripts(id)) {
      assert.ok(existsSync(join(ROOT, f)), `${f} is missing`);
      const rel = f.replace('extension/', '');
      const ok = shipped.some(p => (p.endsWith('*') ? rel.startsWith(p.slice(0, -1)) : rel === p));
      assert.ok(ok, `${rel} isn't in web_accessible_resources`);
      const deployed = APPS.some(a => rel.startsWith(`src/scripts/${a}/app/`)) || deploy.includes(f);
      assert.ok(deployed, `${f} isn't uploaded by deploy_server.sh`);
    }
  }
});

test('boards: no two files of an app page declare the same top-level name', () => {
  for (const id of APPS) {
    const code = appScripts(id)
      .map(f => read(f))
      .join('\n;\n');
    assert.doesNotThrow(() => new vm.Script(code), `${id}: a name is declared twice`);
  }
});

// The flag board froze after raising the flag: Biome made map.js's `let view` a const, but
// app.js assigns it.
// consts: name -> the file declaring it. A name the file declares itself (at any depth) is its own.
function checkNoConstAssigned(f, consts) {
  const code = read(f);
  const own = new Set(declared(code, '(?:const|let|var)', true));
  for (const [name, from] of consts) {
    if (from === f || own.has(name)) continue;
    const assigns = new RegExp(`(?<![\\w$.])${name.replace('$', '\\$')}\\s*(?:[-+*/]?=(?!=)|\\+\\+|--)`);
    assert.ok(!assigns.test(code), `${f} assigns ${name}, a const in ${from}`);
  }
}

test('boards: no file assigns a top-level const of another file', () => {
  for (const id of APPS) {
    const files = appScripts(id).filter(f => !f.includes('/vendor/'));
    const consts = new Map();
    for (const f of files) for (const name of declared(read(f), 'const')) consts.set(name, f);
    for (const f of files) checkNoConstAssigned(f, consts);
  }
});

// ---- the userscript ----

test('userscript: rebuilt from the current extension (node tools/build.mjs)', () => {
  const us = read('userscript/oggs.user.js');
  assert.match(us, new RegExp(`// @version\\s+${manifest.version.replaceAll('.', '\\.')}\\n`));
  let at = 0;
  for (const f of pageScripts) {
    const body = `${read(`extension/${f}`).trimEnd()}\n`;
    const i = us.indexOf(body, at);
    assert.ok(i >= 0, `${f} differs from the userscript copy`);
    at = i + body.length;
  }
});
