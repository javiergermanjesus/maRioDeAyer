import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const context = vm.createContext({ Phaser: {
  Scene: class {},
  Input: { Keyboard: { JustDown(key) {
    const pressed = key.edge;
    key.edge = false;
    return pressed;
  } } },
} });
vm.runInContext(readFileSync(new URL('../src/secret-room.js', import.meta.url), 'utf8')
  .replace(/export /g, ''), context);
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').split('new Phaser.Game(')[0]
  + '\nglobalThis.Playground = Playground;', context);

test('death locks all controls, bypasses floor reset, and restarts only once after 1.3s', () => {
  const scene = new context.Playground();
  let resets = 0;
  let enemyUpdates = 0;
  let restarts = 0;
  const timers = [];
  scene.input = { keyboard: { resetKeys() { resets++; } } };
  scene.player = {
    y: 900, body: { velocity: { x: 460, y: 0 } },
    setCollideWorldBounds(value) { this.collideWorldBounds = value; },
    setVelocity(x, y) { this.body.velocity = { x, y }; },
    setVelocityX(x) { this.body.velocity.x = x; },
    anims: { stop() {} }, setFrame(value) { this.frame = value; },
  };
  scene.playerTerrainCollider = { active: true };
  scene.enemies = { playerOverlap: { active: true }, update() { enemyUpdates++; } };
  scene.time = { delayedCall(delay, callback) { timers.push({ delay, callback }); } };
  scene.scene = { restart() { restarts++; } };
  scene.readMovementInput = () => { throw new Error('Controls read while dead'); };
  scene.updateMovement = () => { throw new Error('Movement updated while dead'); };
  scene.updatePlayerAnimation = () => { throw new Error('Death pose overwritten'); };
  scene.shiftKeys.add('ShiftLeft');
  scene.die();
  assert.equal(scene.lives, 2);
  assert.equal(scene.dead, true);
  assert.equal(scene.movementState, 'dead');
  assert.equal(scene.player.body.velocity.x, 0);
  assert.equal(scene.player.body.velocity.y, -420);
  assert.equal(scene.player.frame, 'jump');
  assert.equal(scene.player.collideWorldBounds, false);
  assert.equal(scene.playerTerrainCollider.active, false);
  assert.equal(scene.enemies.playerOverlap.active, false);
  assert.equal(scene.shiftKeys.size, 0);
  scene.die();
  assert.equal(scene.lives, 2);
  assert.equal(resets, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 1300);
  scene.onShiftDown({ code: 'ShiftLeft' });
  assert.equal(scene.shiftKeys.size, 0);
  scene.update(0, 16);
  assert.equal(enemyUpdates, 1);
  scene.stopMovement(); // Blur must preserve the death state and vertical impulse.
  assert.equal(scene.movementState, 'dead');
  assert.equal(scene.player.body.velocity.y, -420);
  assert.equal(restarts, 0);
  timers[0].callback();
  assert.equal(restarts, 1);
});

test('three deaths preserve lives across full restarts, then Game Over permits a fresh game', () => {
  const scene = new context.Playground();
  const timers = [];
  const restarts = [];
  let paused = false;
  scene.input = { keyboard: { resetKeys() {} } };
  scene.player = {
    body: { velocity: { y: 600 } },
    setCollideWorldBounds() {}, setVelocity(x, y) { this.body.velocity = { x, y }; },
    setFrame() {}, anims: { stop() {} },
  };
  scene.playerTerrainCollider = { active: true };
  scene.enemies = { playerOverlap: { active: true } };
  scene.livesText = { setText(text) { this.text = text; } };
  scene.gameOverObjects = [{ setVisible(value) { this.visible = value; } }];
  scene.physics = { world: { pause() { paused = true; } } };
  scene.time = { delayedCall(delay, callback) { timers.push(callback); } };
  scene.scene = { restart(data) { restarts.push(data); } };
  scene.init();
  assert.equal(scene.lives, 3);
  for (const remaining of [2, 1, 0]) {
    scene.dead = false; // create() clears the death state in the next attempt.
    scene.die(remaining === 1 ? 'fall' : 'enemy');
    scene.die();
    assert.equal(scene.lives, remaining);
    assert.equal(scene.livesText.text, `VIDAS × ${remaining}`);
    timers.at(-1)();
    if (remaining > 0) {
      assert.equal(restarts.at(-1).lives, remaining);
      scene.init(restarts.at(-1));
      assert.equal(scene.lives, remaining);
    }
  }
  assert.equal(restarts.length, 2);
  assert.equal(scene.gameOver, true);
  assert.equal(paused, true);
  assert.equal(scene.gameOverObjects[0].visible, true);
  scene.startNewGame();
  scene.startNewGame();
  assert.equal(restarts.length, 3);
  assert.equal(restarts.at(-1).lives, 3);
  scene.init(restarts.at(-1));
  assert.equal(scene.lives, 3);
});

test('fall routes through the same death flow and preserves downward motion', () => {
  const scene = new context.Playground();
  let callback;
  let restartLives;
  scene.input = { keyboard: { resetKeys() {} } };
  scene.player = {
    y: 677, body: { velocity: { y: 650 } },
    setCollideWorldBounds() {}, setVelocity(x, y) { this.body.velocity = { x, y }; },
    setFrame() {}, anims: { stop() {} },
  };
  scene.playerTerrainCollider = { active: true };
  scene.enemies = { playerOverlap: { active: true } };
  scene.time = { delayedCall(delay, fn) { callback = fn; } };
  scene.scene = { restart(data) { restartLives = data.lives; } };
  scene.readMovementInput = () => { throw new Error('Controls read after fatal fall'); };
  scene.update(0, 16);
  assert.equal(scene.dead, true);
  assert.equal(scene.lives, 2);
  assert.equal(scene.player.body.velocity.y, 650);
  callback();
  assert.equal(restartLives, 2);
});

test('Game Over accepts a fresh Enter or Space edge and ignores held keys', () => {
  for (const key of ['ENTER', 'SPACE']) {
    const scene = new context.Playground();
    scene.keys = { ENTER: { edge: false }, SPACE: { edge: false } };
    scene.dead = scene.gameOver = true;
    scene.input = { keyboard: { resetKeys() {} } };
    let restarts = 0;
    scene.scene = { restart(data) { assert.equal(data.lives, 3); restarts++; } };
    scene.update(0, 16);
    assert.equal(restarts, 0);
    scene.keys[key].edge = true;
    scene.update(0, 16);
    assert.equal(restarts, 1);
    assert.equal(scene.gameOver, false);
  }
});

test('create rebuilds nine hongos, four walking turtles and fifteen unused blocks', () => {
  const collisionOrder = [];
  context.BrickSystem = class {
    constructor() { this.group = {}; this.remaining = 31; }
  };
  context.CoinSystem = class {
    constructor() { this.remaining = 41; }
  };
  context.Phaser.Core = { Events: { BLUR: 'blur' } };
  context.Phaser.Scenes = { Events: { SHUTDOWN: 'shutdown', PRE_RENDER: 'prerender' } };
  context.EnemySystem = class {
    constructor() { this.spawns = []; collisionOrder.push('enemy-overlap'); }
    spawnHongo(x, y) { this.spawns.push({ x, y, enemyState: 'walking' }); }
    spawnTortuga(x, y, direction = -1) {
      this.spawns.push({ x, y, direction, enemyType: 'tortuga', enemyState: 'walking' });
    }
  };
  context.PowerUpSystem = class {
    constructor(scene, player, surfaces, x, topY, hasMushroom) {
      Object.assign(this, { state: 'ready', x, topY, hasMushroom, colliders: [], solid: {} });
      this.mushroom = hasMushroom ? {} : null;
    }
  };
  const scene = new context.Playground();
  const events = { on() {}, once() {}, off() {} };
  const camera = () => ({ setBounds() {}, setZoom() {}, startFollow() {}, setDeadzone() {},
    setScroll() {}, ignore() {} });
  scene.makeScenery = () => [];
  scene.makePlayerTexture = scene.makeHud = () => {};
  scene.children = { list: [] };
  scene.add = { rectangle: () => ({ setVisible() { return this; } }) };
  scene.physics = {
    world: { setBounds() {} },
    add: {
      staticGroup: () => ({ add() {} }), collider: () => {
        collisionOrder.push('solid'); return { active: true };
      },
      sprite(x, y) {
        return { x, y, body: { setSize() { return this; }, setOffset() { return this; } },
          setCollideWorldBounds() { return this; }, setBounce() { return this; } };
      },
    },
  };
  scene.cameras = { main: camera(), cameras: [], add: camera };
  scene.input = { keyboard: { createCursorKeys: () => ({}), addKeys: () => ({}),
    resetKeys() {}, on() {}, off() {}, addCapture() {} } };
  scene.game = { events };
  scene.events = events;
  scene.init();
  scene.create();
  assert.ok(collisionOrder.lastIndexOf('solid') < collisionOrder.indexOf('enemy-overlap'),
    'enemy overlap is registered after every solid collider');
  const oldPlayer = scene.player;
  const oldEnemies = scene.enemies;
  const oldBlocks = scene.powerUps;
  const oldCoins = scene.coinSystem;
  const oldBricks = scene.bricks;
  const oldEntrance = scene.secretEntrance;
  oldEntrance.used = true;
  oldEntrance.collected.add(0);
  oldBricks.remaining = 0;
  scene.collectPowerUp({ type: 'white-mushroom' });
  assert.equal(scene.powered, true);
  oldCoins.remaining = 0;
  oldEnemies.spawns[0].enemyState = 'flat';
  oldEnemies.spawns[6].enemyState = 'sliding';
  oldEnemies.spawns[7].enemyState = 'shell';
  oldBlocks[0].state = 'collected';
  oldBlocks[1].state = 'used';
  scene.dead = true;
  scene.init({ lives: 2, coins: 47 });
  scene.create();
  assert.notEqual(scene.secretEntrance, oldEntrance);
  assert.equal(scene.secretEntrance.used, false);
  assert.equal(scene.secretEntrance.collected.size, 0);
  assert.equal(scene.lives, 2);
  assert.equal(scene.coins, 47);
  assert.notEqual(scene.coinSystem, oldCoins);
  assert.equal(scene.coinSystem.remaining, 41);
  assert.equal(scene.dead, false);
  assert.equal(scene.powered, false);
  assert.notEqual(scene.bricks, oldBricks);
  assert.equal(scene.bricks.remaining, 31);
  assert.notEqual(scene.player, oldPlayer);
  assert.equal(scene.player.x, 378);
  assert.equal(scene.player.y, 608);
  assert.notEqual(scene.enemies, oldEnemies);
  assert.equal(scene.enemies.spawns.length, 13);
  assert.deepEqual(Array.from(scene.enemies.spawns.filter(e => e.enemyType === 'tortuga'), e => e.x),
    [2830, 3280, 5460, 6320]);
  assert.equal(scene.enemies.spawns[6].direction, -1);
  assert.equal(scene.enemies.spawns[7].direction, 1);
  assert.ok(scene.enemies.spawns.every(enemy => enemy.enemyState === 'walking'));
  assert.equal(scene.enemies.spawns[0].x, 1140);
  assert.equal(scene.powerUps.length, 15);
  assert.ok(scene.powerUps.every((block, i) => block !== oldBlocks[i] && block.state === 'ready'));
  assert.equal(scene.powerUps.filter(block => block.hasMushroom).length, 2);
  assert.equal(scene.powerUps[0].x, 560);
});
