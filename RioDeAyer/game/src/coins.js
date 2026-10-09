import coinUrl from '../assets/moneda-1-peso.png';

// Measured alpha bounds of the six clean upper poses (the lower row has sparkles).
// Keep a common canvas and scale so the narrowing poses really turn edge-on.
export const COIN_REGIONS = [
  { x: 64, y: 224, width: 276, height: 266 },
  { x: 402, y: 224, width: 223, height: 266 },
  { x: 682, y: 224, width: 196, height: 266 },
  { x: 937, y: 224, width: 156, height: 266 },
  { x: 1167, y: 224, width: 108, height: 266 },
  { x: 1377, y: 224, width: 70, height: 266 },
];

export const COIN_SPAWNS = [
  [650, 606], [800, 606],
  [990, 566], [1050, 566], [1280, 534], [1340, 534],
  [1690, 550], [1750, 550],
  [1980, 548], [2050, 510], [2120, 548],
  [2230, 606], [2510, 558], [2570, 558],
  [2795, 518], [2865, 518], [3090, 550],
  [3475, 532], [3565, 492], [3655, 532],
  [4040, 606], [4200, 606],
  // Mix a ground pickup, a short rising arc, a log reward and river crossings.
  [4520, 606], [4510, 550], [4580, 526], [4872, 550], [4936, 550],
  [5030, 548], [5144, 510], [5250, 548], [5420, 534], [5490, 534],
  [5680, 574], [5800, 554], [5920, 548], [6052, 504], [6170, 548],
  [6280, 558], [6344, 558], [6440, 606], [6590, 546],
];

export function preloadCoins(scene) {
  scene.load.image('coin-source', coinUrl);
}

function makeCoinTexture(scene) {
  if (scene.textures.exists('peso-coin')) return;
  const source = scene.textures.get('coin-source').getSourceImage();
  const texture = scene.textures.createCanvas('peso-coin', 24 * 12, 24);
  const ctx = texture.context;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < 12; i++) {
    const { x, y, width, height } = COIN_REGIONS[i % 6];
    const w = Math.round(width * 24 / 276);
    const h = Math.round(height * 24 / 276);
    ctx.save();
    ctx.translate(i * 24 + 12, 12);
    if (i >= 6) ctx.scale(-1, 1);
    ctx.drawImage(source, x, y, width, height, -w / 2, -h / 2, w, h);
    ctx.restore();
    texture.add(i, 0, i * 24, 0, 24, 24);
  }
  texture.refresh();
  scene.anims.create({
    key: 'peso-spin',
    frames: [0, 1, 2, 3, 4, 5, 10, 9, 8, 7, 6, 7, 8, 9, 10, 11, 4, 3, 2, 1]
      .map(frame => ({ key: 'peso-coin', frame })),
    frameRate: 16, repeat: -1,
  });
}

export class CoinSystem {
  constructor(scene, player) {
    this.scene = scene;
    makeCoinTexture(scene);
    this.group = scene.physics.add.group({ allowGravity: false, immovable: true });
    for (const [x, y] of COIN_SPAWNS) {
      const coin = this.group.create(x, y, 'peso-coin', 0).setDepth(1);
      coin.body.setSize(20, 22).setOffset(2, 1);
      coin.play('peso-spin');
    }
    this.overlap = scene.physics.add.overlap(player, this.group,
      (_player, coin) => this.collect(coin));
    scene.events.once('shutdown', () => {
      if (this.overlap.world) this.overlap.destroy();
      if (this.group.scene) this.group.destroy(true);
    });
  }

  collect(coin) {
    if (this.scene.dead || !coin.active || coin.collected) return;
    coin.collected = true;
    coin.body.enable = false;
    coin.destroy();
    this.scene.addCoin();
  }

  // Allocate before camera filtering; rewards have no overlap body to count twice.
  createReward(x, topY) {
    return this.scene.add.sprite(x, topY - 12, 'peso-coin', 0)
      .setDepth(3).setVisible(false);
  }

  reward(coin) {
    if (this.scene.dead || coin.rewarded) return;
    coin.rewarded = true;
    this.scene.addCoin();
    coin.setVisible(true).play('peso-spin');
    this.scene.tweens.add({
      targets: coin, y: coin.y - 64, duration: 260,
      ease: 'Quad.Out', yoyo: true,
      onComplete: () => coin.destroy(),
    });
  }
}
