import blockUrl from '../assets/bloque-pregunta.png';
import mushroomUrl from '../assets/hongo-blanco.png';

// Explicit artwork bounds, measured in the PNGs. Exclude detached particles/shadows.
export const BLOCK_REGIONS = [
  { x: 45, y: 245, width: 370, height: 361 },
  { x: 467, y: 290, width: 371, height: 316 },
  { x: 889, y: 215, width: 381, height: 376 },
  { x: 1323, y: 244, width: 367, height: 362 },
  { x: 1732, y: 245, width: 373, height: 361 },
];
export const MUSHROOM_REGIONS = [
  { x: 23, y: 368, width: 290, height: 284 },
  { x: 326, y: 391, width: 288, height: 262 },
  { x: 627, y: 331, width: 281, height: 269 },
  { x: 922, y: 391, width: 285, height: 262 },
  { x: 1224, y: 381, width: 291, height: 271 },
];
const BLOCK_SIZE = 34;
const MUSHROOM_SIZE = 28;
const SPEED = 90;
const BUMP_MS = 300;
const EMERGE_MS = 1100;

export function preloadPowerUps(scene) {
  scene.load.image('question-source', blockUrl);
  scene.load.image('white-mushroom-source', mushroomUrl);
}

function makeTexture(scene, key, sourceKey, regions, size, scale) {
  if (scene.textures.exists(key)) return;
  const source = scene.textures.get(sourceKey).getSourceImage();
  const texture = scene.textures.createCanvas(key, size * regions.length, size);
  const ctx = texture.context;
  ctx.imageSmoothingEnabled = false;
  regions.forEach(({ x, y, width, height }, i) => {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    // The frame itself contains only artwork, rather than a padded square canvas.
    ctx.drawImage(source, x, y, width, height, i * size, 0, w, h);
    texture.add(i, 0, i * size, 0, w, h);
  });
  texture.refresh();
}

export function isHitFromBelow(player, block) {
  if (player.velocity.y >= 0 || player.prev.y < block.bottom) return false;
  const travel = player.prev.y - player.y;
  if (travel <= 0 || player.y > block.bottom) return false;
  const fraction = (player.prev.y - block.bottom) / travel;
  const x = player.prev.x + (player.x - player.prev.x) * fraction;
  return Math.min(x + player.width, block.right) - Math.max(x, block.x) > 0;
}

// Independent block/power-up state machine; the scene handles the collection event.
export class PowerUpSystem {
  constructor(scene, player, surfaces, x, topY, hasMushroom = true, hasCoin = false) {
    this.scene = scene;
    this.player = player;
    this.state = 'ready';
    this.elapsed = 0;
    this.hasMushroom = hasMushroom;
    this.coinReward = hasCoin && !hasMushroom ? scene.coinSystem.createReward(x, topY) : null;
    makeTexture(scene, 'question-block', 'question-source', BLOCK_REGIONS, BLOCK_SIZE, BLOCK_SIZE / 381);
    makeTexture(scene, 'white-mushroom', 'white-mushroom-source', MUSHROOM_REGIONS,
      MUSHROOM_SIZE, 26 / 291);
    if (!scene.anims.exists('white-mushroom-walk')) scene.anims.create({
      key: 'white-mushroom-walk',
      frames: MUSHROOM_REGIONS.map((_frame, frame) => ({ key: 'white-mushroom', frame })),
      frameRate: 6, repeat: -1,
    });

    // Allocate both visuals before the scene assigns world/background/HUD cameras.
    this.mushroom = scene.physics.add.sprite(x, topY, 'white-mushroom', 0)
      .setOrigin(0.5, 1).setVisible(false).setDepth(1).setBounce(0);
    const fitMushroomBody = () => {
      this.mushroom.body.setSize(this.mushroom.width, this.mushroom.height).setOffset(0, 0);
    };
    fitMushroomBody();
    this.mushroom.on('animationupdate', fitMushroomBody);
    this.mushroom.body.enable = false;
    this.mushroom.direction = 1;
    this.block = scene.add.sprite(x, topY, 'question-block', 0).setOrigin(0.5, 1).setDepth(2);
    this.baseY = topY + this.block.height;
    this.block.y = this.baseY;
    this.mushroom.y = this.baseY;
    if (!hasMushroom) {
      this.mushroom.destroy();
      this.mushroom = null;
    }
    // A stationary solid separate from the visual bump avoids pushing the player sideways.
    this.solid = scene.add.rectangle(x, topY + this.block.height / 2,
      this.block.width, this.block.height).setVisible(false);
    scene.physics.add.existing(this.solid, true);
    this.colliders = [
      scene.physics.add.collider(player, this.solid, undefined, () => {
        if (scene.dead) return false;
        if (isHitFromBelow(player.body, this.solid.body)) this.activate();
        return true;
      }),
    ];
    if (this.mushroom) this.colliders.push(
      scene.physics.add.collider(this.mushroom, surfaces),
      scene.physics.add.collider(this.mushroom, this.solid),
      scene.physics.add.overlap(player, this.mushroom, () => this.collect(), () => !scene.dead),
    );
    scene.events.once('shutdown', () => {
      for (const collider of this.colliders) if (collider.world) collider.destroy();
    });
  }

  activate() {
    if (this.state !== 'ready' || this.scene.dead) return;
    this.state = this.hasMushroom === false ? 'bumping' : 'emerging';
    this.elapsed = 0;
    if (this.state === 'bumping') {
      if (this.coinReward) this.scene.coinSystem.reward(this.coinReward);
      return;
    }
    this.mushroom.setVisible(true);
    this.mushroom.setCrop(0, 0, this.mushroom.width, 0);
    this.mushroom.body.enable = false;
    this.mushroom.body.setAllowGravity(false);
    this.mushroom.setVelocity(0, 0);
  }

  collect() {
    if (this.state !== 'walking' || this.scene.dead) return;
    this.state = 'collected';
    this.collected = true;
    this.mushroom.destroy();
    this.scene.events.emit('powerup-collected', { type: 'white-mushroom' });
  }

  update(delta) {
    if (this.state === 'emerging' || this.state === 'bumping') {
      this.elapsed += delta;
      const bump = Math.min(this.elapsed / BUMP_MS, 1);
      this.block.y = this.baseY - Math.sin(bump * Math.PI) * 8;
      this.block.setFrame(bump >= 1 ? 4 : bump < 0.25 ? 1 : bump < 0.6 ? 2 : 3);
      if (this.state === 'bumping') {
        if (bump === 1) this.state = 'used';
        return;
      }
      // Bottom origins keep feet on visible edges. Reveal only above the moving artwork,
      // so the compressed/bumped frames cannot expose the mushroom underneath the block.
      const progress = Math.min(this.elapsed / EMERGE_MS, 1);
      const visibleTop = this.block.y - this.block.height;
      this.mushroom.y = visibleTop + this.mushroom.height * (1 - progress);
      this.mushroom.setCrop(0, 0, this.mushroom.width, this.mushroom.height * progress);
      if (progress === 1) {
        this.state = 'walking';
        this.block.y = this.baseY;
        this.block.setFrame(4);
        this.mushroom.setCrop();
        this.mushroom.body.enable = true;
        this.mushroom.body.reset(this.mushroom.x, this.mushroom.y);
        this.mushroom.body.setAllowGravity(true);
        this.mushroom.setVelocityX(SPEED);
        this.mushroom.play('white-mushroom-walk');
      }
    } else if (this.state === 'walking') {
      const body = this.mushroom.body;
      if (body.blocked.left) this.mushroom.direction = 1;
      else if (body.blocked.right) this.mushroom.direction = -1;
      this.mushroom.setVelocityX(this.mushroom.direction * SPEED);
      this.mushroom.setFlipX(this.mushroom.direction < 0);
      const bounds = this.scene.physics.world.bounds;
      if (body.top > bounds.bottom || body.right < bounds.left || body.x > bounds.right) {
        this.state = 'gone';
        this.mushroom.destroy();
      }
    }
  }
}
