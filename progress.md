Original prompt: help me make a fps game

# SHOOT CLANKERS (formerly NEON SIEGE) — wave-based arena FPS (Three.js, WebGL2)

## Stack
- Three.js 0.160.1 via esm.sh importmap; UnrealBloom + OutputPass post-processing
- No physics lib — custom circle-vs-AABB collision (works in sandbox, cheap)
- Procedural Web Audio SFX + synthwave music loop (no external binary assets)
- UI: HTML/CSS overlay, Chakra Petch + JetBrains Mono (Google Fonts)

## Files
- index.html — HUD, screens, touch controls, importmap
- style.css — design tokens (cyan/magenta on dark)
- js/main.js — renderer, loop, input, state machine, testing hooks
- js/world.js — arena (floor grid, walls, pillars, crates, bunker, lights, starfield)
- js/player.js — WASD + jump + sprint, hitscan shooting, reload, recoil, shake
- js/enemies.js — EnemyManager waves (scout/grunt/brute), AI chase/attack, pickups
- js/effects.js — particle pool (shader Points), tracer pool, explosion light
- js/audio.js — procedural SFX + music scheduler
- js/ui.js — HUD bindings

## Constraints honored
- Pointer lock blocked in sandbox → free-cursor mouse look via movementX/Y
- No localStorage; in-memory state only
- Binary assets only from CDN — none used (all procedural)

## Testing
- window.render_game_to_text + window.advanceTime hooks exposed
- Playwright client: skills/website-building/game/scripts/web_game_playwright_client.js
- Serve locally: python3 -m http.server 5173 (from neon-siege dir)

## TODO / notes for next agent
- (none yet)

## QA log (final)
- Fixed black-scene bug: spawn view blocked by pillar at (0,18) + too-dark floor + heavy fog. Brightened grid texture, floor emissive, hemisphere light; moved pillars to (0,±24); fog 40-130.
- Enemy bodies given faint emissive glow so hostiles read against dark floor.
- preserveDrawingBuffer:true so test screenshots capture WebGL canvas.
- Verified via Playwright: movement, jump, shooting (ammo drain), reload, enemy chase/attack, natural + forced game over, restart, pause/resume, settings (sens/volume/music toggle), wave state machine, mobile 375px layout (HUD clear of touch controls, debug clear of wave info).
- No console errors on any pass.
- renderer.info draw counts are misleading with EffectComposer (info resets per pass); debug overlay still shows FPS/frame/geo/tex which are stable.

## Remaining TODOs / ideas
- Enemy projectile attacks (currently melee only)
- More weapon variety, weapon switch
- High-score persistence impossible (localStorage blocked in sandbox) — keep in-memory
- Headshot multiplier

## Fix: DEPLOY button unresponsive in hosted preview
- Cause: Three.js was loaded at runtime from esm.sh; the button had no handler until that finished (slow/blocked CDN = silent dead button).
- Fix: vendored three@0.160.1 + postprocessing addons under vendor/three (local importmap). Button starts disabled as "LOADING SYSTEMS…" and arms to DEPLOY once main.js runs. Boot guard surfaces load errors on the start screen with a RELOAD button.

## Pointer lock (mouse capture)
- Lock requested on DEPLOY/RESUME/REDEPLOY clicks and on canvas click; tries unadjustedMovement first, then default. Esc (native lock exit) pauses. Pause releases lock, resume re-locks.
- Fallback: if the embedding frame forbids pointer lock (sandbox without allow-pointer-lock), game uses free-cursor mouse look and start screen shows a note to open in its own tab.

## Expansion: modes, abilities, Sector 07, enemy roster, armory
- Modes (`js/modes.js`): SIEGE (endless waves, Warden every 5th), BLITZ (150 s score attack, continuous spawns with surges every 20 s, streak multiplier up to 4x, 1.5x coins, timer expiry = extraction), OVERLORD (boss rush: Warden + escorts every wave, each Warden +35% HP).
- Abilities (`js/player.js` ABILITIES): Q Dash (4 s cd, brief invulnerability), E Shockwave (12 s cd, 45 dmg + knockback within 9 m, full damage through Sentinel shields), F Overdrive (25 s cd, 6 s infinite ammo, 2x fire rate, 1.3x dmg). HUD `#ability-bar`, touch buttons `#touch-abilities`.
- Map Sector 07 (`js/world.js`): 68x68 arena, two-tier steppable central dais with energy core, 4 quadrant bastions with cover walls, 8 portal spawn gates, neon arches, barriers, crates, wall signs, hazard bands, planet/star skybox. Collision via `world.resolve` (step height 1.1 → player can walk up tiers).
- Enemies (`js/enemies.js`): Scout (weaving dart), Sentinel (frontal energy shield: gun hits from the front do 0.3x; turns slowly so flanking works), Spitter (keeps range, plasma projectiles), Brute (windup + charge), Phantom (blinks next to the player), Warden (boss: orbit, spread shots, summons scouts, enrages under 50%).
- Economy: coins per kill (x mode multiplier), profile in `js/storage.js` (guarded localStorage, in-memory fallback + `.save-note`). Armory (`#armory-screen`) buys/equips 6 pulse-rifle skins (`js/skins.js`); `player.applySkin` recolors weapon + tracers; Prism hue-cycles.
- Rendering fix: platform "trim" used to be a solid emissive box covering each platform top; together with full-width emissive lines it made UnrealBloom wash out the frame near the dais. Trims are now 4 thin edge bars below the top surface, emissive intensities ~1.0–1.1, bloom (0.38, 0.3, 0.9).
- Test harness: `window.advanceTime(ms)` steps 60 Hz ticks then renders; `player._applyCamera` calls `camera.updateMatrixWorld()` so raycasts are correct inside stepped ticks. Headless test scripts: `output/functest.js`, `output/flowtest.js` (all passing).

## Secret dev console (cheats)
- `js/cheats.js`: type `IMBOT` anywhere (letters unused by gameplay keys) or tap the menu title 5x within 2 s. Opening mid-game pauses; closing resumes. Esc closes.
- Toggles: aimbot (while firing, snaps to best visible enemy in a ~75° cone with LOS raycast against world.raycastTargets, zero spread), wallhack (enemy materials depthTest=false, renderOrder 999), god, one-shot (gun + shockwave), infinite ammo, no cooldowns, speed 1.8x, slow-mo (enemy dt x0.4). Buttons: all on/off, +5000 coins, unlock all skins. HUD badge "CHEATS ACTIVE".
- Tests: `output/cheattest.js` (27 checks, all passing).
