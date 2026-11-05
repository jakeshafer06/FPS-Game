# Shoot Clankers — Render WebSocket edition

This version uses the included `server/index.js` WebSocket relay for 1v1 room codes instead of PeerJS.

## Render (server)
Create a Render Web Service from this repository with:
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

The server uses Render's `PORT` and listens on `0.0.0.0`. Copy the public Render hostname. For example, `https://example.onrender.com` becomes `wss://example.onrender.com`.

## Netlify (website)
- Base directory: repository root
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_MULTIPLAYER_URL=wss://YOUR-RENDER-SERVICE.onrender.com`
- Trigger a fresh deploy after adding or changing the variable.

## Local development
Run `npm install` then `npm run dev` in the project root. In a second terminal run `cd server && npm install && npm start`.
For local testing, create a `.env.local` file in the project root with `VITE_MULTIPLAYER_URL=ws://localhost:8080` (same machine only). For other devices use the reachable server URL instead.

The ZIP contains source files; do not upload the ZIP directly as a static Netlify site without running the Vite build.

Note: The game and server have not been tested end-to-end across two devices here. Hosting/network policies can still prevent connections. Render may spin down an idle free service and rooms are lost when it restarts.
