# Kettle Creek

A first-person night-shift anomaly game that runs in the browser. It's October 2012 and you're working the overnight shift alone at the Kettle Creek Gas & Go on Route 41. The owner left you a sheet of rules.

- **Serve customers.** Ring up what they bring, fetch what they ask for (cigarettes, coffee, hot dogs, pump prepay), and count out their change.
- **Spot fake customers.** Some customers aren't people. Learn the tells and refuse service.
- **Log every hour.** Walk the store and decide if anything has changed. Log ALL CLEAR, or REPORT and say where. You have until :59.
- **Follow the rules.** Lights out? Hide in the office. Everything quiet? Don't move. Don't open the back door when someone knocks.
- **Three strikes** and you're sent home and the night starts over. Make it to 6:00 AM.

There are 40 anomalies, from subtle (a missing bottle, the wrong date on a calendar) to dangerous. Anomalies you find are remembered between nights.

## Play

Open `index.html` in a desktop browser (Chrome, Edge, or Firefox). The page loads Three.js from the jsDelivr CDN and fonts from Google Fonts, so it needs an internet connection.

Some browsers block JavaScript modules on pages opened straight from disk (`file://`). If the page stays black, run it with a local server instead. With [Node.js](https://nodejs.org) installed:

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000.

## Deploy to Netlify

The included `netlify.toml` tells Netlify there is no build step and to publish the repository root. In Netlify choose **Add new site → Import an existing project → GitHub**, pick this repository, and click **Deploy**.

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
| R | Read Ray's rules |
| 1 to 7 | Choose an option |
| Space | Skip a line |
| Esc | Pause (settings: graphics presets, audio, controls) |

Needs a keyboard and mouse. Headphones recommended.

## How it's built

Everything is in one file, `index.html`:

- **Three.js 0.160** (ES modules via an import map) for rendering, with bloom and a custom film-grain, vignette, and chromatic-aberration pass.
- All textures and product packaging (every brand is invented) are drawn at runtime with the Canvas API, with normal maps generated from height maps. All models are built in code, so there are no image or model files.
- All sound (rain, fluorescent hum, phone, thunder, stingers) is synthesized with the Web Audio API.
- Each anomaly is one entry in a list with a description and an `apply()` function. `resetWorld()` puts the store back to normal at the start of every hour.
