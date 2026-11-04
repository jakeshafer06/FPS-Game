# Shoot Clankers — WebSocket multiplayer setup

This version replaces PeerJS/WebRTC with a central WebSocket relay. Both players connect to the same server. It does **not** bypass device management or network restrictions.

## Deploy the multiplayer server

1. Create a separate Node.js web service on a host that supports persistent WebSockets (such as Render, Railway, or Fly.io).
2. Set the **root directory** to `server`, the **build command** to `npm install`, and the **start command** to `npm start`.
3. The server listens on the host-provided `PORT` and exposes `/health` for health checks.
4. Copy the server's public **wss://** URL (use the HTTPS hostname, but replace `https://` with `wss://`).

## Deploy the website on Netlify

1. Set `VITE_MULTIPLAYER_URL` to your server's `wss://...` URL in Netlify environment variables.
2. Rebuild/redeploy the frontend. Vite injects this variable **at build time**.
3. Open the website in two browsers; create a room in one, join with the five-character code in the other.

## Notes

- The Netlify frontend alone cannot host this persistent WebSocket server.
- Server hosting must stay online while matches are played. Some free hosts sleep when idle.
- A managed device or network may still block the server. Ask its administrator to allow the service; there is no guaranteed workaround.
- The relay forwards gameplay messages and does not validate shots. This is friend-to-friend netcode, not anti-cheat.
- A server restart clears active rooms. Room recovery across server restarts is not implemented.
- Use a reputable host with TLS. Do not put passwords or private secrets in `VITE_` variables.
