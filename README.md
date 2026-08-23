# Church Street Skate

A small open-world 3D skateboarding game set in an accurate downtown Burlington,
Vermont — the Church Street Marketplace, City Hall Park, and the hill streets that drop
west toward Lake Champlain. Plain static site: open `index.html` (or any static host) and
skate. Keyboard on desktop, touch stick + buttons on phones.

## How it was built

- **Geometry is real.** `tools/build_world.py` pulls building footprints (1,088 of them
  with surveyed heights), streets, the pedestrian mall, parks, steps, walls, and every
  mapped storefront from OpenStreetMap, and a 5 m elevation grid from USGS 3DEP LiDAR,
  and bakes them into `data/world.js` (coordinates in metres from Church & College).
  Church St really does drop 9.6 m from Pearl to Main; Main St loses 21.5 m between
  Church and Battery. See `docs/DATA.md`.
- **Identity is researched.** `docs/BURLINGTON-REFERENCE.md` is the ground-truth doc
  the builders worked from: block-by-block storefronts (Aug 2026), landmark descriptions
  from photos and historic-district files, the three-zone brick paving with its granite
  meridian line, the benches/boulders/lamps/banners, the 2020 City Hall Park redesign,
  the Burlington Square tower + construction site, the things that are *gone* (Nectar's,
  the Leahy Way mural) so they aren't built by mistake.
- **Art is original.** Every building, person, car, sign and tree is generated in code
  from primitives and small canvas textures. Business names appear as plain text for
  place recognition only — no logos, wordmarks or brand art.

## What there is to do

Free skate — no timer, no fail state. Score is THPS-style: trick base × combo length,
banked when you settle, with named **spot bonuses** on real Burlington features (City Hall
steps and hubba, the Firehouse piers, Big Joe's slab, the Insomnia boulders, the ski-lift
bench at the top of the mall, the Pomerleau fountain, the Church terrace steps, the
Fletcher Free steps, the globe pavers, the construction barriers). Eight **challenges**
sit on the pause screen and persist between sessions — grind the City Hall handrail, land
a 360 flip on the bricks, bomb College St from Church to Battery without bailing, manual
40 m down the granite line, ollie onto a parked car, grind Big Joe's slab, bank a
10,000-point combo, find every spot.

## Code map

See `docs/ARCHITECTURE.md`. Short version: `js/skate.js` is the physics + tricks +
scoring (no rendering), `js/collide.js` is the physics world that the builders populate
(`ground.js`, `city.js`, `landmarks.js`, `props.js`, `npcs.js`, `traffic.js`), and
`js/world.js` wires them. three.js r160 is vendored; there is no build step.

## Dev

```
scripts/serve.sh &                               # static server on :8765
node scripts/playtest.mjs                        # headless physics battery (needs playwright)
node scripts/shot.mjs out/prefix [mobile]        # scripted keypresses + screenshots
node scripts/shot-mobile.mjs out/prefix [portrait]  # touch-control + layout audit
python3 tools/build_world.py                     # re-bake data/world.js from OSM + USGS
```

`?test=1` loads a flat test course instead of Burlington (physics tuning).
Pushing to `main` publishes to GitHub Pages (`.github/workflows/deploy.yml`).

## Attribution

Map data © OpenStreetMap contributors (ODbL). Elevation: USGS 3DEP (public domain).
