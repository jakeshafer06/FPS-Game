# Kettle Creek

An endless first-person night-shift horror game that runs in the browser. It's October 2012 and you work the overnight shift at the Kettle Creek Gas & Go on Route 41. Every night is harder than the last. You have one life.

- **Before each shift:** do your chores (restock, trash, mop, coffee, ice machine, generator), then clock in.
- **During the shift:** serve customers, spot the fakes, and log every hour (ALL CLEAR, or REPORT and say where).
- **Keep the store running:** feed the generator, swap flashlight batteries, answer the phone, shut off fuel spills, watch the security cameras, and lock the doors.
- **Survive:** something stalks the store. It peeks from the dark, creeps closer on the cameras, and sometimes hunts you. Crouch behind the shelves or hide in the office. If it catches you, the run is over.
- **Fear:** darkness and scares raise your fear. High fear brings hallucinations. Coffee helps.
- **The store gets lost:** doors open onto the wrong places and aisles stretch on.
- **Between nights:** see your mistakes and spend your pay on upgrades.
- **The story:** find a note each night to learn what happened to Carla Wren.
- **Leave the anomalies alone:** touch something that's wrong too many times and it notices. You'll get a hunt, a hiding event, or a strike.
- **Sound captions:** every important sound pops up as text, like *brrrring* for the phone, with an arrow showing which way it came from. Turn them off in Settings → Audio.

## What's new in 4.2

- Sound captions for the phone, knocks, footsteps, growls, the door chime, thunder, and other audio cues.
- No more fade to black between hours. When the hour turns over, the back door slams and bolts itself and the lights cut out for a moment.
- Locking a door slams it shut.
- Touching an anomaly three times in an hour sets off a hunt, a hiding event, or a strike.
- The radio plays a real lo-fi song (`radio.mp3`), and the rain is a real recording (`rain.mp3`) that sounds muffled indoors. Both loop.

## Play

Open `index.html` in a desktop browser (Chrome, Edge, or Firefox). The page loads Three.js from the jsDelivr CDN and fonts from Google Fonts, so it needs an internet connection. Keep `radio.mp3` and `rain.mp3` in the same folder as `index.html`.

Some browsers block JavaScript modules on pages opened straight from disk (`file://`), and the radio and rain recordings only load from a server. If the page stays black or the rain sounds synthetic, run it with a local server instead. With [Node.js](https://nodejs.org) installed:

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000.

## Deploy to Netlify

The included `netlify.toml` runs `npm run build`, which copies `index.html`, `radio.mp3`, and `rain.mp3` into `dist/`, and publishes `dist/`. In Netlify choose **Add new site → Import an existing project → GitHub**, pick this repository, and click **Deploy**.

## Host it on GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save.
4. The game will be live at `https://<your-username>.github.io/<repo-name>/` after a minute or two.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Run |
| Mouse | Look |
| E / click | Interact (register, logbook, doors, shelves) |
| F | Phone flashlight |
| Q | Drop what you are holding |
| C | Crouch |
| V | Drink the coffee you're holding |
| A / D | Switch security cameras |
| R | Read Ray's rules |
| 1 to 7 | Choose an option |
| Space | Skip a line |
| Esc | Pause (settings: graphics presets, audio, controls) |

Needs a keyboard and mouse. Headphones recommended.

## How it's built

The game is one file, `index.html`, plus two audio files:

- **Three.js 0.160** (ES modules via an import map) for rendering, with bloom and a custom film-grain, vignette, and chromatic-aberration pass.
- All textures and product packaging (every brand is invented) are drawn at runtime with the Canvas API, with normal maps generated from height maps. All models are built in code, so there are no image or model files.
- The radio song (`radio.mp3`) and the rain (`rain.mp3`) are recordings that loop. The rain plays through a filter that muffles it indoors, and the radio plays through a filter that makes it sound like a cheap speaker. If either file is missing, the game falls back to synthesized versions.
- Every other sound (fluorescent hum, phone, thunder, stingers, the monster) is synthesized with the Web Audio API.
- Sound captions wrap each sound effect, so adding a caption is one line in the `CAPS` list.
- Each anomaly is one entry in a list with a description and an `apply()` function. `resetWorld()` puts the store back to normal at the start of every hour.
