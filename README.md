# Church Street Skate

A 3D skateboarding score-attack game: a small open-world set in an accurate downtown Burlington,
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

A 3D skateboarding score attack. **Today's Line** is the main mode: one tap from the title,
90 seconds on one of five lines through town (Mall Bomb, College Hill, City Hall, The
Waterfront, Main Street) — a different one each day. Five B-T-O-W-N letters mark the line
(a light column stands on the next one); each is +500 and +5 s. Three goals a day (from a pool
of twelve, one easy, one medium, one hard) are +1,500 each and +5,000 for all three. The last
20 seconds are **Last Call**: every bank counts double. Today's best, the all-time run best
and a day streak are kept; the results card names tomorrow's line. The score goes to the
monthly leaderboard (`church-street-skate`).

Score is THPS-style: trick base × combo length, banked when you settle. Repeating a trick
pays less each time (first use ×1.5 FRESH, then ×1, ×0.7 … ×0.1), so variety is the way up.
Named **spot bonuses** sit on real Burlington features (City Hall steps and hubba, the
Firehouse piers, Big Joe's slab, the Insomnia boulders, the ski-lift bench, the Pomerleau
fountain, the Church terrace steps, the Fletcher Free steps, the globe pavers, the
construction barriers) and sixteen **named gaps** cross real geography.

**Free skate** (a small link on the title) is the whole downtown with no clock: the weekly
B-T-O-W-N route, thirteen **challenges** and the spot / gap collection, all in the pause menu.

Controls — phone: drag on the left to steer and push; **OLLIE** hold and let go; **TRICK**
tap = kickflip (the stick picks Hardflip / Varial Kickflip), double-tap = 360 Flip (The Maple
Leaf with the gold meter full), hold = grab, keep holding through a landing to manual. Land on
ledges and rails to grind. Keyboard: W/S push and brake, A/D steer and spin, Space ollie,
J/K/L kickflip / heelflip / shove-it, Shift grab and manual, P pause.

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
