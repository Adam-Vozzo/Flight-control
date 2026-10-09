# Flight Control

A tribute to Firemint's *Flight Control* (2009), rebuilt as a web game so it runs on a modern iPhone. Touch an aircraft, drag a flight path to the runway or helipad of the same colour, and keep everything apart. One collision ends the game.

Everything is drawn in code: outlined, flat-colour aircraft and hand-built top-down airports in the spirit of the original's mid-century look. There are no image or audio files to download apart from the icons and the font. The sound effects and the swing loop are synthesised in the browser.

## Playing on an iPhone

The game is a static web page, so it needs to be hosted somewhere. GitHub Pages is free for public repositories:

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick the branch with the game and the `/ (root)` folder, and press **Save**.
3. After a minute or so the game is live at `https://<your-username>.github.io/Flight-control/`.

Then, on the iPhone:

1. Open that address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

Launched from the home screen it runs full screen, without Safari's toolbars or the swipe-back gesture getting in the way, and it keeps working offline after the first visit. Best scores stay on the device.

The game plays in either orientation and you can rotate mid-flight. Sound follows the ringer switch, as most games do.

## How to play

- **Draw a flight path.** Touch an aircraft and drag. It follows your line, and you can redraw it at any time. A tap without a drag leaves the old path alone.
- **Match the colours.** Red and yellow planes land on the runway with the same colour, approaching from the end with the arrows and approach lights. Blue helicopters land on the helipad from any side. On the Coast, pink seaplanes land on the buoyed water lane.
- **Watch the edges.** New arrivals are announced by a badge at the edge of the screen a few seconds before they appear. Aircraft without a path turn back when they reach the edge.
- **Keep them apart.** A red ring means two aircraft are too close. When a path locks onto its landing zone the aircraft gets a white outline: it is cleared to land and will touch down on its own.
- Traffic gets busier the longer you last. Use **fast forward** when it is quiet. The game pauses itself when you leave the app.

| Aircraft | Speed | Lands on |
| --- | --- | --- |
| Light plane | Medium | Runway of its colour |
| Jet | Fast | Runway of its colour |
| Jumbo | Fastest | Red runway (it needs the long one) |
| Helicopter | Slow | Helipad |
| Seaplane | Medium | Water lane (Coast) |

Airports: **Airfield**, the classic two runways and a helipad, and **Coast**, a beach resort with a seaplane lane and a helipad at the end of the pier.

## Development

There is no build step: the game is plain HTML, CSS and JavaScript modules, so any static file server works.

```sh
npm install
npm start          # serves the folder on http://localhost:8080
npm test           # simulation tests (node --test)
npm run build:single   # bundle everything into one file: dist/flight-control.html
```

`npm run icons` regenerates `icons/` from the game's own artwork. It renders the PNGs with Playwright, which isn't a regular dependency: run `npm i --no-save playwright && npx playwright install chromium` first.

### Layout

| Path | What it holds |
| --- | --- |
| `index.html`, `css/style.css` | Page shell, menus and HUD |
| `src/sim.js` | Rules: arrivals, path following, landing zones, edge turn-backs, separation. No DOM, fully unit-tested |
| `src/config.js` | Tuning: speeds, sizes, difficulty ramp, colours |
| `src/maps.js` | Airport layouts and their SVG artwork |
| `src/art.js` | Aircraft drawings (SVG path data shared by canvas and DOM) |
| `src/render.js` | Canvas renderer for everything that moves |
| `src/view.js` | Screen fitting, safe areas and the portrait rotation |
| `src/input.js` | Multi-touch path drawing |
| `src/audio.js` | Web Audio sound effects and music |
| `src/main.js` | Game loop, screens and settings |
| `sw.js`, `manifest.webmanifest` | Offline support and home-screen install |

The world is always 400 units tall and as wide as the screen's aspect ratio allows (clamped between 1.55:1 and 2.3:1). In portrait the whole scene is turned a quarter so the long side runs down the screen, which is why rotating mid-game is seamless.

When you change files, bump `VERSION` in `sw.js` so installed copies pick up the update on their next launch.

## Credits

Inspired by *Flight Control* by Firemint (2009). This is a fan-made tribute and is not affiliated with or endorsed by Firemint or Electronic Arts. All code, artwork and sound here are original.

Type is set in [Jost](https://github.com/indestructible-type/Jost) by indestructible type\*, used under the SIL Open Font License (see `fonts/OFL.txt`).
