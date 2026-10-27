// Doom Mode users (the enemies): the 3D game's users (data/enemies.js), rethought for a
// first-person shooter. Each one keeps its name, model, colors and flavor text from the 3D
// game and gets a DOOM role. Speeds are scene units per second; times are seconds.
//
//   from        the 3D game's enemy id (name, model, burst colors, flavor come from there)
//   model       { user: id } for a USER_MODELS model, or { boss: 'executive' }
//   scale       sprite size multiplier
//   melee       { damage, range, time }: hits you when close (time = wind-up)
//   missile     { damage, speed, radius, sprite, count, spread, time, cooldown, colors }
//   hitscan     { damage, pellets, spread, time, cooldown }: instant shots (Shadow IT)
//   charge      { speed, time, every, damage }: dashes at you (Quick Question)
//   explode     { damage, radius }: blows up on contact and when killed (Walk-Up)
//   summon      { id, count, every, max }: brings friends (Phish Clicker's malware)
//   teleport    { every, range }: blinks a few metres sideways when hurt (Shadow IT)
//   aura        { radius, speed }: speeds up users near it (the VIP)
//   onDeath     { spawn, count }: released on death (Reply-All Randy's replies)
//   painChance  chance (0..1) to flinch when hit
//   voice       pitch of its squawks
//   counts      false: doesn't count towards the kill % (summoned minions)
//   drops       item id left behind on death
//   pair        users with the same pair name look out for each other: when one goes
//               down, the others nearby enrage (faster, attack more often)
//   tailgate    { radius, slow }: slows you down while it's this close (Badge Brenda)
//   crate       { loot: [item ids] }: a breakable box that drops one of these
//   phases      boss health thresholds: a banner, and optionally a user to `spawn`

export const ENEMIES = {
  pam: {
    from: 'pam', model: { user: 'pam' }, role: 'Melee shambler',
    hp: 30, speed: 3.4, radius: 0.5, painChance: 0.8, voice: 340,
    melee: { damage: [4, 12], range: 1.1, time: 0.35, cooldown: 0.9 },
    drops: 'ticketClip',
  },
  quinn: {
    from: 'quinn', model: { user: 'quinn' }, role: 'Melee rusher',
    hp: 25, speed: 5.8, radius: 0.45, painChance: 0.7, voice: 420,
    melee: { damage: [5, 12], range: 1.1, time: 0.25, cooldown: 0.7 },
    charge: { speed: 15, time: 0.45, every: 2.4, range: 14 },
  },
  walkup: {
    from: 'walkup', model: { user: 'walkup' }, role: 'Kamikaze rusher',
    hp: 18, speed: 7.5, radius: 0.45, painChance: 0.3, voice: 380,
    explode: { damage: 60, radius: 3.5 },
  },
  randy: {
    from: 'randy', model: { user: 'randy' }, role: 'Ranged: throws reply-all emails',
    hp: 60, speed: 3.6, radius: 0.5, painChance: 0.6, voice: 220,
    melee: { damage: [3, 12], range: 1.1, time: 0.3, cooldown: 1 },
    missile: { damage: [5, 15], speed: 11, radius: 0.25, sprite: 'email', time: 0.45, cooldown: 1.6, colors: ['#f4f4f4', '#b13e53'], sound: 'mailWhoosh' },
    onDeath: { spawn: 'randy_small', count: 3 },
  },
  randy_small: {
    from: 'randy_small', model: { user: 'randy_small' }, role: 'Fast little melee',
    hp: 8, speed: 7, radius: 0.32, painChance: 0.4, voice: 600, counts: false,
    melee: { damage: [2, 6], range: 0.9, time: 0.2, cooldown: 0.6 },
  },
  phish: {
    from: 'phish', model: { user: 'phish' }, role: 'Ranged summoner',
    hp: 80, speed: 3.2, radius: 0.5, painChance: 0.4, voice: 260,
    missile: { damage: [10, 20], speed: 9, radius: 0.3, sprite: 'hook', time: 0.6, cooldown: 2.2, colors: ['#b13e53', '#7a4ea0'], sound: 'spit' },
    summon: { id: 'malware', count: 2, every: 6, max: 4 },
    keepDistance: 6,
  },
  malware: {
    from: 'malware', model: { user: 'malware' }, role: 'Fast little melee',
    hp: 10, speed: 7.5, radius: 0.35, painChance: 0.2, voice: 800, counts: false,
    melee: { damage: [3, 8], range: 0.9, time: 0.2, cooldown: 0.6 },
  },
  steve: {
    from: 'steve', model: { user: 'steve' }, role: 'Hitscan shooter',
    hp: 40, speed: 4.4, radius: 0.5, painChance: 0.7, voice: 180,
    hitscan: { damage: [3, 12], pellets: 3, spread: 0.08, time: 0.4, cooldown: 1.4 },
    teleport: { every: 2.8, range: 5 },
    drops: 'mail',
  },
  jammer: {
    from: 'jammer', model: { user: 'jammer' }, role: 'Tank',
    hp: 300, speed: 2.6, radius: 0.65, painChance: 0.15, voice: 140, scale: 1.15,
    melee: { damage: [10, 25], range: 1.3, time: 0.5, cooldown: 1.2 },
    missile: { damage: [15, 30], speed: 8, radius: 0.35, sprite: 'paper', count: 3, spread: 0.18, time: 0.7, cooldown: 2.6, colors: ['#f4f4f4', '#94b0c2'], sound: 'thud' },
  },
  vip: {
    from: 'vip', model: { user: 'vip' }, role: 'Elite: hurries everyone along',
    hp: 700, speed: 4, radius: 0.6, painChance: 0.1, voice: 120, scale: 1.25,
    melee: { damage: [15, 35], range: 1.4, time: 0.45, cooldown: 1.2 },
    missile: { damage: [20, 40], speed: 13, radius: 0.35, sprite: 'orb', count: 2, spread: 0.12, time: 0.55, cooldown: 2.0, colors: ['#b13e53', '#ef7d57'], sound: 'spit' },
    aura: { radius: 9, speed: 1.4 },
  },
  executive: {
    from: 'executive', model: { boss: 'executive' }, role: 'Boss',
    hp: 1600, speed: 4.2, radius: 1.0, painChance: 0.04, voice: 90, boss: true, scale: 1.7,
    melee: { damage: [20, 40], range: 2.2, time: 0.5, cooldown: 1.2 },
    missile: { damage: [15, 30], speed: 14, radius: 0.35, sprite: 'orb', count: 5, spread: 0.45, time: 0.7, cooldown: 2.4, colors: ['#29366f', '#b13e53', '#ffcd75'], sound: 'spit' },
    charge: { speed: 16, time: 0.6, every: 5, range: 30, damage: [25, 40] },
    summon: { id: 'vip', count: 1, every: 18, max: 2 },
    phases: [
      { at: 0.66, banner: "ESCALATED: now cc'ing your manager's manager." },
      { at: 0.33, banner: "FINAL PHASE: it's 8:59. The board is logging in." },
    ],
  },
  // Merger Day (E1M2): the new parent company's people.
  consultant: {
    from: 'consultant', model: { user: 'consultant' }, role: 'Ranged pair: throws slide decks',
    hp: 50, speed: 3.8, radius: 0.5, painChance: 0.5, voice: 240, pair: 'synergy',
    melee: { damage: [4, 10], range: 1.1, time: 0.3, cooldown: 1 },
    missile: { damage: [8, 16], speed: 12, radius: 0.28, sprite: 'deck', time: 0.5, cooldown: 1.8, colors: ['#f4f4f4', '#ffcd75'], sound: 'mailWhoosh' },
    drops: 'mail',
  },
  consultant_b: {
    from: 'consultant_b', model: { user: 'consultant_b' }, role: 'Ranged pair: throws slide decks',
    hp: 50, speed: 3.8, radius: 0.5, painChance: 0.5, voice: 260, pair: 'synergy',
    melee: { damage: [4, 10], range: 1.1, time: 0.3, cooldown: 1 },
    missile: { damage: [8, 16], speed: 12, radius: 0.28, sprite: 'deck', time: 0.5, cooldown: 1.8, colors: ['#f4f4f4', '#ffcd75'], sound: 'mailWhoosh' },
  },
  dave: {
    from: 'dave', model: { user: 'dave' }, role: 'Melee: comes back as Dave (2)',
    hp: 40, speed: 4, radius: 0.5, painChance: 0.6, voice: 300,
    melee: { damage: [5, 14], range: 1.1, time: 0.3, cooldown: 0.9 },
    onDeath: { spawn: 'dave2', count: 1 },
  },
  dave2: {
    from: 'dave2', model: { user: 'dave2' }, role: 'Fast melee',
    hp: 25, speed: 6.5, radius: 0.5, painChance: 0.6, voice: 330, counts: false,
    melee: { damage: [4, 10], range: 1.1, time: 0.22, cooldown: 0.7 },
  },
  brenda: {
    from: 'brenda', model: { user: 'brenda' }, role: 'Melee: slows you while close',
    hp: 45, speed: 5, radius: 0.5, painChance: 0.5, voice: 380,
    melee: { damage: [3, 9], range: 1.1, time: 0.3, cooldown: 0.8 },
    tailgate: { radius: 4.5, slow: 0.72 },
  },
  takeover: {
    from: 'takeover', model: { boss: 'takeover' }, role: 'Boss',
    hp: 2000, speed: 3.8, radius: 1.0, painChance: 0.04, voice: 80, boss: true, scale: 1.8,
    melee: { damage: [20, 40], range: 2.2, time: 0.5, cooldown: 1.2 },
    missile: { damage: [12, 25], speed: 13, radius: 0.35, sprite: 'memo', count: 5, spread: 0.5, time: 0.8, cooldown: 2.2, colors: ['#f4f4f4', '#b13e53'], sound: 'thud' },
    summon: { id: 'consultant', count: 2, every: 14, max: 4 },
    phases: [
      { at: 0.5, banner: 'SPIN-OFF! The Subsidiary has entered the meeting.', spawn: 'subsidiary' },
      { at: 0.25, banner: 'REORG! Everything is being restructured.' },
    ],
  },
  subsidiary: {
    from: 'subsidiary', model: { boss: 'subsidiary' }, role: 'Mini-boss',
    hp: 500, speed: 4.6, radius: 0.8, painChance: 0.1, voice: 110, scale: 1.35, counts: false,
    melee: { damage: [15, 30], range: 1.8, time: 0.45, cooldown: 1.1 },
    missile: { damage: [10, 20], speed: 13, radius: 0.32, sprite: 'memo', count: 3, spread: 0.3, time: 0.6, cooldown: 2.0, colors: ['#f4f4f4', '#41a6f6'], sound: 'thud' },
  },
  // An Unclaimed Moving Box: smash it, there's always something inside.
  moving_box: {
    from: 'moving_box', model: { user: 'moving_box' }, role: 'Breakable crate',
    hp: 25, speed: 0, radius: 0.55, painChance: 0, counts: false, crate: { loot: ['pizza', 'coffee', 'ticketClip', 'mail', 'keycap', 'snack', 'power'] },
  },
  // A swollen UPS battery: DOOM's exploding barrel, office edition.
  ups: {
    name: 'Swollen UPS Battery', model: { prop: 'ups' }, role: 'Exploding barrel',
    hp: 20, speed: 0, radius: 0.45, painChance: 0, counts: false, barrel: true,
    explode: { damage: 128, radius: 5 },
  },
};

// Decorations that stand in the way (models from the 3D game's furniture).
export const DECOR = {
  plant: { prop: 'plant', radius: 0.45, solid: true },
  cooler: { prop: 'waterCooler', radius: 0.4, solid: true },
};

// Difficulty, DOOM's five skills renamed. `damage` scales what you take, `ammo` what
// you pick up; map things with "minSkill" only appear from that skill up; `fast` users
// move, throw and wind up quicker.
export const SKILLS = [
  { name: "I'm Too Junior for This", hint: 'Half damage, double ammo.', damage: 0.5, ammo: 2 },
  { name: 'Hey, Not Too Many Tickets', hint: 'A gentler queue.', damage: 0.75, ammo: 1 },
  { name: 'Ticket Me Plenty', hint: 'A normal day on the desk.', damage: 1, ammo: 1 },
  { name: 'Ultra-Escalation', hint: 'More users, and worse ones.', damage: 1, ammo: 1 },
  { name: 'On-Call!', hint: 'Everyone is fast and furious. Double ammo.', damage: 1, ammo: 2, fast: true },
];
