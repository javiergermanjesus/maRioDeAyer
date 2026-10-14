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

const context = vm.createContext({ Phaser: { Scene: class {} } });
const load = name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
vm.runInContext(load('powerups') + load('bricks') + `
  globalThis.api = { BrickSystem, PowerUpSystem, makeBrickTextures, BRICK_LAYOUT, USED_BLOCK_LAYOUT, BRICK_WIDTH, BRICK_HEIGHT };`, context);
vm.runInContext(load('main').split('new Phaser.Game(')[0] + `
  globalThis.Playground = Playground;
  globalThis.layout = { QUESTION_BLOCKS, LEVEL_SURFACES, RIVER_GAPS, WORLD_WIDTH };`, context);
const { BrickSystem, PowerUpSystem, makeBrickTextures, BRICK_LAYOUT, USED_BLOCK_LAYOUT, BRICK_WIDTH, BRICK_HEIGHT } = context.api;
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
  const system = Object.assign(Object.create(BrickSystem.prototype), { scene, fragments:new Set() });
  const world = Object.assign(Object.create(World.prototype), {
    defaults:{}, bounds:{}, gravity:{x:0,y:1600}, OVERLAP_BIAS:4, _total:0,
    staticTree:{insert(){},remove(){}},
  });
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
    physics:{add:{staticGroup:()=>group,collider(player,solids,onCollide,onProcess){
      collide=onCollide;process=onProcess;return {};
    }}},
  };
  const system=new BrickSystem(scene,{});
  assert.equal(images.filter(b=>b.material==='clay').length,23);
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
