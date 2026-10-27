// Doom Mode weapons: the 3D game's tools (data/weapons/), rebuilt as things you hold.
// Slots are the number keys. Damage is per hit (per pellet), rolled between the two
// numbers. Times are seconds. Ranges and speeds are scene units (a map cell is 2).
//
//   kind      'melee' (short reach), 'hitscan' (instant, like DOOM's guns) or 'projectile'
//   ammo      key in AMMO, and `use` of it per shot
//   pellets   hitscan rays per shot; `spread` is their random angle (radians)
//   firstShotAccurate  the first shot after a pause goes dead straight (DOOM's pistol)
//   projectile  { speed, radius, damage: [min, max], splash: { radius, damage } }
//   refire    true: keeps firing while the button is held
//   noise     how far (cells) the shot wakes up users who can hear it

export const AMMO = {
  tickets: { name: 'Tickets', short: 'TIX', max: 200, start: 50 },
  mail: { name: 'Emails', short: 'MAIL', max: 50, start: 0 },
  discs: { name: 'Install Discs', short: 'DISC', max: 50, start: 0 },
  power: { name: 'UPS Charge', short: 'PWR', max: 300, start: 0 },
};

export const WEAPONS = {
  cable: {
    slot: 1, name: 'Patch Cable', kind: 'melee', ammo: null,
    damage: [8, 22], range: 2.4, cooldown: 0.55, hitDelay: 0.12, noise: 0, sound: 'whip',
    flavor: 'Cat6, 15 feet, no idea which port it goes to.',
  },
  autoClose: {
    slot: 2, name: 'Ticket Auto-Close', kind: 'hitscan', ammo: 'tickets', use: 1,
    damage: [5, 15], pellets: 1, spread: 0.045, firstShotAccurate: true, cooldown: 0.32, noise: 30, sound: 'pistol',
    flavor: 'Closing due to no response. It has been four minutes.',
  },
  replyAll: {
    slot: 3, name: 'Reply-All Storm', kind: 'hitscan', ammo: 'mail', use: 1,
    damage: [5, 15], pellets: 7, spread: 0.1, cooldown: 0.95, noise: 30, sound: 'shotgun',
    pickupAmmo: 8,
    flavor: 'Sent to All-Staff (4,812 recipients). 4,811 replies so far.',
  },
  powershell: {
    slot: 4, name: 'PowerShell Script', kind: 'hitscan', ammo: 'tickets', use: 1, refire: true,
    damage: [5, 15], pellets: 1, spread: 0.06, firstShotAccurate: true, cooldown: 0.115, noise: 30, sound: 'chaingun',
    pickupAmmo: 20,
    flavor: 'Tested in production. Works on my machine.',
  },
  reimage: {
    slot: 5, name: 'Reimage', kind: 'projectile', ammo: 'discs', use: 1,
    projectile: { sprite: 'disc', speed: 24, radius: 0.25, damage: [20, 160], splash: { radius: 5, damage: 128 } },
    cooldown: 0.75, noise: 30, sound: 'launch',
    pickupAmmo: 2,
    flavor: 'Did you back up your files? You did not back up your files.',
  },
  reboot: {
    slot: 6, name: 'Fleet-Wide Reboot', kind: 'projectile', ammo: 'power', use: 40,
    windup: 0.6, cooldown: 1.4, noise: 40, sound: 'bfgCharge',
    projectile: { sprite: 'reboot', speed: 20, radius: 0.5, damage: [100, 800], splash: null, spray: { rays: 40, spread: 0.8, damage: [49, 87], range: 32 } },
    pickupAmmo: 40,
    flavor: 'Scheduled for 2 PM on a Tuesday. In the middle of the all-hands.',
  },
};

export const START_WEAPONS = ['cable', 'autoClose'];
export const SLOT_ORDER = ['cable', 'autoClose', 'replyAll', 'powershell', 'reimage', 'reboot'];
