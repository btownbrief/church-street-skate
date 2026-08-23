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

## Code map

See `docs/ARCHITECTURE.md`. Short version: `js/skate.js` is the physics + tricks +
scoring (no rendering), `js/collide.js` is the physics world that the builders populate
(`ground.js`, `city.js`, `landmarks.js`, `props.js`, `npcs.js`, `traffic.js`), and
`js/world.js` wires them. three.js r160 is vendored; there is no build step.

## Dev

```
python3 -m http.server 8765 --bind 127.0.0.1   # then open http://localhost:8765/
node scripts/shot.mjs out/prefix [mobile]        # headless playtest + screenshots (needs playwright)
python3 tools/build_world.py                     # re-bake data/world.js from OSM + USGS
```

`?test=1` loads a flat test course instead of Burlington (physics tuning).

## Attribution

Map data © OpenStreetMap contributors (ODbL). Elevation: USGS 3DEP (public domain).
