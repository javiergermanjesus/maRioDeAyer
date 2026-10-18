import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const Body = require('../../node_modules/phaser/src/physics/arcade/Body.js');
const StaticBody = require('../../node_modules/phaser/src/physics/arcade/StaticBody.js');
const World = require('../../node_modules/phaser/src/physics/arcade/World.js');
const load = name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const context = vm.createContext({ Phaser: {
  Scene: class {}, Input: { Keyboard: { JustDown(key) {
    const edge = key.edge;
    key.edge = false;
    return edge;
  } } },
} });
vm.runInContext(load('secret-room') + load('coins') + load('main').split('new Phaser.Game(')[0]
  + '\nglobalThis.api = { Playground, Underground, SecretEntrance, CoinSystem, ROOM, ROOM_COINS, ROOM_SURFACES, ENTRY_MS, EXIT_CLIMB_MS, EXIT_CLIMB_RISE, makeUndergroundArt, WOODLAND_OBSTACLES };', context);
const { Playground, Underground, SecretEntrance, CoinSystem, ROOM, ROOM_COINS, ROOM_SURFACES, ENTRY_MS, EXIT_CLIMB_MS, EXIT_CLIMB_RISE, makeUndergroundArt, WOODLAND_OBSTACLES } = context.api;

function setup() {
  const scene = new Playground();
  scene.init({ lives: 4, coins: 91 });
  scene.powered = true;
  const world = Object.assign(Object.create(World.prototype), {
    defaults: {}, bounds: {}, gravity: { x: 0, y: 1600 }, OVERLAP_BIAS: 4, _total: 0,
    staticTree: { insert() {}, remove() {} },
    pause() { this.isPaused = true; }, resume() { this.isPaused = false; },
  });
  scene.physics = { world };
  const player = scene.player = {
    x: 1873, y: 572, angle: 0, rotation: 0, scaleX: 1, scaleY: 1,
    width: 36, height: 64, displayOriginX: 18, displayOriginY: 32,
    displayWidth: 36, displayHeight: 64, visible: true,
    setPosition(x, y) { this.x = x; this.y = y; },
    setVelocity(x, y) { this.body.velocity.set(x, y); },
    setVelocityX(x) { this.body.velocity.x = x; },
    setVelocityY(y) { this.body.velocity.y = y; },
    setFrame(frame) { this.frame = frame; },
    setFlipX() {}, play() {}, anims: { stop() {} },
    setCrop(...crop) { this.crop = crop; },
    setVisible(visible) { this.visible = visible; },
  };
  player.body = new Body(world, player);
  scene.updatePlayerBody();
  player.body.updateFromGameObject();
  player.body.blocked.down = true;
  const key = () => ({ isDown: false, edge: false });
  scene.cursors = { up: key(), down: key(), left: key(), right: key() };
  scene.keys = { A: key(), D: key(), S: key(), W: key(), SPACE: key() };
  scene.input = { keyboard: { resetKeys() {
    for (const k of [...Object.values(scene.keys), ...Object.values(scene.cursors)]) {
      k.isDown = k.edge = false;
    }
  } } };
  const camera = scene.cameras = { main: {
    once(event, callback) { this[event] = callback; },
    fadeOut() { this.fading = true; this.fadeCount = (this.fadeCount ?? 0) + 1; },
    fadeIn() { this.fading = false; },
  } };
  scene.scene = {
    launch(name, data) { this.launched = { name, data }; },
    pause() { this.paused = true; }, resume() { this.paused = false; },
    stop() { this.stopped = true; },
    restart() { assert.fail('A secret visit must not rebuild WORLD 1-1'); },
  };
  scene.secretEntrance = new SecretEntrance(scene, WOODLAND_OBSTACLES[0]);
  scene.finishFade = () => camera.main.camerafadeoutcomplete();
  return scene;
}

function enter(scene) {
  assert.equal(scene.secretEntrance.tryEnter(true), true);
  scene.secretEntrance.update(ENTRY_MS);
  assert.equal(scene.scene.launched, undefined, 'wait for the short fade after disappearing');
  scene.finishFade();
}

test('only a new Down/S press centered on the chosen crown enters; other hollow trees stay solid', () => {
  for (const tree of WOODLAND_OBSTACLES) {
    const s = setup();
    const [left, right] = tree.tiers[0];
    s.player.setPosition(tree.x + (left + tree.width - right) / 2, tree.y - 32);
    s.player.body.updateFromGameObject();
    assert.equal(s.secretEntrance.tryEnter(true), tree === WOODLAND_OBSTACLES[0]);
  }
  for (const invalid of ['no press', 'airborne', 'rising', 'off center', 'ground beside stump', 'dead']) {
    const s = setup();
    if (invalid === 'airborne') s.player.body.blocked.down = false;
    if (invalid === 'rising') s.player.body.velocity.y = -5;
    if (invalid === 'off center') s.player.body.center.x += 20;
    if (invalid === 'ground beside stump') { s.player.y += 36; s.player.body.updateFromGameObject(); }
    if (invalid === 'dead') s.dead = true;
    assert.equal(s.secretEntrance.tryEnter(invalid !== 'no press'), false, invalid);
    assert.equal(s.player.body.enable, true);
  }
  for (const key of ['down', 'S']) {
    const s = setup();
    (s.cursors[key] ?? s.keys[key]).edge = true;
    s.update(0, 16);
    assert.equal(s.secretEntrance.state, 'entering', key);
    assert.equal(s.player.frame, 'idle');
  }
});

test('entry descends progressively behind the near lip, locks physics and waits before launching', () => {
  for (const fps of [30, 60, 120]) {
    const s = setup();
    const startY = s.player.y;
    s.player.body.velocity.x = 280;
    s.shiftKeys.add('ShiftLeft');
    assert.equal(s.secretEntrance.tryEnter(true), true);
    assert.equal(s.player.y, startY, 'no immediate teleport');
    assert.equal(s.player.body.enable, false);
    assert.equal(s.physics.world.isPaused, true);
    assert.equal(s.shiftKeys.size, 0);
    let previousY = startY, previousCrop = 64;
    let partialFrames = 0;
    while (s.secretEntrance.state === 'entering') {
      s.update(0, 1000 / fps);
      assert.ok(s.player.y >= previousY && s.player.y - previousY <= 80 / fps + 0.01);
      assert.ok(s.player.crop[3] <= previousCrop);
      if (s.player.crop[3] > 0 && s.player.crop[3] < 54) partialFrames++;
      previousY = s.player.y;
      previousCrop = s.player.crop[3];
    }
    assert.ok(partialFrames > fps / 2, 'many visibly cropped frames before disappearance');
    assert.equal(s.player.visible, false);
    assert.equal(s.player.crop[3], 0);
    assert.equal(s.scene.launched, undefined);
    s.finishFade();
    assert.equal(s.scene.launched.name, 'Underground');
    assert.equal(s.scene.launched.data.owner, s);
    assert.equal(s.scene.paused, true);
  }
});

test('return preserves the actual main-level objects, currencies and power; entry stays used until full create', () => {
  const s = setup();
  const original = {
    coinSystem: { remaining: 12 }, powerUps: [{ state: 'used' }, { state: 'collected' }],
    enemies: { defeated: new Set([1, 3]), timer: { elapsed: 123 } },
    bricks: { broken: [4, 5], secret: { coinsRemaining: 2 } }, surfaces: { getChildren: () => [] },
  };
  Object.assign(s, original);
  s.enemies.update = () => assert.fail('main enemy logic ran during entry');
  enter(s);
  assert.equal(s.secretEntrance.returnToLevel(), true);
  for (const [name, object] of Object.entries(original)) assert.equal(s[name], object, name);
  assert.equal(s.powerUps[0].state, 'used');
  assert.equal(s.enemies.timer.elapsed, 123);
  assert.equal(s.bricks.secret.coinsRemaining, 2);
  assert.equal(s.lives, 4);
  assert.equal(s.coins, 91);
  assert.equal(s.powered, true);
  assert.equal(s.player.x, s.secretEntrance.centerX);
  assert.equal(s.player.body.bottom, WOODLAND_OBSTACLES[0].y);
  assert.equal(s.player.body.enable, true);
  assert.equal(s.player.body.velocity.length(), 0);
  assert.deepEqual(s.player.crop, []);
  assert.equal(s.player.visible, true);
  assert.equal(s.physics.world.isPaused, false);
  assert.equal(s.scene.paused, false);
  s.player.body.blocked.down = true;
  assert.equal(s.secretEntrance.tryEnter(true), false);
  assert.equal(s.secretEntrance.returnToLevel(), false);
  const reset = new SecretEntrance(s, WOODLAND_OBSTACLES[0]);
  assert.equal(reset.tryEnter(true), true, 'a full level rebuild installs a fresh entrance');
});

test('vine exits only on a fresh Up/W press beside it; Space keeps the existing jump', () => {
  for (const key of ['up', 'W', 'SPACE']) {
    const owner = setup();
    enter(owner);
    const s = setup();
    Object.setPrototypeOf(s, Underground.prototype);
    s.owner = owner;
    s.player.setPosition(ROOM.vineX, ROOM.floor - 32);
    s.player.body.updateFromGameObject();
    (s.cursors[key] ?? s.keys[key]).edge = true;
    s.update(0, 16);
    assert.equal(!!s.returning, key !== 'SPACE');
    if (key === 'SPACE') assert.equal(s.player.body.velocity.y, -650);
    else {
      assert.equal(s.player.body.enable, false);
      assert.equal(s.cameras.main.fading, undefined, 'climb precedes the fade');
      s.update(0, EXIT_CLIMB_MS);
      s.finishFade();
      assert.equal(owner.secretEntrance.used, true);
      assert.equal(s.scene.stopped, true);
    }
  }
  const s = setup();
  Object.setPrototypeOf(s, Underground.prototype);
  assert.equal(s.tryExit(true), false, 'away from the vine');
  s.player.body.center.x = ROOM.vineX;
  assert.equal(s.tryExit(false), false, 'holding Up alone is not a new press');
});

test('vine climbs briefly with existing poses, ignores controls and collisions, and exits exactly once at 30/60/120 FPS', () => {
  assert.ok(EXIT_CLIMB_MS >= 500 && EXIT_CLIMB_MS <= 800);
  for (const fps of [30, 60, 120]) {
    for (const startY of [ROOM.floor - 32, ROOM.ceiling + 32]) {
      const owner = setup();
      enter(owner);
      const s = setup();
      Object.setPrototypeOf(s, Underground.prototype);
      s.owner = owner;
      s.player.setPosition(ROOM.vineX - 24, startY);
      s.player.body.updateFromGameObject();
      s.shiftKeys.add('ShiftLeft');
      assert.equal(s.tryExit(true), true);
      assert.equal(s.player.x, ROOM.vineX);
      assert.equal(s.player.body.velocity.length(), 0);
      assert.equal(s.shiftKeys.size, 0);
      assert.equal(s.physics.world.isPaused, true);
      const climbStart = s.player.y;
      const frames = new Set();
      let elapsed = 0, previousY = climbStart;
      s.readMovementInput = () => assert.fail('normal controls read during climb or transition');
      s.updatePlayerBody = () => assert.fail('normal hitbox update during climb');
      while (!s.exitTransition) {
        assert.equal(s.tryExit(true), false, 'repeated exit triggers are ignored');
        s.update(elapsed, 1000 / fps);
        elapsed += 1000 / fps;
        frames.add(s.player.frame);
        assert.ok(s.player.y <= previousY);
        assert.ok(previousY - s.player.y <= EXIT_CLIMB_RISE * 1000 / fps / EXIT_CLIMB_MS + 0.001);
        assert.equal(s.player.body.enable, false);
        assert.ok(s.player.y - s.player.height / 2 >= ROOM.ceiling);
        if (s.exitElapsed < EXIT_CLIMB_MS) assert.equal(s.cameras.main.fading, undefined);
        assert.equal(owner.secretEntrance.state, 'inside');
        previousY = s.player.y;
      }
      assert.ok(elapsed >= EXIT_CLIMB_MS && elapsed < EXIT_CLIMB_MS + 1000 / fps + 0.01);
      assert.equal(climbStart - s.player.y, EXIT_CLIMB_RISE);
      assert.deepEqual([...frames].sort(), ['walk-1', 'walk-2']);
      for (let i = 0; i < 10; i++) s.update(1000, 100);
      assert.equal(s.cameras.main.fadeCount, 1);
      let returns = 0;
      const originalReturn = owner.secretEntrance.returnToLevel.bind(owner.secretEntrance);
      owner.secretEntrance.returnToLevel = () => { returns++; return originalReturn(); };
      s.finishFade();
      assert.equal(returns, 1);
      assert.equal(owner.player.body.bottom, WOODLAND_OBSTACLES[0].y);
      assert.equal(owner.secretEntrance.used, true);
      assert.equal(s.scene.stopped, true);
      assert.equal(s.tryExit(true), false);
    }
  }
});

test('exactly 15 room coins use the existing HUD and life rollover; ledger prevents repeat awards', () => {
  const owner = setup();
  const room = new Underground();
  room.init({ owner });
  const text = () => ({ setText(value) { this.value = value; } });
  room.coinsText = text();
  room.livesText = text();
  const items = [];
  room.textures = { exists: () => true };
  room.events = { once() {} };
  room.physics = { add: {
    group: () => ({ create(x, y) {
      const coin = { x, y, active: true, body: { enable: true, setSize() { return this; }, setOffset() {} },
        setDepth() { return this; }, play() {}, destroy() { this.active = false; } };
      items.push(coin);
      return coin;
    } }), overlap: () => ({}),
  } };
  const system = new CoinSystem(room, {}, ROOM_COINS, owner.secretEntrance.collected);
  assert.equal(items.length, 15);
  for (const coin of items) { system.collect(coin); system.collect(coin); }
  assert.equal(owner.coins, 6);
  assert.equal(owner.lives, 5);
  assert.equal(room.coinsText.value, 'x06');
  assert.equal(room.livesText.value, 'VIDAS × 5');
  assert.equal(owner.secretEntrance.collected.size, 15);
  new CoinSystem(room, {}, ROOM_COINS, owner.secretEntrance.collected);
  assert.equal(items.length, 15, 'even recreating the room cannot spawn collected coins');
  enter(owner);
  owner.secretEntrance.returnToLevel();
  assert.equal(owner.coins, 6, 'return keeps the currency earned below');
  assert.equal(owner.lives, 5, 'return keeps the extra life earned below');
  assert.equal(owner.secretEntrance.collected.size, 15);
});

test('vine art uses crisp pixels, a winding stem, staggered pointed leaves and wall roots', () => {
  const pixels = [];
  const c = { fillRect(x, y, w, h) { pixels.push([this.fillStyle, x, y, w, h]); } };
  makeUndergroundArt({
    textures: { exists: () => false, createCanvas: () => ({ context: c, refresh() {} }) },
    add: { image: () => ({ setOrigin() { return this; }, setScale() { return this; } }) },
  });
  assert.equal(c.imageSmoothingEnabled, false);
  const plant = pixels.filter(([color]) => ['#203e25', '#59883b', '#97bd55', '#497b35', '#384c29', '#59603a'].includes(color));
  assert.ok(plant.length > 300);
  const stem = plant.filter(([color, , , w, h]) => color === '#203e25' && w === 3 && h === 1);
  assert.equal(stem.length, 141);
  assert.ok(new Set(stem.map(([, x]) => x)).size >= 5);
  const leaves = plant.filter(([color]) => color === '#497b35');
  assert.ok(leaves.some(([, x]) => x < ROOM.vineX / 2 - 5));
  assert.ok(leaves.some(([, x]) => x > ROOM.vineX / 2 + 4));
  assert.ok(new Set(leaves.map(([, , , , h]) => h)).size >= 3, 'tapered leaf silhouettes');
  assert.ok(plant.some(([color]) => color === '#384c29'), 'wall anchoring roots');
  for (const [color, x, y, w, h] of plant) {
    assert.match(color, /^#[0-9a-f]{6}$/);
    assert.ok([x, y, w, h].every(Number.isInteger));
    assert.ok(x >= 0 && x + w <= ROOM.width / 2 && y >= 0 && y + h <= ROOM.height / 2);
  }
});

function roomSolids(s) {
  return ROOM_SURFACES.map(({ x, y, width, height }) => {
    const body = new StaticBody(s.physics.world);
    body.setSize(width, height, false);
    body.x = x;
    body.y = y;
    const object = { body };
    body.gameObject = object;
    return object;
  });
}

test('all 15 coins are reachable with the unchanged normal jump and real Arcade collisions at 30/60/120 FPS', () => {
  assert.equal(ROOM_COINS.length, 15);
  for (const fps of [30, 60, 120]) {
    for (const [x, y] of ROOM_COINS) {
      const s = setup();
      const solids = roomSolids(s);
      s.player.setPosition(x, ROOM.floor - 32);
      s.player.body.updateFromGameObject();
      s.player.body.velocity.y = -650;
      let reached = false;
      for (let i = 0; i < fps; i++) {
        s.player.body.preUpdate(true, 1 / fps);
        for (const solid of solids) s.physics.world.collide(s.player, solid);
        const b = s.player.body;
        if (b.x < x + 10 && b.right > x - 10 && b.y < y + 11 && b.bottom > y - 11) reached = true;
        s.player.body.postUpdate();
      }
      assert.equal(reached, true, `coin ${x},${y} at ${fps} FPS`);
    }
  }
});

test('earthen walls, ceiling and floor contain the unchanged player at maximum movement speeds', () => {
  for (const fps of [30, 60, 120]) {
    for (const [vx, vy] of [[-400, 0], [400, 0], [0, -760], [0, 760]]) {
      const s = setup();
      const solids = roomSolids(s);
      s.player.setPosition(ROOM.width / 2, 250);
      s.player.body.updateFromGameObject();
      s.player.setVelocity(vx, vy);
      for (let i = 0; i < fps * 2; i++) {
        s.player.body.preUpdate(true, 1 / fps);
        for (const solid of solids) s.physics.world.collide(s.player, solid);
        const b = s.player.body;
        assert.ok(b.x >= ROOM.wall && b.right <= ROOM.width - ROOM.wall);
        assert.ok(b.y >= ROOM.ceiling && b.bottom <= ROOM.floor);
        s.player.body.postUpdate();
      }
    }
  }
});
