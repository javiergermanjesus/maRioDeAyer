import hongoUrl from '../assets/hongo-enemigo.png';

// Measured alpha bounds in the 2172 × 724 source, not a regular grid.
export const HONGO_REGIONS = [
  { name: 'walk-1', x: 0, y: 9, width: 678, height: 659 },
  { name: 'walk-2', x: 701, y: 38, width: 697, height: 662 },
  { name: 'flat', x: 1407, y: 254, width: 710, height: 454 },
];
const SPEED = 55;
const BOUNCE = -360;
const FLAT_DURATION = 450;

export function preloadEnemies(scene) {
  scene.load.image('hongo-source', hongoUrl);
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
    this.previousContacts = new Set();
    this.contacts = new Set();
    makeHongoTexture(scene);
    this.group = scene.physics.add.group();
    this.terrainCollider = scene.physics.add.collider(this.group, surfaces);
    this.playerOverlap = scene.physics.add.overlap(player, this.group,
      (_player, enemy) => this.touchPlayer(enemy));
    scene.events.once('shutdown', () => {
      if (this.terrainCollider.world) this.terrainCollider.destroy();
      if (this.playerOverlap.world) this.playerOverlap.destroy();
      // Phaser's UpdateList may already have destroyed the group on shutdown.
      if (this.group.scene) {
        for (const enemy of this.group.getChildren()) enemy.removalTimer?.remove(false);
        this.group.destroy(true);
      }
    });
  }

  spawnHongo(x, groundY) {
    const enemy = this.group.create(x, groundY - 20, 'hongo', 'walk-1');
    enemy.body.setSize(36, 38).setOffset(4, 2);
    enemy.setCollideWorldBounds(true).setBounce(0);
    enemy.direction = -1;
    enemy.enemyState = 'walking';
    enemy.setVelocityX(-SPEED);
    enemy.play('hongo-walk');
    return enemy;
  }

  touchPlayer(enemy) {
    if (this.scene.dead || enemy.enemyState !== 'walking') return;
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
    this.contacts.add(enemy);
    if (!this.previousContacts.has(enemy)) {
      // The scene owns player death; enemy movement and state remain independent.
      this.lastImpact = { enemy, player: this.player, time: this.scene.time.now };
      this.scene.events.emit('enemy-impact', this.lastImpact);
    }
  }

  update() {
    for (const enemy of this.group.getChildren()) {
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
