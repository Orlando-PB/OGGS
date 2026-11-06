// Guess on Jack: a picture of JackSucksAtGeography (app/) over GeoGuessr's guess map, through
// core/board.js. Every part of his face is a country (each tooth, the eyes, the ears...) and the
// background is the sea. Each click on him puts GeoGuessr's pin on the matching spot of the
// hidden map, and the board's Guess presses GeoGuessr's. The result is GeoGuessr's own.
(() => {
  const ggs = globalThis.__ggs;
  const MAX_W = 520;
  // the board's header, buttons and padding round the 1840x2000 photo
  const CHROME_H = 100;
  // frames to wait for GeoGuessr to draw its pin after a click
  const PIN_FRAMES = 30;

  function start() {
    let guess = null;
    const board = ggs.board({
      id: 'jack-guess',
      app: 'src/scripts/jack-guess/app/index.html',
      size: (roomW, roomH, boardH) => {
        const w = Math.min(MAX_W, roomW, ((roomH - CHROME_H) * 1840) / 2000);
        return { w, h: Math.min(boardH || w * 1.09 + CHROME_H, roomH) };
      },
      guessDelay: 0,
      onMessage(d) {
        if (d.ggs === 'pick') {
          guess = board.place(d.guess) ? d.guess : null;
          board.post({ ggs: 'placed', ok: !!guess });
          if (guess) sendPinPicture();
        }
        if (d.ggs === 'go' && guess) board.press(guess, 0);
      },
    });

    // The picture in GeoGuessr's pin (the player's avatar), so the board's pin can show it too.
    function sendPinPicture(frame = 0) {
      requestAnimationFrame(() => {
        const src = pinPicture();
        if (src) board.post({ ggs: 'pin', src });
        else if (frame < PIN_FRAMES) sendPinPicture(frame + 1);
      });
    }

    return { update() {}, stop: board.stop };
  }

  function pinPicture() {
    const pin = document.querySelector(ggs.maps.GUESS_PIN_SELECTORS.join(', '));
    if (!pin) return null;
    const root = ggs.maps.pinRoot(pin);
    const img = root.querySelector('img');
    if (img?.src) return img.src;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const url = getComputedStyle(el).backgroundImage.match(/url\("?([^")]+)"?\)/);
      if (url) return url[1];
    }
    return null;
  }

  ggs.scripts['jack-guess'] = { start };
})();
