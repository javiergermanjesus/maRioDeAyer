import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ Phaser: { Scene: class {} } });
const load = name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
vm.runInContext(load('main').split('new Phaser.Game(')[0] + `
  globalThis.level = { ORIGINAL_WORLD_WIDTH, WORLD_WIDTH, GROUND_Y, LEVEL_SURFACES,
    RIVER_GAPS, QUESTION_BLOCKS, ENEMY_SPAWNS, TURTLE_SPAWNS,
    EXTENSION_HONGO_SPAWNS, EXTENSION_TURTLE_SPAWNS };`, context);
vm.runInContext(load('coins') + '\nglobalThis.coins = COIN_SPAWNS;', context);
vm.runInContext(load('secret-room') + '\nglobalThis.roomCoins = ROOM_COINS;', context);
const level = JSON.parse(JSON.stringify(context.level));
const coins = JSON.parse(JSON.stringify(context.coins));

test('extension stays 50% longer and preserves original terrain and single blocks', () => {
  assert.equal(level.ORIGINAL_WORLD_WIDTH, 4480);
  assert.equal(level.WORLD_WIDTH, 6720);
  assert.deepEqual(level.LEVEL_SURFACES.slice(0, 9), [
    { x: 0, y: 640, width: 2040, height: 80, kind: 'bank' },
    { x: 2152, y: 640, width: 1388, height: 80, kind: 'bank' },
    { x: 3692, y: 640, width: 788, height: 80, kind: 'bank' },
    { x: 960, y: 600, width: 120, height: 40, kind: 'bank' },
    { x: 1240, y: 568, width: 144, height: 72, kind: 'bank' },
    { x: 1656, y: 584, width: 144, height: 56, kind: 'log' },
    { x: 2480, y: 592, width: 128, height: 48, kind: 'bank' },
    { x: 2760, y: 552, width: 144, height: 88, kind: 'bank' },
    { x: 3060, y: 584, width: 128, height: 56, kind: 'bank' },
  ]);
  assert.deepEqual(level.RIVER_GAPS.slice(0, 2), [{ x: 2040, width: 112 }, { x: 3540, width: 152 }]);
  assert.deepEqual(level.ENEMY_SPAWNS, [1140, 1490, 1560, 2650, 2940, 3010]);
  assert.deepEqual(level.QUESTION_BLOCKS.slice(0, 4), [
    { x: 560, topY: 488, hasMushroom: true },
    { x: 1490, topY: 488, hasMushroom: false, hasCoin: true },
    { x: 2340, topY: 488, hasMushroom: false },
    { x: 3930, topY: 488, hasMushroom: false, hasCoin: true },
  ]);
});

test('exactly 30 initially visible coins: 15 in the room and 15 spread across the main route', () => {
  assert.equal(coins.length, 15);
  assert.equal(context.roomCoins.length, 15);
  assert.equal(coins.length + context.roomCoins.length, 30);
  assert.equal(new Set(coins.map(([x, y]) => `${x},${y}`)).size, 15);
  assert.ok(coins[0][0] < 960 && coins.at(-1)[0] > 6400);
  for (const [i, [x, y]] of coins.entries()) {
    assert.ok(x > 0 && x < level.WORLD_WIDTH && y < level.GROUND_Y);
    if (i) assert.ok(x > coins[i - 1][0] && x - coins[i - 1][0] < 800);
  }
  for (const gap of level.RIVER_GAPS) {
    assert.ok(coins.some(([x]) => Math.abs(x - (gap.x + gap.width / 2)) < 180), 'each river has a visible cue');
  }
});

test('ground covers the entire world except river gaps, with a seamless extension boundary', () => {
  const banks = level.LEVEL_SURFACES.filter(s => s.y === 640).sort((a,b) => a.x-b.x);
  const intervals = [...banks, ...level.RIVER_GAPS].sort((a,b) => a.x-b.x);
  let edge = 0;
  for (const interval of intervals) {
    assert.equal(interval.x, edge, 'no unintended hole or overlap');
    edge += interval.width;
  }
  assert.equal(edge, level.WORLD_WIDTH);
});

test('new obstacles are within normal jump reach and new enemies have safe support', () => {
  // Unchanged normal jump: 650 impulse, 1600 gravity, 280 walking speed.
  const height = 650 ** 2 / (2 * 1600);
  const range = 280 * (2 * 650 / 1600);
  for (const gap of level.RIVER_GAPS) {
    assert.ok(gap.width + 40 < range, 'jump has horizontal margin without running');
  }
  for (const surface of level.LEVEL_SURFACES.slice(9).filter(s => s.treeIndex === undefined)) {
    assert.ok(surface.x >= 4480 && surface.x + surface.width <= 6720);
    assert.ok(640 - surface.y < height);
    assert.ok(!level.RIVER_GAPS.some(g => surface.x < g.x + g.width && surface.x + surface.width > g.x));
  }
  assert.ok(level.LEVEL_SURFACES.every(s => 640-s.y < height),
    'every raised bank and log can be reached with the unchanged normal jump');
  for (const turtle of [...level.TURTLE_SPAWNS, ...level.EXTENSION_TURTLE_SPAWNS]) {
    assert.ok(level.LEVEL_SURFACES.some(s => s.y === turtle.groundY
      && turtle.x - 24 >= s.x && turtle.x + 24 <= s.x + s.width));
  }
  for (const x of [...level.ENEMY_SPAWNS, ...level.EXTENSION_HONGO_SPAWNS]) {
    assert.ok(level.LEVEL_SURFACES.some(s => s.y === 640 && x - 18 >= s.x && x + 18 <= s.x+s.width));
    assert.ok(!level.LEVEL_SURFACES.some(s => s.y < 640 && x + 18 > s.x && x - 18 < s.x+s.width));
    assert.ok(level.RIVER_GAPS.every(g => Math.min(Math.abs(x-g.x), Math.abs(x-g.x-g.width)) >= 120));
  }
  assert.ok(coins.filter(([x]) => x >= 4480).length >= 5);
  assert.ok(level.QUESTION_BLOCKS.every(b => b.x > 0 && b.x < 6720));
});

test('a solid bank protects the quiet opening and several mushrooms precede turtles', () => {
  const first = Math.min(...level.ENEMY_SPAWNS, ...level.EXTENSION_HONGO_SPAWNS);
  assert.equal(first, 1140);
  assert.ok(level.LEVEL_SURFACES.some(s => s.x === 960 && s.x+s.width < first && s.y < 602));
  const firstTurtle = Math.min(...level.TURTLE_SPAWNS.map(t => t.x), ...level.EXTENSION_TURTLE_SPAWNS.map(t => t.x));
  assert.equal(firstTurtle, 2830);
  assert.ok(level.ENEMY_SPAWNS.filter(x => x < firstTurtle).length >= 4);
  const obstacles = level.LEVEL_SURFACES.filter(s => s.y < 602);
  for (const x of level.ENEMY_SPAWNS.filter(x => x < firstTurtle)) {
    const left = obstacles.filter(s => s.x+s.width < x).sort((a,b) => b.x-a.x)[0];
    const right = obstacles.filter(s => s.x > x).sort((a,b) => a.x-b.x)[0];
    assert.ok(left && right, 'introductory mushrooms have solid patrol boundaries');
    assert.ok(!level.RIVER_GAPS.some(g => g.x >= left.x+left.width && g.x < right.x),
      'an introductory patrol cannot disappear into a river before being encountered');
  }
});

test('joined block groups are reachable from below, have headroom and avoid river gaps', () => {
  const groups = [[740,773,806], [4120,4153,4186], [5840,5873]];
  // Derive the unchanged solid width from the idle art region, as makeTexture does.
  const width = Math.round(370 * 34 / 381);
  const normalJumpHeight = 650**2/(2*1600);
  for (const xs of groups) {
    const blocks = xs.map(x => level.QUESTION_BLOCKS.find(b => b.x === x));
    assert.ok(blocks.every(Boolean));
    assert.ok(blocks.every(b => b.topY === blocks[0].topY));
    for (let i=1; i<xs.length; i++) assert.equal(xs[i]-xs[i-1], width);
    for (const block of blocks) {
      assert.ok(!level.RIVER_GAPS.some(g => block.x+width/2>g.x && block.x-width/2<g.x+g.width));
      const support = level.LEVEL_SURFACES.filter(s => block.x >= s.x && block.x <= s.x+s.width)
        .sort((a,b) => a.y-b.y)[0];
      const headY = support.y-64;
      const underside = block.topY + Math.round(361*34/381);
      assert.ok(headY > underside, 'room to walk beneath the blocks');
      assert.ok(headY-underside < normalJumpHeight, 'normal jump can hit the underside');
      assert.ok(![...level.ENEMY_SPAWNS,...level.EXTENSION_HONGO_SPAWNS].some(x=>Math.abs(x-block.x)<100));
    }
  }
  assert.equal(level.QUESTION_BLOCKS.length, 15);
});
