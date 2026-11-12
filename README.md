# Kettle Creek

A first-person night-shift anomaly game that runs in the browser. It's October 2012 and you're working the overnight shift alone at the Kettle Creek Gas & Go on Route 41. The owner left you a sheet of rules.

Every hour, walk the store and decide whether anything has changed. Log the hour at the register as **ALL CLEAR** or **REPORT**. One wrong call and the night starts over at 12:00 AM. Make it to 6:00 AM to win.

There are 28 anomalies, from subtle (a clock running backwards) to dangerous (something in the aisle that moves when you look away). Anomalies you find are remembered between nights.

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
| E / click | Interact |
| F | Phone flashlight |
| R | Read Ray's rules |
| 1, 2, 3 | Choose an option |
| Space | Skip a line |
| Esc | Pause (mouse sensitivity, glow, and graphics settings) |

Needs a keyboard and mouse. Headphones recommended.

## How it's built

Everything is in one file, `index.html`:

- **Three.js 0.160** (ES modules via an import map) for rendering, with bloom and a custom film-grain, vignette, and chromatic-aberration pass.
- All textures and product packaging (every brand is invented) are drawn at runtime with the Canvas API, with normal maps generated from height maps. All models are built in code, so there are no image or model files.
- All sound (rain, fluorescent hum, phone, thunder, stingers) is synthesized with the Web Audio API.
- Each anomaly is one entry in a list with a description and an `apply()` function. `resetWorld()` puts the store back to normal at the start of every hour.
