// Doom Mode: it boots to the title, a shift can be finished in badge order, users
// wake up and fight, and the exit leads to the tally. Uses doom.tick() to step the game,
// since headless browsers don't run animation frames on their own.

import { assert } from './harness.mjs';

export const browser = true;
export const pages = ['dev.html', 'index.html'];

// Walks the map as a flood fill, picking up badges and opening the doors they unlock,
// and reports what it couldn't reach.
const REACH = `(() => {
  const L = doom.level, g = doom.game;
  const keys = new Set();
  const start = L.idx(L.col(g.player.x), L.col(g.player.z));
  const keyAt = {};
  for (const p of g.pickups) if (p.def.key) keyAt[L.idx(L.col(p.x), L.col(p.z))] = p.def.key;
  const lo = (j) => { const c = L.cells[j]; if (c.kind === 'lift') return L.lifts[L.liftOf[j]].low; if (c.kind === 'door') return L.doors[L.doorOf[j]].floor; return L.floor[j]; };
  const hi = (j) => { const c = L.cells[j]; if (c.kind === 'lift') return L.lifts[L.liftOf[j]].high; return lo(j); };
  const ceil = (j) => { const c = L.cells[j]; if (c.kind === 'door') return L.doors[L.doorOf[j]].top; return L.cells[j].kind==='lift' ? 99 : L.ceil[j]; };
  let seen, order = [];
  for (let pass = 0; pass < 5; pass++) {
    seen = new Uint8Array(L.cells.length); const q = [start]; seen[start] = 1;
    while (q.length) { const j = q.pop(); if (keyAt[j] && !keys.has(keyAt[j])) { keys.add(keyAt[j]); order.push(keyAt[j]); }
      const c = j % L.w, r = (j / L.w) | 0;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const k = L.idx(c+dc, r+dr); const ck = L.cells[k]; if (!ck || seen[k] || ck.kind === 'wall') continue;
        if (ck.kind === 'door') { const d = L.doors[L.doorOf[k]]; if (d.key && !keys.has(d.key)) continue; }
        if (lo(k) > hi(j) + 0.75 && hi(k) > hi(j) + 0.75) { if (!(L.cells[j].kind==='lift' && hi(k) <= hi(j)+0.75)) continue; }
        if (ceil(k) - Math.max(lo(k), hi(j)) < 1.75 && ceil(k) - hi(k) < 1.75) continue;
        seen[k] = 1; q.push(k); } }
  }
  const exitNear = []; for (let j = 0; j < L.cells.length; j++) if (L.cells[j].def?.exit) { const c=j%L.w, r=(j/L.w)|0; exitNear.push([[1,0],[-1,0],[0,1],[0,-1]].some(([dc,dr]) => L.inside(c+dc,r+dr) && seen[L.idx(c+dc,r+dr)])); }
  const secrets = L.secrets.map(s => s.cells.some(j => seen[j]));
  const items = g.pickups.filter(p => !seen[L.idx(L.col(p.x), L.col(p.z))]).map(p => p.id + '@' + L.col(p.x) + ',' + L.col(p.z));
  const mons = g.actors.filter(a => a.counts && !seen[L.idx(L.col(a.x), L.col(a.z))]).map(a => a.type + '@' + L.col(a.x) + ',' + L.col(a.z));
  return JSON.stringify({ order, exit: exitNear, secrets, unreachableItems: items, unreachableMonsters: mons });
})()`;

export const tests = [
  ['boots to the title with no errors', async (page) => {
    await page.evaluate(() => doom.tick(10));
    assert(await page.evaluate(() => doom.mode) === 'title', 'not on the title screen');
    assert(page.errors.length === 0, page.errors.join('\n'));
  }],
  ['every level can be finished: every badge, item, user, secret and the exit can be reached', async (page) => {
    const n = await page.evaluate(() => doom.maps.length);
    assert(n >= 2, `only ${n} levels`);
    for (let i = 0; i < n; i++) {
      const r = JSON.parse(await page.evaluate(`doom.playLevel(${i}, null), ${REACH}`));
      const name = await page.evaluate(() => doom.level.name);
      assert(r.order.join() === 'blue,yellow,red', `${name}: badges found in order ${r.order}`);
      assert(r.exit.every(Boolean), `${name}: the exit switch is out of reach`);
      assert(r.secrets.every(Boolean), `${name}: a secret is out of reach`);
      assert(r.unreachableItems.length === 0, `${name}: unreachable items: ${r.unreachableItems}`);
      assert(r.unreachableMonsters.length === 0, `${name}: unreachable users: ${r.unreachableMonsters}`);
    }
  }],
  ['harder skills bring more users', async (page) => {
    const counts = await page.evaluate(() => [3, 4].map((s) => { doom.start(s); return doom.game.stats.totalKills; }));
    assert(counts[0] > 30 && counts[1] > counts[0], `kills to make: ${counts}`);
  }],
  ['gunfire wakes users, and they come and hurt you', async (page) => {
    const r = await page.evaluate(() => {
      doom.start(3);
      const g = doom.game;
      g.player.x = 36 * 2 + 1;
      g.player.z = 40 * 2 + 1;
      g.noise(20);
      doom.tick(300);
      return { awake: g.actors.filter((a) => a.monster && a.state !== 'idle').length, health: g.player.health };
    });
    assert(r.awake > 0, 'nobody woke up');
    assert(r.health < 100, 'nobody hurt the player');
  }],
  ['users you hurt die and count as kills', async (page) => {
    const r = await page.evaluate(() => {
      doom.start(3);
      const g = doom.game;
      const pam = g.actors.find((a) => a.type === 'pam');
      g.damageActor(pam, 999, g.player);
      doom.tick(30);
      return { dead: pam.dead, kills: g.stats.kills };
    });
    assert(r.dead && r.kills === 1, JSON.stringify(r));
  }],
  ['each exit leads to the tally and the next level, keeping your tools; the last one to the ending', async (page) => {
    const r = await page.evaluate(() => {
      const exitAt = () => {
        // Stand next to the level's exit switch, facing it, and press it.
        const L = doom.level;
        const g = doom.game;
        for (let j = 0; j < L.cells.length; j++) {
          if (!L.cells[j].def?.exit) continue;
          const c = j % L.w;
          const r = (j / L.w) | 0;
          for (const [dc, dr, yaw] of [[-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2], [0, -1, Math.PI], [0, 1, 0]]) {
            const n = L.cell(c + dc, r + dr);
            if (!n || n.kind !== 'open') continue;
            g.player.x = (c + dc + 0.5) * L.S;
            g.player.z = (r + dr + 0.5) * L.S;
            g.player.yaw = yaw;
            g.use();
            return;
          }
        }
      };
      const press = () => {
        doom.input.queue.push('use');
        doom.tick(1);
      };
      doom.start(3);
      doom.game.arsenal.owned.add('reimage');
      exitAt();
      doom.tick(60);
      const modes = [doom.mode];
      press();
      press();
      modes.push(doom.mode, doom.mapIndex, doom.game.arsenal.owned.has('reimage'));
      exitAt();
      doom.tick(60);
      modes.push(doom.mode);
      press();
      press();
      modes.push(doom.mode);
      press();
      press();
      modes.push(doom.mode);
      return modes;
    });
    assert(JSON.stringify(r) === JSON.stringify(['tally', 'play', 1, true, 'tally', 'ending', 'title']), JSON.stringify(r));
    assert(page.errors.length === 0, page.errors.join('\n'));
  }],
  // Last, since a touch switches the page to touch controls for good.
  ['on a touch screen: the stick moves, FIRE fires, II pauses', async (page) => {
    const r = await page.evaluate(() => {
      const ev = (type, target, x, y, id) =>
        target.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, bubbles: true }));
      const root = document.getElementById('touch');
      const button = (id) => {
        const b = root.querySelector(`[data-id=${id}]`);
        const r = b.getBoundingClientRect();
        return [b, r.x + r.width / 2, r.y + r.height / 2];
      };
      ev('pointerdown', document.body, 10, 10, 1);
      ev('pointerup', document.body, 10, 10, 1);
      doom.start(3);
      doom.tick(1);
      const out = { touch: doom.input.touch, shown: getComputedStyle(root).display !== 'none' };
      const p = doom.game.player;
      const z0 = p.z;
      ev('pointerdown', root, 100, 200, 2);
      ev('pointermove', root, 100, 150, 2);
      doom.tick(20);
      out.moved = Math.hypot(p.x - 75, p.z - z0) > 1;
      ev('pointerup', root, 100, 150, 2);
      const yaw = p.yaw;
      ev('pointerdown', root, innerWidth * 0.6, 150, 3);
      ev('pointermove', root, innerWidth * 0.6 + 60, 150, 3);
      ev('pointerup', root, innerWidth * 0.6 + 60, 150, 3);
      doom.tick(1);
      out.turned = p.yaw !== yaw;
      const ammo = doom.game.arsenal.ammo.tickets;
      const [fire, fx, fy] = button('fire');
      ev('pointerdown', fire, fx, fy, 4);
      doom.tick(30);
      ev('pointerup', root, fx, fy, 4);
      out.fired = doom.game.arsenal.ammo.tickets < ammo;
      const [pause, px, py] = button('pause');
      ev('pointerdown', pause, px, py, 5);
      ev('pointerup', root, px, py, 5);
      doom.tick(1);
      out.mode = doom.mode;
      out.hidden = getComputedStyle(root).display === 'none';
      return out;
    });
    assert(JSON.stringify(r) === JSON.stringify({ touch: true, shown: true, moved: true, turned: true, fired: true, mode: 'paused', hidden: true }), JSON.stringify(r));
    assert(page.errors.length === 0, page.errors.join('\n'));
  }],
];
