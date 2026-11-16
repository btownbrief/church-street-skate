# Church Street Skate — advisor notes (2026-11-16)

Played as a 390x844 touch phone (real CDP touches, Metal GL) against the local branch, which is
byte-identical to live for everything below. Sessions: one hand-scripted "naive first 30 seconds",
four full 2-minute runs, a 90 s free skate down College St, a landing-difficulty test (30 ollies),
plus title / pause / results captures. Screenshots and scripts: `/tmp/upgrade-church-street-skate/`
(`sheetA1.png`, `sheetA2.png`, `sheetR1a.png`, `sheetR1b.png`, `sheetF1.png`, `sheetP.png`,
`results.png`). Bot numbers come from a scripted finger at roughly 10 updates a second on a loaded
machine, so treat them as "clumsy casual player", not as a skilled human.

## Verdict

There is a lovely, big, hilly Burlington in here and a real trick engine, but the game never
points you at any of it: every session starts at the same spot facing uphill into a quarter pipe,
and nothing changes between run 1 and run 10 or between today and tomorrow. It is harder than it
looks for dull reasons — a bug that freezes the skater, a mall packed with 222 solid posts and 30
ramps in a 12 m corridor, and landings that slam you for steering while you pop. The 2-minute run
can be "won" by standing still and tapping FLIP (8,310 points without moving for 80 seconds).
Phone UI is a desktop HUD squeezed into portrait: 4 buttons plus a stick, a minimap sitting on top
of the trick list, an 8-line manual on the title. Fix the freeze, clear the line, forgive the
landings, and give each day its own line through town — then it is a game people reopen.

## Scores (1–10)

| | Score | Why |
|---|---|---|
| Fun | 5 | Bombing College St at 42 mph is great. The mall, where you spawn, is a pinball table. |
| Difficulty curve | 3 | No curve at all; hardest thing is the first block. 13 bails in 90 s of casual play. |
| Readability | 4 | Skater is ~6% of screen height; camera starts buried in a ramp; canopies and posts cut across him. |
| Taste / Looks | 6 | The low-poly town is charming and coherent. The HUD and the title card are not. |
| Phone feel | 4 | Stick + 4 buttons + hidden alternate control scheme. Layout itself is stable and thumb-sized. |
| Variety | 4 | The world is varied; the game always shows the same 100 m of it. |
| Reason to return | 3 | Monthly board and a weekly letter route nobody is told about. No daily hook, no personal best for the run. |

## Ranked upgrade plan

Rough time for a strong engineer in brackets. Items 1–5 are the round; 6–8 if time allows.
Cut order if short: 8, then the shader half of 3, then the coach half of 7.

### 1. Fix the frozen skater (charge stuck after a ramp launch) [5 min]

**Evidence.** Hit in 3 of 4 runs, each within 30 s. Hold OLLIE on the ground, roll off a kicker
lip before releasing, release in the air: `charging` stays true forever because
`handleOllieCharge` only runs in ride/grind (`skate.js` 251, 507) and the launch branch
(`skate.js` ~200–218) never clears it. While `charging` is true you cannot push (line 171),
combos never bank (line 249) and the charge bar stays lit. `R2-02.png`: 1:30 left, 1 mph, bar
stuck at 80%, and the run sat at 10,944 for the remaining 95 seconds. Kickers sit every ~12 m on
the mall centre line and a full charge takes 0.45 s, so this is constant.

**Change.**
- In `step()` before the state switch: if `ev.ollieReleased || ev.ollieCancel` and state is `air`
  or `bail`, set `charging = false; charge = 0`.
- In the roll-off / launch branch of `stepRide`, set `charging = false`.
- Belt and braces at the top of `stepRide`: `if (this.charging && !inp.ollie) { this.charging = false; this.charge = 0; }`
  (cancel, no pop).

**Check.** Scripted: `__tp` 6 m before a Mall kicker at 10 m/s, press OLLIE, release 0.5 s later
(in the air), land, hold push 2 s → speed > 6 m/s and `#charge` has no `on` class. Add this to
`scripts/feature-checks.mjs`.

### 2. Make it fair: forgiving landings, soft small props, quick get-up [20 min]

**Evidence.**
- Landing test, 6 ollies per case on flat ground at 9 m/s: stick at 0 or 25% sideways → 0 bails;
  stick at 50% sideways (what a thumb does in any turn) → **3 of 6 bail**, tap ollie or full
  charge alike. Cause: the landing assist drops from 6 to 2.5 rad/s whenever `|steer| > 0.3`
  (`skate.js` 373), and the stick doubles as air spin at 6 rad/s.
- Free skate, 90 s, casual inputs: **13 bails** (8 spin, 4 wall, 1 pedestrian) — one every 7 s,
  each costing 1.6 s plus the roll back up to speed. About a third of the session is spent lying
  on the bricks.
- One 2-minute mall run logged **325 bumps**. Census of the mall corridor (within 6 m of the
  centre line, Pearl to College): 222 solid blockers — 44 trees, 30 bollards, 22 lamp posts, 18
  trash cans, 17 granite posts, 12 sandwich boards, 10 bike racks, 25 umbrella poles, more.

Note this reverses the 8/24 tightening ("people should mostly land straight"). Read that line
the other way round: the *assist* should make them land straight; the game should not slam them
when it does not.

**Change (config.js / skate.js).**
- Air spin needs intent on analog input: in `stepAir`, use
  `s = |steer| < 0.6 ? 0 : sign(steer) * (|steer| - 0.6) / 0.4` for the spin target. Keyboard
  (±1) is unchanged.
- Landing assist: delete the `> 0.3 ? 2.5` branch; use the weak rate only when `|steer| > 0.6`.
  `landAssistRate` 6 → 10, `landAssistHeight` 1.4 → 2.0.
- `landTolerance` 0.55 → 0.80 rad. Between 0.80 and 1.15 rad: land "sketchy" — keep the combo,
  halve roll speed, no spin points for that air. Slam only beyond 1.15 rad (truly sideways).
- Unfinished flip: bail threshold `flip.t < 0.82·dur` → `< 0.6·dur`; between 0.6 and 0.82 finish
  it and mark sketchy.
- `bailTime` 1.6 → 0.9 s. On bail keep `flow × 0.6` (was 0.35) and `special × 0.5` (was 0).
- Soft props: give `addBlocker` a `soft` flag and set it for Bollard, Granite post, Trash,
  Sandwich board, Bike rack, Bike, Hydrant, Pay station, Bowl planter (everything whose top is
  under ~1.2 m). A soft blocker never stops or bails the skater: pass through, lose 15% speed,
  play a short "clack", knock nothing else. Trees, lamp posts, walls, cars stay solid.
- `wallBailSpeed` 6.5 → 9 (a glancing brush at jogging speed should bounce, not slam).

**Check.** Rerun the landing test: 50% stick → 0 of 6 bails; full sideways stick held for a full
charge still spins and can slam. Rerun `run.js casual` three times: ≤ 3 bails and < 30 bumps per
2 minutes. `node scripts/playtest.mjs tricks hazards` still passes.

### 3. Clear the line and show the skater [25 min]

**Evidence.**
- The spawn (0, −12) sits on a "Mall quarter" ramp. First frame of the game (`A-00-start.png`):
  the bottom half of the screen is the inside of a brown ramp and the skater is a hat. He is
  already rolling at 3.8 m/s and scores a "Big Drop +146 STOMPED!" three seconds in without the
  player touching anything.
- `skatepark.js` 304–305 caps both ends of every mall block with a 4.4 m wide, 2.1 m tall
  quarter pipe dead on the centre line: 8 walls across the one street the player is told to
  skate. With kickers, funbox, pads and rails also at offset 0, the centre line has a piece of
  furniture every ~12 m.
- Tree canopies, bunting, umbrellas and the tower crane repeatedly sit between camera and
  skater (`sheetR1b.png` frame 2, `sheetA2.png`). The audit's "umbrellas hide the skater" is
  right, and canopies are worse.
- Skater height on screen ≈ 50 px of 844. College St, with nothing overhead, reads perfectly
  (`sheetF1.png`) — that is the target.

**Change.**
- Delete the 8 mall quarter pipes (keep City Hall Park halfpipe and Battery Park). Keep the
  kickers, the funbox and the rails; move the manual pads to offset ±2.6 opposite the rails so
  the granite centre line is clean brick between kickers.
- Spawn on flat brick with 25 m of clear run ahead (verify with `__near(x, z, 6)` returning no
  ramp/quarter/blocker), skater at rest.
- Portrait camera (aspect < 1): `camDist` 5.2 → 4.2, `camHeight` 2.1 → 2.8, look-ahead 2.4 →
  3.2. Target: skater 90–110 px tall at 390x844, feet at about 58% of screen height, above the
  buttons.
- See-through occluders: one helper `seeThrough(mat)` using `onBeforeCompile` on the canopy,
  umbrella, awning, bunting and banner materials, with two shared uniforms set each frame from
  the skater's projected position (`uHole` in pixels, `uHoleZ` = skater depth):
  `if (gl_FragCoord.z < uHoleZ && distance(gl_FragCoord.xy, uHole) < uHoleR) discard;`
  with `uHoleR` ≈ 18% of screen width. Fallback if that fights the merged meshes: drop café
  umbrella canopies within 8 m of the centre line and lift every mall tree canopy so its
  underside is ≥ 6 m.

**Check.** 20 screenshots at 5 m steps down the mall centre line (`__tp` + screenshot): the whole
skater is visible in all 20. First frame after tapping play shows the full skater, standing, on
open brick. `node scripts/playtest.mjs mall holes` passes. Draw calls stay ≤ 110 on mobile tier.

### 4. Today's Line — a daily run that starts somewhere new [35 min]

**Evidence.** Every run is the same spawn, same direction, same 2:00. The best minute I had was
College St at 42 mph picking up B-T-O-W-N letters by accident — this week's letter route happens
to be there, and nothing in the game says so. The map already has five distinct "levels"; the
game shows one. There is no personal best for the run, no streak, nothing dated.

**Change.** Replace "2-minute run" with **Today's Line**. Same leaderboard, same game id, same
single `submitScore(skater.score)` at the buzzer; `js/leaderboard.js` untouched.
- **Five lines, one per day** (`dayIndex = floor(localMidnight / 86400000) % 5`), each a name, a
  start (x, z, yaw) and five letter positions. Reuse `ROUTES` in `letters.js`:
  1. *Mall Bomb* — start top of the mall (−16.5, −360) facing south, downhill; "The mall run" letters reversed.
  2. *College Hill* — start (−30, 3) facing west; "College hill" letters.
  3. *City Hall* — start (−46, 90) facing the park; "City Hall to Main" letters.
  4. *The Waterfront* — start (−462, −5) facing north; "The waterfront" letters.
  5. *Main Street* — start (0, 128) facing west down Main; five new letters along z ≈ 132 from
     x = −40 to −260, ending before the mega kicker.
  Verify every start and every new letter with `__ground` / `__near` (repo rule).
- **Letters are the breadcrumbs.** In a run they reset every run, and the next uncollected one
  shows a tall soft-yellow light column (one unlit cylinder, 40 m tall, 0.6 m wide, 35% opacity)
  so you can see where to go from 150 m away. Each letter: +500 and **+5 s** on the clock. All
  five: the existing +2,500. Free skate keeps the weekly letters exactly as now.
- **Clock:** `runSeconds` 120 → **90** base; with five letters, 1:55. Shorter runs, more retries.
- **Three goals a day**, seeded by the date from this pool, shown as three small chips under the
  clock that turn green: Land a 360 Flip · Grind for 3 s total · Manual 15 m · Clear a named gap
  · Hop a car · Hit 45 mph · Bank a 3,000 combo · Land a 540 · Land a backflip · Stomp 3
  landings · 30 s without a bail · Collect all five letters. Each goal +1,500; all three +5,000
  and a "LINE CLEARED" callout. All are detectable from events that already exist.
- **Last Call:** at 0:20 remaining the clock goes red, a "LAST CALL ×2" callout fires, and every
  bank until the buzzer is doubled. The last 20 seconds must not feel like the first.
- **Persistence (new keys only; never rename `css-best`, `css-gaps`, `css-challenges`,
  `css-letters-*`, `btown-player-*`):** `css-daily` = `{ date, best, goals:[bool,bool,bool] }`,
  `css-streak` = `{ last, n }`, `css-run-best` = number.
- **Results card:** score count-up, "NEW BEST TODAY" when it is, today's best and all-time run
  best, the three goals ticked or not, streak, and one line: "Tomorrow: Main Street". Primary
  button "Again" stays one tap.

**Check.** Override the date (`?day=0..4`): five different start screenshots, each on a clear
line with the first light column in view. Collect a letter → clock +5 s. Complete a goal → chip
green, +1,500. Finish two runs → results shows today's best; reload → title shows it and the
streak. Set `css-streak.last` to yesterday → streak increments; to two days ago → resets to 1.
Leaderboard request still carries game `church-street-skate` and the final score.

### 5. Stop paying for the same trick forever [10 min]

**Evidence.** Run 1 spent 80 s wedged beside a sandwich board and still scored 8,310: a standing
full ollie reaches 3.9 m, so every hop pays "Big Drop +234" plus a kickflip. Results listing:
Big Drop ×10, Kickflip ×9. The best strategy in the leaderboard mode is to not skate.

**Change.**
- Per-run staleness by trick name: 1st use ×1.5 with a "FRESH" tag in the combo line, then
  ×1.0, ×0.7, ×0.45, ×0.25, floor ×0.1. Grinds and manuals go stale by name too. Reset per run
  (and every 60 s in free skate).
- "Big Drop" only when the landing is ≥ 1.5 m below the takeoff ground; "Big Air" only when the
  air started from a ramp launch (`launch` event) or a grind exit. A flat-ground ollie earns
  neither.
- A flip trick popped below 3 m/s roll speed pays 25%.

**Check.** Script: stand still, 20 × (full ollie + flip) → under 1,500 total. Same 20 tricks
while rolling a line with 6 distinct names → at least 3× that. Combo line shows FRESH on a first
use.

### 6. Two buttons and a HUD diet [20 min]

**Evidence.** `sheetA1.png` / `sheetR1a.png`: score, best, two meters, letter tray, a two-line
location pill, speed, MAP, pause, minimap, trick tape *underneath* the minimap, combo line,
callout, wreck toast and the first-play hint are all on screen in portrait; the callout and the
wreck toast overlap each other. Four trick buttons plus an optional flick pad is more than a
thumb can learn in a 90 s game.

**Change (touch only; keyboard and gamepad untouched).**
- Buttons: **OLLIE** (hold and release, as now) and **TRICK**. TRICK tap in the air = flip
  (`flipA`; stick left/right already picks Hardflip / Varial Kickflip). Double-tap within 0.25 s
  = 360 Flip (send `shove` on the second tap; widen the upgrade window at `skate.js` ~277 from
  0.18 to 0.25 s). TRICK held > 0.18 s = `grab` for as long as it is held, so "hold through the
  landing to manual" still works. With the special meter full, the double-tap fires The Maple
  Leaf. Remove the SHOVE and GRAB buttons, the flick-pad toggle and its pause-menu button on
  touch (keep `flickpad.js` for the gamepad stick).
- Remove on touch: minimap and MAP button during a run (the light column replaces them; free
  skate keeps the map behind a pause-menu toggle, default off in portrait), speed readout, trick
  tape, "wreck score" toast, the flow meter (keep one gold special bar), `best` under the score
  during a run.
- Location pill: show for 1.5 s when the name changes, then fade out. One line, ellipsis.
- One callout at a time: queue them, 1.6 s each (4.2 s now).
- Pause menu: Resume, Restart, Sound on top; spots / gaps / challenges collapsed behind one
  "Collection 1/21 · 0/15 · 0/13" row. The card is 1,276 px tall inside a 741 px box today.

**Check.** During play in portrait there are at most 5 HUD items: score, clock, goal chips,
special bar, pause. No two HUD boxes overlap (extend the layout audit in
`scripts/shot-mobile.mjs`). 360 Flip, manual and grab are each reachable with OLLIE + TRICK in a
scripted touch test. Two fingers at once (stick + OLLIE + TRICK) still register.

### 7. Title in one tap, teach by doing [10 min]

**Evidence.** `local-title.png`: the card is 747 px of text — a paragraph, an ordinance joke, a
mode explainer, an 8-line controls manual (394 characters), build stats and credits. Two equal
buttons force a choice before the player knows what either means.

**Change.**
- Title: eyebrow, logo, one line ("3D skateboarding score attack"), one big button
  **TODAY'S LINE — College Hill** with today's best and streak under it, a small text link
  "Free skate", and the one-line OSM/USGS credit (attribution must stay). Delete `.sub`,
  `.fineprint`, `.modenote`, `#how` and the "Downtown loaded" stats line; the loading state lives
  inside the button ("Building Burlington…").
- Coach, first run only, one prompt at a time with the control pulsing: "Drag up to push" until
  speed > 5 m/s → "Tap TRICK" until a flip lands → "Hold OLLIE, let go" until a charged pop.
  Keep the existing `css-ollied` key as the "done" flag. Desktop keeps a one-line key legend in
  the pause menu.
- If the shared ticker is added to this game later, call `BtownTicker.hide()` on start and
  `.show()` on title/results. There is no ticker tag in this repo today; do not add one this round.

**Check.** Fresh profile: title fits in 844 px with no scrolling and ≤ 25 words outside the
buttons; one tap starts play; coach prompts advance on the right actions and never reappear.

### 8. Juice the payoff moments [10 min]

**Evidence.** Banking a combo is a "+110" that looks the same at 110 and at 2,754. Bails and
stomps have camera shake and sound but no haptics. Results are static text.

**Change.** Bank popup scales with value (30 px under 500, 44 px over 2,000, gold flash over
5,000) and its sound pitch rises with combo length. `navigator.vibrate?.(…)`: 10 ms on land, 25
ms on stomp, [30, 40, 30] on bail, guarded so iOS ignores it. A 120 ms hit-pause (time scale
0.2) on stomp and on a new-gap callout. Results score counts up over 0.8 s with a tick sound.
Use one display face for score, clock and title (Bebas Neue via Google Fonts, system fallback).

**Check.** Visual: screenshots of a 200-point and a 3,000-point bank differ obviously. No
console errors on iOS UA when `navigator.vibrate` is undefined.

## Remove list

- The 8 mall quarter pipes, and the spawn that sits on one.
- Title: subtitle paragraph, ordinance fine print, mode note, 8-line controls text, build stats.
- Touch: SHOVE and GRAB buttons, flick-pad toggle, MAP button, speed readout.
- HUD: trick tape, in-run minimap, flow meter, "wreck score" toast, permanent location pill.
- Scoring: Big Drop / Big Air for flat-ground ollies; full value for the tenth identical trick.
- Hard collisions on anything shorter than the skater's hip.
- The "Free skate vs 2-minute run" choice as the first decision.

## Keep list

- The town. Real streets, real hills, College St at 42 mph. It is the game's whole identity.
- The trick engine: flips, variants, spins, grinds, manuals, reverts, stomps, The Maple Leaf.
- Named spots and gaps, and the car hop. Good "you cleared THAT?" moments.
- B-T-O-W-N letters — promote them from a hidden weekly extra to the daily breadcrumb trail.
- Free skate, the 13 challenges and the collection lists, one tap deeper.
- Monthly leaderboard: game id `church-street-skate`, `js/leaderboard.js` byte-identical.
- All existing localStorage keys (`css-best`, `css-gaps`, `css-challenges`, `css-letters-*`,
  `css-ollied`, `css-flick`, `btown-player-*`).
- No build step, vendored three.js, `?test=1`, the dev hooks and both test batteries.
- Stable thumb-sized layout, auto-pause on tab hide, the red-jacket skater.

## Acceptance tests

1. **Freeze bug:** charge through a kicker and release in the air → pushing works on landing;
   charge bar hidden. Three casual-bot runs: score increases in every 20 s window.
2. **Fairness:** 50% stick held through 6 ollies → 0 bails. Casual bot: ≤ 3 bails and < 30 bumps
   per 2 minutes on the mall (was 6 and 325).
3. **First 10 seconds:** fresh profile at 390x844 — one tap from title to play; the first frame
   shows the entire skater on open brick; nothing scores until the player acts.
4. **One-second read:** 20 mall screenshots, skater fully visible and 90–110 px tall in all;
   ≤ 5 HUD items; no overlapping HUD boxes.
5. **Two buttons:** kickflip, 360 Flip, grab, manual, grind and The Maple Leaf all performed
   with stick + OLLIE + TRICK using real touch events.
6. **No grinding the score:** 20 standing flip-ollies < 1,500 points.
7. **Minute 1 vs the end:** Last Call fires at 0:20 and doubles banks; a letter adds 5 s.
8. **Tomorrow:** `?day=0..4` gives five different starts, names and goal sets; streak and
   today's best survive a reload; results names tomorrow's line.
9. **Leaderboard and saves:** score submits once per run under `church-street-skate`; a profile
   carrying the old keys keeps its best, gaps, challenges and letters.
10. **Regression:** `node scripts/playtest.mjs` and `node scripts/feature-checks.mjs` pass
    (update the checks that assumed 120 s, the quarter pipes or the old landing tolerance); no
    console errors; mobile tier ≤ 110 draw calls.
