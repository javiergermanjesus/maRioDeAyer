import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { readRgbaPng, alphaBounds } from './helpers/png.mjs';

const require = createRequire(import.meta.url);
const Body = require('../../node_modules/phaser/src/physics/arcade/Body.js');
const StaticBody = require('../../node_modules/phaser/src/physics/arcade/StaticBody.js');
const World = require('../../node_modules/phaser/src/physics/arcade/World.js');
const load = name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const context = vm.createContext({});
vm.runInContext(load('enemies') + `
  globalThis.api = { EnemySystem, HONGO_REGIONS, makeHongoTexture, TURTLE_BODIES };`, context);
const { EnemySystem, HONGO_REGIONS, makeHongoTexture, TURTLE_BODIES } = context.api;
const mainContext = vm.createContext({ Phaser: { Scene: class {} } });
vm.runInContext(load('main').split('new Phaser.Game(')[0] + `
  globalThis.shape = { width: PLAYER_BODY_WIDTH, height: PLAYER_STANDING_HEIGHT,
    x: PLAYER_BODY_OFFSET_X, y: PLAYER_FRAME_HEIGHT - PLAYER_STANDING_HEIGHT,
    scale: PLAYER_VISUAL_SCALE, baseline: PLAYER_FEET_BASELINE };`, mainContext);
const playerShape = mainContext.shape;

function sprite(world, x, y, width, height) {
  const object = { x, y, angle: 0, rotation: 0, scaleX: 1, scaleY: 1,
    displayOriginX: width / 2, displayOriginY: height / 2,
    displayWidth: width, displayHeight: height,
    frame: { realWidth: width, realHeight: height }, active: true,
    anims: { stop() {} },
    setScale(s) { this.scaleX = this.scaleY = s; return this; },
    setCollideWorldBounds() { return this; }, setBounce() { return this; },
    setVelocityX(x) { this.body.velocity.x = x; return this; },
    setVelocityY(y) { this.body.velocity.y = y; return this; },
    setVelocity(x, y) { this.body.velocity.set(x, y); return this; },
    setFrame(frame) { this.currentFrame = frame; return this; },
    setFlipX(v) { this.flipX = v; return this; }, play() { return this; }, destroy() {},
  };
  object.body = new Body(world, object);
  return object;
}

function setup(kind = 'hongo') {
  const impacts = [];
  const world = Object.assign(Object.create(World.prototype), {
    defaults: {}, bounds: { bottom: 720 }, gravity: { x: 0, y: 1600 },
    OVERLAP_BIAS: 4, _total: 0, staticTree: { insert() {}, remove() {} },
  });
  const player = sprite(world, 200, 608, 36, 64);
  player.body.setSize(playerShape.width, playerShape.height, false).setOffset(playerShape.x, playerShape.y);
  player.body.updateFromGameObject();
  const children = [];
  const system = Object.assign(Object.create(EnemySystem.prototype), {
    player, contacts: new Set(), previousContacts: new Set(),
    surfaces: { getChildren: () => [] },
    group: { getChildren: () => children, create(x, y, key) {
      const object = sprite(world, x, y, key === 'tortuga' ? 192 : 44, key === 'tortuga' ? 144 : 40);
      children.push(object); return object;
    } },
    scene: { textures: { exists: () => true }, anims: { exists: () => true },
      physics: { world }, events: { emit(...args) { impacts.push(args); } },
      time: { now: 0, delayedCall() { return { remove() {} }; } },
    },
  });
  const enemy = kind === 'hongo' ? system.spawnHongo(232, 640) : system.spawnTortuga(232, 640);
  if (kind === 'shell') system.setTurtleState(enemy, 'sliding');
  enemy.body.updateFromGameObject();
  return { world, system, player, enemy, impacts };
}

test('player and mushroom bodies follow the opaque artwork rather than faint PNG margins', () => {
  const { player, enemy } = setup();
  const mario = readRgbaPng(new URL('../assets/mario-sprites-grid.png', import.meta.url));
  const idle = alphaBounds(mario, { width: 192, height: 320 });
  const left = (36 - 192 * playerShape.scale) / 2 + idle.left * playerShape.scale;
  const right = (36 - 192 * playerShape.scale) / 2 + idle.right * playerShape.scale;
  assert.ok(Math.abs(player.body.offset.x - left) < 0.5);
  assert.ok(Math.abs(player.body.offset.x + player.body.width - right) < 0.5);

  const source = readRgbaPng(new URL('../assets/hongo-enemigo.png', import.meta.url));
  const draws = [];
  makeHongoTexture({
    textures: { exists: () => false, get: () => ({ getSourceImage: () => source }),
      createCanvas: () => ({ context: { drawImage(...args) { draws.push(args); } }, add() {}, refresh() {} }) },
    anims: { create() {} },
  });
  for (const [i, region] of HONGO_REGIONS.slice(0, 2).entries()) {
    const opaque = alphaBounds(source, region);
    const [, , , sw, sh, dx, dy, dw, dh] = draws[i];
    const visibleLeft = dx - i * 44 + opaque.left * dw / sw;
    const visibleRight = dx - i * 44 + opaque.right * dw / sw;
    const visibleTop = dy + opaque.top * dh / sh;
    for (const flipped of [false, true]) {
      const left = flipped ? 44 - visibleRight : visibleLeft;
      const right = flipped ? 44 - visibleLeft : visibleRight;
      assert.ok(enemy.body.offset.x >= left - 0.5);
      assert.ok(enemy.body.offset.x + enemy.body.width <= right + 0.5);
    }
    assert.ok(Math.abs(enemy.body.offset.y - visibleTop) <= 1);
    assert.equal(enemy.body.offset.y + enemy.body.height, 40, 'original foot baseline');
  }
});

test('turtle walking and shell bounds already stay inside the visible frames at scale 0.32', () => {
  const image = readRgbaPng(new URL('../assets/tortuga-sprites-grid.png', import.meta.url));
  for (const [kind, frames] of [['turtle', [0, 1, 2, 3]], ['shell', [7, 8, 9, 10, 11]]]) {
    const { enemy } = setup(kind);
    const shape = TURTLE_BODIES[kind === 'turtle' ? 'walking' : 'shell'];
    assert.ok(Math.abs(enemy.body.width - shape.width * 0.32) < 1e-9);
    assert.ok(Math.abs(enemy.body.height - shape.height * 0.32) < 1e-9);
    for (const index of frames) {
      const bounds = alphaBounds(image, { x: index * 192, width: 192, height: 144 });
      assert.ok((bounds.left - shape.x) * 0.32 <= 0.5);
      assert.ok((shape.x + shape.width - bounds.right) * 0.32 <= 0.5);
      assert.ok(shape.y >= bounds.top);
      assert.ok(shape.y + shape.height <= bounds.bottom);
    }
  }
});

test('turtle state changes keep its feet and preserve movement awaiting Arcade postUpdate', () => {
  const { system, enemy } = setup('turtle');
  const body = enemy.body;
  for (const state of ['hiding', 'shell', 'emerging', 'walking', 'walking', 'sliding']) {
    body.preUpdate(false, 0);
    const spriteX = enemy.x, spriteY = enemy.y;
    body.x += 0.8;
    body.y += 0.25;
    const feet = body.bottom;
    system.setTurtleState(enemy, state);
    assert.ok(Math.abs(body.bottom - feet) < 1e-9);
    body.postUpdate();
    assert.ok(Math.abs(enemy.x - spriteX - 0.8) < 1e-9);
    assert.ok(Math.abs(enemy.y - spriteY - 0.25) < 1e-9);
    body.updateFromGameObject();
    assert.ok(Math.abs(body.bottom - feet) < 1e-9);
  }
});

test('mushroom side contact waits for visible contact and emits one impact per continuous overlap', () => {
  for (const direction of [-1, 1]) {
    const { world, system, player, enemy, impacts } = setup();
    if (direction === 1) {
      player.x = 264;
      player.body.updateFromGameObject();
    }
    enemy.direction = direction;
    // At these original positions the former bodies overlap by 2 px while the
    // opaque sprites still have a visible gap. The corrected bodies stay apart.
    world.overlap(player, enemy, (_player, e) => system.touchPlayer(e));
    assert.equal(impacts.length, 0);
    enemy.x += direction * 2;
    enemy.body.updateFromGameObject();
    world.overlap(player, enemy, (_player, e) => system.touchPlayer(e));
    assert.equal(impacts.length, 1);
    for (let frame = 0; frame < 10; frame++) {
      system.update();
      world.overlap(player, enemy, (_player, e) => system.touchPlayer(e));
    }
    assert.equal(impacts.length, 1);
    assert.equal(enemy.flipX, direction === 1);
  }
});

test('real side and underside contacts damage, while descending top contacts stomp', () => {
  for (const kind of ['hongo', 'turtle', 'shell']) {
    for (const contact of ['side', 'below', 'top']) {
      const { world, system, player, enemy, impacts } = setup(kind);
      const a = player.body, b = enemy.body;
      a.x = b.x + 1;
      a.prev.x = a.x;
      b.prev.copy(b.position);
      if (contact === 'top') {
        a.prev.y = b.y - a.height - 1;
        a.y = b.y - a.height + 1;
        a.velocity.y = 200;
      } else if (contact === 'below') {
        a.y = b.bottom - 1;
        a.prev.y = b.bottom + 1;
        a.velocity.y = -200;
      } else {
        a.y = b.y;
        a.prev.y = a.y;
        a.velocity.y = 0;
      }
      world.overlap(player, enemy, (_player, e) => system.touchPlayer(e));
      assert.equal(impacts.length, contact === 'top' ? 0 : 1, `${kind}: ${contact}`);
      if (contact === 'top') assert.equal(a.velocity.y, -360);
    }
  }
});

test('solid separation prevents enemies behind a block from damaging the speculative player position', () => {
  for (const kind of ['hongo', 'turtle', 'shell']) {
    const { world, system, player, enemy, impacts } = setup(kind);
    const a = player.body;
    a.x = 151;
    a.y = 586;
    a.prev.set(143, 586);
    a._dx = 8;
    a._dy = 0;
    a.velocity.set(400, 0);
    enemy.body.x = 180.5;
    enemy.body.prev.copy(enemy.body.position);
    const wallBody = new StaticBody(world);
    wallBody.setSize(33, 56, false);
    wallBody.x = 180;
    wallBody.y = 584;
    const wall = { body: wallBody };
    wallBody.gameObject = wall;
    assert.equal(world.intersects(a, enemy.body), true, 'unresolved position overlaps the enemy');
    world.collide(player, wall);
    world.overlap(player, enemy, (_player, e) => system.touchPlayer(e));
    assert.equal(a.blocked.right, true);
    assert.equal(a.right, wallBody.x);
    assert.equal(impacts.length, 0);
  }
});
