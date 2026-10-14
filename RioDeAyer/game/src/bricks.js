import { isHitFromBelow } from './powerups.js';

// Match the 33 × 32 idle artwork/solid of the existing question blocks.
export const BRICK_WIDTH = 33;
export const BRICK_HEIGHT = 32;
export const BRICK_LAYOUT = [
  { x: 527, topY: 488, vines: true },
  { x: 593, topY: 488, vines: false },
  { x: 707, topY: 488, vines: false },
  { x: 839, topY: 488, vines: true },
  { x: 872, topY: 488, vines: true },
  { x: 1457, topY: 488, vines: true },
  { x: 1523, topY: 488, vines: true },
  { x: 1556, topY: 488, vines: false },
  { x: 2307, topY: 488, vines: false },
  { x: 2373, topY: 488, vines: true },
  { x: 3897, topY: 488, vines: true },
  { x: 3963, topY: 488, vines: false },
  // A small two-column stair, clear of the original coin placements.
  // Raise the stair 8 px: its underside gaps are one/two full blocks.
  { x: 4290, topY: 544, vines: false },
  { x: 4323, topY: 544, vines: false },
  { x: 4323, topY: 512, vines: false },
  { x: 4323, topY: 480, vines: true },
  { x: 4527, topY: 488, vines: true },
  { x: 4593, topY: 488, vines: false },
  { x: 5613, topY: 488, vines: true },
  { x: 5646, topY: 488, vines: false },
  { x: 5807, topY: 472, vines: true },
  { x: 6167, topY: 488, vines: false },
  { x: 6233, topY: 488, vines: true },
];

// Exactly the exhausted question-block frame; no reward or activation state.
export const USED_BLOCK_LAYOUT = [
  { x: 626, topY: 488 }, { x: 905, topY: 488 },
  { x: 1589, topY: 488 }, { x: 2406, topY: 488 },
  { x: 4219, topY: 488 }, { x: 4257, topY: 576 },
  { x: 4626, topY: 488 }, { x: 6266, topY: 488 },
];

// Draw both textures once, using the terrain's earth/leaf palette and integer pixels.
export function makeBrickTextures(scene) {
  for (const vines of [false, true]) {
    const key = vines ? 'mud-brick-vines' : 'mud-brick';
    if (scene.textures.exists(key)) continue;
    const texture = scene.textures.createCanvas(key, BRICK_WIDTH, BRICK_HEIGHT);
    const c = texture.context;
    c.imageSmoothingEnabled = false;
    const ink = (color, x, y, w, h) => {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
    };
    ink('#49351f', 0, 0, 33, 32);
    ink('#a85b2e', 1, 1, 31, 29);
    ink('#bc7037', 2, 2, 29, 2);
    ink('#794829', 1, 29, 31, 2);
    for (const y of [10, 21]) {
      ink('#49351f', 1, y, 31, 2);
      ink('#d28b45', 2, y + 2, 29, 1);
    }
    for (const [x, y] of [[16, 2], [8, 12], [24, 12], [16, 23]]) {
      ink('#49351f', x, y, 2, 8);
      ink('#794829', x - 1, y + 1, 1, 6);
    }
    // Small chips and cracks keep the clay old and uneven.
    for (const [x,y] of [[5,5], [23,6], [13,17], [4,26], [27,25]]) {
      ink('#794829', x, y, 2, 1);
      ink('#bc7037', x + 2, y + 1, 2, 1);
    }
    if (vines) {
      // Four winding edges, with bright leaves against a dark green outline.
      for (let i = 1; i < 31; i++) {
        const bend = Math.floor(i / 4) % 2;
        ink('#213f34', i, 1 + bend, 1, 3);
        ink('#547536', i, 2 + bend, 1, 1);
        ink('#213f34', i, 27 + bend, 1, 3);
        ink('#547536', i, 28 + bend, 1, 1);
        ink('#213f34', 1 + bend, i, 3, 1);
        ink('#547536', 2 + bend, i, 1, 1);
        ink('#213f34', 28 - bend, i, 3, 1);
        ink('#547536', 29 - bend, i, 1, 1);
      }
      for (const [x,y] of [[5,2], [13,1], [24,2], [2,7], [1,17],
        [3,24], [9,27], [20,28], [28,7], [27,17], [27,25]]) {
        ink('#213f34', x, y, 5, 3);
        ink('#547536', x + 1, y, 3, 2);
        ink('#8b9c3c', x + 1, y, 2, 1);
      }
    }
    texture.refresh();
  }
  if (!scene.textures.exists('mud-fragment')) {
    const texture = scene.textures.createCanvas('mud-fragment', 6, 6);
    const c = texture.context;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#49351f'; c.fillRect(0, 1, 6, 4);
    c.fillStyle = '#a85b2e'; c.fillRect(1, 0, 4, 5);
    c.fillStyle = '#bc7037'; c.fillRect(1, 0, 3, 1);
    c.fillStyle = '#794829'; c.fillRect(2, 4, 3, 2);
    texture.refresh();
  }
}

export class BrickSystem {
  constructor(scene, player) {
    this.scene = scene;
    this.fragments = new Set();
    makeBrickTextures(scene);
    this.group = scene.physics.add.staticGroup();
    for (const { x, topY, vines } of BRICK_LAYOUT) {
      const brick = scene.add.image(x, topY, vines ? 'mud-brick-vines' : 'mud-brick')
        .setOrigin(0.5, 0).setDepth(2);
      brick.material = 'clay';
      this.group.add(brick);
    }
    for (const { x, topY } of USED_BLOCK_LAYOUT) {
      const brick = scene.add.image(x, topY, 'question-block', 4)
        .setOrigin(0.5, 0).setDepth(2);
      brick.material = 'used-metal';
      this.group.add(brick);
    }
    this.collider = scene.physics.add.collider(player, this.group,
      (mario, brick) => this.finishContact(mario, brick),
      (mario, brick) => this.processContact(mario, brick));
    scene.events.once('shutdown', () => {
      if (this.collider.world) this.collider.destroy();
      for (const fragment of this.fragments) {
        fragment.removalTimer.remove(false);
        if (fragment.scene) fragment.destroy();
      }
      this.fragments.clear();
      if (this.group.scene) {
        for (const brick of this.group.getChildren()) brick.removalTimer?.remove(false);
      }
      if (this.group.scene) this.group.destroy(true);
    });
  }

  processContact(player, brick) {
    brick.breakOnImpact = false;
    brick.headHits = [];
    if (this.scene.dead || !brick.body.enable) return false;
    // Capture all clay undersides reached by this ascending sweep BEFORE any
    // adjacent brick / question block separates the player and zeroes velocity.
    // Keep solids enabled until the collide callback confirms the resolved hit.
    if (this.scene.powered && isHitFromBelow(player.body, brick.body)) {
      brick.headHits = (this.group?.getChildren() ?? [brick]).filter(candidate =>
        candidate.material === 'clay' && candidate.body.enable
        && isHitFromBelow(player.body, candidate.body));
      brick.breakOnImpact = brick.headHits.includes(brick);
    }
    return true;
  }

  finishContact(player, brick) {
    const hits = brick.headHits ?? (brick.breakOnImpact ? [brick] : []);
    brick.headHits = [];
    brick.breakOnImpact = false;
    if (this.scene.dead || !player.body.blocked.up) return;
    for (const hit of hits) {
      if (!hit.body.enable || Math.abs(player.body.y - hit.body.bottom) > 0.01) continue;
      // Only the row actually reached after separation breaks. Solids higher
      // up remain intact, and ordinary gravity resumes on the next step.
      player.setVelocityY(0);
      hit.body.enable = false;
      hit.setVisible(false);
      this.spawnFragments(hit);
      // Do not mutate group children during collision iteration.
      hit.removalTimer = this.scene.time.delayedCall(0, () => hit.destroy());
    }
  }

  spawnFragments(brick) {
    for (const [dx, dy, vx, vy] of [
      [-7, 8, -65, -150], [7, 8, 65, -150],
      [-7, 24, -45, -90], [7, 24, 45, -90],
    ]) {
      const fragment = this.scene.physics.add.image(brick.x + dx, brick.y + dy, 'mud-fragment')
        .setDepth(3).setVelocity(vx, vy);
      // New objects must inherit the world's camera filter: otherwise the
      // background and HUD cameras would draw the fragments a second time.
      fragment.cameraFilter = brick.cameraFilter;
      this.fragments.add(fragment);
      fragment.removalTimer = this.scene.time.delayedCall(450, () => {
        fragment.destroy();
        this.fragments.delete(fragment);
      });
    }
  }
}
