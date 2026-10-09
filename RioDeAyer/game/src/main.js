import Phaser from 'phaser';
import './style.css';
import { makeLandscape } from './landscape.js';
import marioUrl from '../assets/mario-sprites-grid.png';
import { EnemySystem, preloadEnemies } from './enemies.js';
import { PowerUpSystem, preloadPowerUps } from './powerups.js';
import { CoinSystem, preloadCoins } from './coins.js';

const WIDTH = 1280;
const HEIGHT = 720;
const WORLD_WIDTH = WIDTH * 3.5;
const GROUND_Y = 640;
const VIEW_ZOOM = 1.6;
// Later patrols sit between existing obstacles so they cannot wander into a river
// before the player reaches them. The final pair shares the same clear stretch.
const ENEMY_SPAWNS = [720, 1140, 1490, 2650, 2940, 3010];
const QUESTION_BLOCKS = [
  { x: 560, topY: 488, hasMushroom: true },
  { x: 1490, topY: 488, hasMushroom: false, hasCoin: true },
  { x: 2340, topY: 488, hasMushroom: false },
  { x: 3930, topY: 488, hasMushroom: false, hasCoin: true },
];
// One geometry source for both artwork and solid Arcade bodies.
const RIVER_GAPS = [{ x: 2040, width: 112 }, { x: 3540, width: 152 }];
const LEVEL_SURFACES = [
  { x: 0, y: GROUND_Y, width: 2040, height: 80, kind: 'bank' },
  { x: 2152, y: GROUND_Y, width: 1388, height: 80, kind: 'bank' },
  { x: 3692, y: GROUND_Y, width: WORLD_WIDTH - 3692, height: 80, kind: 'bank' },
  { x: 960, y: 600, width: 120, height: 40, kind: 'bank' },
  { x: 1240, y: 568, width: 144, height: 72, kind: 'bank' },
  { x: 1656, y: 584, width: 144, height: 56, kind: 'log' },
  { x: 2480, y: 592, width: 128, height: 48, kind: 'bank' },
  { x: 2760, y: 552, width: 144, height: 88, kind: 'bank' },
  { x: 3060, y: 584, width: 128, height: 56, kind: 'bank' },
];
const MOVEMENT = {
  walkSpeed: 280,
  walkAcceleration: 1400,
  runSpeed: 400,
  runAcceleration: 900,
  braking: 700,
  slideThreshold: 350,
  slideFriction: 420,
};
const approach = (value, target, amount) => value + Math.sign(target - value)
  * Math.min(Math.abs(target - value), amount);

class Playground extends Phaser.Scene {
  constructor() {
    super('Playground');
    this.movementState = 'idle';
    this.shiftKeys = new Set();
    this.lives = 3;
    this.coins = 0;
  }

  init(data = {}) {
    // Rebuild the attempt, preserving both currencies on death.
    this.lives = data.lives ?? 3;
    this.coins = data.coins ?? 0;
  }

  preload() {
    preloadEnemies(this);
    preloadPowerUps(this);
    preloadCoins(this);
    this.load.spritesheet('mario-source', marioUrl, {
      frameWidth: 192,
      frameHeight: 320,
      endFrame: 13,
    });
  }

  create() {
    this.dead = false;
    this.gameOver = false;
    this.movementState = 'idle';
    this.shiftKeys.clear();
    this.backgrounds = this.makeScenery();
    this.makePlayerTexture();

    this.surfaces = this.physics.add.staticGroup();
    for (const { x, y, width, height } of LEVEL_SURFACES) {
      const surface = this.add.rectangle(x + width / 2, y + height / 2, width, height)
        .setVisible(false);
      this.surfaces.add(surface);
    }
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, HEIGHT);

    this.player = this.physics.add.sprite(378, GROUND_Y - 32, 'player');
    // All visual frames retain the original 36 × 64 canvas and body geometry.
    this.player.body.setSize(32, 64).setOffset(2, 0);
    this.player.setCollideWorldBounds(true).setBounce(0);
    this.playerTerrainCollider = this.physics.add.collider(this.player, this.surfaces);
    this.enemies = new EnemySystem(this, this.player, this.surfaces);
    for (const x of ENEMY_SPAWNS) this.enemies.spawnHongo(x, GROUND_Y);
    this.enemies.spawnTortuga(880, GROUND_Y);
    this.enemies.spawnTortuga(3280, GROUND_Y, 1);
    this.events.on('enemy-impact', this.die, this);
    this.coinSystem = new CoinSystem(this, this.player);
    this.powerUps = QUESTION_BLOCKS.map(({ x, topY, hasMushroom, hasCoin }) =>
      new PowerUpSystem(this, this.player, this.surfaces, x, topY, hasMushroom, hasCoin));
    // Power-ups can walk across any of the question blocks.
    for (const powerUp of this.powerUps) {
      if (!powerUp.mushroom) continue;
      for (const other of this.powerUps) {
        if (other !== powerUp) powerUp.colliders.push(
          this.physics.add.collider(powerUp.mushroom, other.solid));
      }
    }

    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, HEIGHT);
    // Magnify the world uniformly; bodies, sprite frames and distances stay intact.
    camera.setZoom(VIEW_ZOOM);
    camera.startFollow(this.player, true, 0.1, 0);
    // Keep the original 320-pixel screen deadzone after magnification.
    camera.setDeadzone(320 / VIEW_ZOOM, HEIGHT);
    // Anchor the ground at its original screen height; no vertical following.
    camera.setScroll(-(WIDTH - WIDTH / VIEW_ZOOM) / 2,
      GROUND_Y - HEIGHT / 2 - (GROUND_Y - HEIGHT / 2) / VIEW_ZOOM);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('A,D,W,S,SPACE,ENTER');
    this.input.keyboard.resetKeys();
    // Track physical keys separately: releasing one Shift must not release the other.
    this.input.keyboard.on('keydown', this.onShiftDown, this);
    this.input.keyboard.on('keyup', this.onShiftUp, this);
    this.input.keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
    this.game.events.on(Phaser.Core.Events.BLUR, this.stopMovement, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('enemy-impact', this.die, this);
      this.deathTimer?.remove(false);
      this.game.events.off(Phaser.Core.Events.BLUR, this.stopMovement, this);
      this.input.keyboard.off('keydown', this.onShiftDown, this);
      this.input.keyboard.off('keyup', this.onShiftUp, this);
    });
    const worldObjects = this.children.list.filter(object => !this.backgrounds.includes(object));
    const hudStart = this.children.list.length;
    this.makeHud();
    const hudObjects = this.children.list.slice(hudStart);
    // Separate display cameras keep scenery and HUD independent of world zoom.
    this.landscapeCamera = this.cameras.add(0, 0, WIDTH, HEIGHT, false, 'landscape');
    const hudCamera = this.cameras.add(0, 0, WIDTH, HEIGHT, false, 'hud');
    camera.ignore([...this.backgrounds, ...hudObjects]);
    this.landscapeCamera.ignore([...worldObjects, ...hudObjects]);
    hudCamera.ignore([...worldObjects, ...this.backgrounds]);
    this.cameras.cameras.splice(0, 3, this.landscapeCamera, camera, hudCamera);
    const syncLandscape = () => {
      this.landscapeCamera.setScroll(camera.worldView.x, 0);
    };
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, syncLandscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, syncLandscape);
    });
  }

  die(cause = 'enemy') {
    if (this.dead) return;
    this.dead = true;
    this.input.keyboard.resetKeys();
    this.shiftKeys.clear();
    this.movementState = 'dead';
    this.lives = Math.max(0, this.lives - 1);
    this.livesText?.setText(`VIDAS × ${this.lives}`);
    this.playerTerrainCollider.active = false;
    this.enemies.playerOverlap.active = false;
    this.player.setCollideWorldBounds(false);
    this.player.setVelocity(0, cause === 'fall' ? Math.max(0, this.player.body.velocity.y) : -420);
    this.player.anims.stop();
    this.player.setFrame('jump');
    // Keep normal gravity: rise briefly, then fall through the terrain.
    this.deathTimer = this.time.delayedCall(1300, () => {
      if (this.lives > 0) this.scene.restart({ lives: this.lives, coins: this.coins });
      else this.showGameOver();
    });
  }

  showGameOver() {
    this.gameOver = true;
    this.physics.world.pause();
    this.input.keyboard.resetKeys();
    for (const object of this.gameOverObjects) object.setVisible(true);
  }

  addCoin() {
    if (this.dead) return;
    this.coins++;
    if (this.coins >= 100) {
      this.coins -= 100;
      this.lives++;
      this.livesText?.setText(`VIDAS × ${this.lives}`);
    }
    this.coinsText?.setText(`x${String(this.coins).padStart(2, '0')}`);
  }

  startNewGame() {
    if (!this.gameOver) return;
    this.gameOver = false; // Ignore further edges while the restart is queued.
    this.input.keyboard.resetKeys();
    this.scene.restart({ lives: 3 });
  }

  stopMovement() {
    this.input.keyboard.resetKeys();
    this.shiftKeys.clear();
    if (!this.dead) this.movementState = 'idle';
    this.player.setVelocityX(0);
  }

  onShiftDown(event) {
    if (this.dead) return;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.shiftKeys.add(event.code);
  }

  onShiftUp(event) {
    this.shiftKeys.delete(event.code);
  }

  makeScenery() {
    // Scene restarts keep the texture manager; recreate the same procedural artwork.
    for (const key of ['sunset', 'distant-islands', 'near-islands', 'level-terrain']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    return makeLandscape(this, {
      width: WIDTH, height: HEIGHT, worldWidth: WORLD_WIDTH,
      groundY: GROUND_Y, gaps: RIVER_GAPS, surfaces: LEVEL_SURFACES,
    });
  }

  makePlayerTexture() {
    if (this.textures.exists('player')) return;
    // Grid indices retain the same poses and walking cadence as before.
    const poses = [
      ['idle', 0],
      ['walk-1', 1],
      ['walk-2', 2],
      ['jump', 9],
      ['crouch', 12],
      ['run-1', 5],
      ['run-2', 6],
      ['run-3', 7],
    ];
    const sheet = this.textures.get('mario-source');
    const source = sheet.getSourceImage();
    // The grid's idle artwork is 262 px tall instead of 278 px in the old atlas.
    // Preserve its visible height and feet baseline inside the same 36 × 64 frame.
    const visualScale = 0.2 * 278 / 262;
    const feetBaseline = 299;
    const texture = this.textures.createCanvas('player', 36 * poses.length, 64);
    const ctx = texture.context;
    ctx.imageSmoothingEnabled = false;
    poses.forEach(([name, sourceIndex], index) => {
      const frame = sheet.get(sourceIndex);
      const drawWidth = frame.cutWidth * visualScale;
      const drawHeight = frame.cutHeight * visualScale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(index * 36, 0, 36, 64);
      ctx.clip();
      ctx.drawImage(source, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
        index * 36 + (36 - drawWidth) / 2, 64 - feetBaseline * visualScale,
        drawWidth, drawHeight);
      ctx.restore();
      texture.add(name, 0, index * 36, 0, 36, 64);
    });
    texture.firstFrame = 'idle';
    texture.refresh();
    this.anims.create({
      key: 'mario-walk',
      frames: ['walk-1', 'walk-2'].map(frame => ({ key: 'player', frame })),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'mario-run',
      frames: ['run-1', 'run-2', 'run-3'].map(frame => ({ key: 'player', frame })),
      frameRate: 15,
      repeat: -1,
    });
  }

  makeHud() {
    // Temporary diagnostic, rendered only by the existing HUD camera.
    this.fpsText = this.add.text(WIDTH - 12, HEIGHT - 12, 'FPS: --', {
      fontFamily: 'monospace', fontSize: '14px', color: '#d0d0d0',
      backgroundColor: '#000000', padding: { x: 5, y: 3 },
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(101).setAlpha(0.75);
    this.nextFpsUpdate = 0;
    const style = {
      fontFamily: 'monospace', fontSize: '28px', fontStyle: 'bold',
      color: '#ffffff', lineSpacing: 5,
      shadow: { offsetX: 4, offsetY: 4, color: '#000000', fill: true },
    };
    this.add.text(80, 30, 'RIO\n000000', style).setScrollFactor(0);
    this.livesText = this.add.text(80, 106, `VIDAS × ${this.lives}`, {
      ...style, fontSize: '22px',
    }).setScrollFactor(0);
    this.add.sprite(452, 46, 'peso-coin', 0).setScrollFactor(0);
    this.coinsText = this.add.text(470, 30, `x${String(this.coins).padStart(2, '0')}`, style)
      .setScrollFactor(0);
    this.add.text(790, 30, 'WORLD\n1-1', style).setScrollFactor(0);
    this.add.text(1200, 30, 'TIME\n300', style).setOrigin(1, 0).setScrollFactor(0);
    this.add.text(640, 680, 'MOVER: ← → / A D     SALTAR: ESPACIO / ↑ / W', {
      ...style, fontSize: '18px', backgroundColor: '#000000', padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0);
    this.gameOverObjects = [
      this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.85),
      this.add.text(WIDTH / 2, 300, 'GAME OVER', { ...style, fontSize: '64px' }).setOrigin(0.5),
      this.add.text(WIDTH / 2, 390, 'ENTER / ESPACIO: NUEVA PARTIDA', {
        ...style, fontSize: '22px',
      }).setOrigin(0.5),
    ];
    this.gameOverObjects.forEach(object => object.setScrollFactor(0).setDepth(100).setVisible(false));
  }

  readMovementInput() {
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    // Consume all edges even when an action is blocked; never queue a jump/slide.
    const jump = [this.cursors.up, this.keys.W, this.keys.SPACE]
      .map(key => Phaser.Input.Keyboard.JustDown(key)).some(Boolean);
    const crouchPressed = [this.cursors.down, this.keys.S]
      .map(key => Phaser.Input.Keyboard.JustDown(key)).some(Boolean);
    return {
      direction: Number(right) - Number(left),
      run: this.shiftKeys.size > 0,
      crouch: this.cursors.down.isDown || this.keys.S.isDown,
      crouchPressed,
      jump,
    };
  }

  updateMovement(input, dt) {
    const body = this.player.body;
    const grounded = body.blocked.down && body.velocity.y >= 0;
    let speed = body.velocity.x;

    // A slide owns horizontal motion until friction stops it or support is lost.
    const sliding = grounded && (this.movementState === 'slide'
      || (input.crouchPressed && Math.abs(speed) >= MOVEMENT.slideThreshold));
    if (sliding) {
      speed = approach(speed, 0, MOVEMENT.slideFriction * dt);
      this.player.setVelocityX(speed);
      this.movementState = speed !== 0 ? 'slide' : input.crouch ? 'crouch' : 'idle';
      return;
    }
    if (grounded && input.crouch) {
      this.player.setVelocityX(0);
      this.movementState = 'crouch';
      return;
    }

    if (input.direction && input.run) {
      speed = approach(speed, input.direction * MOVEMENT.runSpeed, MOVEMENT.runAcceleration * dt);
    } else if (Math.abs(speed) > MOVEMENT.walkSpeed || this.movementState === 'run') {
      speed = approach(speed, input.direction * MOVEMENT.walkSpeed, MOVEMENT.braking * dt);
    } else if (!input.direction && speed !== 0) {
      speed = approach(speed, 0, MOVEMENT.braking * dt);
    } else {
      // Short grounded taps start slowly; holding still reaches the same walk speed.
      speed = grounded
        ? approach(speed, input.direction * MOVEMENT.walkSpeed, MOVEMENT.walkAcceleration * dt)
        : input.direction * MOVEMENT.walkSpeed;
    }
    this.player.setVelocityX(speed);
    if (input.jump && grounded) {
      // Height scales with impulse squared: 650 gives ~27% less height than 760.
      const runningFast = input.run && Math.abs(speed) >= MOVEMENT.runSpeed * 0.9;
      this.player.setVelocityY(runningFast ? -760 : -650);
    }

    if (!grounded || body.velocity.y < 0) this.movementState = 'jump';
    else if (speed === 0) this.movementState = 'idle';
    else if ((input.run && input.direction) || Math.abs(speed) > MOVEMENT.walkSpeed) this.movementState = 'run';
    else this.movementState = 'walk';
  }

  updatePlayerAnimation() {
    const velocity = this.player.body.velocity;
    if (velocity.x !== 0) this.player.setFlipX(velocity.x < 0);
    switch (this.movementState) {
      case 'walk': this.player.play('mario-walk', true); break;
      case 'run': this.player.play('mario-run', true); break;
      default:
        this.player.anims.stop();
        this.player.setFrame(this.movementState === 'slide' ? 'crouch' : this.movementState);
    }
  }

  update(_time, delta) {
    // Refresh the diagnostic twice per second, including death and Game Over.
    if (this.fpsText && _time >= this.nextFpsUpdate) {
      this.fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
      this.nextFpsUpdate = _time + 500;
    }
    if (this.gameOver) {
      const restart = [this.keys.ENTER, this.keys.SPACE]
        .map(key => Phaser.Input.Keyboard.JustDown(key)).some(Boolean);
      if (restart) this.startNewGame();
      return;
    }
    this.powerUps?.forEach(powerUp => powerUp.update(delta));
    if (this.dead) {
      this.enemies?.update();
      return;
    }
    // Die before the world floor can support a fall into the river/void.
    if (this.player.y > GROUND_Y + 36) {
      this.die('fall');
      return;
    }
    this.updateMovement(this.readMovementInput(), Math.min(delta, 50) / 1000);
    this.updatePlayerAnimation();
    this.enemies?.update();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 1600 }, debug: false },
  },
  scene: Playground,
});
