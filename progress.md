Original prompt: help me make a fps game

# SHOOT CLANKERS — wave-based arena FPS (Three.js, WebGL2)

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
- Serve locally: python3 -m http.server 5173 (from shoot-clankers dir)

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
