/* Persistent profile (coins, skins, best scores).
 * Browser storage may be unavailable (sandboxed preview frames) — every access is
 * guarded and the game falls back to an in-memory profile for the session. */
const KEY = 'shoot-clankers-profile-v1';

const DEFAULTS = () => ({
  coins: 0,
  owned: ['stock'],
  equipped: 'stock',
  best: { siege: 0, blitz: 0, overlord: 0 },
  totalKills: 0,
});

let backend = null;
try {
  const s = window.localStorage;
  s.setItem('__ns_test', '1');
  s.removeItem('__ns_test');
  backend = s;
} catch (_) {
  backend = null;
}

export const storage = {
  persistent: !!backend,
  load() {
    const d = DEFAULTS();
    if (!backend) return d;
    try {
      const raw = backend.getItem(KEY);
      if (!raw) return d;
      const parsed = JSON.parse(raw);
      return { ...d, ...parsed, best: { ...d.best, ...(parsed.best || {}) } };
    } catch (_) {
      return d;
    }
  },
  save(profile) {
    if (!backend) return false;
    try {
      backend.setItem(KEY, JSON.stringify(profile));
      return true;
    } catch (_) {
      return false;
    }
  },
};
