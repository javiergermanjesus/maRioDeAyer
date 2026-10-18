import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const load = name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const context = vm.createContext({ Phaser: { Scene: class {} } });
vm.runInContext(load('main').split('new Phaser.Game(')[0]
  + '\nglobalThis.level = { WOODLAND_OBSTACLES, LEVEL_SURFACES, RIVER_GAPS, WORLD_WIDTH, QUESTION_BLOCKS };', context);
vm.runInContext(load('bricks') + '\nglobalThis.blocks = [...BRICK_LAYOUT, ...USED_BLOCK_LAYOUT];', context);
vm.runInContext(load('landscape') + '\nglobalThis.paint = deadwood; globalThis.woodPalette = LOG_WOOD;', context);
const level = JSON.parse(JSON.stringify(context.level));
const trees = Object.values(Object.groupBy(level.LEVEL_SURFACES.filter(s => s.treeIndex !== undefined), s => s.treeIndex));

test('sparse deadwood has varied sizes, ground roots, river clearance and headroom under existing blocks', () => {
  assert.equal(trees.length, 5);
  assert.equal(trees.filter(s => s[0].kind === 'stump').length, 3);
  assert.equal(trees.filter(s => s[0].kind === 'snag').length, 2);
  assert.equal(new Set(trees.map(s => 640 - s[0].y)).size, 5);
  const blocks = [...level.QUESTION_BLOCKS, ...context.blocks];
  for (const sections of trees) {
    const crown = sections[0], roots = sections.at(-1);
    assert.ok(crown.width >= 40, 'flat crowns leave space to stand and walk');
    assert.equal(roots.y + roots.height, 640);
    assert.ok(640 - crown.y < 650 ** 2 / (2 * 1600));
    assert.ok(roots.x >= 960 && roots.x + roots.width <= level.WORLD_WIDTH);
    for (const gap of level.RIVER_GAPS) {
      assert.ok(roots.x + roots.width <= gap.x - 100 || roots.x >= gap.x + gap.width + 100,
        'at least 100 world pixels of clear bank beside a river');
    }
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (i) assert.equal(s.y, sections[i - 1].y + sections[i - 1].height);
      assert.ok(level.LEVEL_SURFACES.some(b => b.kind === 'bank' && b.y === 640
        && roots.x >= b.x && roots.x + roots.width <= b.x + b.width));
      for (const block of blocks) {
        if (block.x + 16.5 > s.x && block.x - 16.5 < s.x + s.width) {
          assert.ok(block.topY + 32 <= s.y - 54, 'standing headroom under existing blocks');
        }
      }
      assert.ok(level.LEVEL_SURFACES.filter(b => b.treeIndex === undefined && b.y < 640)
        .every(b => s.x + s.width <= b.x || s.x >= b.x + b.width),
      'new wood does not overlap an existing raised obstacle');
    }
  }
  assert.ok(trees.reduce((sum, s) => sum + s.at(-1).width, 0) / level.WORLD_WIDTH < 0.08);
});

test('every painted deadwood pixel matches its solid silhouette, including crowns, shoulders and roots', () => {
  for (const sections of trees) {
    const expected = new Set();
    for (const s of sections) {
      for (let y = s.y / 2; y < (s.y + s.height) / 2; y++) {
        for (let x = s.x / 2; x < (s.x + s.width) / 2; x++) expected.add(`${x},${y}`);
      }
    }
    const render = () => {
      const pixels = new Map();
      const canvas = { fillRect(x, y, width, height) {
        assert.ok([x, y, width, height].every(Number.isInteger), 'crisp integer pixel art');
        for (let dy = y; dy < y + height; dy++) {
          for (let dx = x; dx < x + width; dx++) {
            assert.ok(expected.has(`${dx},${dy}`), 'no visible wood outside the colliders');
            pixels.set(`${dx},${dy}`, this.fillStyle);
          }
        }
      } };
      context.paint(canvas, sections);
      return pixels;
    };
    const pixels = render();
    assert.ok(pixels.size / expected.size > 0.95, 'only tiny bark chips change the visible perimeter');
    for (const pixel of expected) {
      if (pixels.has(pixel)) continue;
      const [x, y] = pixel.split(',').map(Number);
      assert.ok(!expected.has(`${x-1},${y}`) || !expected.has(`${x+1},${y}`)
        || !expected.has(`${x},${y-1}`), 'chips are confined to the outermost pixel');
    }
    const crown = sections[0];
    for (let x = crown.x / 2 + 3; x < (crown.x + crown.width) / 2 - 3; x++) {
      assert.ok(pixels.has(`${x},${crown.y / 2}`), 'central support line stays visible');
    }
    assert.ok([...pixels.values()].includes(context.woodPalette.hollow), 'every vertical variant has a dark cavity');
    assert.deepEqual(render(), pixels, 'repeatable artwork across restarts');
    assert.ok(new Set(pixels.values()).size >= 7, 'weathered grain and cut faces');
    const sharedColors = new Set(Object.values(context.woodPalette));
    for (const color of pixels.values()) {
      assert.ok(sharedColors.has(color), 'every vertical variant uses the original horizontal log palette');
    }
  }
});
