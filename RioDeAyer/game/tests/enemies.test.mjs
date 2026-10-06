import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')
  + '\nglobalThis.api = { EnemySystem, isStomp };', context);
const { EnemySystem, isStomp } = context.api;

function setup() {
  const impacts = [];
  const timers = [];
  const enemy = {
    enemyState: 'walking', direction: -1,
    body: { prev: { x: 100, y: 602 }, x: 100, y: 602, width: 36,
      velocity: { y: 0 }, blocked: {}, bottom: 640, enable: true },
    anims: { stop() {} },
    setFrame(frame) { this.frame = frame; },
    setVelocity(x, y) { this.velocity = { x, y }; },
    setVelocityX(x) { this.speed = x; },
    setFlipX(value) { this.flip = value; },
    destroy() { this.destroyed = true; },
  };
  const player = {
    body: { prev: { x: 100, y: 530 }, x: 100, bottom: 605,
      width: 32, height: 64, velocity: { y: 400 } },
    setVelocityY(y) { this.body.velocity.y = y; },
  };
  const system = Object.assign(Object.create(EnemySystem.prototype), {
    player, contacts: new Set(), previousContacts: new Set(),
    group: { getChildren: () => [enemy] },
    scene: {
      physics: { world: { bounds: { bottom: 720 } } },
      time: { now: 123, delayedCall(delay, callback) { timers.push({ delay, callback }); } },
      events: { emit(name, payload) { impacts.push({ name, payload }); } },
    },
  });
  return { system, enemy, player, impacts, timers };
}

test('descending from above stomps, disables contact, rebounds and removes after flat pose', () => {
  const { system, enemy, player, timers, impacts } = setup();
  system.touchPlayer(enemy);
  assert.equal(enemy.frame, 'flat');
  assert.equal(enemy.body.enable, false);
  assert.equal(player.body.velocity.y, -360);
  assert.equal(timers[0].delay, 450);
  assert.equal(enemy.destroyed, undefined);
  system.touchPlayer(enemy);
  assert.equal(timers.length, 1);
  assert.equal(impacts.length, 0);
  timers[0].callback();
  assert.equal(enemy.destroyed, true);
});

test('side, below and ascending contacts detect impact without changing player velocity', () => {
  for (const [y, velocity] of [[580, 400], [630, -400], [530, -400]]) {
    const { system, enemy, player, impacts, timers } = setup();
    player.body.prev.y = y;
    player.body.velocity.y = velocity;
    system.touchPlayer(enemy);
    system.update();
    system.touchPlayer(enemy);
    assert.equal(impacts.length, 1);
    assert.equal(impacts[0].name, 'enemy-impact');
    assert.equal(player.body.velocity.y, velocity);
    assert.equal(enemy.enemyState, 'walking');
    assert.equal(timers.length, 0);
    system.update();
    system.update(); // A step without contact allows a new impact.
    system.touchPlayer(enemy);
    assert.equal(impacts.length, 2);
  }
});

test('an enemy falling faster than the player cannot be stomped', () => {
  const { enemy, player } = setup();
  enemy.body.velocity.y = 500;
  assert.equal(isStomp(player.body, enemy.body), false);
});

test('falling into a side after passing the top is not a stomp', () => {
  const { enemy, player } = setup();
  player.body.prev.x = 45;
  player.body.x = 75; // Horizontal overlap now, but none when the feet crossed the top.
  assert.equal(isStomp(player.body, enemy.body), false);
  player.body.prev.x = 100;
  player.body.prev.y = 539; // Feet were already below the top.
  assert.equal(isStomp(player.body, enemy.body), false);
});

test('no stomp before the feet reach the top; dead players cause no further contact', () => {
  const { system, enemy, player, impacts, timers } = setup();
  player.body.bottom = 600;
  assert.equal(isStomp(player.body, enemy.body), false);
  system.scene.dead = true;
  system.touchPlayer(enemy);
  assert.equal(impacts.length, 0);
  assert.equal(timers.length, 0);
  assert.equal(enemy.enemyState, 'walking');
});

test('solid walls reverse slow walking and falling out removes the enemy', () => {
  const { system, enemy } = setup();
  enemy.body.blocked.left = true;
  system.update();
  assert.equal(enemy.speed, 55);
  enemy.body.blocked = { right: true };
  system.update();
  assert.equal(enemy.speed, -55);
  enemy.body.bottom = 720;
  system.update();
  assert.equal(enemy.destroyed, true);
});

test('scene shutdown tolerates an enemy group already destroyed by Phaser', () => {
  let cleanup;
  let destroyedColliders = 0;
  const group = {
    scene: undefined,
    getChildren() { throw new Error('Phaser already destroyed group.children'); },
  };
  const collider = () => ({ world: {}, destroy() { destroyedColliders++; this.world = null; } });
  const scene = {
    textures: { exists: () => true },
    physics: { add: { group: () => group, collider, overlap: collider } },
    events: { once(event, callback) { assert.equal(event, 'shutdown'); cleanup = callback; } },
  };
  new EnemySystem(scene, {}, {});
  assert.doesNotThrow(() => cleanup());
  assert.equal(destroyedColliders, 2);
  assert.doesNotThrow(() => cleanup());
  assert.equal(destroyedColliders, 2);
});
