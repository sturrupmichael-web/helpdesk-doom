// A 5x7 pixel font, so every word on screen (HUD, menus, wall signs) is drawn in crisp
// pixels at the game's low resolution instead of a blurry browser font.
// Each glyph is 7 rows of 5 columns; '#' is ink. Lower-case text is drawn in capitals.

const GLYPHS = {
  A: ' ### #   ##   #######   ##   ##   #',
  B: '#### #   ##   ##### #   ##   ##### ',
  C: ' ### #   ##    #    #    #   # ### ',
  D: '#### #   ##   ##   ##   ##   ##### ',
  E: '######    #    #### #    #    #####',
  F: '######    #    #### #    #    #    ',
  G: ' ### #   ##    # ####   ##   # ####',
  H: '#   ##   ##   #######   ##   ##   #',
  I: ' ###   #    #    #    #    #   ### ',
  J: '  ###   #    #    #    # #  #  ##  ',
  K: '#   ##  # # #  ##   # #  #  # #   #',
  L: '#    #    #    #    #    #    #####',
  M: '#   ### ### # ##   ##   ##   ##   #',
  N: '#   ###  ## # ##  ###   ##   ##   #',
  O: ' ### #   ##   ##   ##   ##   # ### ',
  P: '#### #   ##   ##### #    #    #    ',
  Q: ' ### #   ##   ##   ## # ##  #  ## #',
  R: '#### #   ##   ##### # #  #  # #   #',
  S: ' #####    #     ###     #    ##### ',
  T: '#####  #    #    #    #    #    #  ',
  U: '#   ##   ##   ##   ##   ##   # ### ',
  V: '#   ##   ##   ##   ##   # # #   #  ',
  W: '#   ##   ##   ## # ## # ## # # # # ',
  X: '#   ##   # # #   #   # # #   ##   #',
  Y: '#   ##   # # #   #    #    #    #  ',
  Z: '#####    #   #   #   #   #    #####',
  0: ' ### #   ##  ### # ###  ##   # ### ',
  1: '  #   ##    #    #    #    #   ### ',
  2: ' ### #   #    #  ##  #   #    #####',
  3: '#####   #   #     #     ##   # ### ',
  4: '   #   ##  # # #  # #####   #    # ',
  5: '######    ####     #    ##   # ### ',
  6: '  ##  #   #    #### #   ##   # ### ',
  7: '#####    #   #   #   #    #    #   ',
  8: ' ### #   ##   # ### #   ##   # ### ',
  9: ' ### #   ##   # ####    #   #  ##  ',
  " ": '                                   ',
  ".": '                           ##   ## ',
  ",": '                      ##   #   #   ',
  "!": '  #    #    #    #    #         #  ',
  "?": ' ### #   #    #   #   #         #  ',
  ":": '       ##   ##        ##   ##      ',
  ";": '       ##   ##        ##   #   #   ',
  "'": '  #    #   #                       ',
  "\"": ' # #  # #                          ',
  "-": '                ###                ',
  "+": '       #    #  #####  #    #       ',
  "=": '          #####     #####          ',
  "%": '##   ##  #   #   #   #   #  ##   ##',
  "/": '    #    #   #   #   #   #    #    ',
  "(": '   #   #   #    #    #     #     # ',
  ")": ' #     #     #    #    #   #   #   ',
  "#": ' # #  # # ##### # # ##### # #  # # ',
  "$": '  #   ##### #   ###   # #####   #  ',
  "&": ' ##  #  # # #   #   # # ##  #  ## #',
  "*": '     # # # ### ##### ### # # #     ',
  "<": '   #   #   #   #     #     #     # ',
  ">": ' #     #     #     #   #   #   #   ',
  "_": '                              #####',
  "@": ' ### #   ## #### # ## ####     ####',
  "[": ' ###  #    #    #    #    #    ### ',
  "]": ' ###    #    #    #    #    #  ### ',
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;

// Width in pixels of `text` at `scale` (1 px gap between letters).
export const textWidth = (text, scale = 1) => (String(text).length * (GLYPH_W + 1) - 1) * scale;

// Draws `text` on a 2D canvas context with its top-left at (x, y). `align` is 'left',
// 'center' or 'right'. `shadow` adds a one-pixel dark drop shadow for legibility.
export function drawText(ctx, text, x, y, color = '#f4f4f4', scale = 1, align = 'left', shadow = null) {
  text = String(text).toUpperCase();
  const w = textWidth(text, scale);
  let px = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  if (shadow) drawRaw(ctx, text, px + scale, y + scale, shadow, scale);
  drawRaw(ctx, text, px, y, color, scale);
  return w;
}

function drawRaw(ctx, text, x, y, color, scale) {
  ctx.fillStyle = color;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS['?'];
    for (let i = 0; i < g.length; i++) {
      if (g[i] === '#') ctx.fillRect(x + (i % GLYPH_W) * scale, y + Math.floor(i / GLYPH_W) * scale, scale, scale);
    }
    x += (GLYPH_W + 1) * scale;
  }
}

// Splits `text` into lines that fit `maxWidth` pixels at `scale`.
export function wrapText(text, maxWidth, scale = 1) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, scale) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// A tiny 3x5 font for the status bar's ammo table (digits, '/', and the capitals used).
const TINY = {
  0: '###' + '# #' + '# #' + '# #' + '###',
  1: ' # ' + '## ' + ' # ' + ' # ' + '###',
  2: '###' + '  #' + '###' + '#  ' + '###',
  3: '###' + '  #' + ' ##' + '  #' + '###',
  4: '# #' + '# #' + '###' + '  #' + '  #',
  5: '###' + '#  ' + '###' + '  #' + '###',
  6: '###' + '#  ' + '###' + '# #' + '###',
  7: '###' + '  #' + ' # ' + ' # ' + ' # ',
  8: '###' + '# #' + '###' + '# #' + '###',
  9: '###' + '# #' + '###' + '  #' + '###',
  '/': '  #' + '  #' + ' # ' + '#  ' + '#  ',
  ' ': '               ',
  A: ' # ' + '# #' + '###' + '# #' + '# #',
  C: ' ##' + '#  ' + '#  ' + '#  ' + ' ##',
  D: '## ' + '# #' + '# #' + '# #' + '## ',
  I: '###' + ' # ' + ' # ' + ' # ' + '###',
  L: '#  ' + '#  ' + '#  ' + '#  ' + '###',
  M: '# #' + '###' + '###' + '# #' + '# #',
  P: '###' + '# #' + '###' + '#  ' + '#  ',
  R: '## ' + '# #' + '## ' + '# #' + '# #',
  S: ' ##' + '#  ' + ' # ' + '  #' + '## ',
  T: '###' + ' # ' + ' # ' + ' # ' + ' # ',
  W: '# #' + '# #' + '###' + '###' + '# #',
  X: '# #' + '# #' + ' # ' + '# #' + '# #',
};

export function drawTiny(ctx, text, x, y, color, align = 'left') {
  text = String(text).toUpperCase();
  const w = text.length * 4 - 1;
  let px = Math.round(align === 'right' ? x - w : x);
  ctx.fillStyle = color;
  for (const ch of text) {
    const g = TINY[ch] ?? TINY[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '#') ctx.fillRect(px + (i % 3), Math.round(y) + Math.floor(i / 3), 1, 1);
    px += 4;
  }
}
