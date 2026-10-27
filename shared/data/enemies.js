// Copied unchanged from the original (HelpDeskSurvivor data/).
// End-user definitions. `behavior` picks a movement module from src/game/behaviors/,
// `params` are passed to it. HP and speed are multiplied by the wave timeline at spawn.
//
//   hp        base hit points
//   speed     world px / second
//   damage    sanity drained per second while touching the player
//   radius    collision radius (world px)
//   foot      px from collision center down to the sprite's feet (default 10)
//   xp        value of the Closed Ticket dropped (0 = no drop)
//   knockback 0..1, how much of a weapon's knockback applies (1 = full)
//   resist    damage multipliers by weapon tag, e.g. { policy: 0.4 }
//   onDeath   { spawn, count }: enemies released when this one is closed
//   explode   { damage }: dies on contact, dealing this much sanity damage at once
//   elite     draws a health bar
//   boss      shown on the boss bar, can't be shoved by the horde; `final` ends the shift when closed
//             (a boss's `params.phase2` is its second phase: see src/game/behaviors/phase2.js)
//   stunResist multiplier on stun duration (bosses barely flinch)
//   drops     extra drop chances on death, e.g. { chest: 0.5 }
//   particle  palette colors for the death burst
//   anchored  can't be shoved by the horde or knockback (Unclaimed Moving Box)
//   wikiAs    counts toward another user's Help Desk Wiki entry instead of its own
//   loot      drops one of these items, picked at random, when closed

// The Rat's Nest's second phase (behaviors/phase2.js), shared by the big nest and the
// two it splits into: when the whole fight is down to `at`, every nest left catches fire.
const NEST_FIRE = {
  at: 0.25, title: 'ELECTRICAL FIRE', wiki: 'At a quarter health, Electrical Fire: faster nests, sparks down every cable.',
  text: 'Something shorted. Sparks run down every cable.',
  speed: 1.25, lashEvery: 0.8, // x speed, x time between lashes
  sparks: { count: 3, radius: 18, delay: 0.35, step: 0.15, damage: 10 },
};

export const ENEMIES = {
  pam: {
    name: 'Password Reset Pam', sprite: 'pam', behavior: 'chase',
    hp: 6, speed: 34, damage: 8, radius: 7, xp: 1, knockback: 1,
    particle: ['#7a4ea0', '#ffcd75', '#f4f4f4'],
    flavor: '"It says my password expired. Again. I only changed it in March."',
  },
  quinn: {
    name: '"Quick Question" Quinn', sprite: 'quinn', behavior: 'dart',
    params: { dashEvery: 2.2, dashTime: 0.35, dashMult: 3.4, range: 220, approachMult: 0.75 },
    hp: 4, speed: 52, damage: 6, radius: 6, xp: 1, knockback: 1.2,
    particle: ['#38b764', '#ffcd75', '#f4f4f4'],
    flavor: '"Got a sec? It\'ll only take a sec. It is never a sec."',
  },
  randy: {
    name: 'Reply-All Randy', sprite: 'randy', behavior: 'chase',
    hp: 16, speed: 34, damage: 10, radius: 7, xp: 2, knockback: 0.8,
    onDeath: { spawn: 'randy_small', count: 3 },
    particle: ['#f4f4f4', '#b13e53', '#1a1c2c'],
    flavor: '"Please remove me from this list." (sent to 4,000 people)',
  },
  randy_small: {
    name: 'Reply-All Reply', sprite: 'randy_small', behavior: 'chase',
    hp: 4, speed: 50, damage: 4, radius: 5, foot: 5, xp: 1, knockback: 1.3,
    particle: ['#f4f4f4', '#b13e53'],
    flavor: '"+1" "Me too" "Please stop replying all" "Same"',
  },
  phish: {
    name: 'Phish Clicker', sprite: 'phish', behavior: 'summoner',
    params: { every: 4.5, count: 2, minion: 'malware', keepDistance: 120 },
    hp: 26, speed: 30, damage: 8, radius: 7, xp: 4, knockback: 0.8,
    particle: ['#b13e53', '#5d3a1a', '#f4f4f4'],
    flavor: '"The email said I won a gift card, so naturally I entered my password."',
  },
  malware: {
    name: 'Malware', sprite: 'malware', behavior: 'chase',
    hp: 3, speed: 56, damage: 5, radius: 5, foot: 4, xp: 1, knockback: 1.4,
    particle: ['#b13e53', '#7a4ea0'],
    flavor: 'FREE_GIFT_CARD.exe has been running since Tuesday.',
  },
  jammer: {
    name: 'Printer Jammer', sprite: 'jammer', behavior: 'dropper',
    params: { every: 4.5, zone: { radius: 18, life: 5, slow: 0.55 } },
    hp: 70, speed: 22, damage: 14, radius: 10, xp: 6, knockback: 0.25,
    particle: ['#f4f4f4', '#94b0c2', '#566c86'],
    flavor: '"I didn\'t touch anything. It just started making that noise."',
  },
  steve: {
    name: 'Shadow IT Steve', sprite: 'steve', behavior: 'teleport',
    params: { every: 2.8, range: 90, minDistance: 36 },
    hp: 22, speed: 40, damage: 10, radius: 7, xp: 4, knockback: 0.9,
    resist: { policy: 0.4 },
    particle: ['#29366f', '#38b764', '#1a1c2c'],
    flavor: '"It\'s fine, I set up my own server. Under my desk. On the guest Wi-Fi."',
  },
  vip: {
    name: 'The VIP', sprite: 'vip', behavior: 'aura',
    params: { radius: 72, speedBuff: 1.5 },
    hp: 180, speed: 30, damage: 18, radius: 8, xp: 20, knockback: 0.15, elite: true,
    drops: { chest: 0.15 },
    particle: ['#29366f', '#b13e53', '#f4f4f4'],
    flavor: '"This is urgent. Everything I send is urgent."',
  },
  walkup: {
    name: 'Ticket-less Walk-Up', sprite: 'walkup', behavior: 'chase',
    hp: 10, speed: 70, damage: 0, radius: 7, xp: 2, knockback: 0.6,
    noSeparation: true, explode: { damage: 14 },
    particle: ['#41a6f6', '#94b0c2', '#b13e53', '#ffcd75'],
    flavor: '"I didn\'t make a ticket, I figured I\'d just swing by."',
  },

  // --- Merger Day users (newUsers in data/maps.js) ---
  consultant: {
    name: 'Synergy Consultant', sprite: 'consultant', behavior: 'pair',
    params: { partner: 'consultant_b', gap: 24, enrage: 1.7 },
    hp: 20, speed: 36, damage: 9, radius: 7, xp: 3, knockback: 0.9,
    particle: ['#566c86', '#ffcd75', '#f4f4f4'],
    flavor: '"We\'re not here to cut jobs. We\'re here to right-size the org." (Always in pairs.)',
  },
  consultant_b: {
    name: 'Synergy Consultant', sprite: 'consultant_b', behavior: 'pair', wikiAs: 'consultant',
    params: { gap: 24, enrage: 1.7 },
    hp: 20, speed: 36, damage: 9, radius: 7, xp: 3, knockback: 0.9,
    particle: ['#566c86', '#ffcd75', '#f4f4f4'],
    flavor: '"Let\'s take this offline and circle back with a deck."',
  },
  dave: {
    name: 'Duplicate Dave', sprite: 'dave', behavior: 'chase',
    hp: 12, speed: 38, damage: 8, radius: 7, xp: 2, knockback: 1,
    onDeath: { spawn: 'dave2', count: 1 },
    particle: ['#3b5dc9', '#ffcd75', '#f4f4f4'],
    flavor: 'Has an account in both directories. Neither one works. Close him and his other account shows up.',
  },
  dave2: {
    name: 'Dave (2)', sprite: 'dave2', behavior: 'chase',
    hp: 8, speed: 50, damage: 6, radius: 7, xp: 2, knockback: 1.1,
    particle: ['#ef7d57', '#ffcd75', '#f4f4f4'],
    flavor: 'dave.smith2@newparent.com. Same Dave. Same ticket. Different mailbox.',
  },
  brenda: {
    name: 'Badge Brenda', sprite: 'brenda', behavior: 'tailgate',
    params: { radius: 56, slow: 0.78 },
    hp: 18, speed: 46, damage: 5, radius: 7, xp: 3, knockback: 0.9,
    particle: ['#34488f', '#ffcd75', '#b13e53'],
    flavor: '"My new badge doesn\'t open anything. Mind if I just follow you in?" (Slows you while she\'s close.)',
  },
  moving_box: {
    name: 'Unclaimed Moving Box', sprite: 'moving_box', behavior: 'still', anchored: true,
    hp: 30, speed: 0, damage: 0, radius: 9, foot: 1, xp: 2, knockback: 0,
    loot: ['pizza', 'pizza', 'swag_bag', 'swag_bag', 'bulk_close', 'pto'],
    particle: ['#a0703c', '#5d3a1a', '#ffcd75'],
    flavor: 'Labeled "MISC - DO NOT OPEN". Smash it open: there\'s always something inside.',
  },

  // --- Bosses (spawned by events in data/waves.js; HP is not scaled by the timeline) ---
  incident: {
    name: 'Major Incident', sprite: 'incident', behavior: 'incidentBoss', boss: true,
    params: {
      ringEvery: 4.5, ringTelegraph: 1.0, ringBullets: 22, ringGap: 5, bulletSpeed: 85, bulletDamage: 10,
      minionEvery: 5, minionCount: 4, minion: 'status_update',
      // Second phase (behaviors/phase2.js): double rings, and spirals between them.
      phase2: {
        at: 0.5, title: 'SEV 0', wiki: 'At half health, SEV 0: double rings and sweeping spirals of phones.',
        text: 'Now it is two bridge calls. Circle with the spiral.',
        spiral: { telegraph: 0.9, time: 2.6, every: 0.13, turn: 1.3, arms: 3, speed: 80, damage: 9 },
      },
    },
    hp: 9000, speed: 20, damage: 20, radius: 22, foot: 16, xp: 60, knockback: 0, stunResist: 0.1,
    downBanner: ['INCIDENT RESOLVED', 'Post-mortem scheduled for never. Grab the Change Approved.'],
    particle: ['#566c86', '#b13e53', '#ffcd75', '#f4f4f4'],
    flavor: 'Severity 1. Forty people on the bridge. Nobody is typing.',
  },
  // Map bosses: replace the Major Incident at 10:00 on their map (`boss` in data/maps.js).
  // Every non-final boss drops a Change Approved chest where it goes down.
  ratsnest: {
    name: "The Rat's Nest", sprite: 'ratsnest', behavior: 'ratsnestBoss', boss: true,
    params: {
      lashEvery: 3.2, lashTelegraph: 0.9, lashLength: 180, lashWidth: 14, lashDamage: 16,
      snagEvery: 6, snagCount: 3, snagScatter: 70,
      snag: { radius: 16, life: 7, slow: 0.4, sprite: 'cable_loop' },
      splitAt: 0.5, small: 'ratsnest_small',
      phase2: NEST_FIRE,
    },
    hp: 13000, speed: 18, damage: 20, radius: 24, foot: 24, xp: 60, knockback: 0, stunResist: 0.1,
    downBanner: ['CABLES MANAGED', 'Labeled, zip-tied and finally documented. Grab the Change Approved.'],
    particle: ['#41a6f6', '#ffcd75', '#38b764', '#ef7d57'],
    flavor: 'Nobody knows what half of these plug into. Unplugging any of them takes down payroll.',
  },
  ratsnest_small: {
    name: "The Rat's Nest", sprite: 'ratsnest_small', behavior: 'ratsnestBoss', boss: true,
    params: {
      lashEvery: 3.2, lashTelegraph: 0.9, lashLength: 180, lashWidth: 12, lashDamage: 12,
      snagEvery: 6, snagCount: 1, snagScatter: 50,
      snag: { radius: 16, life: 7, slow: 0.4, sprite: 'cable_loop' },
      isSmall: true,
      phase2: NEST_FIRE,
    },
    hp: 4000, speed: 18, damage: 14, radius: 16, foot: 16, xp: 20, knockback: 0, stunResist: 0.1,
    particle: ['#41a6f6', '#ffcd75', '#38b764', '#ef7d57'],
  },
  caller: {
    name: 'The Angry Caller', sprite: 'caller', behavior: 'callerBoss', boss: true,
    params: {
      keepAway: [120, 190], attackGap: [2.4, 1.7], // seconds between attacks: normal, phase 2
      attacks: ['hold', 'scream', 'conference'],
      // Second phase (behaviors/phase2.js): shorter gaps, double "please hold", transfers.
      phase2: {
        at: 0.5, title: 'ESCALATED', wiki: 'At half health, Escalated: transfers itself to a spot right behind you.',
        text: 'A supervisor is on the line. They can transfer themselves now.',
        attacks: ['hold', 'scream', 'conference', 'transfer'],
        transfer: { telegraph: 1.1, behind: 70, radius: 64, damage: 14, push: 380 },
      },
      hold: { count: 8, radius: 62, bombRadius: 24, gap: 2, delay: 1.5, ringGap: 0.6, damage: 12 },
      scream: { telegraph: 0.8, spread: 0.9, range: 230, damage: 11, push: 420 },
      conference: { id: 'randy', count: 6, radius: 170 },
    },
    hp: 9000, speed: 40, damage: 20, radius: 20, foot: 26, xp: 60, knockback: 0, stunResist: 0.1,
    downBanner: ['CALL RESOLVED', 'They rated you 1 star anyway. Grab the Change Approved.'],
    particle: ['#7a4ea0', '#b13e53', '#73eff7', '#f4f4f4'],
    flavor: '"I have been on hold for FORTY minutes. I want your name. And your manager\'s name."',
  },
  janitor: {
    name: 'The Night Janitor', sprite: 'janitor', behavior: 'janitorBoss', boss: true,
    params: {
      attackGap: [2.6, 1.9], trailEvery: 0.45, // seconds between attacks: normal, phase 2
      attacks: ['mop', 'charge', 'lights'],
      // Second phase (behaviors/phase2.js): shorter gaps, double charges, spin-outs.
      phase2: {
        at: 0.5, title: 'DOUBLE SHIFT', wiki: 'At half health, Double Shift: double charges and buffer spin-outs.',
        text: "He's on overtime now. Stay out of the buffer's reach.",
        attacks: ['mop', 'charge', 'lights', 'spin'],
        recharge: 0.6, // telegraph of the second charge (s)
        spin: { telegraph: 0.9, time: 1.0, radius: 80, damage: 18, push: 320, wet: 8 },
      },
      wet: { radius: 18, life: 8, slip: true, sprite: 'wet_floor' },
      mop: { count: 6, spread: 1.3, reach: 130 },
      charge: { telegraph: 1.0, speed: 300, time: 0.85, damage: 24 },
      lights: { time: 5, scale: 0.5 },
    },
    hp: 13500, speed: 26, damage: 22, radius: 20, foot: 26, xp: 60, knockback: 0, stunResist: 0.1,
    downBanner: ['FLOOR CLEAN', 'He clocked out. Caution: still wet. Grab the Change Approved.'],
    particle: ['#566c86', '#ef7d57', '#41a6f6', '#ffcd75'],
    flavor: 'Has keys to every door in the building. Has never once been asked his name.',
  },
  takeover: {
    name: 'The Hostile Takeover', sprite: 'takeover', behavior: 'takeoverBoss', boss: true,
    params: {
      attackGap: [3, 2.2], // seconds between attacks: normal, phase 2
      attacks: ['memo', 'allhands'],
      absorb: { heal: 15, perSec: 6, grow: 0.012, maxScale: 1.5 },
      memo: { telegraph: 1.2, lanes: 3, gap: 92, width: 36, length: 560, damage: 16 },
      allhands: { id: 'consultant', pairs: 2, radius: 150 },
      spinAt: 0.5, spin: 'subsidiary',
      // Second phase (behaviors/phase2.js), at `at` of its own HP: shorter gaps, Reorgs.
      phase2: {
        at: 0.25, title: 'REORG', wiki: 'At a quarter health, Reorg: memo lanes both ways at once.',
        text: 'Everything is being restructured. Stand between the lines.',
        reorg: { telegraph: 1.4, lanes: 3, gap: 100, width: 34, length: 520, damage: 16 },
      },
    },
    hp: 13000, speed: 24, damage: 22, radius: 22, foot: 26, xp: 60, knockback: 0, stunResist: 0.1,
    downBanner: ['DEAL CLOSED', 'The merger is complete. Your badge works now. Grab the Change Approved.'],
    particle: ['#1f2a5c', '#34488f', '#ffcd75', '#f4f4f4'],
    flavor: '"Nothing changes for you. Except your email, your laptop, your manager and your job title."',
  },
  subsidiary: {
    name: 'The Subsidiary', sprite: 'subsidiary', behavior: 'takeoverBoss', boss: true,
    params: {
      isSmall: true, attackGap: [2.6, 2.6],
      attacks: ['memo'],
      memo: { telegraph: 1.0, lanes: 1, gap: 0, width: 32, length: 420, damage: 14 },
    },
    hp: 3500, speed: 34, damage: 14, radius: 14, foot: 16, xp: 20, knockback: 0, stunResist: 0.1,
    particle: ['#566c86', '#ffcd75', '#f4f4f4'],
  },
  status_update: {
    name: 'Status Update Request', sprite: 'status_update', behavior: 'chase',
    hp: 8, speed: 58, damage: 6, radius: 5, foot: 4, xp: 1, knockback: 1.2,
    particle: ['#ffcd75', '#f4f4f4'],
    flavor: '"Any update?" (sent 30 seconds after the last update)',
  },
  executive: {
    name: 'The Executive Who Needs It Fixed Before The Board Meeting', sprite: 'executive', behavior: 'executiveBoss',
    boss: true, final: true,
    downBanner: ['SHIFT COMPLETE', 'The Executive left for the board meeting. Everyone else went home.'],
    params: {
      phases: [0.66, 0.33], // HP fractions where phase 2 and 3 begin
      attackGap: [2.6, 2.2, 1.6], // seconds between attacks, per phase
      charge: { telegraph: 0.9, speed: 320, time: 0.75, damage: 22 },
      cone: { telegraph: 0.7, bullets: 7, spread: 1.0, speed: 120, damage: 12, volleys: [1, 1, 2] },
      bombs: { count: 5, radius: 34, delay: 1.3, damage: 22, scatter: 90 },
      summon: { id: 'vip', count: 2 },
      // Calendar Tetris (final phase): a size x size checkerboard of meetings round you,
      // half going off after `delay` s and the other half after `delay2` s.
      calendar: { size: 5, spacing: 52, radius: 24, delay: 1.3, delay2: 2.2, damage: 18 },
      // Attacks the boss picks from in each phase (never the same one twice in a row).
      attacks: [['charge', 'cone'], ['charge', 'cone', 'bombs'], ['charge', 'cone', 'bombs', 'summon', 'calendar']],
      phase2: { wiki: 'Final phase: Calendar Tetris, two waves of meetings in a checkerboard.' }, // the final phase is its second phase (behaviors/phase2.js); the banner is its own
      phaseBanners: [
        null,
        ['ESCALATED', "Now cc'ing your manager's manager."],
        ['FINAL PHASE', "It's 8:59. The board is logging in."],
      ],
    },
    hp: 60000, speed: 30, damage: 25, radius: 22, foot: 26, xp: 0, knockback: 0, stunResist: 0.1,
    particle: ['#29366f', '#b13e53', '#f4f4f4', '#ffcd75'],
    flavor: '"I don\'t need the details. I just need it working. By 9."',
  },
};
