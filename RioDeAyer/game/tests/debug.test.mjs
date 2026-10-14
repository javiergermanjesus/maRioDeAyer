import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const context = vm.createContext({ Phaser: { Scene: class {} } });
vm.runInContext(source.split('new Phaser.Game(')[0]
  + '\nglobalThis.Playground = Playground;', context);

test('physics debug is optional, reuses one graphic and belongs only to the world camera', () => {
  const scene = new context.Playground();
  const ignored = [];
  let created = 0;
  const world = { drawDebug: false, createDebugGraphic() {
    created++;
    this.debugGraphic = { setVisible(v) { this.visible = v; } };
  } };
  scene.physics = { world };
  scene.landscapeCamera = { ignore(g) { ignored.push(['landscape', g]); } };
  scene.hudCamera = { ignore(g) { ignored.push(['hud', g]); } };
  scene.setPhysicsDebug(false);
  assert.equal(created, 0);
  scene.togglePhysicsDebug();
  assert.equal(created, 1);
  assert.equal(world.drawDebug, true);
  assert.equal(world.debugGraphic.visible, true);
  assert.ok(ignored.some(([camera]) => camera === 'landscape'));
  assert.ok(ignored.some(([camera]) => camera === 'hud'));
  scene.togglePhysicsDebug({ repeat: true });
  assert.equal(world.drawDebug, true, 'holding F2 does not repeatedly toggle');
  scene.togglePhysicsDebug();
  assert.equal(world.drawDebug, false);
  assert.equal(world.debugGraphic.visible, false);
  scene.togglePhysicsDebug();
  assert.equal(created, 1);
});

test('default game configuration disables debug and keeps gravity and camera scale', () => {
  const configContext = vm.createContext({ Phaser: {
    Scene: class {},
    Scale: { FIT: 'fit', CENTER_BOTH: 'center' },
    Game: class { constructor(config) { configContext.config = config; } },
  } });
  vm.runInContext(source, configContext);
  assert.equal(configContext.config.physics.arcade.debug, false);
  assert.equal(configContext.config.physics.arcade.gravity.y, 1600);
  assert.equal(configContext.config.width, 1280);
  assert.equal(configContext.config.height, 720);
});
