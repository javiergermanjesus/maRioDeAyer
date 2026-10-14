import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { readRgbaPng } from './helpers/png.mjs';

const require = createRequire(import.meta.url);
const Body = require('../../node_modules/phaser/src/physics/arcade/Body.js');
const StaticBody = require('../../node_modules/phaser/src/physics/arcade/StaticBody.js');
const World = require('../../node_modules/phaser/src/physics/arcade/World.js');
const context = vm.createContext({ Phaser: { Scene: class {} } });
const load = name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
vm.runInContext(load('powerups') + load('bricks') + load('main').split('new Phaser.Game(')[0]
  + '\nglobalThis.api = { Playground, BrickSystem, PowerUpSystem, isHitFromBelow };', context);
const { Playground, BrickSystem, PowerUpSystem, isHitFromBelow } = context.api;

// Decode the actual RGBA8 PNG with built-in Node modules. This prevents a test
// from merely repeating the body's configured offset instead of measuring art.
function readSpriteAlpha() {
  return readRgbaPng(new URL('../assets/mario-sprites-grid.png', import.meta.url));
}

function jumpHeadOffset(scene) {
  const { width, height, pixels } = readSpriteAlpha();
  const draws = [], frames = [];
  scene.textures = {
    exists: () => false,
    get: () => ({ getSourceImage: () => ({ width, height }), get: index => ({
      cutX: index * 192, cutY: 0, cutWidth: 192, cutHeight: 320,
    }) }),
    createCanvas: () => ({
      context: { save() {}, beginPath() {}, rect() {}, clip() {}, restore() {},
        drawImage(...args) { draws.push(args); } },
      add(name) { frames.push(name); }, refresh() {},
    }),
  };
  scene.anims = { create() {} };
  scene.makePlayerTexture();
  const [, sx, sy, sw, sh, , dy, , dh] = draws[frames.indexOf('jump')];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (pixels[((sy + y) * width + sx + x) * 4 + 3] > 0) return dy + y * dh / sh;
    }
  }
  assert.fail('jump frame must contain visible artwork');
}

test('visible jump head meets brick, used and question undersides after real Arcade separation', () => {
  const measuredScene = new Playground();
  const headOffset = jumpHeadOffset(measuredScene);
  for (const kind of ['clay', 'used-metal', 'question']) {
    for (const fps of [30, 60, 120]) {
      for (const impulse of [-650, -760]) {
        const scene = new Playground();
        const world = Object.assign(Object.create(World.prototype), {
          defaults: {}, bounds: {}, gravity: { x: 0, y: 1600 }, OVERLAP_BIAS: 4, _total: 0,
          staticTree: { insert() {}, remove() {} },
        });
        const player = scene.player = {
          x: 560, y: 534 + 32 - headOffset, angle: 0, rotation: 0,
          scaleX: 1, scaleY: 1, displayOriginX: 18, displayOriginY: 32,
          displayWidth: 36, displayHeight: 64,
        };
        const body = player.body = new Body(world, player);
        body.setSize(32, 64, false).setOffset(2, 0);
        scene.updatePlayerBody();
        body.updateFromGameObject();
        body.velocity.set(0, impulse);
        const blockBody = new StaticBody(world);
        blockBody.setSize(33, 32, false);
        blockBody.x = 543.5;
        blockBody.y = 500;
        const block = { body: blockBody, material: kind };
        blockBody.gameObject = block;
        const brickSystem = Object.assign(Object.create(BrickSystem.prototype), { scene });
        const powerUp = Object.assign(Object.create(PowerUpSystem.prototype), {
          scene, state: 'ready', hasMushroom: false, elapsed: 0,
        });
        let contacts = 0;
        body.preUpdate(true, 1 / fps);
        world.collideSpriteVsSprite(player, block, (mario, brick) => {
          contacts++;
          if (kind !== 'question') brickSystem.finishContact(mario, brick);
        }, (mario, brick) => {
          if (kind !== 'question') return brickSystem.processContact(mario, brick);
          if (isHitFromBelow(mario.body, brick.body)) powerUp.activate();
          return true;
        }, undefined, false);
        body.postUpdate();
        assert.equal(contacts, 1);
        assert.equal(body.velocity.y, 0);
        assert.equal(body.blocked.up, true);
        assert.ok(Math.abs(player.y - player.displayOriginY + headOffset - blockBody.bottom) < 1e-9,
          `${kind}, ${fps} fps, impulse ${impulse}: visible head touches without penetration`);
        if (kind === 'question') assert.equal(powerUp.state, 'bumping');
      }
    }
  }
});
