// Ported unchanged from the original (HelpDeskSurvivor data/).
// Shared 20-color palette used by every sprite definition.
// Each key is the single character used in sprite grids; '.' is always transparent.
// Edit a hex value here and re-run `node sprites/build.js` to recolor everything.
export const PALETTE = {
  k: '#1a1c2c', // outline / near-black
  w: '#f4f4f4', // white (paper, collars, hit flash)
  g: '#94b0c2', // light gray (cubicle trim, keyboards)
  G: '#566c86', // gray (headsets, skirts, fabric)
  c: '#36363b', // carpet charcoal
  m: '#4b4b52', // carpet mid grey
  D: '#47566b', // desk top (a shade darker than the partition gray)
  E: '#34404f', // desk front edge
  K: '#232328', // chair black
  n: '#29366f', // navy (pants, carpet speckle)
  b: '#3b5dc9', // blue (helpdesk polo)
  B: '#41a6f6', // light blue (screens, tier-1 tickets)
  s: '#f4c8a0', // skin light
  S: '#b07850', // skin dark
  h: '#5d3a1a', // brown (hair, desk edges, pots)
  d: '#a0703c', // wood / tan (desk tops)
  y: '#ffcd75', // yellow (sticky notes, lanyards, gold tickets)
  r: '#b13e53', // red
  e: '#38b764', // green (plants, tier-2 tickets)
  p: '#7a4ea0', // purple (cardigans)
  // Added for the extra office maps (data/maps.js).
  x: '#4a4a50', // concrete
  X: '#64646b', // concrete light
  o: '#ef7d57', // orange (hot aisle, warning stripes)
  q: '#73eff7', // cyan (server LEDs, wallboard)
  R: '#2a2f45', // raised-floor seam / server room shadow
  // Added for Merger Day: the parent company's brand colors (navy and gold, with 'y').
  a: '#1f2a5c', // deep navy (acquirer floor, suits)
  A: '#34488f', // light navy (acquirer highlights)
  // Added for the job-title techs.
  u: '#d49a6a', // skin medium
};

// Color used for the auto-generated hit-flash frames.
export const FLASH_COLOR = '#ffffff';
