import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// Exercise the scene's actual input/state logic without needing a browser renderer.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const context = vm.createContext({ Phaser: {
  Scene: class {},
  Input: { Keyboard: { JustDown(key) {
    const pressed = key.edge;
    key.edge = false;
    return pressed;
  } } },
} });
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').split('new Phaser.Game(')[0]
  + '\nglobalThis.Playground = Playground;', context);

function setup() {
  const scene = new context.Playground();
  const key = () => ({ isDown: false, edge: false });
  scene.cursors = { left: key(), right: key(), up: key(), down: key() };
  scene.keys = { A: key(), D: key(), W: key(), S: key(), SPACE: key() };
  const player = scene.player = {
    body: { velocity: { x: 0, y: 0 }, blocked: { down: true } },
    setVelocityX(x) { this.body.velocity.x = x; },
    setVelocityY(y) { this.body.velocity.y = y; },
    setFlipX(flip) { this.flipX = flip; },
    setFrame(frame) { this.frame = frame; },
    play(animation) { this.animation = animation; },
    anims: { stop() { player.animation = null; } },
  };
  scene.input = { keyboard: { resetKeys() {
    for (const k of [...Object.values(scene.keys), ...Object.values(scene.cursors)]) {
      k.isDown = false;
      k.edge = false;
    }
  } } };
  scene.tick = (frames = 1, delta = 1000 / 60) => {
    for (let i = 0; i < frames; i++) scene.update(0, delta);
  };
  return scene;
}

test('walk, gradual run, max speed, braking and both physical Shift keys', () => {
  for (const code of ['ShiftLeft', 'ShiftRight']) {
    const s = setup();
    s.keys.D.isDown = true;
    s.tick();
    assert.equal(s.player.body.velocity.x, 280);
    assert.equal(s.movementState, 'walk');
    s.onShiftDown({ code });
    s.tick();
    assert.ok(s.player.body.velocity.x > 280 && s.player.body.velocity.x < 460);
    s.tick(60);
    assert.equal(s.player.body.velocity.x, 460);
    assert.equal(s.player.animation, 'mario-run');
    s.keys.D.isDown = false;
    s.tick();
    assert.ok(s.player.body.velocity.x > 0 && s.player.body.velocity.x < 460);
    s.tick(120);
    assert.equal(s.player.body.velocity.x, 0);
    assert.equal(s.movementState, 'idle');
  }
  const s = setup();
  s.onShiftDown({ code: 'ShiftLeft' });
  s.onShiftDown({ code: 'ShiftRight' });
  s.onShiftUp({ code: 'ShiftLeft' });
  assert.equal(s.readMovementInput().run, true);
  s.onShiftUp({ code: 'ShiftRight' });
  assert.equal(s.readMovementInput().run, false);
});

test('slide locks direction and jump, decelerates to crouch, and consumes jump edges', () => {
  for (const direction of [-1, 1]) {
    for (const input of ['down', 'S']) {
      const s = setup();
      s.player.body.velocity.x = direction * 460;
      s.movementState = 'run';
      const crouch = input === 'down' ? s.cursors.down : s.keys.S;
      crouch.isDown = crouch.edge = true;
      s.tick();
      assert.equal(s.movementState, 'slide');
      assert.equal(s.player.frame, 'crouch');
      assert.equal(s.player.flipX, direction < 0);
      s.keys[direction === 1 ? 'A' : 'D'].isDown = true;
      s.keys.SPACE.edge = true;
      const previous = Math.abs(s.player.body.velocity.x);
      s.tick();
      assert.equal(Math.sign(s.player.body.velocity.x), direction);
      assert.ok(Math.abs(s.player.body.velocity.x) < previous);
      assert.equal(s.player.body.velocity.y, 0);
      s.tick(120);
      assert.equal(s.movementState, 'crouch');
      assert.equal(s.player.body.velocity.x, 0);
      crouch.isDown = false;
      s.keys.A.isDown = s.keys.D.isDown = false;
      s.tick();
      assert.equal(s.movementState, 'idle');
      assert.equal(s.player.body.velocity.y, 0);
    }
  }
});

test('slide continues after release; slow crouching stays still', () => {
  const s = setup();
  s.player.body.velocity.x = 460;
  s.cursors.down.isDown = s.cursors.down.edge = true;
  s.tick();
  s.cursors.down.isDown = false;
  s.tick();
  assert.equal(s.movementState, 'slide');
  s.tick(120);
  assert.equal(s.movementState, 'idle');
  for (const speed of [0, 280]) {
    s.player.body.velocity.x = speed;
    s.keys.S.isDown = s.keys.S.edge = true;
    s.keys.SPACE.edge = true;
    s.tick();
    assert.equal(s.movementState, 'crouch');
    assert.equal(s.player.body.velocity.x, 0);
    assert.equal(s.player.body.velocity.y, 0);
  }
});

test('no aerial crouch/slide or queued landing slide; jump impulse is unchanged', () => {
  const s = setup();
  s.keys.SPACE.edge = true;
  s.tick();
  assert.equal(s.movementState, 'jump');
  assert.equal(s.player.body.velocity.y, -760);
  s.player.body.blocked.down = false;
  s.player.body.velocity.x = 460;
  s.keys.S.isDown = s.keys.S.edge = true;
  s.tick();
  assert.equal(s.movementState, 'jump');
  assert.equal(s.player.frame, 'jump');
  s.player.body.blocked.down = true;
  s.player.body.velocity.y = 0;
  s.tick();
  assert.equal(s.movementState, 'crouch');
  assert.equal(s.player.body.velocity.x, 0);
});

test('slide ends on loss of support or collision; blur clears held Shift', () => {
  const s = setup();
  s.movementState = 'slide';
  s.player.body.velocity.x = 400;
  s.player.body.blocked.down = false;
  s.tick();
  assert.equal(s.movementState, 'jump');
  s.player.body.blocked.down = true;
  s.movementState = 'slide';
  s.player.body.velocity.x = 0;
  s.tick();
  assert.equal(s.movementState, 'idle');
  s.onShiftDown({ code: 'ShiftRight' });
  s.stopMovement();
  assert.equal(s.shiftKeys.size, 0);
  assert.equal(s.player.body.velocity.x, 0);
});

test('acceleration and friction are independent of frame rate', () => {
  const simulate = fps => {
    const s = setup();
    s.keys.D.isDown = true;
    s.onShiftDown({ code: 'ShiftLeft' });
    s.tick(fps / 2, 1000 / fps);
    const runSpeed = s.player.body.velocity.x;
    s.cursors.down.isDown = s.cursors.down.edge = true;
    s.tick(fps / 2, 1000 / fps);
    return [runSpeed, s.player.body.velocity.x];
  };
  const reference = simulate(60);
  for (const fps of [30, 120]) {
    simulate(fps).forEach((speed, i) => assert.ok(Math.abs(speed - reference[i]) < 0.00001));
  }
});
