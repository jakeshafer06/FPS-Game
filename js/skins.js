/* Weapon skins purchasable with coins. Colors feed the weapon mesh, muzzle light,
 * tracers and impact sparks so each skin changes the feel of every shot. */
export const SKINS = [
  { id: 'stock',  name: 'STOCK',  price: 0,   body: 0x1a2634, metal: 0.7,  accent: 0x29e6ff, tracer: 0x8ef3ff, desc: 'Standard-issue pulse rifle.' },
  { id: 'ember',  name: 'EMBER',  price: 120, body: 0x3a1410, metal: 0.6,  accent: 0xff5a1f, tracer: 0xffa060, desc: 'Overclocked coils. Runs hot.' },
  { id: 'toxin',  name: 'TOXIN',  price: 160, body: 0x0f2a18, metal: 0.55, accent: 0x39ff6e, tracer: 0x9dffb8, desc: 'Bio-reactive casing, acid-green core.' },
  { id: 'void',   name: 'VOID',   price: 220, body: 0x0a0a12, metal: 0.9,  accent: 0xb24dff, tracer: 0xd9a6ff, desc: 'Matte black. Violet singularity core.' },
  { id: 'gold',   name: 'GILDED', price: 320, body: 0x8a6a1a, metal: 1.0,  accent: 0xffd36b, tracer: 0xffe9a8, desc: 'For operators who never miss rent.' },
  { id: 'prism',  name: 'PRISM',  price: 500, body: 0x1c1c28, metal: 0.8,  accent: 0xffffff, tracer: 0xffffff, desc: 'Cycles the full spectrum. Pure flex.', animated: true },
];

export function getSkin(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

export function hexToCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
