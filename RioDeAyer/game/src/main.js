import Phaser from 'phaser';
import './style.css';
import { makeLandscape } from './landscape.js';
import marioUrl from '../assets/mario-sprites-grid.png';
import { EnemySystem, preloadEnemies } from './enemies.js';
import { PowerUpSystem, preloadPowerUps } from './powerups.js';
import { CoinSystem, preloadCoins } from './coins.js';
import { BrickSystem } from './bricks.js';
import { SecretEntrance, SECRET_TREE_INDEX, ROOM, ROOM_COINS, ROOM_SURFACES, TRANSITION_MS, EXIT_CLIMB_MS, EXIT_CLIMB_RISE, makeUndergroundArt } from './secret-room.js';

const WIDTH = 1280;
const HEIGHT = 720;
const ORIGINAL_WORLD_WIDTH = WIDTH * 3.5;
const WORLD_WIDTH = ORIGINAL_WORLD_WIDTH * 1.5;
const GROUND_Y = 640;
const VIEW_ZOOM = 1.6;
// Keep the existing artwork scale and baseline. Idle/walk/jump heads start at
// source row 45; the unused canvas above them must not collide with ceilings.
const PLAYER_VISUAL_SCALE = 0.2 * 278 / 262;
const PLAYER_FEET_BASELINE = 299;
const PLAYER_FRAME_HEIGHT = 64;
// The idle silhouette is ~30 px wide inside the 36 px canvas.
const PLAYER_BODY_WIDTH = 30;
const PLAYER_BODY_OFFSET_X = 3;
const PLAYER_STANDING_HEIGHT = (PLAYER_FEET_BASELINE - 45) * PLAYER_VISUAL_SCALE;
const PLAYER_CROUCH_HEIGHT = 32; // One block (33 × 32), versus ~54 when standing.
// The first bank contains the first patrol, keeping the opening peaceful even
// when the player waits. Introduce single mushrooms before pairs and turtles.
const ENEMY_SPAWNS = [1140, 1490, 1560, 2650, 2940, 3010];
const TURTLE_SPAWNS = [
  { x: 2830, groundY: 552, direction: -1 },
  { x: 3280, groundY: GROUND_Y, direction: 1 },
];
// Ground patrols are contained by raised surfaces. Turtles patrol platform tops,
// leaving the landing banks and the approach to each river gap clear.
const EXTENSION_HONGO_SPAWNS = [4800, 5570, 6500];
const EXTENSION_TURTLE_SPAWNS = [
  { x: 5460, groundY: 568, direction: 1 },
  { x: 6320, groundY: 592, direction: -1 },
];
const QUESTION_BLOCKS = [
  { x: 560, topY: 488, hasMushroom: true },
  { x: 1490, topY: 488, hasMushroom: false, hasCoin: true },
  { x: 2340, topY: 488, hasMushroom: false },
  { x: 3930, topY: 488, hasMushroom: false, hasCoin: true },
  { x: 4560, topY: 488, hasMushroom: false, hasCoin: true },
  { x: 5580, topY: 488, hasMushroom: true },
  { x: 6200, topY: 488, hasMushroom: false, hasCoin: true },
  // Idle artwork and solid bodies are 33 px wide: equal spacing joins the row.
  // Opening rewards, a later quiet reward area, then a higher pair before water.
  { x: 740, topY: 488, hasMushroom: false, hasCoin: true },
  { x: 773, topY: 488, hasMushroom: false },
  { x: 806, topY: 488, hasMushroom: false, hasCoin: true },
  { x: 4120, topY: 488, hasMushroom: false, hasCoin: true },
  { x: 4153, topY: 488, hasMushroom: false, hasCoin: true },
  { x: 4186, topY: 488, hasMushroom: false },
  { x: 5840, topY: 472, hasMushroom: false },
  { x: 5873, topY: 472, hasMushroom: false, hasCoin: true },
];
// One geometry source for both artwork and solid Arcade bodies.
const RIVER_GAPS = [
  { x: 2040, width: 112 }, { x: 3540, width: 152 },
  { x: 5080, width: 128 }, { x: 5980, width: 144 },
];
// Cut stumps and standing deadwood. Each tier is [left inset, right inset,
// height], from the flat crown down to the exposed roots at ground level.
// The stepped silhouettes are the solids themselves, including every root.
const WOODLAND_OBSTACLES = [
  { x: 1828, y: 604, width: 92, kind: 'stump', tiers: [[10, 12, 20], [6, 8, 8], [0, 0, 8]] },
  { x: 3348, y: 528, width: 76, kind: 'snag', tiers: [[22, 14, 8], [22, 10, 12], [14, 10, 12], [8, 20, 12], [18, 20, 28], [10, 14, 22], [0, 0, 18]] },
  { x: 3792, y: 588, width: 92, kind: 'stump', tiers: [[14, 14, 32], [6, 8, 12], [0, 0, 8]] },
  { x: 4392, y: 524, width: 76, kind: 'snag', tiers: [[14, 18, 12], [18, 18, 18], [18, 4, 14], [16, 0, 8], [16, 18, 22], [10, 12, 24], [0, 0, 18]] },
  { x: 6576, y: 572, width: 100, kind: 'stump', tiers: [[18, 14, 44], [8, 6, 14], [0, 0, 10]] },
];
const LEVEL_SURFACES = [
  { x: 0, y: GROUND_Y, width: 2040, height: 80, kind: 'bank' },
  { x: 2152, y: GROUND_Y, width: 1388, height: 80, kind: 'bank' },
  { x: 3692, y: GROUND_Y, width: ORIGINAL_WORLD_WIDTH - 3692, height: 80, kind: 'bank' },
  { x: 960, y: 600, width: 120, height: 40, kind: 'bank' },
  { x: 1240, y: 568, width: 144, height: 72, kind: 'bank' },
  { x: 1656, y: 584, width: 144, height: 56, kind: 'log' },
  { x: 2480, y: 592, width: 128, height: 48, kind: 'bank' },
  { x: 2760, y: 552, width: 144, height: 88, kind: 'bank' },
  { x: 3060, y: 584, width: 128, height: 56, kind: 'bank' },
  // Append after the original boundary; its geometry and artwork stay intact.
  { x: ORIGINAL_WORLD_WIDTH, y: GROUND_Y, width: 600, height: 80, kind: 'bank' },
  { x: 5208, y: GROUND_Y, width: 772, height: 80, kind: 'bank' },
  { x: 6124, y: GROUND_Y, width: WORLD_WIDTH - 6124, height: 80, kind: 'bank' },
  { x: 4620, y: 592, width: 128, height: 48, kind: 'bank' },
  { x: 4840, y: 584, width: 144, height: 56, kind: 'log' },
  { x: 5390, y: 568, width: 144, height: 72, kind: 'bank' },
  { x: 5650, y: 608, width: 192, height: 32, kind: 'log' },
  { x: 6250, y: 592, width: 144, height: 48, kind: 'bank' },
  ...WOODLAND_OBSTACLES.flatMap((tree, treeIndex) => {
    let y = tree.y;
    return tree.tiers.map(([left, right, height]) => {
      const surface = { x: tree.x + left, y, width: tree.width - left - right,
        height, kind: tree.kind, treeIndex };
      y += height;
      return surface;
    });
  }),
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
  constructor(sceneKey = 'Playground') {
    super(sceneKey);
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
    this.powered = false;
    this.gameOver = false;
    this.movementState = 'idle';
    this.shiftKeys.clear();
    // Each full level rebuild gets a fresh entrance and room coin ledger.
    this.secretEntrance = new SecretEntrance(this, WOODLAND_OBSTACLES[SECRET_TREE_INDEX]);
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
    // The 36 × 64 visual canvas stays intact; only opaque headroom is solid.
    this.player.body.setSize(PLAYER_BODY_WIDTH, PLAYER_STANDING_HEIGHT, false)
      .setOffset(PLAYER_BODY_OFFSET_X, PLAYER_FRAME_HEIGHT - PLAYER_STANDING_HEIGHT);
    this.player.setCollideWorldBounds(true).setBounce(0);
    this.playerTerrainCollider = this.physics.add.collider(this.player, this.surfaces);
    this.events.on('enemy-impact', this.die, this);
    this.events.on('powerup-collected', this.collectPowerUp, this);
    this.coinSystem = new CoinSystem(this, this.player);
    this.powerUps = QUESTION_BLOCKS.map(({ x, topY, hasMushroom, hasCoin }) =>
      new PowerUpSystem(this, this.player, this.surfaces, x, topY, hasMushroom, hasCoin));
    this.bricks = new BrickSystem(this, this.player);
    // Power-ups can walk across any of the question blocks.
    for (const powerUp of this.powerUps) {
      if (!powerUp.mushroom) continue;
      powerUp.colliders.push(this.physics.add.collider(powerUp.mushroom, this.bricks.group));
      for (const other of this.powerUps) {
        if (other !== powerUp) powerUp.colliders.push(
          this.physics.add.collider(powerUp.mushroom, other.solid));
      }
    }

    // Resolve every player/solid collision before checking enemy contact.
    // Otherwise an enemy behind a block can hit a position Arcade will undo.
    this.enemies = new EnemySystem(this, this.player, this.surfaces);
    for (const x of ENEMY_SPAWNS) this.enemies.spawnHongo(x, GROUND_Y);
    for (const { x, groundY, direction } of TURTLE_SPAWNS) {
      this.enemies.spawnTortuga(x, groundY, direction);
    }
    for (const x of EXTENSION_HONGO_SPAWNS) this.enemies.spawnHongo(x, GROUND_Y);
    for (const { x, groundY, direction } of EXTENSION_TURTLE_SPAWNS) {
      this.enemies.spawnTortuga(x, groundY, direction);
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
      this.events.off('powerup-collected', this.collectPowerUp, this);
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
    const hudCamera = this.hudCamera = this.cameras.add(0, 0, WIDTH, HEIGHT, false, 'hud');
    camera.ignore([...this.backgrounds, ...hudObjects]);
    this.landscapeCamera.ignore([...worldObjects, ...hudObjects]);
    hudCamera.ignore([...worldObjects, ...this.backgrounds]);
    this.cameras.cameras.splice(0, 3, this.landscapeCamera, camera, hudCamera);
    this.setPhysicsDebug(typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('debugPhysics') === '1');
    this.input.keyboard.on('keydown-F2', this.togglePhysicsDebug, this);
    const syncLandscape = () => {
      this.landscapeCamera.setScroll(camera.worldView.x, 0);
    };
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, syncLandscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, syncLandscape);
      this.input.keyboard.off('keydown-F2', this.togglePhysicsDebug, this);
    });
  }

  setPhysicsDebug(enabled) {
    const world = this.physics.world;
    if (enabled && !world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = enabled;
    if (world.debugGraphic) {
      // Arcade draws in world coordinates. Scenery and HUD cameras must not
      // draw a second copy at a different scale or scroll position.
      this.landscapeCamera?.ignore(world.debugGraphic);
      this.hudCamera.ignore(world.debugGraphic);
      world.debugGraphic.setVisible(enabled);
    }
  }

  togglePhysicsDebug(event) {
    if (event?.repeat) return;
    this.setPhysicsDebug(!this.physics.world.drawDebug);
  }

  collectPowerUp({ type }) {
    if (!this.dead && type === 'white-mushroom') this.powered = true;
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
    const visualScale = PLAYER_VISUAL_SCALE;
    const feetBaseline = PLAYER_FEET_BASELINE;
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
    const upPressed = [this.cursors.up, this.keys.W]
      .map(key => Phaser.Input.Keyboard.JustDown(key)).some(Boolean);
    const spacePressed = Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
    const crouchPressed = [this.cursors.down, this.keys.S]
      .map(key => Phaser.Input.Keyboard.JustDown(key)).some(Boolean);
    return {
      direction: Number(right) - Number(left),
      run: this.shiftKeys.size > 0,
      crouch: this.cursors.down.isDown || this.keys.S.isDown,
      crouchPressed,
      jump: upPressed || spacePressed,
      upPressed,
    };
  }

  updateMovement(input, dt) {
    const body = this.player.body;
    const grounded = body.blocked.down && body.velocity.y >= 0;
    const standBlocked = body.height < PLAYER_STANDING_HEIGHT && !this.canPlayerStand();
    let speed = body.velocity.x;

    // A slide owns horizontal motion until friction stops it or support is lost.
    const sliding = grounded && (this.movementState === 'slide'
      || (input.crouchPressed && Math.abs(speed) >= MOVEMENT.slideThreshold));
    if (sliding) {
      speed = approach(speed, 0, MOVEMENT.slideFriction * dt);
      this.player.setVelocityX(speed);
      this.movementState = speed !== 0 ? 'slide' : input.crouch || standBlocked ? 'crouch' : 'idle';
      return;
    }
    if (grounded && (input.crouch || standBlocked)) {
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

  canPlayerStand() {
    const body = this.player.body;
    const top = body.bottom - PLAYER_STANDING_HEIGHT;
    const solids = [
      ...(this.surfaces?.getChildren() ?? []),
      ...(this.bricks?.group.getChildren() ?? []),
      ...(this.powerUps?.map(powerUp => powerUp.solid) ?? []),
    ];
    // Edge contact is allowed: an adjacent wall or the supporting floor should
    // not prevent standing. Disabled/broken blocks no longer form a ceiling.
    return !solids.some(({ body: solid }) => solid?.enable
      && body.x < solid.right && body.right > solid.x
      && top < solid.bottom && body.bottom > solid.y);
  }

  updatePlayerBody() {
    const body = this.player.body;
    const crouched = this.movementState === 'crouch' || this.movementState === 'slide';
    const height = crouched ? PLAYER_CROUCH_HEIGHT : PLAYER_STANDING_HEIGHT;
    if (body.height === height) return;
    if (!crouched && !this.canPlayerStand()) {
      this.movementState = 'crouch';
      return;
    }
    const shift = body.height - height;
    body.setSize(PLAYER_BODY_WIDTH, height, false)
      .setOffset(PLAYER_BODY_OFFSET_X, PLAYER_FRAME_HEIGHT - height);
    // Scene.update runs between Arcade's step and postUpdate. Move its history
    // with the top edge so a resize is not applied to the sprite as Y motion.
    body.y += shift;
    body.prev.y += shift;
    body.prevFrame.y += shift;
    body.updateCenter();
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
    if (this.secretEntrance && ['entering', 'transition', 'inside'].includes(this.secretEntrance.state)) {
      this.secretEntrance.update(delta);
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
    const input = this.readMovementInput();
    if (this.secretEntrance?.tryEnter(input.crouchPressed)) return;
    this.updateMovement(input, Math.min(delta, 50) / 1000);
    this.updatePlayerBody();
    this.updatePlayerAnimation();
    this.enemies?.update();
  }
}

// A separate paused/resumed scene keeps every main-level object, timer and
// collider alive, without serializing or reconstructing the level on return.
class Underground extends Playground {
  constructor() {
    super('Underground');
  }

  init({ owner }) {
    this.owner = owner;
    this.lives = owner.lives;
    this.coins = owner.coins;
    this.powered = owner.powered;
  }

  preload() {} // Reuse the textures and animations already loaded by WORLD 1-1.

  create() {
    this.dead = this.gameOver = this.returning = false;
    this.movementState = 'idle';
    this.shiftKeys.clear();
    makeUndergroundArt(this);
    this.surfaces = this.physics.add.staticGroup();
    for (const { x, y, width, height } of ROOM_SURFACES) {
      this.surfaces.add(this.add.rectangle(x + width / 2, y + height / 2, width, height).setVisible(false));
    }
    this.physics.world.setBounds(0, 0, ROOM.width, ROOM.height);
    this.player = this.physics.add.sprite(88, ROOM.floor - 32, 'player');
    this.player.body.setSize(PLAYER_BODY_WIDTH, PLAYER_STANDING_HEIGHT, false)
      .setOffset(PLAYER_BODY_OFFSET_X, PLAYER_FRAME_HEIGHT - PLAYER_STANDING_HEIGHT);
    this.player.setCollideWorldBounds(true).setBounce(0);
    this.playerTerrainCollider = this.physics.add.collider(this.player, this.surfaces);
    this.coinSystem = new CoinSystem(this, this.player, ROOM_COINS, this.owner.secretEntrance.collected);
    this.add.text(ROOM.vineX - 10, ROOM.floor - 20, '↑ / W', {
      fontFamily: 'monospace', fontSize: '12px', color: '#d6ed9c',
      backgroundColor: '#21140d', padding: { x: 3, y: 2 },
    }).setOrigin(1, 1);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('A,D,W,S,SPACE,ENTER');
    this.input.keyboard.resetKeys();
    this.input.keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
    this.input.keyboard.on('keydown', this.onShiftDown, this);
    this.input.keyboard.on('keyup', this.onShiftUp, this);
    this.input.keyboard.on('keydown-F2', this.togglePhysicsDebug, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.stopMovement, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown', this.onShiftDown, this);
      this.input.keyboard.off('keyup', this.onShiftUp, this);
      this.input.keyboard.off('keydown-F2', this.togglePhysicsDebug, this);
      this.game.events.off(Phaser.Core.Events.BLUR, this.stopMovement, this);
      this.owner = null;
    });

    const camera = this.cameras.main;
    camera.setZoom(VIEW_ZOOM).centerOn(ROOM.width / 2, ROOM.height / 2);
    const worldObjects = [...this.children.list];
    this.makeHud();
    const hudObjects = this.children.list.slice(worldObjects.length);
    this.hudCamera = this.cameras.add(0, 0, WIDTH, HEIGHT, false, 'hud');
    camera.ignore(hudObjects);
    this.hudCamera.ignore(worldObjects);
    this.setPhysicsDebug(this.owner.physics.world.drawDebug);
    camera.fadeIn(TRANSITION_MS, 0, 0, 0);
  }

  addCoin() {
    this.owner.addCoin();
    this.coins = this.owner.coins;
    this.lives = this.owner.lives;
    this.coinsText.setText(`x${String(this.coins).padStart(2, '0')}`);
    this.livesText.setText(`VIDAS × ${this.lives}`);
  }

  tryExit(pressed) {
    if (!pressed || this.returning || Math.abs(this.player.body.center.x - ROOM.vineX) > 32) return false;
    this.returning = true;
    this.exitElapsed = 0;
    this.exitTransition = false;
    this.exitStartY = Math.max(ROOM.ceiling + this.player.height / 2 + EXIT_CLIMB_RISE,
      Math.min(ROOM.floor - this.player.height / 2, this.player.y));
    this.player.setVelocity(0, 0);
    this.player.body.enable = false;
    this.physics.world.pause();
    this.input.keyboard.resetKeys();
    this.shiftKeys.clear();
    this.player.anims.stop();
    this.player.x = ROOM.vineX;
    this.player.y = this.exitStartY;
    this.player.setFrame('walk-1');
    return true;
  }

  updateExit(delta) {
    if (this.exitTransition) return;
    this.exitElapsed = Math.min(EXIT_CLIMB_MS, this.exitElapsed + delta);
    this.player.y = this.exitStartY - EXIT_CLIMB_RISE * this.exitElapsed / EXIT_CLIMB_MS;
    // Reuse the two existing limb poses, without adding a sprite or animation.
    this.player.setFrame(Math.floor(this.exitElapsed / 130) % 2 ? 'walk-2' : 'walk-1');
    if (this.exitElapsed < EXIT_CLIMB_MS) return;
    this.exitTransition = true;
    const camera = this.cameras.main;
    camera.once('camerafadeoutcomplete', () => {
      this.owner.secretEntrance.returnToLevel();
      this.scene.stop();
    });
    camera.fadeOut(TRANSITION_MS, 0, 0, 0);
  }

  update(time, delta) {
    if (this.fpsText && time >= this.nextFpsUpdate) {
      this.fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
      this.nextFpsUpdate = time + 500;
    }
    if (this.returning) {
      this.updateExit(delta);
      return;
    }
    const input = this.readMovementInput();
    if (this.tryExit(input.upPressed)) return;
    this.updateMovement(input, Math.min(delta, 50) / 1000);
    this.updatePlayerBody();
    this.updatePlayerAnimation();
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
    arcade: { gravity: { y: 1600 }, debug: false, debugShowVelocity: false },
  },
  scene: [Playground, Underground],
});
