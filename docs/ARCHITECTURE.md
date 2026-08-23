# Church Street Skate — architecture contract

Plain static site, **no build step, no npm**: `index.html` + `style.css` + ES modules in
`js/`, three.js (r160) vendored at `vendor/three.module.min.js`. Everything is original
low-poly art built procedurally in code; no external assets, no CDN. Must run at a
playable frame rate on a mid-range phone.

## Coordinate system (contract with `data/world.js`)

- Origin = Church St ∩ College St (real lat/lon in `WORLD.origin`).
- `x` = metres EAST, `z` = metres SOUTH (north is −z), `y` = metres UP relative to the
  origin's ground elevation. three.js uses these directly: `position.set(x, y, z)`.
- Heading/yaw convention: `yaw = 0` faces **north** (−z); `yaw` increases turning
  **left** (counter-clockwise seen from above). Forward vector = `(−sin yaw, 0, −cos yaw)`.
  Helper: `fwd(yaw)` in `js/util.js`.
- `WORLD` (see `docs/DATA.md`) holds terrain heightmap, roads, areas, buildings, pois,
  props, lines. `js/data.js` loads it and derives the playable bounds
  (`PLAY = {minX,maxX,minZ,maxZ}`) and the Church Street landmarks table.

## Module map (who owns what)

| file | owner | responsibility |
|---|---|---|
| `js/main.js` | lead | boot, screens (title/pause/game-over), main loop, resize, quality tier |
| `js/util.js` | lead | math helpers, seeded RNG, `fwd(yaw)`, lerp, clamp, canvas-text textures |
| `js/collide.js` | lead | **the physics world**: spatial hash of surfaces / grind edges / walls / ramps; ground query; nearest-edge query; wall push-out. World builders *populate* it, physics *reads* it |
| `js/terrain.js` | lead | heightmap sampler (`heightAt`, `normalAt`), built from `WORLD.terrain` (with smoothing) |
| `js/skate.js` | lead | skater physics + trick state machine + scoring events (no rendering) |
| `js/skater-mesh.js` | lead | low-poly skater + board visuals driven by `skate.js` state |
| `js/camera.js` | lead | third-person follow camera |
| `js/input.js` | lead | keyboard + touch (virtual stick + buttons) → one `input` object |
| `js/hud.js` | lead | score / combo / trick popups / spot callouts / minimap / location label |
| `js/audio.js` | lead | WebAudio procedural SFX (roll, pop, land, grind, bail) |
| `js/ground.js` | builder A | terrain mesh, roads (asphalt ribbons), Church St brick mall, sidewalks + granite curbs, crosswalks, park lawns/paths, parking lots, City Hall Park fountain plaza; lake + Adirondacks backdrop, sky/sun/fog. Populates `collide` with sidewalk slabs, curbs, park walls, fountain edge, stairs |
| `js/city.js` | builder B1 | generic buildings extruded from footprints with facade textures, storefront band + awnings + signage for Church St tenants (skips footprints listed in `ctx.landmarkIds`). Populates `collide` walls (building polygons) |
| `js/landmarks.js` | builder B2 | exports `LANDMARK_IDS` (OSM building ids it replaces) + `buildLandmarks(ctx)`: hand-modelled Unitarian Church, City Hall + steps + bronzes, BCA Firehouse, Masonic Temple, Richardson Bldg, Howard Opera House, Leunig's, Sweetwaters, marble banks, Flynn marquee, Burlington Square tower + construction site, hotels, Fletcher Free Library… Populates `collide` walls/steps/ledges for those |
| `js/props.js` | builder C | street furniture: benches, planters, lamp posts w/ banners, bollards, trees, bike racks, kiosks/vendor carts, café tables+umbrellas, trash cans, statues, info booth, string lights; InstancedMesh everywhere. Populates `collide` surfaces + grind edges (benches, planters, ledges, rails) with `name`s for spot callouts |
| `js/npcs.js` | builder D | pedestrians (walk cycle, waypoints on Church St + sidewalks, react to skater, knock-downs), dogs, buskers, seated diners |
| `js/traffic.js` | builder D | cars/buses on car streets (not on the pedestrian mall), follow `WORLD.roads` polylines, one-way aware, yield, hit = bail |
| `js/world.js` | lead | thin orchestrator: builds terrain → ground → city → props → npcs → traffic; exposes `world.update(dt, skaterPos)` |
| `js/env.js` | builder A | time-of-day lighting preset (golden hour), drifting leaves / snow particle option, distance fog, lamp glow at dusk |
| `js/challenges.js` | lead | eight Burlington challenges, ticked off from `skater.events` + a per-frame tracker, persisted in `localStorage` |
| `js/devhooks.js` | lead | the `window.__*` headless-playtest hooks (`__sim` / `__tp` / `__drive` / `__air` / `__near` / `__pick` / `__ground` / `__meshes` / `__look` / `__topdown` / `__dbg`). Kept out of `main.js`; nothing runs unless a test calls it |

Builders must not touch files they don't own. Shared constants in `js/config.js`.

### Decisions worth knowing before you edit the world builders

- **Sidewalks are ramps, not boxes.** `ground.js` registers each 5 m sidewalk segment with
  `addRamp`, matching the drawn quad exactly. A flat-topped box per segment left a ~25 cm
  step at every joint on the hill streets — taller than the skater's 0.24 m `stepUp`, so
  riding uphill on a sidewalk stopped dead.
- **Physics boxes may be bigger than the art.** The City Hall landing's collision box is
  0.9 m longer and 0.9 m deeper than the granite block that is drawn, so it overlaps the
  top of both stair ramps (a flush fit left a crack that dropped the skater 2.4 m) and
  reaches out past the cheek walls so the hubba can be lined up on.
- **Every `InstancedMesh` slot must be written.** An unwritten slot keeps the identity
  matrix, i.e. a 1 m cube at the world origin — which here is Church & College. `npcs.js`
  and `traffic.js` park every slot off-world at build time; `props.js` sizes its meshes to
  the instances it actually placed.
- **Parked cars carry two decks** (`traffic.js`): the hood/trunk sheet metal at ~0.9 m and
  the cabin roof above it, both `kind: 'car'`. A full-charge ollie peaks at 1.24 m, so the
  deck is the reachable one.

## Collision contract (`js/collide.js`)

All builders register physical objects with these calls (positions in world metres):

```js
collide.addSurface({ x, z, w, d, yaw, top, bottom, kind, name, grindable })
  // a flat-topped rotated box. w = size along local X, d = size along local Z, yaw as above.
  // top/bottom = absolute y of top face and bottom face. kind: 'ledge'|'bench'|'planter'|
  // 'curb'|'sidewalk'|'table'|'stairs'|'wall'|'fountain'|'platform'|'car'.
  // grindable=true registers the two LONG top edges as grind edges (kind 'ledge'); pass
  // allEdges:true to add the short ends too (a bench's ends are not a grind target).
collide.addEdge({ ax, ay, az, bx, by, bz, kind, name })   // 'rail'|'ledge'|'handrail'
collide.addWall({ ax, az, bx, bz, top, name })               // vertical segment, infinite below top
collide.addRamp({ ax, az, bx, bz, w, yLow, yHigh, kind, name })  // sloped surface from edge A→B
  // (used for stair sets: visual steps, physical ramp; the physics treats it as ground)
collide.addPolygonWalls(pts /*[[x,z],...]*/, top, name)      // convenience for building footprints
collide.addBlocker({x,z,r, name})                            // cylinder blocker (tree trunks, poles)
```

Queries used by physics: `groundAt(x, z, yHint)`, `nearestEdge(x,y,z,maxDist)`,
`resolveWalls(pos, radius)`, `blockersNear(x,z)`. Everything goes into a uniform grid
(cell 8 m) so queries are O(nearby).

## Skate physics summary (`js/skate.js`)

Ground: terrain + surfaces. Pushing: impulses to ~9 m/s, downhill gravity along slope
(Burlington's hills matter), rolling friction low, brake = foot drag. Turning rotates the
board; velocity is pulled toward heading (carve grip). Ollie: hold to charge
(0–0.45 s) → vertical 3.4–6.5 m/s, i.e. a peak of 0.34–1.24 m. Air: steer = spin (yaw rate), flip buttons start
board flips (~0.42 s). Land: bail if flip unfinished, if |yaw − velocity dir| mod 180 >
38°, if speed into a wall is high, or if a car/pedestrian is hit. Grinds: while airborne and no longer rising
(`vel.y < 0.25`), within 0.6 m of a grind edge horizontally and between 0.25 m below and
0.55 m above it → snap and slide along the edge; balance drifts, steer to correct; ollie out or fall off at the end.
Manual: hold back/forward after landing on flat (balance mechanic). Scoring: THPS style
(trick base × combo multiplier, combo banked on clean landing, lost on bail) with named
**spot bonuses** keyed to real Burlington features (e.g. "City Hall steps", "Leunig's
corner", "Bank St planter", "Fountain gap").

## Performance rules

- Pixel ratio capped (2 desktop, 1.5 phone). One directional light with a small shadow
  map that follows the skater on desktop; no shadows on the low tier.
- Merge static geometry by material; props use `InstancedMesh`; textures are small
  canvases (≤512px) generated at boot.
- Fog + lake backdrop hide the world edge. Draw-call budget ≈ 150 desktop, ≈ 110 phone.
- `main.js` measures FPS and drops tiers (shadows → pixel ratio → NPC count).
- Mobile cuts, all gated on `ctx.quality.mobile`: half-resolution terrain lattice, 8 m road
  resample, roof-edge detail only within 140 m of Church St, `SEG()` coarsens every round
  primitive in `props.js`, and every flat-coloured landmark material merges into one
  vertex-coloured mesh. Measured on an iPhone 13 profile: ~99 meshes, ~295k triangles.

## Headless playtesting

`scripts/serve.sh` keeps a static server on :8765. Then:

```
node scripts/playtest.mjs [test ...]     # physics battery: mall, college, main, cityhall,
                                         # grinds, holes, car, hazards, edges, tricks,
                                         # spots, perf   (add `mobile` for the phone tier)
node scripts/shot.mjs <prefix> [mobile]  # scripted keypresses + screenshots
node scripts/shot-mobile.mjs <prefix> [portrait]   # touch-control + layout audit
```

`playtest.mjs` drives the real game through `js/devhooks.js` — `__drive` steers along
waypoints and reports bails, stalls and camera jitter; `__air` unit-tests the grind snap on
every registered edge; the `holes` test sweeps the skateable areas on a 0.3 m grid looking
for cracks between two builders' surfaces.
