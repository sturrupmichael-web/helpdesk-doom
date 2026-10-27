// Doom Mode pickups: health, armor, ammo, weapons, badges and power-ups, named after
// the 3D game's items (data/pickups.js) and drawn from its pixel icons (src/ui/icons.js).
//
//   icon       pixel icon name (src/ui/icons.js ICONS), or a sprite drawn in sprites.js
//   recolor    { from: to } colors swapped in the icon
//   health     + health, up to `max` (100, or 200 for bonuses)
//   armor      armor points (and `armorClass` 1 or 2: how much damage armor soaks up)
//   ammo       { kind: amount }
//   weapon     a weapons.js id; picking it up also gives its `pickupAmmo`
//   key        badge color
//   power      a power-up: invulnerable / berserk / map, for `time` seconds
//   always     picked up even when it would do nothing (badges, power-ups)
//   counts     counts toward the items % on the tally screen (DOOM counts the rare ones)
//   size       sprite height in scene units

const B = '#41a6f6';

export const ITEMS = {
  coffee: { name: 'Cold Brew', icon: 'coffee', health: 10, max: 100, msg: 'Picked up a Cold Brew.', size: 0.6 },
  pizza: { name: 'Vendor-Lunch Pizza', icon: 'pizza', health: 25, max: 100, msg: 'Picked up some leftover vendor-lunch pizza.', size: 0.6 },
  snack: { name: 'Desk Snack', icon: 'snack', health: 1, max: 200, always: true, counts: true, msg: 'Picked up a desk snack.', size: 0.45 },
  keycap: { name: 'Spare Keycap', icon: 'keyboard', armor: 1, armorMax: 200, always: true, counts: true, msg: 'Picked up a spare keycap.', size: 0.45 },
  ooo: { name: 'Out-of-Office Reply', icon: 'ooo', armor: 100, armorClass: 1, msg: 'Set your Out-of-Office Reply! (100 armor)', size: 0.7 },
  sabbatical: { name: 'Sabbatical', icon: 'ooo', recolor: { '#73eff7': '#ffcd75', '#f4f4f4': '#ffe9b0' }, armor: 200, armorClass: 2, msg: 'Your Sabbatical was approved! (200 armor)', size: 0.75 },
  catering: { name: 'Catered Lunch', icon: 'pizza', recolor: { '#ffcd75': '#41a6f6', '#a0703c': '#29366f' }, health: 100, max: 200, always: true, counts: true, glow: B, msg: 'CATERED LUNCH! The whole spread is yours.', size: 0.8 },
  pto: { name: 'PTO Request', icon: 'pto', power: 'invulnerable', time: 20, always: true, counts: true, glow: B, msg: 'PTO APPROVED! Nothing can touch you for a while.', size: 0.75 },
  bulk: { name: 'Bulk Close', icon: 'bulk', power: 'berserk', health: 100, max: 100, always: true, counts: true, msg: 'BULK CLOSE! Your patch cable hits ten times harder.', size: 0.7 },
  floorplan: { name: 'Fire Evacuation Map', icon: 'floorplan', power: 'map', always: true, counts: true, msg: 'Found the fire evacuation map. (Tab)', size: 0.7 },

  ticketClip: { name: 'Ticket Stack', icon: 'ticket', ammo: { tickets: 10 }, msg: 'Picked up a stack of tickets.', size: 0.5 },
  ticketBox: { name: 'Box of Tickets', icon: 'ticketbox', ammo: { tickets: 50 }, msg: 'Picked up a box of tickets.', size: 0.6 },
  mail: { name: 'Emails', icon: 'email', ammo: { mail: 4 }, msg: 'Picked up 4 unread emails.', size: 0.5 },
  mailBox: { name: 'Full Inbox', icon: 'inbox', ammo: { mail: 20 }, msg: 'Picked up a full inbox.', size: 0.6 },
  disc: { name: 'Install Disc', icon: 'disc', ammo: { discs: 1 }, msg: 'Picked up an install disc.', size: 0.45 },
  discBox: { name: 'Disc Spindle', icon: 'spindle', ammo: { discs: 5 }, msg: 'Picked up a spindle of install discs.', size: 0.6 },
  power: { name: 'UPS Battery', icon: 'charger', ammo: { power: 20 }, msg: 'Picked up a UPS battery.', size: 0.5 },
  powerBig: { name: 'Rack UPS', icon: 'ups', ammo: { power: 100 }, msg: 'Picked up a rack-mount UPS.', size: 0.7 },

  w_replyAll: { name: 'Reply-All Storm', weapon: 'replyAll', msg: 'You got the Reply-All Storm!', size: 0.6 },
  w_powershell: { name: 'PowerShell Script', weapon: 'powershell', msg: 'You got the PowerShell Script!', size: 0.6 },
  w_reimage: { name: 'Reimage', weapon: 'reimage', msg: 'You got the Reimage launcher! Back up your files.', size: 0.6 },
  w_reboot: { name: 'Fleet-Wide Reboot', weapon: 'reboot', msg: 'You got the Fleet-Wide Reboot! Oh no.', size: 0.7 },

  blueBadge: { name: 'Blue Badge', icon: 'badge', recolor: { '#38b764': '#41a6f6' }, key: 'blue', always: true, msg: 'Picked up a blue access badge (Contractor).', size: 0.5 },
  yellowBadge: { name: 'Yellow Badge', icon: 'badge', recolor: { '#38b764': '#ffcd75' }, key: 'yellow', always: true, msg: 'Picked up a yellow access badge (Employee).', size: 0.5 },
  redBadge: { name: 'Red Badge', icon: 'badge', recolor: { '#38b764': '#b13e53' }, key: 'red', always: true, msg: 'Picked up a red access badge (Domain Admin).', size: 0.5 },
};
