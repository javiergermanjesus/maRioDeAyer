import Phaser from 'phaser';
import './style.css';
import { makeLandscape } from './landscape.js';
import marioUrl from '../assets/mario-sprites-grid.png';

const WIDTH = 1280;
const HEIGHT = 720;
const WORLD_WIDTH = WIDTH * 3.5;
const GROUND_Y = 640;
const VIEW_ZOOM = 1.6;
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
  runSpeed: 460,
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
  }

  preload() {
    this.load.spritesheet('mario-source', marioUrl, {
      frameWidth: 192,
      frameHeight: 320,
      endFrame: 13,
    });
  }

  create() {
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
    this.physics.add.collider(this.player, this.surfaces);

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
    this.keys = this.input.keyboard.addKeys('A,D,W,S,SPACE');
    // Track physical keys separately: releasing one Shift must not release the other.
    this.input.keyboard.on('keydown', this.onShiftDown, this);
    this.input.keyboard.on('keyup', this.onShiftUp, this);
    this.input.keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
    this.game.events.on(Phaser.Core.Events.BLUR, this.stopMovement, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, () => {
      this.landscapeCamera.setScroll(camera.worldView.x, 0);
    });
  }

  stopMovement() {
    this.input.keyboard.resetKeys();
    this.shiftKeys.clear();
    this.movementState = 'idle';
    this.player.setVelocityX(0);
  }

  onShiftDown(event) {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.shiftKeys.add(event.code);
  }

  onShiftUp(event) {
    this.shiftKeys.delete(event.code);
  }

  makeScenery() {
    return makeLandscape(this, {
      width: WIDTH, height: HEIGHT, worldWidth: WORLD_WIDTH,
      groundY: GROUND_Y, gaps: RIVER_GAPS, surfaces: LEVEL_SURFACES,
    });
  }

  makePlayerTexture() {
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
    const style = {
      fontFamily: 'monospace', fontSize: '28px', fontStyle: 'bold',
      color: '#ffffff', lineSpacing: 5,
      shadow: { offsetX: 4, offsetY: 4, color: '#000000', fill: true },
    };
    this.add.text(80, 30, 'RIO\n000000', style).setScrollFactor(0);
    this.add.rectangle(452, 46, 14, 20, 0xf7d000).setStrokeStyle(3, 0x000000).setScrollFactor(0);
    this.add.text(470, 30, 'x00', style).setScrollFactor(0);
    this.add.text(790, 30, 'WORLD\n1-1', style).setScrollFactor(0);
    this.add.text(1200, 30, 'TIME\n300', style).setOrigin(1, 0).setScrollFactor(0);
    this.add.text(640, 680, 'MOVER: ← → / A D     SALTAR: ESPACIO / ↑ / W', {
      ...style, fontSize: '18px', backgroundColor: '#000000', padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0);
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
      speed = input.direction * MOVEMENT.walkSpeed;
    }
    this.player.setVelocityX(speed);
    if (input.jump && grounded) this.player.setVelocityY(-760);

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
    // The existing world floor stays in place; reset before it can support a fall.
    if (this.player.y > GROUND_Y + 36) {
      this.stopMovement();
      this.player.body.reset(378, GROUND_Y - 32);
    }
    this.updateMovement(this.readMovementInput(), Math.min(delta, 50) / 1000);
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
    arcade: { gravity: { y: 1600 }, debug: false },
  },
  scene: Playground,
});
