# Orlando's GeoGuessr Scripts (OGGS)

> **Status (2026-09-26):** made as a bit of fun; no active plans. Repo `Orlando-PB/OGGS` (private for now).
> Published on the Chrome Web Store and Edge Add-ons, and built as a userscript for Tampermonkey
> (`userscript/oggs.user.js`, served from oggs.orlandopb.com). The Firefox listing is behind and isn't
> being kept up to date. Server side is `server/` on the IONOS webspace. Store listing assets and the
> tooling behind the drawing board's generated files are kept locally, out of git (see *Layout*).

A Chrome extension that bundles GeoGuessr scripts. You turn each one on or off from the toolbar popup.

## Install

As an extension, from the Chrome Web Store or Edge Add-ons, or unpacked:

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick the `extension/` folder.
3. Open a GeoGuessr game. After you edit any files, click the reload icon on the extension card, then refresh the GeoGuessr tab.

As a userscript (Tampermonkey, Violentmonkey): install [`userscript/oggs.user.js`](userscript/oggs.user.js)
(or open <https://oggs.orlandopb.com/oggs.user.js>, which is also where it updates from). On geoguessr.com
the settings are behind the yellow **OGGS** tab at the bottom left, or **Alt+O**. It's the extension's
page scripts concatenated (`node tools/build.mjs` rebuilds it; don't edit it by hand), with
`userscript/bridge.js` in place of the extension's `bridge.js` and popup: settings live in
geoguessr.com's localStorage, and the drawing board and the sign-text detector, which the extension
carries as files, are loaded from oggs.orlandopb.com. It runs with `@grant none`, so it has no
userscript privileges: everything it can do, the page could do. The comment at the top of the file
lists every host it talks to and what it sends.

## Scripts

### Draw your country
While this script is on, a drawing board takes the place of GeoGuessr's guess map in every round. It stays small until you hover over it.

1. Draw the country you think you're in, then click where you think you are. That can be inside the drawing, or out in the sea for an island you didn't draw (draw the US and click off its south-west coast for Hawaii).
2. Click *Guess* (or press **Enter**). Your guess goes onto GeoGuessr's map straight away, which is still there but invisible. Then the drawing snaps onto the closest real country. As it zooms out, a flag marks the correct spot, with a dashed line from your pin, and the result card says whether you got the country right.
3. Three seconds after the animation finishes, the script presses GeoGuessr's own Guess button for you. That button is hidden, so the board can take its space, but Space still presses it sooner if you want.

After each round, GeoGuessr's result screen gets a panel with that round's drawing, with the correct country's outline dashed over it, and the country it snapped to and its match %. If the correct country was a different one, the panel shows that country's match % too; if you got it right, the stats get a gold border. After the last round, *Your drawings* shows every round the same way, plus your average match with the correct country and how many you got right. Drag the panel by its header. (The correct country's % needs standard games, the same as the nudge.)

The board clears itself for the next round. The countries it can match are picked from the game's map name: a region such as Europe, the countries the name mentions (such as "Spain & Portugal"), or otherwise GeoGuessr's world coverage. The console logs how many countries are possible. *Hard mode* in the popup matches against all 193 UN members instead. Two things help the matcher. First, a per-country correction (`app/data/prior.json`, built from hand drawings with `tools/train_eval.mjs --write-prior`): blob-shaped countries such as Ghana or Germany overlap almost any drawing well, so each country's usual score on drawings of *other* countries is subtracted, capped at 5 points. It's skipped when the round's real country is already the best match. Second, the *Correct country sensitivity* slider (0-20, default 7): the round's real country is tried with extra rotation (up to 10°) and stretch leeway, islands drawn too big or too small are tried resized, and if it's then within that many percentage points of the best match it's lifted past it (the closer it was, the bigger its lead). At 0 the real country gets no help at all. On 298 test drawings, 7 points gets the right country 89% of the time, while a *wrong* popular country steals the match 7% of the time when you draw something else (5 points: 83% right, 5% stolen; 10 points: 93%, 12%). Standard games only, not challenges. To get the normal map back, turn the script off in the popup.

The board is the [country-matcher](country-matcher/) app (a small Python/FastAPI app, `country-matcher/run.sh` runs it and creates its `.venv`), running inside the extension with no server. After changing country-matcher, re-sync it:

```sh
country-matcher/.venv/bin/python tools/sync_draw.py country-matcher
node tools/check_parity.mjs     # JS matcher vs Python: every test drawing should pick the same country
```

`sync_draw.py` regenerates `app/index.html`, `app/app.js`, `app/vendor/` and `app/data/`, so don't edit those by hand. The handwritten files are `matcher.js`, `shim.js` and `embed.css`. `matcher.js` is a port of `app.py`'s matching code. The tuning numbers come across with each sync, but if the matching logic itself changes, `matcher.js` needs the same change. The parity check will show when they've drifted apart.

### Minecraft world (experimental)
Each panorama is sent, once, to OpenAI's image edit API and comes back redrawn as Minecraft, then it's wrapped back over the Street View sphere: every tile the Maps API uploads to WebGL is swapped for the matching crop of the generated picture, so looking around and zooming never generate again. Only a new panorama (moving) does, so play *no move* for one generation per round. Until the picture is back, the tiles are black and a *Loading round* bar sits in the middle of the screen; the API reports no progress, so the bar runs on how long the last rounds took and only fills once the new tiles are on screen.

Two modes (`MODES` in [server/minecraft.php](server/minecraft.php)): normal is `gpt-image-2.5-flare` at low quality, 2048x1024, with the panorama sent at 1024 px wide (the fewest input tokens the API charges), about $0.008 a round in 12-16 s. *High quality* in the popup is `gpt-image-2.5-sunburst` at high, 3840x1920, about $0.09 in 35 s, and much cleaner (the normal mode mangles villagers and fine detail). The prompt is `PROMPT` in the same file; the gpt-image-1 models were tried and either ignore "keep it equirectangular" or look nothing like Minecraft, and lower sizes or quality look upscaled.

Limits, per rolling 24 h (`CAPS` in `minecraft.php`): 100 normal rounds and 10 high-quality ones, or 50 high-quality with the code (`HQ_CODE` in `.env`) typed into the popup's *Code* field. The server also caps each IP address and everyone together, so the bill has a ceiling. The popup shows what's left today under the options and, once it's out, how long until it's back; in the game a short note says the same and the real view shows instead. A failed generation (no credit, API down) isn't counted and shows *Minecraft isn't available right now, try again later*.

Server: the page sends only the panorama's id and size (plus a random per-install id for the daily count, and the optional code) to `https://oggs.orlandopb.com/minecraft.php`, a small PHP script on the IONOS webspace. It fetches the tiles from Google, stitches them, and calls the image API with the key it holds; the picture comes back as a data URL. Nothing secret is in the extension or the userscript. Deploy with `tools/deploy_server.sh` (uploads `server/`, the files the userscript loads from there, and the userscript itself, and the first time writes `~/oggs_private/config.php` from `.env`).

### Radio mode
Street View is hidden; instead a live radio station near the round's location plays (from [Radio Browser](https://www.radio-browser.info)). The player takes Street View's place inside GeoGuessr's layout (purple backdrop, GeoGuessr's HUD and guess map stay on top): a fluid shape that is always blending from one random country outline to the next (so it only now and then looks like a real country, never deliberately the round's), its border rippling with the volume and faint echoes spreading behind it, plus previous/next station, play/pause and volume. With *Show Street View* on, and on result screens, it shrinks to a bar in the top-left, under GeoGuessr's logo. Each round's result screen names that round's station; once the game is over, the result screens list every round's station, and clicking one plays it again (hover a row to see its stream host). Stations on stream networks known to insert ads (Zeno, AdsWizz, Triton/StreamTheWorld; `AD_STREAMS` in `radio/main.js`) are tried last, since an ad inside the stream itself can't be detected. The ripples follow the real loudness for streams that allow cross-origin reads (CORS, about 9 in 10); for the rest they follow a made-up wobble while audio is arriving. While it's finding or connecting to a station, the shape melts into a circle with orbiting dots, and it briefly turns into a play, pause or skip sign when you use those buttons or music gets skipped; after 8 s of silence it skips to the next. The outlines come from `tools/radio_shapes.py` (draw-guess's country data, largest piece of each country). Nothing about the station is shown until you've guessed; the result screen then shows its name, region and distance from the spot. Standard games only. *Streamer / YouTube mode* only plays talk stations (news, talk, sport, going by Radio Browser's tags, minus any tagged with a music genre), since music is what YouTube's Content ID claims. It also listens and skips music: each new station is first listened to silently for 3 s (*checking for music*), and then checked over the last 7 s for as long as it plays, in case music starts later. If every station nearby turns out to be music, it goes back to the first one, paused, so you can still press play and hear it. To tell music from speech: music puts far more of its energy in the bass (below 90 Hz) than speech does. Music light on bass (old recordings, acoustic) gets through. See `musicCheck` in `radio/main.js`. That only works on streams that allow cross-origin reads (about 9 in 10; the rest are tried last, and play with a *can't check this one for music* note only if nothing else is left) and after a first click on the page (Chrome's rule for reading audio, so streamer mode waits for one), and a short jingle or ad still gets through, so it lowers the risk but doesn't remove it. Talk stations are sparser, so it puts the round's country first (the country of the nearest station of any kind): its talk stations within 250 km, then the rest of that country, then nearby ones across the border, then wider. Stations are searched within 50 km, widening to 250, 1000 and 3000 km if fewer than three turn up, so remote rounds may get a station from a neighbouring country.

### Add new Ghana black tape
Old (Gen 3) Ghana coverage has black tape on the tip of the car's front-left roof bar; the new Gen 4 coverage doesn't. With this on, looking down on Gen 4 panoramas inside Ghana shows the four roof-bar ends with the tape drawn on, fixed to the car so it turns and zooms with the view. Only Gen 4 panoramas (16384 px-wide tiles) inside Ghana's outline get it, so old coverage keeps its real tape. The car's shape is `CAR` at the top of `ghana-tape/main.js`.

### Lying signs (experimental)
Rewrites the text on signs in another script or language (Thai, Georgian, Korean, Arabic, Cyrillic, Greek, Hebrew, Japanese, Hindi, Armenian, wrong English words (JackSucksAtLife / zi8gzag lore, in `ENGLISH` at the top of `main.js`), German, Spanish, French, or Minecraft's enchanting-table letters when you just want the text scrambled; *Random*, the default, picks one per panorama from its id, so each location has a single foreign script), so language cues lie to you. Every Street View tile is caught as the Maps API uploads it to WebGL (a `texImage2D`/`texSubImage2D` hook on `<img>`s from `streetviewpixels-pa.googleapis.com`). Finding the text takes a few hundred ms per tile, so a copy at a tenth of the size, scaled back up, goes up first so nothing is legible however far you zoom, the texture is remembered, and the edited tile is uploaded into it when the boxes come back. Text is found with PaddleOCR's PP-OCRv4 detector (DBNet) on onnxruntime-web in a worker, on WebGPU (about 55 ms a tile) or wasm if there's no GPU (about 300 ms). The tile nearest to where you're looking goes first (tile grid position against the panorama's heading and pitch), and queued tiles you've already moved away from are dropped unrun (`lying-signs/worker.js`; runtime and model in `lying-signs/vendor/`, about 30 MB). The detector returns each text line as a rotated box (principal axis of its blob) plus the blob itself, so angled text gets a tight, tilted patch. Boxes that aren't shaped like a line of text (taller than a quarter of the tile, taller than wide, or a sparse blob: shirts, railings, clouds) are dropped in the worker, and a box whose 'text' pixels barely differ from the sign colour is ignored too. Each box is handled in a frame rotated so the text runs level: the fill is built from the pixels just outside it (each pixel a distance-weighted mix of the smoothed left/right/top/bottom border colours, so lighting gradients carry across and none of the old text bleeds in; border pixels that aren't the sign's dominant colour are ignored; the border's own noise is added back as grain). It's composited back through a mask shaped like the old and new text, grown to cover every stroke and feathered a long way out, confined to a soft rounded region around the box so it never spills onto whatever is behind the sign; and the biggest random word that fits the box is written in the sampled text colour. The Maps API never re-uploads a tile that's already on screen, so switching the script on or off (or changing the script to write in) mid-round replays them: `core/tiles.js` remembers which texture every tile `<img>` went into, reloads them from the browser cache and uploads them again through the same hook, then nudges the view to repaint. Word and script choices are seeded from the sign's position in the panorama, so a sign reads the same at every zoom. Zooming in reuses the zoomed-out work: a tile whose parent one or two zoom levels out has been detected takes its boxes, scaled, straight away, and this zoom's own detection only adds boxes that aren't over an inherited one (small text the parent couldn't see). Zooming out reuses the zoomed-in work: a tile whose four children one zoom level in are already edited is assembled from them (scaled down) instead of being detected again, so the sharper edit and the same words carry over; partly edited children are drawn over the placeholder and the result as they arrive. Known gap: words cut by tile edges get two different replacements. `__ggs.lyingSigns.stats` in the console counts tiles seen/edited/failed and detector time.

## Layout

```
extension/                what ships in the store; also the source of the userscript
  manifest.json
  popup/                  settings popup (src/form.js over each script's meta.js)
  src/
    registry.js           ggs.registry + settings defaults
    form.js               the settings form, shared by the popup and the userscript panel
    bridge.js             passes chrome.storage settings to the page (isolated world)
    core/                 shared helpers, run in the page's own JS world
      base.js             namespace (window.__ggs), settings, status lines, hotkeys
      maps.js             find the guess map, place/submit a guess
      game.js             current game mode/token and map name
      ui.js               draggable shadow-DOM panel
      tiles.js            remembers Street View tile uploads so scripts can replay them
    scripts/<id>/         one folder per script: meta.js (name, options) + main.js
      draw-guess/app/     the drawing board (generated from country-matcher, see below)
      lying-signs/vendor/ onnxruntime-web and the text detector model (third party)
    boot.js               starts/stops scripts when settings change
userscript/
  bridge.js               settings in localStorage + in-page panel, in place of bridge.js/popup
  oggs.user.js            the built userscript (node tools/build.mjs)
server/                   what runs on oggs.orlandopb.com: minecraft.php and Apache/PHP config
tools/
  build.mjs               builds userscript/oggs.user.js and the store zips
  deploy_server.sh        uploads server/, the userscript and its assets to the webspace
```

Kept locally and out of git (`.gitignore`): `store/` (listing images and templates), `country-matcher/`
(the Python app the board is generated from), `training/` and the tools that regenerate `app/` and
`prior.json` (`sync_draw.py`, `check_parity.mjs`, `train_eval.mjs`, `trainer/`, `radio_shapes.py`).

To add a script, create `src/scripts/<id>/meta.js` (pushes `{ id, name, description, defaultEnabled, options }` onto `__ggs.registry`) and `main.js` (sets `__ggs.scripts['<id>'] = { start(cfg) { …; return { stop, update } } }`), then add both to `manifest.json` before `src/boot.js` (the popup and the userscript build both read that list).

## Competitive games

Every script switches off in competitive games: ranked duels, battle royale, and the matchmaking pages. Friendly party games (started from a party lobby or an invite link) keep working. A duel counts as friendly only if you came in through `/party` or `/join`, or its game data marks it as a party game. If it can't tell, it treats the game as competitive. With debug logging on (below) the console shows the decision, e.g. `[OGGS] friendly game: scripts on duels: lobby=party …`.

## Debugging

- The console shows `[OGGS]` lines for errors only. Run `localStorage.ggsDebug = 1` on geoguessr.com and refresh to also see script starts/stops, the competitive decision, tile replays and generation times.
- On a game page, run `__ggs.maps.debug()` in the console. It shows whether the guess map, its Google Map instance and the Guess button were found.
- If GeoGuessr changes its markup, the selectors to fix are at the top of `src/core/maps.js`.

### Training the matcher

`tools/trainer/` is a local page for collecting drawings made with the country in view, so a bad match is the matcher's fault rather than the drawer's. It works offline:

```sh
python3 tools/trainer/serve.py      # open http://localhost:8765/, draw, press Enter
node tools/train_eval.mjs           # replay every saved drawing through the matcher, per method
```

`node tools/train_eval.mjs --write-prior` regenerates `app/data/prior.json`, the per-country "attractor" correction the matcher applies (capped at 5 points, and only when the round's real country isn't already the raw winner). Drawings are saved to `training/drawings/` (see `training/README.md` for the format and how to add scoring experiments).
