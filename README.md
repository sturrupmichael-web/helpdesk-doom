# Helpdesk Survivors: Doom Mode

Helpdesk Survivors as a 1993-style first-person shooter. You're the IT tech. The users
from the 3D game are the monsters, IT tools are the weapons, and access badges are the
keycards. Somewhere in the office there are server closets that everyone forgot about.

It grew out of [Helpdesk Survivors 3D](https://github.com/sturrupmichael-web/HelpDeskSurvivors3D)
and borrows that game's user models, icons, palette and game loop. Those files are copied
into `shared/`, so this repo builds and runs on its own.

There are two levels so far, E1M1: The Help Desk and E1M2: Merger Day. You keep your
health, armor, tools and ammo from one level to the next. After the last level, the
episode's ending plays.

```
dev.html          the page for development (loads src/ as ES modules)
index.html        the built page (npm run build), one self-contained file; not in git
maps/             the levels, as data (e1m1.json, e1m2.json)
data/             weapons, items, users (enemies), skills and the episode, as plain tables
src/              the game: level.js, geometry.js, renderer.js, game.js, enemies.js, ...
shared/           files copied from Helpdesk Survivors 3D: user models, icons, palette, loop
build.mjs         builds index.html
tests/            npm test
```

## Run it locally

```sh
npm install
npm run serve            # python3 -m http.server 8000
```

Open <http://localhost:8000/dev.html>. It loads the source straight from `src/`,
so refresh to see a change. Any static server works, but opening the file directly from
disk doesn't: browsers won't load ES modules from `file://`.

To try the built page, run `npm run build` and open <http://localhost:8000/index.html>.
Everything is in that one file, including the map, so you can copy it anywhere and it
still runs.

### Controls

| | |
|---|---|
| Mouse | Look and turn (click the screen to capture the mouse) |
| Click, Ctrl or F | Fire |
| W A S D | Move and strafe (the arrow keys move and turn) |
| Shift | Walk (with Always Run on, which is the default) |
| Space, E or right-click | Use: doors, lifts, the exit switch |
| 1 to 6, the wheel, [ ] | Switch tools |
| Tab | Automap (- and = zoom) |
| Esc or P | Pause menu: options, controls, restart, quit |
| M / N | Music / all sound on and off |
| Gamepad | Left stick moves, right stick looks, RT fires, A uses, Start pauses |
| Touch | Drag on the left half to move and on the right half to look. Hold FIRE (drag it to aim), tap USE, TOOL, MAP and II (pause). Play with the phone held sideways |

The cheat codes are DOOM's: type `iddqd` for invulnerability, or `idkfa` for every tool,
full ammo, armor and all three badges. `idclev12` warps to E1M2 (`idclev11` back to E1M1).

## Edit the maps

Each level is a file in `maps/`, such as `maps/e1m1.json`. It has two grids of characters, each one character per
2 x 2 metre cell:

- `map` is the building. Each character is looked up in `tiles`.
- `things` is the same size and says what stands in each cell: the player start, items,
  users and decorations. Each character is looked up in `thingTypes`, and `.` means
  nothing.

Each tile says what a cell is:

- **Wall**: `"wall": "DRYWALL"` names its texture. Add `"exit": true` to make it the exit
  switch.
- **Door**: `"door": "DOOR"`. Add `"key": "blue"`, `"yellow"` or `"red"` to make it a badge
  door, or `"secret": true` to make it look like a wall.
- **Lift**: `"lift": {"high": 2, "wait": 3}`.
- **Floor**: everything else, with `floor` and `ceil` heights in metres (the player is 1.75
  tall and can step up 0.75), `floorTex` and `ceilTex`, a `light` level from 0 to 255, and
  an optional `effect` (`flicker`, `strobe` or `glow`).

Floors can also be hazards (`"hazard": {"damage": 10, "slow": 0.6}`) or part of a secret
(`"secret": true`). A tile that leaves out a height, light or texture, like a desk, a door
or a lift, takes it from the room next to it. Plain walls (`#`) take on the room's `walls`
texture.

Each thing type is one of these:

- `{"type": "start", "angle": 0}`: the player start. The angle is in degrees, with 0 facing
  north and 90 facing east.
- `{"item": "coffee"}`: an item from `data/items.js`.
- `{"monster": "pam"}`: a user from `data/enemies.js`.
- `{"decor": "plant"}`: a decoration.

Add `"minSkill": 4` to a thing to show it only on Ultra-Escalation and On-Call!.

Textures are drawn in code in `src/textures.js`. To add one, add a function there and use
its name in a tile. To try out a map file on its own, put it in `maps/` and open
`dev.html?map=maps/yours.json`. To add it to the episode, put its name in the `maps` list
in `data/episode.js`, which also holds the ending text.

The tests check every map in the episode. `npm test` floods each level from the start and
picks up badges in order. It fails if anything can't be reached: an item, a user, a
secret or the exit.

## Tune the game

- `data/weapons.js`: the six tools, with their damage, fire rate, spread, ammo and sounds.
- `data/items.js`: health, armor, ammo, power-ups and badges.
- `data/enemies.js`: each user's health, speed, attacks and behaviors. It also holds the
  five skills, with the damage and ammo multipliers each one uses.

## Deploy

Every push to `main` runs the tests (`.github/workflows/test.yml`). When they pass, the
Deploy workflow builds `index.html` and publishes it with the maps to GitHub Pages
(Settings > Pages > Source: GitHub Actions). Because the account's main site uses
michaelsturrup.com, it is served at <https://michaelsturrup.com/helpdesk-doom/>.

The game is also on the main site at <https://michaelsturrup.com/hddoom/>. That is a copy
of `index.html` in the sturrupmichael-web.github.io repo (`hddoom/index.html`). To update it,
run `npm run build` here and copy `index.html` over it.

## Shared files

`shared/` holds copies of these files from Helpdesk Survivors 3D, at the same paths there:

- `src/render/models.js`: the low-poly user models, which are baked into sprites
- `src/ui/icons.js`: the item and tool icons
- `src/engine/loop.js`: the fixed-step game loop
- `data/palette.js` and `data/enemies.js`: the colors, and the users' looks

A change to a user's model or the palette in the 3D game doesn't reach Doom Mode by itself.
Copy the file over again to pick it up.

## How it works

- **Level** (`src/level.js`): the map becomes a 2.5D grid of "sectors". Each cell has a
  floor and ceiling height. Doors are cells whose ceiling rises, and lifts are cells whose
  floor moves. Collision, line of sight and hitscan all use one ray trace through that
  grid.
- **Rendering** (`src/geometry.js`, `src/renderer.js`): the grid is turned into meshes
  with baked sector lighting and dark corners. They are drawn at about 240 lines and
  stretched with nearest-neighbour scaling. The status bar and the menus draw on a 2D
  canvas at DOOM's 320 x 200 scale.
- **Sprites** (`src/sprites.js`): when the game loads, each user model from the 3D game is
  rendered from 8 directions and in 4 poses into a sprite sheet. Each one falls over in
  4 more frames.
- **Users** (`src/enemies.js`): a user stands idle until it sees you or hears gunfire in a
  connected room. Then it chases you along a flow field that is recomputed a few times a
  second and attacks. A user hurt by a different kind of user turns on it.
- **Sound** (`src/audio.js`, `src/music.js`): every effect and the music are synthesized
  with Web Audio, so there are no sound files.
