#!/bin/sh
# Uploads everything oggs.orlandopb.com serves to the IONOS webspace (~/oggs):
#   server/                                 minecraft.php and the Apache/PHP config
#   extension/src/scripts/draw-guess/app/   the drawing board, loaded by the userscript
#   extension/src/scripts/flag-guess/app/   the flag board, loaded by the userscript
#   extension/src/scripts/jack-guess/app/   the Guess on Jack board, loaded by the userscript
#   extension/src/scripts/in-country/rows.js  country rows, loaded by the Guess on Jack board
#   extension/src/scripts/lying-signs/      worker.js and vendor/, loaded by the userscript
#   userscript/oggs.user.js                 the userscript's install/update URL
# Only files git tracks (or has staged) are uploaded, as they are on disk: they're copied to a
# temp folder first, so untracked local files in these folders never reach the server.
# The first time, seeds ~/oggs_private/config.php from .env. Usage: tools/deploy_server.sh
set -e
cd "$(dirname "$0")/.."
root=$(pwd)
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
git ls-files -- server extension/src/scripts extension/icons userscript |
  while read -r f; do [ -e "$f" ] && echo "$f"; done |
  rsync -a --files-from=- ./ "$stage/"
cd "$stage"
ssh ionos 'mkdir -p ~/oggs/src/scripts/draw-guess ~/oggs/src/scripts/flag-guess ~/oggs/src/scripts/jack-guess ~/oggs/src/scripts/in-country \
  ~/oggs/src/scripts/lying-signs ~/oggs/icons ~/oggs_private && chmod 700 ~/oggs_private'
rsync -az --delete --exclude .DS_Store \
  --exclude src/ --exclude oggs.user.js --exclude icon-128.png --exclude icons/ \
  server/ ionos:~/oggs/
rsync -az --delete --exclude .DS_Store extension/src/scripts/draw-guess/app ionos:~/oggs/src/scripts/draw-guess/
rsync -az --delete --exclude .DS_Store extension/src/scripts/flag-guess/app ionos:~/oggs/src/scripts/flag-guess/
rsync -az --delete --exclude .DS_Store extension/src/scripts/jack-guess/app ionos:~/oggs/src/scripts/jack-guess/
scp -q extension/src/scripts/in-country/rows.js ionos:~/oggs/src/scripts/in-country/
rsync -az --delete --exclude .DS_Store --include='worker.js' --include='vendor/***' --exclude='*' \
  extension/src/scripts/lying-signs/ ionos:~/oggs/src/scripts/lying-signs/
scp -q userscript/oggs.user.js extension/icons/icon-128.png ionos:~/oggs/
# the panel header icon (ggs.extBase + 'icons/')
scp -q extension/icons/icon-128.png ionos:~/oggs/icons/
if ! ssh ionos 'test -f ~/oggs_private/config.php'; then
  key=$(sed -n 's/^OPENAI_API_KEY=//p' "$root/.env")
  gkey=$(sed -n 's/^GEMINI_API_KEY=//p' "$root/.env")
  code=$(sed -n 's/^HQ_CODE=//p' "$root/.env")
  printf "<?php\nreturn ['OPENAI_API_KEY' => '%s', 'GEMINI_API_KEY' => '%s', 'HQ_CODE' => '%s'];\n" \
    "$key" "$gkey" "$code" |
    ssh ionos 'cat > ~/oggs_private/config.php && chmod 600 ~/oggs_private/config.php'
  echo "seeded ~/oggs_private/config.php from .env"
fi
echo "deployed to ionos:~/oggs"
