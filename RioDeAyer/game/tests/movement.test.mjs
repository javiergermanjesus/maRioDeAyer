import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Body = require('../../node_modules/phaser/src/physics/arcade/Body.js');
const StaticBody = require('../../node_modules/phaser/src/physics/arcade/StaticBody.js');
const World = require('../../node_modules/phaser/src/physics/arcade/World.js');

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
  + '\nglobalThis.Playground = Playground; globalThis.standingHeight = PLAYER_STANDING_HEIGHT;'
  + '\nglobalThis.woodlandSurfaces = LEVEL_SURFACES.filter(s => s.treeIndex !== undefined);', context);
vm.runInContext(readFileSync(new URL('../src/bricks.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')
  + '\nglobalThis.stair = [...BRICK_LAYOUT, ...USED_BLOCK_LAYOUT].filter(b => b.x >= 4257 && b.x <= 4323);', context);

function setup() {
  const scene = new context.Playground();
  const key = () => ({ isDown: false, edge: false });
  scene.cursors = { left: key(), right: key(), up: key(), down: key() };
  scene.keys = { A: key(), D: key(), W: key(), S: key(), SPACE: key() };
  const world = scene.physics = { world: Object.assign(Object.create(World.prototype), {
    defaults: {}, bounds: {}, gravity: { x: 0, y: 1600 }, OVERLAP_BIAS: 4, _total: 0,
    staticTree: { insert() {}, remove() {} },
  }) };
  const player = scene.player = {
    x: 378, y: 608, angle: 0, rotation: 0, scaleX: 1, scaleY: 1,
    displayOriginX: 18, displayOriginY: 32, displayWidth: 36, displayHeight: 64,
    setVelocityX(x) { this.body.velocity.x = x; },
    setVelocityY(y) { this.body.velocity.y = y; },
    setFlipX(flip) { this.flipX = flip; },
    setFrame(frame) { this.frame = frame; },
    play(animation) { this.animation = animation; },
    anims: { stop() { player.animation = null; } },
  };
  player.body = new Body(world.world, player);
  player.body.setSize(30, context.standingHeight, false).setOffset(3, 64 - context.standingHeight);
  player.body.updateFromGameObject();
  player.body.prev.copy(player.body.position);
  player.body.prevFrame.copy(player.body.position);
  player.body.blocked.down = true;
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

function solid(scene, x, y, width, height) {
  const body = new StaticBody(scene.physics.world);
  body.setSize(width, height, false);
  body.x = x;
  body.y = y;
  const object = { body };
  body.gameObject = object;
  return object;
}

const woodlandTrees = Object.groupBy(Array.from(context.woodlandSurfaces), s => s.treeIndex);

test('normal walking jumps land on every deadwood crown from either side at 30, 60 and 120 FPS', () => {
  for (const sections of Object.values(woodlandTrees)) {
    for (const fps of [30, 60, 120]) {
      const dt = 1 / fps;
      const crown = sections[0];
      // Predict the descending crossing using the unchanged semi-implicit
      // Arcade gravity step, then aim a walking jump at the crown's center.
      let feet = 640, velocity = -650, frames = 0;
      do {
        velocity += 1600 * dt;
        feet += velocity * dt;
        frames++;
      } while (velocity < 0 || feet < crown.y);
      for (const direction of [-1, 1]) {
        const s = setup();
        s.player.x = crown.x + crown.width / 2 - direction * 280 * frames * dt;
        s.player.body.updateFromGameObject();
        const solids = [solid(s, 0, 640, 7000, 80),
          ...sections.map(r => solid(s, r.x, r.y, r.width, r.height))];
        s.surfaces = { getChildren: () => solids };
        s.keys[direction < 0 ? 'A' : 'D'].isDown = true;
        s.player.body.velocity.x = direction * 280;
        s.keys.SPACE.edge = true;
        s.tick(1, dt * 1000);
        assert.equal(s.player.body.velocity.y, -650);
        let landed = false;
        for (let frame = 0; frame <= frames + 2; frame++) {
          s.player.body.preUpdate(true, dt);
          for (const object of solids) s.physics.world.collide(s.player, object);
          s.tick(1, dt * 1000);
          s.player.body.postUpdate();
          if (s.player.body.blocked.down) {
            assert.equal(s.player.body.bottom, crown.y,
              `tree ${crown.treeIndex}, ${fps} FPS, direction ${direction}`);
            landed = true;
            break;
          }
        }
        assert.equal(landed, true, 'a normal jump reaches the visible crown');
      }
    }
  }
});

test('deadwood supports idle and walking feet, then allows walking off each side without snagging', () => {
  for (const sections of Object.values(woodlandTrees)) {
    for (const fps of [30, 60, 120]) {
      for (const direction of [-1, 1]) {
        const s = setup();
        const crown = sections[0];
        s.player.x = crown.x + crown.width / 2;
        s.player.y = crown.y - 32;
        s.player.body.updateFromGameObject();
        const solids = [solid(s, 0, 640, 7000, 80),
          ...sections.map(r => solid(s, r.x, r.y, r.width, r.height))];
        s.surfaces = { getChildren: () => solids };
        const step = () => {
          s.player.body.preUpdate(true, 1 / fps);
          for (const object of solids) s.physics.world.collide(s.player, object);
          s.tick(1, 1000 / fps);
          s.player.body.postUpdate();
        };
        for (let frame = 0; frame < fps; frame++) {
          step();
          assert.equal(s.player.body.bottom, crown.y, 'idle feet stay on the visible cut');
          assert.equal(s.movementState, 'idle');
        }
        const start = s.player.x;
        s.keys[direction < 0 ? 'A' : 'D'].isDown = true;
        for (let frame = 0; frame < fps / 10; frame++) {
          step();
          assert.equal(s.player.body.bottom, crown.y, 'walking keeps the same support line');
          assert.equal(s.movementState, 'walk');
        }
        assert.ok(direction * (s.player.x - start) > 3);
        for (let frame = 0; frame < fps; frame++) step();
        assert.equal(s.player.body.bottom, 640, 'stepped roots do not trap the player on exit');
        assert.ok(direction * (s.player.x - start) > 150);
      }
    }
  }
});

test('crouch and stand preserve the feet, sprite and Arcade postUpdate displacement', () => {
  const s = setup();
  const body = s.player.body;
  const feet = body.bottom;
  const spriteY = s.player.y;
  assert.ok(body.height > 1.5 * 32 && body.height < 2 * 32);
  for (let i = 0; i < 10; i++) {
    // Include a real downward displacement before the resize. It must reach
    // the sprite once, without the change of body height being added to it.
    body.preUpdate(false, 0);
    body.y += 2;
    s.keys.S.isDown = true;
    s.tick();
    assert.equal(body.height, 32);
    assert.equal(body.bottom, feet + 2 * (i + 1));
    body.postUpdate();
    assert.equal(s.player.y, spriteY + 2 * (i + 1));
    body.preUpdate(false, 0);
    s.keys.S.isDown = false;
    s.tick();
    assert.equal(body.height, context.standingHeight);
    assert.equal(body.bottom, feet + 2 * (i + 1));
    body.postUpdate();
    assert.equal(s.player.y, spriteY + 2 * (i + 1));
  }
});

test('releasing crouch under terrain, bricks or question blocks waits for headroom', () => {
  for (const kind of ['terrain', 'brick', 'question']) {
    const s = setup();
    s.keys.S.isDown = true;
    s.tick();
    const ceiling = solid(s, s.player.body.x, 576, 33, 32);
    if (kind === 'terrain') s.surfaces = { getChildren: () => [ceiling] };
    if (kind === 'brick') s.bricks = { group: { getChildren: () => [ceiling] } };
    if (kind === 'question') s.powerUps = [{ solid: ceiling, update() {} }];
    s.keys.S.isDown = false;
    s.keys.SPACE.edge = true;
    s.tick(30);
    assert.equal(s.movementState, 'crouch');
    assert.equal(s.player.body.height, 32);
    assert.equal(s.player.body.bottom, 640);
    assert.equal(s.player.body.velocity.y, 0);
    ceiling.body.x = s.player.body.right; // Just touching the wall allows standing.
    s.tick();
    assert.equal(s.movementState, 'idle');
    assert.equal(s.player.body.height, context.standingHeight);
    assert.equal(s.player.body.velocity.y, 0, 'blocked jump was not queued');
    s.keys.S.isDown = true;
    s.tick();
    ceiling.body.x = s.player.body.x;
    ceiling.body.enable = false;
    s.keys.S.isDown = false;
    s.tick();
    assert.equal(s.movementState, 'idle', 'broken blocks no longer prevent standing');
  }
});

test('a real Arcade slide crosses a one-block-high tunnel without ceiling or side collisions', () => {
  for (const fps of [30, 60, 120]) {
    const s = setup();
    const body = s.player.body;
    const floor = solid(s, 300, 640, 600, 80);
    const ceiling = solid(s, 430, 576, 99, 32);
    s.surfaces = { getChildren: () => [floor, ceiling] };
    body.velocity.x = 400;
    s.keys.S.isDown = s.keys.S.edge = true;
    s.tick();
    s.keys.S.isDown = false;
    for (let frame = 0; frame < fps; frame++) {
      body.preUpdate(true, 1 / fps);
      s.physics.world.collideSpriteVsSprite(s.player, floor, undefined, undefined, undefined, false);
      let ceilingCollision = false;
      s.physics.world.collideSpriteVsSprite(
        s.player, ceiling, () => { ceilingCollision = true; }, undefined, undefined, false);
      assert.equal(ceilingCollision, false,
        JSON.stringify({ fps, frame, x: body.x, y: body.y, height: body.height,
          blocked: body.blocked, velocity: body.velocity, spriteY: s.player.y }));
      s.tick(1, 1000 / fps);
      if (body.x < ceiling.body.right && body.right > ceiling.body.x) {
        assert.equal(body.height, 32);
      }
      assert.ok(Math.abs(body.bottom - 640) < 1e-9);
      body.postUpdate();
    }
    assert.ok(body.x > ceiling.body.right, `tunnel exit reached at ${fps} fps`);
    assert.equal(body.height, context.standingHeight);
  }
});

test('a slide that stops inside a tunnel stays crouched after Down is released', () => {
  const s = setup();
  const ceiling = solid(s, s.player.body.x - 1, 576, 100, 32);
  s.player.body.velocity.x = 400;
  s.keys.S.isDown = s.keys.S.edge = true;
  s.tick();
  s.surfaces = { getChildren: () => [ceiling] };
  s.keys.S.isDown = false;
  s.tick(120);
  assert.equal(s.movementState, 'crouch');
  assert.equal(s.player.body.height, 32);
  assert.equal(s.player.body.velocity.x, 0);
  assert.equal(s.player.frame, 'crouch');
});

test('the actual level stair permits a slide through its one-block entrance and then standing', () => {
  for (const fps of [30, 60, 120]) {
    const s = setup();
    s.player.x = 4210;
    const floor = solid(s, 4160, 640, 400, 80);
    const steps = Array.from(context.stair, b => solid(s, b.x - 16.5, b.topY, 33, 32));
    s.surfaces = { getChildren: () => [floor] };
    s.bricks = { group: { getChildren: () => steps } };
    s.player.body.velocity.x = 400;
    s.keys.S.isDown = s.keys.S.edge = true;
    s.tick();
    s.keys.S.isDown = false;
    let entered = false;
    for (let frame = 0; frame < fps; frame++) {
      const body = s.player.body;
      body.preUpdate(true, 1 / fps);
      s.physics.world.collide(s.player, floor);
      for (const step of steps) {
        s.physics.world.collide(s.player, step, () => assert.fail('unexpected stair collision'));
      }
      s.tick(1, 1000 / fps);
      if (body.x < 4273.5 && body.right > 4240.5) {
        entered = true;
        assert.equal(body.height, 32);
      }
      assert.ok(Math.abs(body.bottom - 640) < 1e-9);
      body.postUpdate();
    }
    assert.equal(entered, true);
    assert.ok(s.player.body.x > 4339.5);
    assert.equal(s.player.body.height, context.standingHeight);
  }
});

test('standing still collides with a one-block tunnel; crouching cannot cross a 24-pixel opening', () => {
  for (const [crouched, gap] of [[false, 32], [true, 24]]) {
    const s = setup();
    s.keys.S.isDown = crouched;
    s.tick();
    s.player.x = 411;
    const body = s.player.body;
    const floor = solid(s, 300, 640, 600, 80);
    const ceiling = solid(s, 430, 640 - gap - 32, 99, 32);
    body.velocity.x = 400;
    body.preUpdate(true, 1 / 60);
    s.physics.world.collideSpriteVsSprite(s.player, floor, undefined, undefined, undefined, false);
    s.physics.world.collideSpriteVsSprite(s.player, ceiling, undefined, undefined, undefined, false);
    assert.equal(body.blocked.right, true);
    assert.equal(body.velocity.x, 0);
    assert.equal(body.right, ceiling.body.x);
  }
});

test('leaving support below a ceiling retains the short pose until space opens', () => {
  const s = setup();
  s.player.body.velocity.x = 400;
  s.keys.S.isDown = s.keys.S.edge = true;
  s.tick();
  const ceiling = solid(s, s.player.body.x - 1, 576, 100, 32);
  s.surfaces = { getChildren: () => [ceiling] };
  s.keys.S.isDown = false;
  s.player.body.blocked.down = false;
  s.tick();
  assert.equal(s.player.body.height, 32);
  assert.equal(s.player.frame, 'crouch');
  ceiling.body.enable = false;
  s.tick();
  assert.equal(s.player.body.height, context.standingHeight);
  assert.equal(s.player.frame, 'jump');
});

test('walk, gradual run, max speed, braking and both physical Shift keys', () => {
  for (const code of ['ShiftLeft', 'ShiftRight']) {
    const s = setup();
    s.keys.D.isDown = true;
    s.tick();
    assert.ok(s.player.body.velocity.x > 0 && s.player.body.velocity.x < 280);
    assert.equal(s.movementState, 'walk');
    s.tick(12);
    assert.equal(s.player.body.velocity.x, 280);
    s.onShiftDown({ code });
    s.tick();
    assert.ok(s.player.body.velocity.x > 280 && s.player.body.velocity.x < 400);
    s.tick(60);
    assert.equal(s.player.body.velocity.x, 400);
    assert.equal(s.player.animation, 'mario-run');
    s.keys.D.isDown = false;
    s.tick();
    assert.ok(s.player.body.velocity.x > 0 && s.player.body.velocity.x < 400);
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

test('short grounded taps travel much less while held walking and airborne control retain speed', () => {
  for (const direction of [-1, 1]) {
    const s = setup();
    const arrow = direction < 0 ? s.cursors.left : s.cursors.right;
    const dt = 1 / 60;
    arrow.isDown = true;
    s.tick(1);
    let distance = Math.abs(s.player.body.velocity.x) * dt;
    arrow.isDown = false;
    for (let frame = 0; frame < 60; frame++) {
      s.tick();
      distance += Math.abs(s.player.body.velocity.x) * dt;
    }
    // Previously even a one-frame tap coasted for roughly 56 world pixels.
    assert.ok(distance < 2, `one-frame tap moved ${distance} pixels`);
    assert.equal(s.player.body.velocity.x, 0);
    arrow.isDown = true;
    s.tick(60);
    assert.equal(s.player.body.velocity.x, direction * 280);
    s.player.body.blocked.down = false;
    s.player.body.velocity.x = 0;
    s.tick();
    assert.equal(s.player.body.velocity.x, direction * 280);
  }
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

test('no aerial crouch/slide or queued landing slide; normal jump uses lower impulse', () => {
  const s = setup();
  s.keys.SPACE.edge = true;
  s.tick();
  assert.equal(s.movementState, 'jump');
  assert.equal(s.player.body.velocity.y, -650);
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

test('high jump requires Shift and actual near-running speed in either direction', () => {
  for (const direction of [-1, 1]) {
    for (const fps of [30, 60, 120]) {
      for (const [speed, shift, expected] of [
        [0, false, -650], [0, true, -650],
        [280, false, -650], [280, true, -650],
        [320, true, -650], [360, true, -760],
        [400, true, -760], [400, false, -650],
      ]) {
        const s = setup();
        s.player.body.velocity.x = direction * speed;
        s.keys[direction === 1 ? 'D' : 'A'].isDown = true;
        if (shift) s.onShiftDown({ code: 'ShiftLeft' });
        s.keys.SPACE.edge = true;
        s.tick(1, 1000 / fps);
        assert.equal(s.player.body.velocity.y, expected,
          `speed=${speed}, Shift=${shift}, direction=${direction}, fps=${fps}`);
        assert.equal(s.player.frame, 'jump');
        // Pressing jump again in the air must not upgrade or reapply the impulse.
        s.player.body.blocked.down = false;
        s.player.body.velocity.y = -200;
        s.keys.SPACE.edge = true;
        s.tick(1, 1000 / fps);
        assert.equal(s.player.body.velocity.y, -200);
      }
    }
  }
  const heightRatio = (650 / 760) ** 2;
  assert.ok(heightRatio >= 0.7 && heightRatio <= 0.75);
});
