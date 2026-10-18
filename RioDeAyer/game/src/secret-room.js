// Only the first short hollow stump is an entrance. Artwork and solid profiles
// remain owned by the level; no decorative tree becomes interactive implicitly.
export const SECRET_TREE_INDEX = 0;
export const ENTRY_MS = 1300;
export const TRANSITION_MS = 180;
export const EXIT_CLIMB_MS = 650;
export const EXIT_CLIMB_RISE = 32;
export const ROOM = { width: 800, height: 450, wall: 32, ceiling: 100, floor: 400, vineX: 748 };
export const ROOM_COINS = [
  [120, 365], [250, 360], [380, 365], [510, 356], [640, 365],
  [170, 314], [300, 306], [430, 316], [560, 309], [680, 316],
  [110, 260], [240, 250], [370, 262], [500, 254], [630, 260],
];
export const ROOM_SURFACES = [
  { x: 0, y: 0, width: ROOM.width, height: ROOM.ceiling },
  { x: 0, y: ROOM.floor, width: ROOM.width, height: ROOM.height - ROOM.floor },
  { x: 0, y: ROOM.ceiling, width: ROOM.wall, height: ROOM.floor - ROOM.ceiling },
  { x: ROOM.width - ROOM.wall, y: ROOM.ceiling, width: ROOM.wall, height: ROOM.floor - ROOM.ceiling },
];

export class SecretEntrance {
  constructor(scene, tree) {
    this.scene = scene;
    this.tree = tree;
    const [left, right] = tree.tiers[0];
    this.centerX = tree.x + (left + tree.width - right) / 2;
    // The near inner edge of the existing 18 px cut face, just behind its lip.
    this.lipY = tree.y + 14;
    this.state = 'ready';
    this.used = false;
    this.collected = new Set();
  }

  tryEnter(pressed) {
    const { player, dead } = this.scene;
    const body = player.body;
    if (!pressed || dead || this.used || this.state !== 'ready'
      || !body.blocked.down || body.velocity.y !== 0
      || Math.abs(body.bottom - this.tree.y) > 2
      || Math.abs(body.center.x - this.centerX) > 8) return false;
    this.state = 'entering';
    this.elapsed = 0;
    this.startX = player.x;
    this.startY = player.y;
    player.setVelocity(0, 0);
    this.scene.movementState = 'idle';
    this.scene.updatePlayerBody();
    this.scene.updatePlayerAnimation();
    this.scene.input.keyboard.resetKeys();
    this.scene.shiftKeys.clear();
    // Disabling the body also excludes every block/coin/enemy overlap.
    body.enable = false;
    this.scene.physics.world.pause();
    return true;
  }

  update(delta) {
    if (this.state !== 'entering') return;
    this.elapsed = Math.min(ENTRY_MS, this.elapsed + delta);
    const progress = this.elapsed / ENTRY_MS;
    const player = this.scene.player;
    player.x = this.startX + (this.centerX - this.startX) * Math.min(1, progress * 6);
    player.y = this.startY + 80 * progress;
    // Crop in the unchanged sprite's local coordinates: the feet go behind
    // the existing wooden rim first, and the head disappears last.
    player.setCrop(0, 0, player.width,
      Math.max(0, Math.min(player.height, this.lipY - (player.y - player.height / 2))));
    if (progress < 1) return;
    player.setVisible(false);
    this.state = 'transition';
    const camera = this.scene.cameras.main;
    camera.once('camerafadeoutcomplete', () => {
      this.state = 'inside';
      this.scene.scene.launch('Underground', { owner: this.scene });
      this.scene.scene.pause();
    });
    camera.fadeOut(TRANSITION_MS, 0, 0, 0);
  }

  returnToLevel() {
    if (this.state !== 'inside') return false;
    this.used = true;
    this.state = 'used';
    const scene = this.scene;
    const player = scene.player;
    player.setCrop();
    player.setVisible(true);
    player.body.enable = true;
    // Body.reset clears velocity and integration history, preserving the
    // corrected body size/offset. Feet sit exactly on the original crown.
    player.body.reset(this.centerX, this.tree.y - player.height / 2);
    player.body.updateFromGameObject();
    player.body.prev.copy(player.body.position);
    player.body.prevFrame.copy(player.body.position);
    scene.movementState = 'idle';
    scene.updatePlayerAnimation();
    scene.input.keyboard.resetKeys();
    scene.shiftKeys.clear();
    scene.physics.world.resume();
    scene.cameras.main.fadeIn(TRANSITION_MS, 0, 0, 0);
    scene.scene.resume();
    return true;
  }
}

// Native, deterministic Canvas pixel art at the same 2 px grid as the terrain.
export function makeUndergroundArt(scene) {
  const key = 'underground-earth';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, ROOM.width / 2, ROOM.height / 2);
  const c = texture.context;
  c.imageSmoothingEnabled = false;
  const rect = (color, x, y, w, h) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  rect('#302015', 0, 0, 400, 225);
  // Recessed earthen back wall: horizontal compacted layers and fine stones.
  for (let y = 0; y < 225; y += 7) {
    rect(y % 3 ? '#39271b' : '#422d1e', 0, y, 400, 2);
    for (let x = 3; x < 400; x += 17) {
      const offset = (x * 13 + y * 7) % 11;
      rect('#59402a', x, y + offset % 5, 2, 1);
    }
  }
  for (const s of ROOM_SURFACES) {
    const x = s.x / 2, y = s.y / 2, w = s.width / 2, h = s.height / 2;
    rect('#754c2d', x, y, w, h);
    for (let row = 0; row < h; row += 5) {
      rect(row % 2 ? '#684128' : '#825735', x, y + row, w, 2);
      for (let col = 2; col < w - 2; col += 11) {
        rect('#ae8050', x + col, y + row + 2, 2, 1);
        rect('#513923', x + col + 2, y + row + 3, 2, 1);
      }
    }
  }
  rect('#ae763c', 16, 50, 368, 2);
  rect('#513923', 16, 52, 2, 148);
  rect('#513923', 382, 52, 2, 148);
  rect('#c38a46', 16, 200, 368, 2);
  // Stepped roots and dry branches crossing the walls, with short forks.
  for (const [x, y, direction] of [[12, 68, 1], [387, 90, -1], [80, 45, 1], [280, 44, -1], [14, 165, 1]]) {
    for (let i = 0; i < 25; i++) {
      rect('#21140d', x + direction * i, y + Math.floor(i / 3), 3, 2);
      rect('#946537', x + direction * i, y + Math.floor(i / 3), 2, 1);
      if (i > 12 && i < 21) rect('#67452b', x + direction * i, y + 7 - Math.floor((i - 12) / 2), 1, 1);
    }
  }
  // One winding stem, staggered pointed leaves and thin anchoring roots.
  // Everything stays on the terrain's 2 px grid; there are no rung-like pairs.
  const stemX = y => ROOM.vineX / 2
    + Math.round(2 * Math.sin((y - 59) / 17) + Math.sin(y / 7));
  for (let y = 59; y < 200; y++) {
    const x = stemX(y);
    rect('#203e25', x - 1, y, 3, 1);
    rect('#59883b', x, y, 1, 1);
    if (y % 7 < 3) rect('#97bd55', x, y, 1, 1);
  }
  for (const [y, side, length, height] of [
    [65, -1, 7, 4], [76, 1, 5, 3], [87, -1, 9, 5],
    [102, 1, 7, 4], [111, -1, 5, 3], [127, -1, 8, 4],
    [137, 1, 6, 5], [151, -1, 10, 5], [164, 1, 7, 4],
    [177, -1, 7, 3], [188, 1, 5, 3], [195, -1, 8, 4],
  ]) {
    const x = stemX(y);
    for (let i = 0; i < length; i++) {
      // A rising petiole becomes a tapered, asymmetric leaf with a bright vein.
      const leafY = y - Math.floor(i / 2);
      const thickness = Math.min(height, i + 1, length - i);
      rect('#203e25', x + side * i, leafY - thickness + 1, 1, thickness + 1);
      if (i > 1 && i < length - 1) {
        rect('#497b35', x + side * i, leafY - thickness + 2, 1, thickness - 1);
        rect('#97bd55', x + side * i, leafY, 1, 1);
      }
    }
  }
  // Small forks disappear into the earthen wall, including the roots at its foot.
  for (const [y, side, length] of [[59, 1, 12], [94, 1, 11], [143, 1, 9], [199, -1, 13], [199, 1, 11]]) {
    const x = stemX(y);
    for (let i = 1; i <= length; i++) {
      const rootY = y + Math.floor(i / 3);
      rect('#384c29', x + side * i, rootY, 1, 1);
      if (i > length / 2) rect('#59603a', x + side * i, rootY + 2, 1, 1);
    }
  }
  texture.refresh();
  return scene.add.image(0, 0, key).setOrigin(0).setScale(2);
}
