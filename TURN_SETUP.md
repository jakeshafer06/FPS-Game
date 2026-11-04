# Shoot Clankers — 1v1 relay fallback

The game already uses PeerJS/WebRTC for room codes. This update adds an optional TURN relay fallback for networks that do not allow direct WebRTC connections.

## Netlify setup

1. Get a TURN service that supports WebRTC with `turn:` / `turns:` URLs, username and credential. Use short-lived credentials where supported.
2. In Netlify > Site configuration > Environment variables add:
   - `VITE_TURN_URLS`: e.g. `turn:your-relay.example:3478?transport=udp,turns:your-relay.example:5349?transport=tcp`
   - `VITE_TURN_USERNAME`: your TURN username
   - `VITE_TURN_CREDENTIAL`: your TURN credential
3. Trigger a fresh production build/deploy. Vite embeds these values at build time.
4. Test from two different networks. If the relay service has usage logs, check whether connections are relayed.

IMPORTANT: Values prefixed VITE_ are public in the browser bundle. Never put an account API key or long-term admin secret in them. For production use, issue temporary TURN credentials via a secure server-side endpoint, or use a hosted realtime multiplayer backend. The TURN fallback is not active until you supply valid relay credentials. A TURN relay also cannot guarantee access on networks that prohibit the service.

The PeerJS library remains included locally in `public/vendor/peerjs/peerjs.min.js` so Vite copies it to the deployed site.
