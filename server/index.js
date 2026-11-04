import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 8080);
const rooms = new Map();
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const server = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  res.writeHead(404); res.end('Not found');
});
const wss = new WebSocketServer({ server, maxPayload: 16384 });
const send = (ws, msg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
function newCode() {
  let code;
  do { code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(''); } while (rooms.has(code));
  return code;
}
function detach(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  if (room.host === ws) {
    rooms.delete(room.code);
    if (room.guest) { const guest = room.guest; guest.room = null; send(guest, { op: 'opponent_left' }); }
  } else if (room.guest === ws) {
    room.guest = null;
    send(room.host, { op: 'opponent_left' });
  }
}
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.op === 'create' && !ws.room) {
      const code = newCode();
      const room = { code, host: ws, guest: null };
      rooms.set(code, room); ws.room = room;
      send(ws, { op: 'ready', code });
    } else if (msg.op === 'join' && !ws.room) {
      const code = String(msg.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { op: 'error', message: 'Room not found. Check the code.' });
      if (room.guest) return send(ws, { op: 'error', message: 'Room is full.' });
      room.guest = ws; ws.room = room;
      send(ws, { op: 'ready', code });
      send(room.host, { op: 'paired' });
      send(ws, { op: 'paired' });
    } else if (msg.op === 'data' && ws.room) {
      const other = ws.room.host === ws ? ws.room.guest : ws.room.host;
      if (other && msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)) send(other, { op: 'data', payload: msg.payload });
    }
  });
  ws.on('close', () => detach(ws));
  ws.on('error', () => detach(ws));
});
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(interval));
server.listen(port, '0.0.0.0', () => console.log(`Shoot Clankers multiplayer listening on ${port}`));
