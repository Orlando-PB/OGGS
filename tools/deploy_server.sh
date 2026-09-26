#!/bin/sh
# Uploads everything oggs.orlandopb.com serves to the IONOS webspace (~/oggs):
#   server/                                 minecraft.php and the Apache/PHP config
#   extension/src/scripts/draw-guess/app/   the drawing board, loaded by the userscript
#   extension/src/scripts/lying-signs/      worker.js and vendor/, loaded by the userscript
#   userscript/oggs.user.js                 the userscript's install/update URL
# The first time, seeds ~/oggs_private/config.php from .env. Usage: tools/deploy_server.sh
set -e
cd "$(dirname "$0")/.."
ssh ionos 'mkdir -p ~/oggs/src/scripts/draw-guess ~/oggs/src/scripts/lying-signs ~/oggs_private && chmod 700 ~/oggs_private'
rsync -az --delete --exclude .DS_Store --exclude src/ --exclude oggs.user.js --exclude icon-128.png server/ ionos:~/oggs/
rsync -az --delete --exclude .DS_Store extension/src/scripts/draw-guess/app ionos:~/oggs/src/scripts/draw-guess/
rsync -az --delete --exclude .DS_Store --include='worker.js' --include='vendor/***' --exclude='*' \
  extension/src/scripts/lying-signs/ ionos:~/oggs/src/scripts/lying-signs/
scp -q userscript/oggs.user.js extension/icons/icon-128.png ionos:~/oggs/
if ! ssh ionos 'test -f ~/oggs_private/config.php'; then
  key=$(sed -n 's/^OPENAI_API_KEY=//p' .env); code=$(sed -n 's/^HQ_CODE=//p' .env)
  printf "<?php\nreturn ['OPENAI_API_KEY' => '%s', 'HQ_CODE' => '%s'];\n" "$key" "$code" | ssh ionos 'cat > ~/oggs_private/config.php && chmod 600 ~/oggs_private/config.php'
  echo "seeded ~/oggs_private/config.php from .env"
fi
echo "deployed to ionos:~/oggs"
