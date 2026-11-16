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

## Review after upgrade

Played the branch fresh as a 390x844 touch phone (real CDP touches, Metal GL, about 10 finger
updates a second): 8 full Today's Line runs across all five lines (`?day=0..4`), two of them
back to back with Again, plus a gesture test of every trick on the two buttons, pause, Last
Call, results, reload, free skate and one landscape pass. BEFORE is the advisor session above
(live `main`). Three bots: "naive" pushes straight and taps, "follow" steers at the light,
"tricky" uses full charges, double-taps and held TRICK. Scripts, logs and contact sheets are
in `/tmp/upgrade-church-street-skate/review/` (`sh-d0-a.png` … `sh-d4.png`, `sh-misc.png`).
No console errors in any session. 60 fps, 98 draw calls on the mall.

### Verdict

It is a different game, and a much better one, for the first 40 seconds of every run. One tap,
a huge readable skater on open ground, a light to chase, letters that pay time, two buttons
that do everything. Then the fifth letter is collected, the light goes out, and the remaining
50–70 seconds are the old aimless free skate with a clock on it. That back half is where the
bails, the walls, the alleys and the boredom all live. And inside one day, run 2 is run 1
again: same start, same letter spots, same three goals, most of them already ticked.

### Scores (1–10), before → now

| | Before | Now | Why |
|---|---|---|---|
| Fun | 5 | 7 | Chasing the light down Main St or the mall at 40 mph is the game it should be. Fun drops off a cliff once the letters are gone. |
| Difficulty curve | 3 | 5 | The line itself is fair now: 0–2 bails while following letters. After that 9–12 bails a run, and nothing ever gets harder. Goals are one-gesture easy. |
| Readability | 4 | 7 | On the line: skater 80–200 px, 5 HUD items, clear street. Off it the camera still collapses (skater 750 px tall, or a screen of grey). |
| Taste / Looks | 6 | 7 | Title, HUD, results and pause are clean and consistent. STOMPED spam and big white squares are the tacky bits. |
| Phone feel | 4 | 8 | Two buttons, every trick reachable, layout stable, Again is one tap. Best single improvement of the round. |
| Variety | 4 | 6 | Five real lines across the week. Within a day nothing varies, and the second half of every run is identical wandering. |
| Reason to return | 3 | 6 | A new line tomorrow, today's best, a streak. But goals are done on run 1, the streak is hidden until day 2, and there is no next rung to climb. |

### What clearly improved

- **Frozen skater is gone.** Not one stuck charge in 8 runs (was 3 of 4).
- **First ten seconds.** Title is one button. First frame is the whole skater standing on open
  ground, clock stopped until you move (`sh-d0-a.png` frame 1; compare `sheetA1.png`).
- **The line reads.** Mall Bomb centre line is brick and kickers, not walls. College Hill and
  Main Street on the road are the best-looking frames in the game (`sh-d1-a.png` 2–3, `sh-d4.png` 1–2).
- **Two buttons work.** Real-touch test, 5 tries each: tap = Kickflip, double-tap = 360 Flip,
  held TRICK through a landing = Manual, gold bar + double-tap = The Maple Leaf (3 of 3), full
  stick + ollie = 540 (4 of 4, clean), stick down in the air = Backflip (4 of 4).
- **Fair while you are on the line.** Follow bot: 2 bails in the first 42 s on Main Street, 0
  spin slams from a steering thumb. Soft props clack instead of slamming.
- **Scores mean something.** Naive straight-line play 2.9k–3.8k; following the light 7k–23k;
  using the trick buttons well 31k. Standing still no longer wins.
- **Run structure.** Letters add time, Last Call turns the clock red, results count up, name
  tomorrow's line, and Again restarts in one tap with one frame loop (4 retries, no slowdown).
- **Saves and board.** New keys only; `js/leaderboard.js` has no diff against `main`; game id
  unchanged. Network to the board was blocked in my sessions so test scores never reached it;
  the submit path was read, not exercised live.

### Still weak or broken

1. **The run runs out of game.** Letters were all collected with 60–78 s still on the clock in
   every follow run. After that: Mall Bomb scored 21,900 by 1:00 left and 23,019 at the buzzer
   (1,100 points in the last minute); Waterfront 12,920 → 14,664; Main Street 8,860 → 11,287.
   Last Call doubles banks of 20. Letters + goals are 60–90% of a casual score.
2. **Run 2 is run 1.** Same start, same five letter spots, same three goals, already ticked.
   College Hill and Mall Bomb had all three goals cleared on the first run by a bot. The goal
   pool is 12 single-gesture items; "Collect all five letters" is the hard goal on 8 of the
   next 15 days and happens by itself.
3. **Leaving the street is a trap.** (a) The west map edge is an invisible wall that multiplies
   speed by 0.2 every frame (`world.js` `confine`): the Bluff Bomber on today's Waterfront line
   sends you into it, and the follow bot stood at 0 mph on the grass at (−643, −333) for the
   last 40 s (`sh-d3-b.png`). Pushing north, south or west there ends at 0.04 m/s. (b) City Hall:
   overshoot the steps, cross Main St, and you are in an alley at (−30, 164) with the last
   letter behind a building — 60 s, 127 bumps (`sh-d2-b.png`). (c) College Hill: 40 s on a lawn
   behind buildings near (−360, −20). A missed letter (2.0 m reach at 20 m/s) forces a U-turn
   uphill because the light only ever points at the next one in order. There is no touch
   control to get back to the line.
4. **Camera collapses near walls.** In that alley the skater is 670–790 px tall — the whole
   screen is his jacket for most of a minute. At Battery Park one frame is solid grey
   (`sh-d3-a.png` frame 6); on the mall the lens ends up inside a brick wall (`sh-d0-b.png` frame 1).
5. **STOMPED! is noise.** 8–16 a run. It fired at score 0 for rolling over a funbox with no
   trick, and on +20 kickflips. Its burst is ~30 big white squares drawn over the stick and
   buttons (`sh-d1-a.png` frame 6, `sh-d4.png` frame 3). Also a free-skate "CHALLENGE: COLLECT
   B-T-O-W-N · 12 to go" card appeared mid-run on top of it (`sh-d3-a.png` frame 8).
6. **No ramp, no next rung.** Second 80 is exactly as hard as second 5. Results show a number
   and nothing to aim at except beating it.

Smaller: landscape hides the skater behind the callout stack (`sh-land.png`); free skate still
spawns facing a kicker with bunting across the view; the letter tray is nearly invisible until
a letter is lit; the B-T-O-W-N letters and the Waterfront road are visually flat next to the
mall. There is no ticker script tag in this repo or on the live page, so none was added; the
guarded `BtownTicker.hide()/show()` calls are in place.

### FINAL PUNCH LIST (ranked by impact)

1. **Never let the light go out.** When the fifth letter is collected, lay a second set
   further along the same line (a `letters2` array per line in `daily.js`, gold, +750 and +5 s
   each, then a third set looping back to the start). Raise `RUN_REACH` 2.0 → 3.5 m, and if the
   skater passes a letter by more than 15 m the beacon moves to the next one instead of
   demanding a U-turn. Check: in a follow-bot run the beacon is visible in every 8 s screenshot
   until the buzzer, and the last 30 s score at least 25% of the run.
2. **Make run 2 different from run 1.** (a) Goals rotate: when a goal is cleared today, the
   next run swaps in the next unused goal of that tier (store cleared ids in `css-daily`), so
   three open chips always show. (b) Grow the pool to ~20 with real hard ones: 5,000 combo,
   2-car hop, grind 5 s, two gaps in one run, a 720, letters with no bail. Drop "Collect all
   five letters" from the hard tier. (c) Two letter layouts per line, alternating by run number
   (B puts letters over the kickers and in the rail lanes). Check: three Again runs in a row
   show three different chip sets and two letter layouts.
3. **Always a way back, and no glue at the map edge.** `confine`: reflect the velocity (keep
   60%) and turn the skater to face inward instead of `×0.2` every frame. Add a touch "BACK TO
   LINE" pill that fades in when speed stays under 1.5 m/s for 2 s or the skater is more than
   45 m from the nearest letter segment for 4 s: one tap respawns at the last collected letter
   facing the next, clock still running, combo dropped. Check: `__tp(-643,-333)` then push
   north for 4 s ends above 5 m/s; the pill appears in the City Hall alley and on the College
   lawn and returns the skater to the line.
4. **Camera never eats the screen.** In `camera.js`, when a wall blocks the boom, lift the
   camera up (to 6 m) before pulling it in, never closer than 3.0 m, and apply the see-through
   hole to building walls that sit between lens and skater. Check: at (−30, 164), (29, 92) and
   the Battery Park ramp the skater is 90–220 px tall and fully visible from all four yaws.
5. **Make STOMPED! rare and clean.** Fire it only when the air was a real one (height > 2.4 m
   and airtime > 0.95 s) and the banked combo is at least 300; target 2–4 a run. Burst: 10–12
   small tan dust puffs at 40% of today's size that fade in 0.4 s. Mute free-skate challenge
   callouts while `mode === 'run'`. Check: pushing over a mall funbox with no trick shows no
   callout; no white squares overlap the stick or buttons in 20 screenshots.
6. **Give the score a ladder and the clock a finish.** Per-line medals (bronze 8k, silver 18k,
   gold 30k; new key `css-medals`): results show the next medal and the gap to it ("gold in
   4,200"), the title shows five small line dots coloured by best medal and the streak from day
   1. For the ramp, Last Call starts at 0:30 and also wakes the street up (traffic and
   pedestrian density ×1.5 until the buzzer). Check: results after an 11k run reads "silver in
   6,7xx"; title shows 5 dots; a reload keeps them.

## Review after upgrade — round 2 (after the final pass, commit 7037d24)

Played the branch fresh as a 390x844 touch phone (real CDP touches, Metal GL): 11 full Today's
Line runs across all five lines (`?day=0..4`; Mall Bomb three times back to back with Again,
College Hill, City Hall and The Waterfront twice each), one clumsy first-timer session on
today's real line (taps both buttons before finding the stick), a letter-by-letter dump of
where the gold line goes on every line (22 letters each), plus title, pause, Last Call,
results, reload, free skate and landscape. BEFORE is live `main` (first section of this file).
Same three bots as before: "naive" pushes straight and taps, "follow" steers blind at the
light, "tricky" uses full charges, double-taps and held TRICK. Everything is in
`/tmp/upgrade-church-street-skate/review2/` (contact sheets `s-*.png`, logs `*.log`,
`gold.log`). The machine was heavily loaded, so the bots are clumsier than a person.
No console errors in any session. Supabase was blocked, so no test scores reached the board;
`js/leaderboard.js` has no diff against `main` and the game id is unchanged.

### Verdict

This is now a game worth reopening, and the gap to live is enormous. One tap, a big readable
skater, two buttons, a light that never goes out, three fresh goals on every Again, a different
line tomorrow. It should ship. What is left is taste, not rescue: the gold half of the run
walks you out of the good part of town onto empty asphalt (and four of the five lines end up
on the same lakefront roads), a yellow card lands on top of the light every time you collect a
letter, the medal ladder is finished on the first run, and walls still knock you down about
seven times a run.

### Scores (1–10): live → first pass → now

| | Live | First pass | Now | Why |
|---|---|---|---|---|
| Fun | 5 | 7 | 7.5 | There is always something to chase now. The first 40 s of each line is the best of the game; the gold half is road cruising with flat-ground flips. |
| Difficulty curve | 3 | 5 | 6 | Fair on the line, and the clock does squeeze. But the ramp is only that squeeze, runs are long (114–170 s), and walls cause 81 of 123 bails. |
| Readability | 4 | 7 | 7 | Skater 75–206 px, five HUD items, camera fixed near walls (max 234 px, was 790). Lost a point back: letter cards cover the light, and the light is faint. |
| Taste / Looks | 6 | 7 | 7.5 | Title, pause, results, tray and chips are clean and consistent. STOMPED is rare. The streets outside the mall are black asphalt and plain boxes. |
| Phone feel | 4 | 8 | 8.5 | Two buttons, stable layout, Again in one tap, Back to the line pill, rotate works. |
| Variety | 4 | 6 | 7 | Five lines, two layouts, goals rotate (seen: 3 runs, 3 chip sets). The gold half converges: College, City Hall, Waterfront and Main all finish on Battery St and the lake road. |
| Reason to return | 3 | 6 | 7 | New line daily, streak from day 1, medals, new goals each run. But gold medal fell on run 1 on three lines, so the ladder is done in a week. |

### Run log (score · bails · real seconds)

| Line | Bot | Runs |
|---|---|---|
| Mall Bomb | follow ×3 (Again) | 20,310 · 12 · 152 → 37,725 · 11 · 170 → 45,154 · 10 · 164 |
| College Hill | tricky ×2 | 70,050 · 16 · 141 → 40,624 · 11 · 131 |
| City Hall | follow ×2 | 35,044 · 8 · 152 → 43,441 · 9 · 133 |
| The Waterfront | follow ×2 | 45,350 · 7 · 163 → 31,688 · 12 · 137 |
| Main Street | tricky / naive | 64,682 · 17 · 148 / 8,581 · 10 · 114 |

### What clearly improved since the first pass

- **The light never goes out.** Every run had a letter to chase until the buzzer (7–19
  letters a run). The dead back half is gone: Mall Bomb scored 10k–25k after the fifth letter
  (was 1,100).
- **Run 2 is not run 1.** Mall Bomb, three Agains: GRAB / 3K / 5K → BIG DROP / MANUAL / 5K →
  30s CLEAN / MANUAL / 540, with the letter layout alternating. Results say "2 new goals next run".
- **Camera near walls.** Tallest skater in 180 screenshots: 234 px (was 750–790).
- **STOMPED** fired 1–5 times a run (was 8–16) and the burst is small tan dust.
- **Map edge** no longer glues you; **Back to the line** shows up when you are lost and works.
- **Ladder and finish.** Medal and gap on results ("silver in 4,690"), five dots on the title,
  streak from day 1, Last Call at 0:30. Title, pause and results all fit 844 px (`s-h-c.png`).

### Still weak or broken

1. **The gold line leaves the good part of town.** It walks the road graph, so it follows
   car streets, not skate spots. On the four street lines, 2 of 68 gold letters sat on a
   feature (the Main St mega kicker and the Battery launch); the rest are bare road with
   traffic (10–27 honks a run). Mall Bomb's gold set runs out the bottom of the map to
   (16, 383), turns round, and marches back up 20 m of climb to Pearl St. College Hill, City
   Hall, The Waterfront and Main Street all end up lapping the same roads at x −480…−620
   (`gold.log`), so from second 40 the five "different" lines look alike: a red jacket on
   black asphalt (`s-g-b.png`, `s-d4t-b.png`).
2. **A card covers the light.** Every letter pops a yellow card ("GOLD T +2s · gold set 2 ·
   2/5 · +750") in the middle of the screen for 1.6 s, exactly where the next light and the
   street ahead are (`s-g-a.png`, `s-g-b.png`: all 12 frames). With a spot or set bonus queued
   it stays 3–5 s. The light itself is a thin pale column on a pale sky, and on the first
   frame of a run it is at the very top under the clock, behind the "follow the light" card
   (`s-h-a.png` frame 2). Nothing points at a light that is off screen.
3. **The ladder is too short and one ramp is half a run.** Gold (45k) fell on the first run
   on The Waterfront (45,350, blind bot, 7 bails), College Hill (70,050) and Main Street
   (64,682, 17 bails: "top of the ladder"). One launch off the Main St mega kicker banked
   30,060 — 46% of that run; College's super kicker 15,640. The naive bot made 8,581, so
   bronze is right; silver and gold are not.
4. **Walls are still the difficulty.** 81 of 123 bails were walls (7.4 a run), in every run
   on every line. The first-timer session bailed on the same building three times in 8 s
   (`s-h-b.png`). The bots are blind, but the pattern is the same one Stephen called "too
   hard": the punishment is for steering, not for tricks.
5. **Runs are long and the clock has no tension for a minute.** Median 148 s. After 60 s of
   play the clock still read 1:20–1:29 in most runs, because the five letters hand back 25 s.
6. **Small.** "top 78 mph" on results (speed cap is 62; the stat counts falling speed).
   "0 × 1" combo line for a spin with no trick. BAIL text drawn over STOMPED and bank popups
   (`s-d0f-d.png` frame 3). A sandwich board next to the lens fills the bottom of the screen
   (`s-d2f.png` frame 2). The Waterfront starts facing uphill. If a script fails to load, the
   title sits on "Building Burlington…" for ever with no retry (6 of 20 boots on my overloaded
   local server; a harness artefact, but a phone on bad signal gets the same dead screen).
   There is still no ticker script tag in this repo or on the live page; the guarded
   `BtownTicker.hide()/show()` calls are there.

### FINAL PUNCH LIST (ranked by impact)

1. **Lay the gold line on skate spots, inside the line's own neighbourhood.** Give each line
   a hand-ordered loop of 12–15 gold points on its own features (rails, kickers, funboxes,
   steps, ledges, the named spots and gap take-offs) and deal gold letters from it, nearest
   one ahead first; keep the road-graph walk only as the fallback. Never place one within
   40 m of the map edge, never reverse direction, never more than 4 m of climb to the next.
   Check: rerun the `gold.js` dump — no step under 30 m, at least 60% of gold letters within
   6 m of a rail/ramp/ledge/spot, and no two lines share more than a third of their points.
2. **Get the cards off the light and make the light loud.** Letter pickups: no centre card;
   flash the tray tile and show "+3s" beside the clock. Keep a card only for a full set, a
   new gap or a new spot, placed under the goal chips, 1.0 s. Beacon: twice as wide, about
   60% opacity, a bright core and a ring on the ground. Add one edge chevron when the next
   letter is off screen or behind you. At a standstill tilt the camera up so the street and
   the first light are in view below the HUD. Check: 20 screenshots taken 1 s after a pickup
   show nothing drawn within 60 px of the light; the first frame of all five lines shows it.
3. **Stretch the ladder and tame the two mega ramps.** Medals 15k / 40k / 80k plus a fourth
   rung at 130k, so gold takes days, not one run. The same launch ramp pays ×1, ×0.5, ×0.25
   within a run, and a single bank is capped near a third of the medal above it. Check: ten
   bot runs give no first-run gold; no single combo is more than 35% of a run.
4. **Walls bounce, they don't slam.** A wall hit under 14 m/s, or at a glancing angle (under
   45°) at any speed, is a stumble: lose half the speed, slide along the wall, drop the combo,
   stay on the board. Only a head-on hit at 14 m/s or more bails, and the get-up faces away
   from the wall, 2 m off it. Check: follow bot averages 3 bails a run or fewer over the five
   lines; never two bails inside 3 s at the same spot.
5. **Tighten the clock.** First five letters +3 s (not +5), gold +2 / +1 / +1. Target a
   median run of 100–110 s for the follow bot, and under 1:00 on the clock by the one-minute
   mark, so Last Call arrives while the run is still hot.
6. **Polish bundle.** Top speed from horizontal speed only. Hide the combo line when it is
   worth 0. One popup at a time in the centre (BAIL replaces, never overlaps). Skip drawing
   any prop within 2 m of the lens, not just the see-through class. Start The Waterfront at
   Battery Park heading downhill. On a failed module load, turn the title button into "Tap
   to retry".
