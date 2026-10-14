import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')
  + '\nglobalThis.api = { EnemySystem, isStomp };', context);
const { EnemySystem, isStomp } = context.api;

function turtleSetup(state = 'walking') {
  const result = setup();
  const { enemy, player } = result;
  enemy.active = true;
  enemy.enemyType = 'tortuga';
  enemy.enemyState = state;
  enemy.body.y = 602;
  enemy.body.right = 136;
  enemy.body.center = { x: 118 };
  enemy.body.height = (state === 'walking' ? 96 : 84) * 0.32;
  enemy.body.prevFrame = { x: 100, y: 602 };
  enemy.body.updateCenter = () => {};
  enemy.body.setSize = function(w, h) {
    enemy.hitbox = { w, h }; this.height = h * 0.32; return this;
  };
  enemy.body.setOffset = function(x, y) { enemy.offset = { x, y }; return this; };
  enemy.body.updateFromGameObject = () => {};
  enemy.play = key => { enemy.animation = key; };
  player.body.y = 546;
  player.body.bottom = 610;
  player.body.right = 132;
  player.body.center = { x: 116 };
  return result;
}

test('turtle stomp hides, waits five seconds, warns, then walks with a larger body', () => {
  const { system, enemy, timers, impacts, player } = turtleSetup();
  system.touchPlayer(enemy);
  assert.equal(enemy.enemyState, 'hiding');
  assert.equal(enemy.animation, 'tortuga-hide');
  assert.equal(player.body.velocity.y, -360);
  assert.equal(enemy.body.enable, true);
  assert.equal(enemy.hitbox.w, 108);
  system.touchPlayer(enemy); // The rebound cannot immediately kick the shell.
  assert.equal(enemy.enemyState, 'hiding');
  timers[0].callback();
  assert.equal(enemy.frame, 7);
  assert.equal(timers[1].delay, 5000);
  timers[1].callback();
  assert.equal(enemy.animation, 'tortuga-emerge');
  timers[2].callback();
  assert.equal(enemy.enemyState, 'walking');
  assert.equal(enemy.hitbox.w, 148);
  assert.equal(impacts.length, 0);
});

test('side kicks go away from the player, cancel emergence and ignore lingering kick contact', () => {
  for (const [x, direction] of [[90, 1], [140, -1]]) {
    const { system, enemy, player, impacts } = turtleSetup('emerging');
    let canceled = false;
    enemy.stateTimer = { remove() { canceled = true; } };
    player.body.prev.y = 580;
    player.body.center.x = x;
    system.touchPlayer(enemy);
    assert.equal(canceled, true);
    assert.equal(enemy.enemyState, 'sliding');
    assert.equal(enemy.speed, direction * 330);
    system.touchPlayer(enemy);
    assert.equal(impacts.length, 0);
    player.body.x = 300;
    player.body.right = 332;
    system.update();
    assert.equal(enemy.kickContact, false);
    system.touchPlayer(enemy);
    assert.equal(impacts.length, 1);
  }
});

test('stomping a sliding shell stops it; walking and sliding side contacts damage', () => {
  const { system, enemy, player } = turtleSetup('sliding');
  system.touchPlayer(enemy);
  assert.equal(enemy.enemyState, 'shell');
  assert.equal(enemy.speed, 0);
  assert.equal(player.body.velocity.y, -360);
  for (const state of ['walking', 'sliding']) {
    const result = turtleSetup(state);
    result.player.body.prev.y = 580;
    result.system.touchPlayer(result.enemy);
    assert.equal(result.impacts.length, 1);
  }
});

test('one walking stomp rebounds once; a separated landing kicks the shell without another bounce', () => {
  const { system, enemy, player, timers, impacts } = turtleSetup();
  system.touchPlayer(enemy);
  assert.equal(enemy.enemyState, 'hiding');
  assert.equal(player.body.velocity.y, -360);
  const hideTimer = timers[0];
  // Even if gravity is descending again, an uninterrupted overlap must not
  // restart the state timer, rebound, or kick on every physics frame.
  player.body.velocity.y = 25;
  for (let frame = 0; frame < 60; frame++) {
    system.update();
    system.touchPlayer(enemy);
    assert.equal(enemy.enemyState, 'hiding');
    assert.equal(player.body.velocity.y, 25);
    assert.equal(timers.length, 1);
  }
  player.body.bottom = enemy.body.y - 1;
  system.update();
  assert.equal(enemy.kickContact, false);
  hideTimer.callback();
  player.body.bottom = enemy.body.y + 3;
  player.body.velocity.y = 400;
  system.touchPlayer(enemy);
  assert.equal(enemy.enemyState, 'sliding');
  assert.equal(enemy.speed, 330);
  assert.equal(player.body.velocity.y, 400, 'stationary shells do not apply rebound');
  const timerCount = timers.length;
  for (let frame = 0; frame < 30; frame++) {
    system.update();
    system.touchPlayer(enemy);
    assert.equal(enemy.enemyState, 'sliding');
    assert.equal(timers.length, timerCount);
    assert.equal(player.body.velocity.y, 400);
  }
  assert.equal(impacts.length, 0);
});

test('a new top contact kicks hiding, stationary and emerging shells in either direction', () => {
  for (const state of ['hiding', 'shell', 'emerging']) {
    for (const [x, direction] of [[90, 1], [140, -1]]) {
      const { system, enemy, player, timers } = turtleSetup(state);
      player.body.center.x = x;
      system.touchPlayer(enemy);
      assert.equal(enemy.enemyState, 'sliding');
      assert.equal(enemy.speed, direction * 330);
      assert.equal(player.body.velocity.y, 400);
      assert.equal(timers.length, 0, 'kick does not start another emergence timer');
    }
  }
});

test('sliding shells eliminate hongos and turtles and simultaneous shells defeat each other', () => {
  for (const state of ['walking', 'shell', 'sliding']) {
    const { system, enemy: shell } = turtleSetup('sliding');
    const { enemy: target } = state === 'walking' ? setup() : turtleSetup(state);
    system.touchEnemies(shell, target);
    assert.equal(target.enemyState, 'defeated');
    assert.equal(target.body.enable, false);
    assert.equal(shell.enemyState, state === 'sliding' ? 'defeated' : 'sliding');
  }
});

test('walking turtles turn at platform edges and walls; shells bounce at walls but leave edges', () => {
  const { system, enemy } = turtleSetup();
  system.surfaces = { getChildren: () => [{ body: { enable: true, x: 100, right: 140, y: 640 } }] };
  enemy.body.blocked.down = true;
  system.update(); // No support to the left of the body.
  assert.equal(enemy.direction, 1);
  enemy.body.blocked.right = true;
  system.update();
  assert.equal(enemy.direction, -1);
  enemy.body.blocked = { down: true };
  system.setTurtleState(enemy, 'sliding');
  system.update();
  assert.equal(enemy.speed, -330);
  enemy.body.blocked.left = true;
  system.update();
  assert.equal(enemy.speed, 330);
});

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
  assert.equal(destroyedColliders, 3);
  assert.doesNotThrow(() => cleanup());
  assert.equal(destroyedColliders, 3);
});
