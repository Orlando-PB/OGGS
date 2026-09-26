// Builds, for the version in extension/manifest.json:
//   userscript/oggs.user.js              the Tampermonkey/Violentmonkey version: the same page
//                                        scripts the extension runs, concatenated, behind
//                                        userscript/bridge.js in place of bridge.js + popup
//   dev/store/vX.Y.Z/oggs-X.Y.Z-chrome.zip   Chrome Web Store and Edge Add-ons (same file)
//   dev/store/vX.Y.Z/oggs-X.Y.Z-firefox.zip  Firefox Add-ons (manifest gets Firefox's extra keys)
// Usage: node tools/build.mjs
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = join(root, "extension");
const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));
const out = join(root, "dev", "store", `v${manifest.version}`);
mkdirSync(out, { recursive: true });

// ---- userscript ----
const SERVER = "https://oggs.orlandopb.com/";
// Install/update address: the file in the repo, like other GeoGuessr userscripts (works once the repo is public).
const RAW = "https://raw.githubusercontent.com/Orlando-PB/OGGS/main/userscript/oggs.user.js";
const pageScripts = manifest.content_scripts.find(c => c.world === "MAIN").js;
const banner = f => `\n// ${"=".repeat(20)} ${f} ${"=".repeat(Math.max(3, 60 - f.length))}\n`;
const file = f => readFileSync(join(src, f), "utf8").trimEnd() + "\n";
const bridge = readFileSync(join(root, "userscript", "bridge.js"), "utf8")
  .replace("__POPUP_CSS__", file("popup/popup.css").replace(/`/g, "\\`").replace(/\$\{/g, "\\${"));
const userscript = `// ==UserScript==
// @name         ${manifest.name}
// @namespace    https://github.com/Orlando-PB/OGGS
// @version      ${manifest.version}
// @description  ${manifest.description}
// @author       Orlando
// @homepageURL  https://github.com/Orlando-PB/OGGS
// @icon         ${SERVER}icon-128.png
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    ${RAW}
// @downloadURL  ${RAW}
// ==/UserScript==

// Built by tools/build.mjs from extension/ in https://github.com/Orlando-PB/OGGS: don't edit
// this file, edit those. Each section below is one file from there, unchanged, except
// userscript/bridge.js, which stands in for the extension's bridge.js and popup.
//
// What talks to the network, and with what:
//   core/game.js          geoguessr.com's own game API (your session), to read the game's mode
//                         and map, and the round's location for the drawing board's nudge
//   userscript/bridge.js  loads the drawing board and the sign-text detector from ${SERVER}
//   scripts/radio         radio-browser.info (station search) and the station streams
//   scripts/minecraft     ${SERVER}minecraft.php: a Street View panorama id, its size, a random
//                         per-install id and the optional code; gets the redrawn picture back
// Nothing else leaves the page. Settings stay in geoguessr.com's localStorage ("ggs-settings").
${banner("userscript/bridge.js")}${bridge}${["src/form.js", ...pageScripts].map(f => banner(f) + file(f)).join("")}`;
mkdirSync(join(root, "userscript"), { recursive: true });
writeFileSync(join(root, "userscript", "oggs.user.js"), userscript);
console.log(join(root, "userscript", "oggs.user.js"));

// ---- store zips ----

function zip(dir, name) {
  const file = join(out, name);
  rmSync(file, { force: true });
  execFileSync("zip", ["-qr", file, ".", "-x", "*.DS_Store"], { cwd: dir });
  console.log(file);
}

zip(src, `oggs-${manifest.version}-chrome.zip`);

// Firefox: needs a fixed add-on id (never change it after the first upload) and the
// data-collection declaration AMO requires, which sets the floor at 140 (142 on Android).
const tmp = mkdtempSync(join(tmpdir(), "oggs-firefox-"));
cpSync(src, tmp, { recursive: true });
const firefox = {
  ...manifest,
  browser_specific_settings: {
    gecko: {
      id: "oggs@orlando-pb",
      strict_min_version: "140.0",
      data_collection_permissions: { required: ["none"] },
    },
    gecko_android: { strict_min_version: "142.0" },
  },
};
writeFileSync(join(tmp, "manifest.json"), JSON.stringify(firefox, null, 2) + "\n");
zip(tmp, `oggs-${manifest.version}-firefox.zip`);
rmSync(tmp, { recursive: true, force: true });
