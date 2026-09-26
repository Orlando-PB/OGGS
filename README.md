# OGGS: Orlando's GeoGuessr Scripts

> **Status:** a fun side project, maintained now and then. Live on the Chrome Web Store and as a Tampermonkey userscript. Made for singleplayer and games with friends; every script switches itself off in ranked and competitive modes.

A browser extension that bundles a few GeoGuessr scripts. Turn each one on or off from the toolbar popup.

## Install

**Easiest: the Chrome extension.** Works in Chrome, Edge, Brave, Opera and other Chromium browsers.

→ [OGGS on the Chrome Web Store](https://chromewebstore.google.com/detail/oggs-orlandos-geoguessr-s/lbnadihehgfemijnjmabooamfnppkkpa)

Click the OGGS icon in the toolbar to switch scripts on and off, then start a GeoGuessr game.

**Otherwise: the userscript.** For Firefox, or if you already use Tampermonkey.

> Note: the userscript needs a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/). In Chromium browsers (Chrome, Opera, Edge, Brave…) Tampermonkey also needs your browser's Developer Mode switched on. The toggle is at the top right of `chrome://extensions`.

1. Install Tampermonkey (or Violentmonkey).
2. Open [oggs.user.js](https://raw.githubusercontent.com/Orlando-PB/OGGS/main/userscript/oggs.user.js) and click **Install**.
3. On geoguessr.com, settings are behind the yellow **OGGS** tab at the bottom left, or **Alt+O**.

Updates come automatically in both cases.

## Scripts

**Draw your country.** A drawing board replaces the guess map. Draw the country you think you're in, click where you think you are and press Guess. The drawing snaps onto the closest real country and the result screen shows how well it matched. *Hard mode* matches against all 193 UN members.

**Minecraft world.** Each location is redrawn as Minecraft and wrapped back over the Street View sphere. Only a new location generates, so it works best in *no move*. There's a daily limit of rounds per person; the popup shows what's left. *High quality* is slower and much cleaner.

**Radio mode.** Street View is hidden and a live radio station from near the round's location plays instead. The station is revealed after you guess. *Streamer / YouTube mode* sticks to talk stations and skips music.

**Lying signs.** Text on signs is rewritten in another script or language, so language clues lie to you. Pick a script in the popup, or leave it on *Random* for one per location.

**Add new Ghana black tape.** Puts the black roof-bar tape from old Ghana coverage onto the new Gen 4 coverage.

## Privacy

Everything runs in your browser. The only thing sent to a server is for Minecraft world: the panorama id and size, plus a random per-install id for the daily count, go to `oggs.orlandopb.com`, which fetches the panorama and calls the image API with its own key. Nothing about you or your account leaves the page.

## Help

Something broken? [Open an issue](https://github.com/Orlando-PB/OGGS/issues).
