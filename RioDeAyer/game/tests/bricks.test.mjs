import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// Exercise the installed Arcade implementation directly, without a DOM renderer.
const arcade = name => require(fileURLToPath(new URL(`../../node_modules/phaser/src/physics/arcade/${name}.js`, import.meta.url)));
const Body = arcade('Body');
const StaticBody = arcade('StaticBody');
const World = arcade('World');
const EventEmitter = require('eventemitter3');

const context = vm.createContext({ Phaser: { Scene: class {} } });
const load = name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
vm.runInContext(load('coins') + load('powerups') + load('bricks') + `
  globalThis.api = { CoinSystem, BrickSystem, PowerUpSystem, makeBrickTextures, BRICK_LAYOUT, USED_BLOCK_LAYOUT, BRICK_WIDTH, BRICK_HEIGHT };`, context);
vm.runInContext(load('main').split('new Phaser.Game(')[0] + `
  globalThis.Playground = Playground;
  globalThis.layout = { QUESTION_BLOCKS, LEVEL_SURFACES, RIVER_GAPS, WORLD_WIDTH };`, context);
const { CoinSystem, BrickSystem, PowerUpSystem, makeBrickTextures, BRICK_LAYOUT, USED_BLOCK_LAYOUT, BRICK_WIDTH, BRICK_HEIGHT } = context.api;
const layout = JSON.parse(JSON.stringify(context.layout));

function contact(powered = true, material = 'clay') {
  const timers = [];
  const particles = [];
  const scene = { powered, dead: false,
    time: { delayedCall(delay, callback) {
      const timer = { delay, callback, remove() { this.removed = true; } };
      timers.push(timer); return timer;
    } },
    physics: { add: { image(x,y,key) {
      const particle = { x,y,key,body:{allowGravity:true},
        setDepth() { return this; }, setVelocity(vx,vy) { this.velocity = {vx,vy}; return this; },
        destroy() { this.destroyed=true; } };
      particles.push(particle); return particle;
    } } },
  };
  const system = Object.assign(Object.create(BrickSystem.prototype), { scene, fragments:new Set(), hitBricks:new Set() });
  const world = Object.assign(Object.create(World.prototype), {
    defaults:{}, bounds:{}, gravity:{x:0,y:1600}, OVERLAP_BIAS:4, _total:0,
    staticTree:{insert(){},remove(){}},
  });
  EventEmitter.call(world);
  scene.physics.world = world;
  world.on('worldstep', () => system.hitBricks.clear());
  const body = new Body(world);
  body.setSize(32,64,false);
  body.x=544; body.y=526; body.prev.set(544,537); body._dy=-11;
  body.velocity.set(70,-500);
  const player = { body, setVelocityY(y) { this.body.velocity.y=y; } };
  const staticBody = new StaticBody(world);
  staticBody.setSize(33,32,false); staticBody.x=538; staticBody.y=500;
  const brick = { material, x:554.5, y:500, cameraFilter:5, body:staticBody,
    setVisible(value) { this.visible = value; }, destroy() { this.destroyed = true; } };
  body.gameObject=player; staticBody.gameObject=brick;
  return { system, scene, player, brick, timers, particles, world };
}

test('both clay variants break only AFTER real Arcade separation stops ascent and corrects penetration', () => {
  for (const vines of [false,true]) {
    const { system, player, brick, timers, particles, world } = contact();
    brick.vines=vines;
    const collided=world.collideSpriteVsSprite(player,brick,
      (mario,block)=>{
        assert.equal(mario.body.velocity.y,0, 'Arcade has already stopped the ascent');
        assert.equal(mario.body.y,block.body.bottom, 'the head cannot penetrate the underside');
        assert.equal(block.body.enable,true, 'solid persists through separation');
        system.finishContact(mario,block);
      },
      (mario,block)=>{
        assert.equal(system.processContact(mario,block),true);
        assert.equal(block.body.enable,true);
        assert.equal(mario.body.velocity.y,-500);
        return true;
      }, undefined,false);
    assert.equal(collided,true);
    assert.equal(brick.body.enable,false);
    assert.equal(brick.visible,false);
    assert.equal(player.body.velocity.x,70, 'horizontal motion is unchanged');
    assert.equal(player.body.velocity.y,0);
    assert.equal(particles.length,4);
    system.finishContact(player,brick);
    assert.equal(particles.length,4, 'one break cannot emit twice');
    assert.equal(brick.destroyed,undefined);
    timers.find(t=>t.delay===0).callback();
    assert.equal(brick.destroyed,true);
    const headY=player.body.y;
    player.body.resetFlags();
    player.body.update(1/60);
    assert.ok(player.body.velocity.y>0, 'ordinary gravity makes Mario fall on the next step');
    assert.ok(player.body.y>headY);
  }
});

test('normal players, used-metal blocks, side contacts and descending landings never break blocks', () => {
  for (const [powered, material, previousY, velocity] of [
    [false,'clay',537,-500], [true,'used-metal',537,-500], [false,'used-metal',537,-500],
    [true,'clay',510,-500], [true,'clay',537,500],
  ]) {
    const { system, brick, player, timers } = contact(powered, material);
    player.body.prev.y = previousY;
    player.body.velocity.y = velocity;
    assert.equal(system.processContact(player, brick), true);
    player.body.blocked.up=true;
    player.body.y=brick.body.bottom;
    system.finishContact(player,brick);
    assert.equal(brick.body.enable, true);
    assert.equal(timers.length, 0);
  }
  const {system, scene, player, brick} = contact();
  scene.dead = true;
  assert.equal(system.processContact(player, brick), false);
  assert.equal(brick.body.enable, true);
});

test('powered center and near-edge hits break clay at both jump impulses and three frame rates', () => {
  for (const fps of [30, 60, 120]) {
    for (const impulse of [-650, -760]) {
      for (const point of ['center-left', 'center-right', 'left-edge', 'right-edge']) {
        const { system, player, brick, particles, world } = contact();
        const body = player.body;
        body.setSize(30, 53.9, false);
        const vx = point.endsWith('right') || point === 'right-edge' ? -400 : 400;
        const travel = -(impulse + 1600 / fps) / fps;
        const crossX = point === 'left-edge' ? brick.body.x - body.width + 0.1
          : point === 'right-edge' ? brick.body.right - 0.1
            : brick.body.x + brick.body.width / 2 - body.width / 2;
        body.x = crossX - vx / fps * (2 / travel);
        body.y = brick.body.bottom + 2;
        body.velocity.set(vx, impulse);
        body.update(1 / fps);
        world.collideSpriteVsSprite(player, brick,
          (p, b) => system.finishContact(p, b), (p, b) => system.processContact(p, b), undefined, false);
        assert.equal(brick.body.enable, false, `${point}, ${fps} fps, impulse ${impulse}`);
        assert.equal(body.y, brick.body.bottom);
        assert.equal(body.velocity.y, 0);
        assert.equal(particles.length, 4);
      }
    }
  }
});

test('a shared underside breaks the reached clay regardless of adjacent-solid collision order', () => {
  for (const side of [-1, 1]) {
    for (const neighborKind of ['question', 'used-metal', 'clay']) {
      for (const first of ['neighbor', 'brick']) {
        const { system, player, brick, particles, world } = contact();
        const neighborBody = new StaticBody(world);
        neighborBody.setSize(33, 32, false);
        neighborBody.x = brick.body.x + side * 33;
        neighborBody.y = brick.body.y;
        const neighbor = { body: neighborBody, material: neighborKind,
          x: neighborBody.x + 16.5, y: neighborBody.y, cameraFilter: 5,
          setVisible(v) { this.visible = v; }, destroy() {} };
        neighborBody.gameObject = neighbor;
        system.group = { getChildren: () => neighborKind === 'clay' ? [brick, neighbor] : [brick] };
        player.body.setSize(30, 53.9, false);
        player.body.x = (side < 0 ? brick.body.x : brick.body.right) - 15;
        player.body.prev.x = player.body.x;
        const collide = block => world.collideSpriteVsSprite(player, block,
          (p, b) => system.finishContact(p, b), (p, b) => system.processContact(p, b), undefined, false);
        if (first === 'neighbor') { collide(neighbor); collide(brick); }
        else { collide(brick); collide(neighbor); }
        assert.equal(brick.body.enable, false, `${neighborKind} on ${side}, ${first} first`);
        assert.equal(neighbor.body.enable, neighborKind !== 'clay');
        assert.equal(player.body.y, brick.body.bottom);
        assert.equal(player.body.velocity.y, 0);
        assert.equal(particles.length, neighborKind === 'clay' ? 8 : 4);
        system.finishContact(player, brick);
        system.finishContact(player, neighbor);
        assert.equal(particles.length, neighborKind === 'clay' ? 8 : 4, 'one burst per brick');
      }
    }
  }
});

test('the actual question-block callbacks preserve an adjacent brick hit before their separation', () => {
  for (const powered of [false, true]) {
    const { system, scene, player, brick, particles, world } = contact(powered);
    system.group = { getChildren: () => [brick] };
    scene.bricks = system;
    scene.textures = { exists: () => true };
    scene.anims = { exists: () => true };
    scene.events = { once() {} };
    const object = (x, y, width, height) => ({ x, y, width, height,
      setOrigin() { return this; }, setDepth() { return this; }, setVisible() { return this; },
      setBounce() { return this; }, on() {}, destroy() {} });
    scene.add = { sprite: (x, y) => object(x, y, 33, 32), rectangle: object };
    scene.physics.add.sprite = (x, y) => {
      const mushroom = object(x, y, 26, 25);
      mushroom.body = new Body(world);
      return mushroom;
    };
    scene.physics.add.existing = solid => {
      const body = solid.body = new StaticBody(world);
      body.setSize(solid.width, solid.height, false);
      body.x = solid.x - solid.width / 2;
      body.y = solid.y - solid.height / 2;
      body.gameObject = solid;
    };
    scene.physics.add.collider = (p, solid, onCollide, onProcess) => ({
      run() { world.collide(p, solid, onCollide, onProcess); },
    });
    const question = new PowerUpSystem(scene, player, {}, brick.x + 33, brick.y, false);
    player.body.x = player.body.prev.x = brick.body.right - 15;
    question.colliders[0].run();
    assert.equal(question.state, 'bumping');
    assert.equal(question.solid.body.enable, true);
    assert.equal(brick.body.enable, !powered);
    assert.equal(particles.length, powered ? 4 : 0);
    assert.equal(player.body.y, question.solid.body.bottom);
    assert.equal(player.body.velocity.y, 0);
  }
});

test('entering a side after crossing the underside does not break; a higher row stays solid', () => {
  const side = contact();
  const body = side.player.body;
  body.setSize(30, 53.9, false);
  body.y = side.brick.body.bottom + 2;
  const travel = (650 - 1600 / 30) / 30;
  body.x = side.brick.body.x - body.width - 0.5 - 400 / 30 * (2 / travel);
  body.velocity.set(400, -650);
  body.update(1 / 30);
  side.world.collideSpriteVsSprite(side.player, side.brick,
    (p, b) => side.system.finishContact(p, b), (p, b) => side.system.processContact(p, b), undefined, false);
  assert.equal(side.brick.body.enable, true);
  assert.equal(side.particles.length, 0);

  const { system, player, brick, particles, world } = contact();
  const upperBody = new StaticBody(world);
  upperBody.setSize(33, 32, false);
  upperBody.x = brick.body.x;
  upperBody.y = brick.body.y - 32;
  const upper = { body: upperBody, material: 'clay' };
  system.group = { getChildren: () => [brick, upper] };
  player.body.prev.y = 540;
  player.body.y = 494;
  player.body._dy = -46;
  world.collideSpriteVsSprite(player, brick,
    (p, b) => system.finishContact(p, b), (p, b) => system.processContact(p, b), undefined, false);
  assert.equal(brick.body.enable, false);
  assert.equal(upper.body.enable, true);
  assert.equal(particles.length, 4);
});

test('mushroom event grants the brick ability only, ignoring unrelated and dead-player pickups', () => {
  const scene = new context.Playground();
  scene.powered = false;
  scene.collectPowerUp({type:'coin'});
  assert.equal(scene.powered, false);
  scene.dead = true;
  scene.collectPowerUp({type:'white-mushroom'});
  assert.equal(scene.powered, false);
  scene.dead = false;
  scene.collectPowerUp({type:'white-mushroom'});
  assert.equal(scene.powered, true);
  assert.equal(scene.lives, 3);
  assert.equal(scene.coins, 0);
});

test('both breakable clay textures share dimensions; vegetation is only decorative', () => {
  const textures = new Map();
  const scene = { textures: {
    exists: key => textures.has(key),
    createCanvas(key,width,height) {
      const commands=[];
      const ctx={fillStyle:'',fillRect(x,y,w,h) {commands.push([this.fillStyle,x,y,w,h]);}};
      const texture={width,height,context:ctx,commands,refresh(){}};
      textures.set(key,texture);
      return texture;
    },
  } };
  makeBrickTextures(scene);
  const bare=textures.get('mud-brick'), vines=textures.get('mud-brick-vines');
  assert.equal(bare.width, BRICK_WIDTH);
  assert.equal(vines.width, BRICK_WIDTH);
  assert.equal(bare.height, BRICK_HEIGHT);
  assert.equal(vines.height, BRICK_HEIGHT);
  assert.deepEqual(vines.commands.slice(0,bare.commands.length),bare.commands);
  const greens=new Set(['#213f34','#547536','#8b9c3c']);
  assert.ok(!bare.commands.some(c=>greens.has(c[0])));
  assert.ok(vines.commands.filter(c=>greens.has(c[0])).length>100);
  for(const [,x,y,w,h] of vines.commands) {
    assert.ok(Number.isInteger(x)&&Number.isInteger(y));
    assert.ok(x>=0&&y>=0&&x+w<=BRICK_WIDTH&&y+h<=BRICK_HEIGHT);
  }
  const before=vines.commands.length;
  makeBrickTextures(scene);
  assert.equal(textures.size,3);
  assert.equal(vines.commands.length,before);
});

test('brick structures do not overlap question blocks or rivers and leave a passable route', () => {
  assert.equal(BRICK_LAYOUT.length,23);
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const rectangles=[...BRICK_LAYOUT,...USED_BLOCK_LAYOUT].map(b=>({left:b.x-16.5,right:b.x+16.5,top:b.topY,bottom:b.topY+32}));
  for(const [i,rect] of rectangles.entries()) {
    assert.ok(rect.left>=0&&rect.right<=layout.WORLD_WIDTH);
    assert.ok(!layout.QUESTION_BLOCKS.some(b=>overlap(rect,{left:b.x-16.5,right:b.x+16.5,top:b.topY,bottom:b.topY+32})));
    assert.ok(!rectangles.slice(i+1).some(r=>overlap(rect,r)));
    assert.ok(!layout.RIVER_GAPS.some(g=>rect.left<g.x+g.width&&rect.right>g.x));
    const ground=layout.LEVEL_SURFACES.filter(s=>rect.left<s.x+s.width&&rect.right>s.x).sort((a,b)=>a.y-b.y)[0];
    assert.ok(ground);
    const headroom=ground.y-rect.bottom;
    // The low stair entrance is one full block; all other passages have >=64 px.
    assert.ok(headroom>=64 || (rect.left===4240.5 && headroom===32));
  }
  assert.ok(640-552 < 650**2/(2*1600));
  assert.ok(552-488 < 650**2/(2*1600));
});

test('four small debris bodies scatter, inherit the world camera, fall and expire after 450ms', () => {
  const {system,brick,particles,timers,world}=contact();
  system.spawnFragments(brick);
  assert.equal(particles.length,4);
  assert.equal(system.fragments.size,4);
  assert.equal(particles.filter(p=>p.velocity.vx<0).length,2);
  assert.equal(particles.filter(p=>p.velocity.vx>0).length,2);
  for(const particle of particles) {
    assert.equal(particle.key,'mud-fragment');
    assert.equal(particle.cameraFilter,brick.cameraFilter);
    const body=new Body(world);
    body.velocity.set(particle.velocity.vx,particle.velocity.vy);
    for(let i=0;i<24;i++) world.updateMotion(body,1/60);
    assert.ok(body.velocity.y>0, 'fragments are falling before removal');
  }
  for(const timer of timers) {
    assert.equal(timer.delay,450);
    timer.callback();
  }
  assert.ok(particles.every(p=>p.destroyed));
  assert.equal(system.fragments.size,0);
});

test('used blocks spawn with the exact exhausted question frame, stay solid and give no rewards', () => {
  const images=[];
  let collide,process;
  const group={scene:{},add(image){image.body={enable:true};},getChildren:()=>images,destroy(){this.scene=null;}};
  const scene={powered:true,dead:false,textures:{exists:()=>true},events:{once(){}},
    add:{image(x,y,key,frame){const image={x,y,key,frame,
      setOrigin(){return this;},setDepth(){return this;}}; images.push(image);return image;}},
    physics:{world:{on(){},off(){}},add:{staticGroup:()=>group,collider(player,solids,onCollide,onProcess){
      collide=onCollide;process=onProcess;return {};
    }}},
  };
  const system=new BrickSystem(scene,{});
  assert.equal(images.filter(b=>b.material==='clay').length,23);
  const secrets=images.filter(b=>b.coinsRemaining>0);
  assert.equal(secrets.length,2);
  assert.deepEqual(secrets.map(b=>b.coinsRemaining).sort(),[4,5]);
  assert.ok(secrets.every(b=>b.key==='mud-brick' && b.frame===undefined));
  const metals=images.filter(b=>b.material==='used-metal');
  assert.equal(metals.length,8);
  for(const metal of metals) {
    assert.equal(metal.key,'question-block');
    assert.equal(metal.frame,4);
    const player={body:{blocked:{up:true},y:520, prev:{x:0,y:521},velocity:{y:0}}};
    assert.equal(process(player,metal),true);
    collide(player,metal);
    assert.equal(metal.body.enable,true);
  }
  assert.equal(system.fragments.size,0);
});

function rewardContact(powered, limit) {
  const fixture = contact(powered);
  const { scene, system, brick } = fixture;
  scene.coins = 98;
  scene.lives = 3;
  scene.coinsText = { setText(value) { this.value = value; } };
  scene.livesText = { setText(value) { this.value = value; } };
  scene.addCoin = context.Playground.prototype.addCoin;
  const rewards = fixture.rewards = [];
  const tweens = fixture.tweens = [];
  scene.add = { sprite(x, y, key, frame) {
    const coin = { x, y, key, frame,
      setDepth(depth) { this.depth = depth; return this; },
      setVisible(visible) { this.visible = visible; return this; },
      play(animation) { this.animation = animation; return this; },
      destroy() { this.destroyed = true; },
    };
    rewards.push(coin);
    return coin;
  } };
  scene.tweens = { add(config) { tweens.push(config); } };
  scene.coinSystem = Object.assign(Object.create(CoinSystem.prototype), { scene });
  system.group = { getChildren: () => [brick] };
  brick.coinsRemaining = limit;
  fixture.hit = () => {
    const { player, world } = fixture;
    world.emit('worldstep');
    player.body.resetFlags();
    player.body.x = player.body.prev.x = 544;
    player.body.y = 526;
    player.body.prev.y = 537;
    player.body._dy = -11;
    player.body.velocity.y = -500;
    return world.collide(player, brick,
      (p, b) => system.finishContact(p, b), (p, b) => system.processContact(p, b));
  };
  return fixture;
}

test('both secret bricks award exactly one coin per real underside hit, respect 4/5 limits and then require strength to break', () => {
  const limits = BRICK_LAYOUT.filter(b => b.hiddenCoins).map(b => b.hiddenCoins);
  for (const limit of limits) {
    for (const powered of [false, true]) {
      const f = rewardContact(powered, limit);
      for (let i = 1; i <= limit; i++) {
        assert.equal(f.hit(), true);
        assert.equal(f.rewards.length, i);
        assert.equal(f.brick.coinsRemaining, limit - i);
        assert.equal(f.scene.coins, (98 + i) % 100);
        assert.equal(f.scene.coinsText.value, `x${String((98 + i) % 100).padStart(2, '0')}`);
        assert.equal(f.scene.lives, i < 2 ? 3 : 4);
        assert.equal(f.brick.body.enable, true, 'even the final reward hit keeps the brick solid');
        assert.equal(f.particles.length, 0);
        // Repeated process/collide calls and another neighbor's cached hit
        // in this same physics step cannot duplicate the reward or break it.
        f.system.processContact(f.player, f.brick);
        f.system.finishContact(f.player, f.brick);
        f.system.finishContact(f.player, { headHits: [f.brick] });
        f.scene.coinSystem.reward(f.rewards.at(-1));
        assert.equal(f.rewards.length, i);
        assert.equal(f.scene.coins, (98 + i) % 100);
        assert.equal(f.brick.body.enable, true);
      }
      assert.equal(f.scene.livesText.value, 'VIDAS × 4');
      f.hit();
      assert.equal(f.rewards.length, limit);
      assert.equal(f.brick.body.enable, !powered);
      assert.equal(f.particles.length, powered ? 4 : 0);
      if (!powered) {
        f.scene.powered = true;
        f.hit();
        assert.equal(f.brick.body.enable, false);
        assert.equal(f.particles.length, 4);
      }
      assert.equal(f.brick.coinsRemaining, 0);
      assert.equal(f.rewards.length, limit, 'no reward after exhaustion');
      for (const [i, tween] of f.tweens.entries()) {
        const coin = f.rewards[i];
        assert.equal(coin.cameraFilter, f.brick.cameraFilter);
        assert.equal(coin.visible, true);
        assert.equal(coin.body, undefined, 'reward cannot be collected by overlap again');
        assert.equal(coin.animation, 'peso-spin');
        assert.equal(tween.y, coin.y - 64);
        assert.equal(tween.yoyo, true);
        tween.onComplete();
        assert.equal(coin.destroyed, true);
      }
    }
  }
});

test('secret rewards ignore dead players, descending, side and top contacts', () => {
  for (const invalid of ['dead', 'descending', 'side', 'top']) {
    const f = rewardContact(false, 4);
    if (invalid === 'dead') f.scene.dead = true;
    if (invalid === 'descending') f.player.body.velocity.y = 500;
    if (invalid === 'side') f.player.body.prev.y = 510;
    if (invalid === 'top') {
      f.player.body.y = 440;
      f.player.body.prev.y = 430;
      f.player.body.velocity.y = 500;
    }
    f.world.collide(f.player, f.brick,
      (p, b) => f.system.finishContact(p, b), (p, b) => f.system.processContact(p, b));
    assert.equal(f.rewards.length, 0, invalid);
    assert.equal(f.scene.coins, 98);
    assert.equal(f.brick.coinsRemaining, 4);
    assert.equal(f.brick.body.enable, true);
  }
});

test('shared edges award a secret coin once regardless of neighbor order, strength or frame rate', () => {
  for (const powered of [false, true]) {
    for (const fps of [30, 60, 120]) {
      for (const first of ['neighbor', 'secret']) {
        const f = rewardContact(powered, 1);
        const neighborBody = new StaticBody(f.world);
        neighborBody.setSize(33, 32, false);
        neighborBody.x = f.brick.body.right;
        neighborBody.y = f.brick.body.y;
        const neighbor = { material: 'used-metal', body: neighborBody };
        neighborBody.gameObject = neighbor;
        const b = f.player.body;
        b.x = f.brick.body.right - 15;
        b.y = f.brick.body.bottom + 2;
        b.velocity.set(0, -650);
        b.update(1 / fps);
        const collide = solid => f.world.collide(f.player, solid,
          (p, s) => f.system.finishContact(p, s), (p, s) => f.system.processContact(p, s));
        for (const solid of first === 'neighbor' ? [neighbor, f.brick] : [f.brick, neighbor]) collide(solid);
        assert.equal(f.rewards.length, 1, `${fps} FPS, ${first}, strength ${powered}`);
        assert.equal(f.scene.coins, 99);
        assert.equal(f.brick.body.enable, true);
        assert.equal(b.velocity.y, 0);
        assert.equal(b.y, f.brick.body.bottom);
      }
    }
  }
});
