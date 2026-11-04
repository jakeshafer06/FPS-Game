/* Game modes. Each defines how waves/spawns work and how coins are rewarded. */
export const MODES = {
  siege: {
    id: 'siege',
    name: 'SIEGE',
    tag: 'ENDLESS WAVES',
    desc: 'Classic hold-out. Waves grow, new hostile classes join, a Warden arrives every fifth wave.',
    coinMult: 1.0,
    timer: null,
    color: '#29e6ff',
  },
  blitz: {
    id: 'blitz',
    name: 'BLITZ',
    tag: '150 SECOND SCORE ATTACK',
    desc: 'Hostiles pour in nonstop and faster every 20s. Chain kills to build a multiplier. Survive to extraction.',
    coinMult: 1.5,
    timer: 150,
    color: '#ffb020',
  },
  overlord: {
    id: 'overlord',
    name: 'OVERLORD',
    tag: 'BOSS RUSH',
    desc: 'Every wave is a Warden with an escort. Each one tougher than the last. Big coin payouts.',
    coinMult: 1.25,
    timer: null,
    color: '#ff2e6b',
  },
};

export const MODE_ORDER = ['siege', 'blitz', 'overlord'];
