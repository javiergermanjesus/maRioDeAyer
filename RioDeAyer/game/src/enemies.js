import hongoUrl from '../assets/hongo-enemigo.png';
import tortugaUrl from '../assets/tortuga-sprites-grid.png';

// Measured alpha bounds in the 2172 × 724 source, not a regular grid.
export const HONGO_REGIONS = [
  { name: 'walk-1', x: 0, y: 9, width: 678, height: 659 },
  { name: 'walk-2', x: 701, y: 38, width: 697, height: 662 },
  { name: 'flat', x: 1407, y: 254, width: 710, height: 454 },
];
const SPEED = 55;
const BOUNCE = -360;
const FLAT_DURATION = 450;
const TURTLE_SPEED = 48;
const SHELL_SPEED = 330;
const SHELL_WAIT = 5000;
const TURTLE_SCALE = 0.32;
// Opaque walking silhouettes begin at x≈5.6/y≈4.9 in the 44 × 40
// rendered frame. Exclude the PNG's faint margins, keeping the foot baseline.
export const HONGO_BODY = { width: 33, height: 35, x: 5.5, y: 5 };
// Source-pixel body bounds exclude transparent margins; both share a foot baseline.
export const TURTLE_BODIES = {
  walking: { width: 148, height: 96, x: 22, y: 40 },
  shell: { width: 108, height: 84, x: 42, y: 52 },
};

export function preloadEnemies(scene) {
  scene.load.image('hongo-source', hongoUrl);
  scene.load.spritesheet('tortuga', tortugaUrl, {
    frameWidth: 192, frameHeight: 144, endFrame: 14,
  });
}

function makeTurtleAnimations(scene) {
  for (const [name, start, end, frameRate, repeat] of [
    ['walk-right', 0, 1, 5, -1], ['walk-left', 2, 3, 5, -1],
    ['hide', 4, 6, 10, 0], ['slide-right', 8, 9, 12, -1],
    ['slide-left', 10, 11, 12, -1], ['emerge', 12, 13, 5, 0],
  ]) {
    const key = `tortuga-${name}`;
    if (!scene.anims.exists(key)) scene.anims.create({
      key, frames: scene.anims.generateFrameNumbers('tortuga', { start, end }),
      frameRate, repeat,
    });
  }
}

function makeHongoTexture(scene) {
  if (scene.textures.exists('hongo')) return;
  const source = scene.textures.get('hongo-source').getSourceImage();
  const texture = scene.textures.createCanvas('hongo', 44 * 3, 40);
  const ctx = texture.context;
  const scale = 38 / 662;
  ctx.imageSmoothingEnabled = false;
  HONGO_REGIONS.forEach(({ name, x, y, width, height }, index) => {
    const w = width * scale;
    const h = height * scale;
    ctx.drawImage(source, x, y, width, height,
      index * 44 + (44 - w) / 2, 40 - h, w, h);
    texture.add(name, 0, index * 44, 0, 44, 40);
  });
  texture.refresh();
  scene.anims.create({
    key: 'hongo-walk',
    frames: ['walk-1', 'walk-2'].map(frame => ({ key: 'hongo', frame })),
    frameRate: 5,
    repeat: -1,
  });
}

export function isStomp(playerBody, enemyBody) {
  if (playerBody.velocity.y <= 0 || playerBody.velocity.y <= enemyBody.velocity.y) return false;
  const previousGap = enemyBody.prev.y - (playerBody.prev.y + playerBody.height);
  const currentGap = enemyBody.y - playerBody.bottom;
  // The feet must actually cross the top, rather than enter an already overlapping side.
  if (previousGap < 0 || currentGap > 0 || previousGap <= currentGap) return false;
  const crossing = previousGap / (previousGap - currentGap);
  const playerX = playerBody.prev.x + (playerBody.x - playerBody.prev.x) * crossing;
  const enemyX = enemyBody.prev.x + (enemyBody.x - enemyBody.prev.x) * crossing;
  // Check horizontal hitbox overlap at the instant the feet crossed the top.
  return Math.min(playerX + playerBody.width, enemyX + enemyBody.width)
    - Math.max(playerX, enemyX) > 0;
}

// Owns enemy physics and interactions; player controls remain in the scene.
export class EnemySystem {
  constructor(scene, player, surfaces) {
    this.scene = scene;
    this.player = player;
    this.surfaces = surfaces;
    this.previousContacts = new Set();
    this.contacts = new Set();
    makeHongoTexture(scene);
    this.group = scene.physics.add.group();
    this.terrainCollider = scene.physics.add.collider(this.group, surfaces);
    this.playerOverlap = scene.physics.add.overlap(player, this.group,
      (_player, enemy) => this.touchPlayer(enemy));
    this.enemyOverlap = scene.physics.add.overlap(this.group, this.group,
      (a, b) => this.touchEnemies(a, b));
    scene.events.once('shutdown', () => {
      if (this.terrainCollider.world) this.terrainCollider.destroy();
      if (this.playerOverlap.world) this.playerOverlap.destroy();
      if (this.enemyOverlap.world) this.enemyOverlap.destroy();
      // Phaser's UpdateList may already have destroyed the group on shutdown.
      if (this.group.scene) {
        for (const enemy of this.group.getChildren()) {
          enemy.removalTimer?.remove(false);
          enemy.stateTimer?.remove(false);
        }
        this.group.destroy(true);
      }
    });
  }

  spawnHongo(x, groundY) {
    const enemy = this.group.create(x, groundY - 20, 'hongo', 'walk-1');
    enemy.body.setSize(HONGO_BODY.width, HONGO_BODY.height, false)
      .setOffset(HONGO_BODY.x, HONGO_BODY.y);
    enemy.setCollideWorldBounds(true).setBounce(0);
    enemy.direction = -1;
    enemy.enemyState = 'walking';
    enemy.setVelocityX(-SPEED);
    enemy.play('hongo-walk');
    return enemy;
  }

  spawnTortuga(x, groundY, direction = -1) {
    makeTurtleAnimations(this.scene);
    const enemy = this.group.create(x, groundY - 64 * TURTLE_SCALE, 'tortuga', 0);
    enemy.setScale(TURTLE_SCALE).setCollideWorldBounds(true).setBounce(0);
    enemy.enemyType = 'tortuga';
    enemy.direction = direction;
    this.setTurtleState(enemy, 'walking');
    return enemy;
  }

  setTurtleState(enemy, state) {
    enemy.stateTimer?.remove(false);
    enemy.stateTimer = null;
    const initialized = enemy.enemyState !== undefined;
    const oldHeight = enemy.body.height;
    enemy.enemyState = state;
    const shape = TURTLE_BODIES[state === 'walking' ? 'walking' : 'shell'];
    enemy.body.setSize(shape.width, shape.height, false).setOffset(shape.x, shape.y);
    if (initialized) {
      // A contact callback runs before postUpdate has moved the sprite.
      // Resize the current simulation pose and history instead of rewinding it
      // to that old sprite position or counting the new offset as foot motion.
      const shift = oldHeight - enemy.body.height;
      enemy.body.y += shift;
      enemy.body.prev.y += shift;
      enemy.body.prevFrame.y += shift;
      enemy.body.updateCenter();
    } else enemy.body.updateFromGameObject();
    enemy.setVelocityX(state === 'walking' ? enemy.direction * TURTLE_SPEED
      : state === 'sliding' ? enemy.direction * SHELL_SPEED : 0);
    const direction = enemy.direction > 0 ? 'right' : 'left';
    if (state === 'shell') {
      enemy.anims.stop();
      enemy.setFrame(7);
    } else enemy.play(`tortuga-${state === 'walking' ? `walk-${direction}`
      : state === 'sliding' ? `slide-${direction}` : state === 'hiding' ? 'hide' : 'emerge'}`, true);
    const next = { hiding: ['shell', 300], shell: ['emerging', SHELL_WAIT], emerging: ['walking', 400] }[state];
    if (next) enemy.stateTimer = this.scene.time.delayedCall(next[1], () => {
      if (enemy.active && enemy.body.enable) this.setTurtleState(enemy, next[0]);
    });
  }

  touchTurtle(enemy) {
    // Ignore the kicker until their hitboxes separate, including a stop/re-kick cycle.
    if (enemy.kickContact) return;
    if (['walking', 'sliding'].includes(enemy.enemyState)
      && isStomp(this.player.body, enemy.body)) {
      this.setTurtleState(enemy, enemy.enemyState === 'walking' ? 'hiding' : 'shell');
      enemy.kickContact = true;
      this.player.setVelocityY(BOUNCE);
      return;
    }
    if (['hiding', 'shell', 'emerging'].includes(enemy.enemyState)) {
      // A fresh landing on a stationary shell kicks it too; only walking
      // turtles and moving shells rebound the player on a valid stomp.
      // A contact from below does not count as a lateral kick.
      const body = this.player.body;
      if (body.bottom <= enemy.body.y || body.y >= enemy.body.bottom) return;
      enemy.direction = body.center.x < enemy.body.center.x ? 1 : -1;
      enemy.kickContact = true;
      this.setTurtleState(enemy, 'sliding');
      return;
    }
    this.impactPlayer(enemy);
  }

  impactPlayer(enemy) {
    this.contacts.add(enemy);
    if (!this.previousContacts.has(enemy)) {
      this.lastImpact = { enemy, player: this.player, time: this.scene.time.now };
      this.scene.events.emit('enemy-impact', this.lastImpact);
    }
  }

  touchEnemies(a, b) {
    if (a === b || !a.body.enable || !b.body.enable) return;
    const slidingA = a.enemyState === 'sliding';
    const slidingB = b.enemyState === 'sliding';
    if (!slidingA && !slidingB) return;
    // Simultaneous sliding shells knock each other out; all other targets are eliminated.
    if (slidingA) this.removeEnemy(b);
    if (slidingB) this.removeEnemy(a);
  }

  removeEnemy(enemy) {
    enemy.stateTimer?.remove(false);
    enemy.enemyState = 'defeated';
    enemy.body.enable = false;
    enemy.setVelocity(0, 0);
    enemy.anims.stop();
    enemy.setFrame(enemy.enemyType === 'tortuga' ? 14 : 'flat');
    enemy.removalTimer = this.scene.time.delayedCall(FLAT_DURATION, () => enemy.destroy());
  }

  hasGroundAhead(enemy) {
    const body = enemy.body;
    const x = enemy.direction > 0 ? body.right + 5 : body.x - 5;
    return this.surfaces.getChildren().some(surface => {
      const ground = surface.body;
      return ground?.enable && x >= ground.x && x <= ground.right
        && ground.y >= body.bottom - 4 && ground.y <= body.bottom + 8;
    });
  }

  touchPlayer(enemy) {
    if (this.scene.dead || !enemy.body.enable) return;
    if (enemy.enemyType === 'tortuga') return this.touchTurtle(enemy);
    if (enemy.enemyState !== 'walking') return;
    if (isStomp(this.player.body, enemy.body)) {
      enemy.enemyState = 'flat';
      enemy.anims.stop();
      enemy.setFrame('flat');
      enemy.setVelocity(0, 0);
      enemy.body.enable = false;
      this.player.setVelocityY(BOUNCE);
      enemy.removalTimer = this.scene.time.delayedCall(FLAT_DURATION, () => enemy.destroy());
      return;
    }
    this.impactPlayer(enemy);
  }

  update() {
    for (const enemy of this.group.getChildren()) {
      if (enemy.enemyType === 'tortuga') {
        if (enemy.kickContact) {
          const a = this.player.body, b = enemy.body;
          if (a.right <= b.x || a.x >= b.right || a.bottom <= b.y || a.y >= b.bottom) enemy.kickContact = false;
        }
        if (['walking', 'sliding'].includes(enemy.enemyState)) {
          const oldDirection = enemy.direction;
          if (enemy.body.blocked.left) enemy.direction = 1;
          else if (enemy.body.blocked.right) enemy.direction = -1;
          else if (enemy.enemyState === 'walking' && enemy.body.blocked.down && !this.hasGroundAhead(enemy)) enemy.direction *= -1;
          if (oldDirection !== enemy.direction) this.setTurtleState(enemy, enemy.enemyState);
          enemy.setVelocityX(enemy.direction * (enemy.enemyState === 'walking' ? TURTLE_SPEED : SHELL_SPEED));
        }
        if (enemy.body.bottom >= this.scene.physics.world.bounds.bottom) {
          enemy.stateTimer?.remove(false);
          enemy.destroy();
        }
        continue;
      }
      if (enemy.enemyState !== 'walking') continue;
      if (enemy.body.blocked.left) enemy.direction = 1;
      else if (enemy.body.blocked.right) enemy.direction = -1;
      enemy.setVelocityX(enemy.direction * SPEED);
      enemy.setFlipX(enemy.direction > 0);
      if (enemy.body.bottom >= this.scene.physics.world.bounds.bottom) enemy.destroy();
    }
    this.previousContacts = this.contacts;
    this.contacts = new Set();
  }
}
