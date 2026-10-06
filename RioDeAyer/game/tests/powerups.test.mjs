import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/powerups.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')
  + '\nglobalThis.api = { PowerUpSystem, isHitFromBelow };', context);
const { PowerUpSystem, isHitFromBelow } = context.api;

function setup() {
  const events = [];
  const mushroom = {
    x: 560, y: 520, width: 26, height: 25, direction: 1,
    body: {
      enable: false, allowGravity: true, blocked: {}, top: 460, right: 574, x: 546,
      reset(x, y) { this.resetAt = { x, y }; },
      setAllowGravity(value) { this.allowGravity = value; },
    },
    setVisible(value) { this.visible = value; },
    setCrop(x, y, width, height) { this.crop = x === undefined ? null : { x, y, width, height }; },
    setVelocity(x, y) { this.velocity = { x, y }; },
    setVelocityX(value) { this.speed = value; },
    setFlipX(value) { this.flipX = value; },
    play(value) { this.animation = value; },
    destroy() { this.destroyed = true; },
  };
  const system = Object.assign(Object.create(PowerUpSystem.prototype), {
    state: 'ready', elapsed: 0, baseY: 520, mushroom,
    block: { y: 520, height: 32, setFrame(value) { this.frame = value; } },
    scene: {
      dead: false,
      physics: { world: { bounds: { bottom: 720, left: 0, right: 4480 } } },
      events: { emit(name, payload) { events.push({ name, payload }); } },
    },
  });
  return { system, mushroom, events };
}

test('block activates only for an upward hit crossing its underside with hitbox overlap', () => {
  const block = { x: 538, right: 582, bottom: 532 };
  const player = { prev: { x: 544, y: 537 }, x: 544, y: 526,
    width: 32, velocity: { y: -500 } };
  assert.equal(isHitFromBelow(player, block), true);
  player.velocity.y = 500;
  assert.equal(isHitFromBelow(player, block), false);
  player.velocity.y = -500;
  player.prev.y = 520; // Entering from a side, already higher than the underside.
  assert.equal(isHitFromBelow(player, block), false);
  player.prev.y = 537;
  player.prev.x = 480;
  player.x = 507; // Side overlap happens only after crossing the underside.
  assert.equal(isHitFromBelow(player, block), false);
});

test('one activation bumps once, uses the final frame and emerges slowly without physics', () => {
  const { system, mushroom } = setup();
  system.activate();
  assert.equal(system.state, 'emerging');
  assert.equal(mushroom.visible, true);
  assert.equal(mushroom.crop.height, 0);
  assert.equal(mushroom.body.enable, false);
  assert.equal(mushroom.body.allowGravity, false);
  assert.equal(mushroom.velocity.x, 0);
  assert.equal(mushroom.velocity.y, 0);
  system.update(100);
  assert.ok(system.block.y < 520);
  // The revealed tip ends exactly at the visible block edge, including its bump.
  const visibleTop = system.block.y - system.block.height;
  assert.ok(Math.abs(mushroom.y - mushroom.height + mushroom.crop.height - visibleTop) < 1e-8);
  system.activate();
  assert.equal(system.elapsed, 100); // Repeated hits cannot start another emergence.
  system.update(200);
  assert.equal(system.block.y, 520);
  assert.equal(system.block.frame, 4);
  assert.equal(mushroom.body.enable, false);
  system.update(800);
  assert.equal(system.state, 'walking');
  assert.equal(mushroom.y, 488);
  assert.equal(mushroom.body.resetAt.y, 488);
  assert.equal(mushroom.crop, null);
  assert.equal(mushroom.body.enable, true);
  assert.equal(mushroom.body.allowGravity, true);
  assert.equal(mushroom.speed, 90);
  system.activate();
  assert.equal(system.state, 'walking');
});

test('moving mushroom reverses at solid walls and keeps gravity when leaving a platform', () => {
  const { system, mushroom } = setup();
  system.activate();
  system.update(1100);
  mushroom.body.blocked = { right: true, down: true };
  system.update(16);
  assert.equal(mushroom.speed, -90);
  mushroom.body.blocked = { left: true };
  system.update(16);
  assert.equal(mushroom.speed, 90);
  assert.equal(mushroom.body.allowGravity, true);
  mushroom.body.blocked = {};
  system.update(16);
  assert.equal(mushroom.speed, 90);
  assert.equal(mushroom.body.allowGravity, true);
});

test('collection only after emergence, once, and without granting any player ability', () => {
  const { system, mushroom, events } = setup();
  system.activate();
  system.collect();
  assert.equal(mushroom.destroyed, undefined);
  system.update(1100);
  system.scene.dead = true;
  system.collect();
  assert.equal(events.length, 0);
  system.scene.dead = false;
  system.collect();
  system.collect();
  system.update(16);
  assert.equal(system.collected, true);
  assert.equal(mushroom.destroyed, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'powerup-collected');
});

test('empty question blocks bump once and become used without releasing a mushroom', () => {
  const { system } = setup();
  system.hasMushroom = false;
  system.mushroom = null;
  system.activate();
  assert.equal(system.state, 'bumping');
  system.update(100);
  assert.ok(system.block.y < 520);
  system.activate();
  assert.equal(system.elapsed, 100);
  system.update(200);
  assert.equal(system.state, 'used');
  assert.equal(system.block.frame, 4);
  assert.equal(system.block.y, 520);
  system.activate();
  system.update(1100);
  assert.equal(system.state, 'used');
  assert.equal(system.mushroom, null);
});
