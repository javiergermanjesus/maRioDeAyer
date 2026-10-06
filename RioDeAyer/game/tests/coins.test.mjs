import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ Phaser: { Scene: class {} } });
const load = name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
vm.runInContext(load('coins') + '\nglobalThis.CoinSystem = CoinSystem;', context);
vm.runInContext(load('main').split('new Phaser.Game(')[0]
  + '\nglobalThis.Playground = Playground;', context);
vm.runInContext(load('powerups') + '\nglobalThis.PowerUpSystem = PowerUpSystem;', context);

test('every 100 coins awards another life and updates the HUD to x00', () => {
  const scene = new context.Playground();
  scene.init();
  scene.coinsText = { setText(text) { this.text = text; } };
  scene.livesText = { setText(text) { this.text = text; } };
  for (let i = 0; i < 99; i++) scene.addCoin();
  assert.equal(scene.coinsText.text, 'x99');
  assert.equal(scene.lives, 3);
  scene.addCoin();
  assert.equal(scene.coinsText.text, 'x00');
  assert.equal(scene.lives, 4);
  for (let i = 0; i < 100; i++) scene.addCoin();
  assert.equal(scene.coins, 0);
  assert.equal(scene.lives, 5);
  assert.equal(scene.livesText.text, 'VIDAS × 5');
  scene.dead = true;
  scene.addCoin();
  assert.equal(scene.coins, 0);
});

test('floating coin disappears immediately and repeated overlaps cannot award it twice', () => {
  let awards = 0;
  const system = Object.assign(Object.create(context.CoinSystem.prototype), {
    scene: { dead: false, addCoin() { awards++; } },
  });
  const coin = { active: true, body: { enable: true }, destroy() { this.active = false; } };
  system.scene.dead = true;
  system.collect(coin);
  assert.equal(coin.active, true);
  system.scene.dead = false;
  system.collect(coin);
  system.collect(coin);
  assert.equal(awards, 1);
  assert.equal(coin.active, false);
  assert.equal(coin.body.enable, false);
});

test('a coin block rewards once, animates upward, then remains used', () => {
  let awards = 0;
  let tween;
  const scene = { dead: false, addCoin() { awards++; },
    tweens: { add(config) { tween = config; } } };
  scene.coinSystem = Object.assign(Object.create(context.CoinSystem.prototype), { scene });
  const coin = { y: 476, setVisible(value) { this.visible = value; return this; },
    play() { return this; }, destroy() { this.destroyed = true; } };
  const block = Object.assign(Object.create(context.PowerUpSystem.prototype), {
    scene, state: 'ready', hasMushroom: false, coinReward: coin, elapsed: 0, baseY: 520,
    block: { y: 520, setFrame(frame) { this.frame = frame; } },
  });
  block.activate();
  block.activate();
  scene.coinSystem.reward(coin);
  assert.equal(awards, 1);
  assert.equal(coin.visible, true);
  assert.equal(tween.y, 412);
  assert.equal(tween.yoyo, true);
  block.update(300);
  assert.equal(block.state, 'used');
  assert.equal(block.block.frame, 4);
  tween.onComplete();
  assert.equal(coin.destroyed, true);
  block.activate();
  assert.equal(awards, 1);
});

test('death restart preserves coins and remaining lives; new game resets both', () => {
  const scene = new context.Playground();
  scene.init({ lives: 4, coins: 76 });
  scene.input = { keyboard: { resetKeys() {} } };
  scene.player = { body: { velocity: { y: 0 } }, setCollideWorldBounds() {},
    setVelocity() {}, anims: { stop() {} }, setFrame() {} };
  scene.playerTerrainCollider = {};
  scene.enemies = { playerOverlap: {} };
  let complete;
  let restart;
  scene.time = { delayedCall(_delay, callback) { complete = callback; } };
  scene.scene = { restart(data) { restart = data; } };
  scene.die();
  complete();
  scene.init(restart);
  assert.equal(scene.lives, 3);
  assert.equal(scene.coins, 76);
  scene.gameOver = true;
  scene.startNewGame();
  scene.init(restart);
  assert.equal(scene.lives, 3);
  assert.equal(scene.coins, 0);
});
