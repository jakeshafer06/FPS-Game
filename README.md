# Kettle Creek

A short first-person horror story game that runs in the browser. October 2012: it's your first overnight shift alone at the Kettle Creek Gas & Go on Route 41, and your boss warned you about a grey Buick.

## Play

Open `index.html` in a desktop browser (Chrome, Edge, or Firefox). The page loads Three.js from the jsDelivr CDN and fonts from Google Fonts, so it needs an internet connection.

Some browsers block JavaScript modules on pages opened straight from disk (`file://`). If the page stays black, serve the folder locally:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

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
| 1, 2 | Choose a reply |
| Space | Skip a line |
| Esc | Pause (mouse sensitivity and graphics settings) |

Needs a keyboard and mouse. Headphones recommended.

## How it's built

Everything is in one file, `index.html`:

- **Three.js 0.160** (ES modules via an import map) for rendering, with bloom and a custom film-grain, vignette, and chromatic-aberration pass.
- All textures (floor tiles, asphalt, signs, posters) are drawn at runtime with the Canvas API, so there are no image or model files.
- All sound (rain, fluorescent hum, phone, thunder, stingers) is synthesized with the Web Audio API.
- The story is a single async script (`story()`) built from small helpers: `say`, `choose`, `use`, `wait`, and `until`.

## Endings

There are two endings, decided by one choice near the end.
