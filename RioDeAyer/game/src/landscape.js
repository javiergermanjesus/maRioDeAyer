// Procedural pixel art. All geometry here is decorative; main.js owns collisions.
const ink = (c, color, x, y, w = 1, h = 1) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};
const noise = (x, y = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
// One warm wood palette for EVERY log, stump and standing dead tree.
const LOG_WOOD = {
  outline: '#332d22', bark: '#754928', dark: '#513923', grain: '#895630',
  light: '#ae763c', highlight: '#c38a46', furrow: '#694027',
  rim: '#382e22', cut: '#d7a65d', ring: '#946537', heart: '#c99550', split: '#67452b',
  innerShadow: '#21140d', hollow: '#110a06',
};
// Scanline ellipses keep silhouettes stepped and pixels crisp, without antialiasing.
function oval(c, color, x, y, rx, ry) {
  for (let row = -Math.floor(ry); row <= ry; row++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (row / ry) ** 2)));
    ink(c, color, x - half, y + row, half * 2 + 1, 1);
  }
}
function branch(c, color, ax, ay, bx, by, width = 2) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
  for (let i = 0; i <= steps; i++) ink(c, color, ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps, width, width);
}
function foliage(c, x, y, rx, ry, palette, seed) {
  oval(c, palette[0], x, y, rx, ry);
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.4;
    const px = x + Math.cos(angle) * rx * 0.65;
    const py = y + Math.sin(angle) * ry * 0.6;
    oval(c, palette[1], px, py, rx * 0.42, ry * 0.45);
  }
  for (let i = 0; i < rx * ry / 3; i++) {
    const dx = (noise(i, seed) * 2 - 1) * rx;
    const dy = (noise(seed, i) * 2 - 1) * ry;
    if (dx * dx / (rx * rx) + dy * dy / (ry * ry) < 0.83) {
      ink(c, palette[dy < -ry * 0.1 ? 3 : 2], x + dx, y + dy, 2 + noise(i, 8) * 2, 1 + noise(i, 4) * 2);
    }
  }
}
function willow(c, x, bottom, scale, seed, distant = false) {
  const greens = distant ? ['#3e5943', '#486547', '#56784a', '#77874b'] : ['#213f34', '#345a36', '#547536', '#8b9c3c'];
  branch(c, '#3a4430', x - 3 * scale, bottom, x + 2 * scale, bottom - 44 * scale, 5 * scale);
  branch(c, '#827042', x, bottom - 2 * scale, x + 4 * scale, bottom - 42 * scale, 2 * scale);
  for (const side of [-1, 1]) branch(c, '#3a4430', x, bottom - 18 * scale, x + side * 20 * scale, bottom - 46 * scale, 3 * scale);
  for (const [dx, dy, rx, ry] of [[-20, -46, 19, 14], [1, -56, 21, 17], [22, -44, 20, 14]]) {
    foliage(c, x + dx * scale, bottom + dy * scale, rx * scale, ry * scale, greens, seed + dx);
  }
  for (let i = 0; i < 27; i++) {
    const dx = (i - 13) * 2.7 * scale;
    const top = bottom - (45 + 9 * Math.cos(i)) * scale;
    const length = (15 + noise(i, seed) * 19) * scale;
    branch(c, greens[0], x + dx, top, x + dx - 3 * scale, top + length, 2 * scale);
    for (let j = 0; j < length; j += 3 * scale) ink(c, greens[1 + ((i + Math.round(j)) % 3)], x + dx - j / length * 3 * scale, top + j, 2 * scale, 3 * scale);
  }
}
function island(c, x, baseline, width, seed, near) {
  const colors = near ? ['#3c5940', '#4d6a42', '#638047', '#89904d'] : ['#596f4b', '#65794f', '#7b8755', '#94965c'];
  for (let dx = 0; dx < width; dx++) {
    const envelope = Math.sin(Math.PI * dx / width);
    const height = envelope * (9 + 7 * Math.sin(dx * 0.07) ** 2 + 5 * noise(Math.floor(dx / 3), seed));
    ink(c, colors[0], x + dx, baseline - height, 1, height + 1);
  }
  for (let dx = 12; dx < width - 12; dx += 14) {
    const h = Math.sin(Math.PI * dx / width);
    foliage(c, x + dx, baseline - 10 * h, 9 + noise(dx, seed) * 7, 8 * h + 2, colors, seed + dx);
  }
  for (let i = 0; i < width; i += 5) ink(c, '#9f9c62', x + i, baseline + 2, 3 + noise(i, seed) * 5, 1);
}

// A flat cut with a thin, chipped bark rim and concentric end grain. The face
// is drawn downward into the existing crown: its support line never moves.
function woodCut(c, x, y, width, depth, seed) {
  const cx = (width - 1) / 2, cy = (depth - 1) / 2;
  for (let row = 0; row < depth; row++) {
    for (let col = 0; col < width; col++) {
      const chippedRim = col <= (row % 4 === 1 ? 1 : 0)
        || col >= width - (row % 3 === 2 ? 2 : 1) || row === depth - 1;
      let color = chippedRim ? LOG_WOOD.bark : LOG_WOOD.cut;
      if (!chippedRim && row > 0 && noise(col, row + seed) > 0.9) color = LOG_WOOD.heart;
      ink(c, color, x + col, y + row);
    }
  }
  // Nested stepped ellipses keep the rings continuous at this small scale.
  const rx = Math.floor(width / 2) - 4, ry = Math.max(1, Math.floor((depth - 3) / 2));
  oval(c, LOG_WOOD.ring, x + cx, y + cy, rx, ry);
  if (ry > 1) {
    oval(c, LOG_WOOD.cut, x + cx, y + cy, rx - 1, ry - 1);
    oval(c, LOG_WOOD.ring, x + cx, y + cy, Math.round(rx * 0.55), ry - 1);
    oval(c, LOG_WOOD.heart, x + cx, y + cy, Math.max(1, Math.round(rx * 0.55) - 1), Math.max(1, ry - 2));
  }
  branch(c, LOG_WOOD.split, x + 2, y + Math.floor(cy), x + Math.floor(width / 4), y + Math.floor(cy) + 1, 1);
}

function hollowCut(c, x, y, width, depth, seed) {
  // Keep the thick cut-wood ring and chipped bark of the solid version.
  woodCut(c, x, y, width, depth, seed);
  const cx = Math.round(x + (width - 1) / 2), cy = y + Math.floor(depth / 2);
  const rx = Math.floor(width / 2) - 5;
  const ry = Math.max(2, Math.floor(depth / 2) - 2);
  // Unequal scanline edges, short inner walls and a recessed dark bottom.
  // Offsets vary by tree, so the opening is neither a rectangle nor a perfect
  // ellipse; all shades remain solid colors from the existing warm palette.
  for (let row = -ry; row <= ry; row++) {
    const half = Math.round(rx * Math.sqrt(1 - (row / (ry + 0.6)) ** 2));
    const left = cx - half + Math.floor(noise(Math.floor(row / 2), seed + 3) * 2);
    const right = cx + half - Math.floor(noise(row + 9, seed + 17) * 2);
    ink(c, LOG_WOOD.dark, left, cy + row, right - left + 1, 1);
    ink(c, LOG_WOOD.split, left + 1, cy + row, Math.max(1, right - left - 1), 1);
    if (row > -ry + 1 && row < ry) {
      ink(c, LOG_WOOD.innerShadow, left + 2, cy + row, Math.max(1, right - left - 3), 1);
      ink(c, LOG_WOOD.hollow, left + 3, cy + row, Math.max(1, right - left - 5), 1);
    }
    if (row === -ry + 1) ink(c, LOG_WOOD.grain, left + 2, cy + row, Math.max(1, right - left - 4), 1);
  }
  // A little worn wood on the near lip separates it from the dark inner edge.
  ink(c, LOG_WOOD.heart, cx - rx + 3, cy + ry + 1, 4, 1);
  ink(c, LOG_WOOD.cut, cx + rx - 6, cy + ry + 1, 3, 1);
  // Tiny splinters and split end grain interrupt the bright rim, not its span.
  for (const dx of [3, width - 5]) {
    ink(c, LOG_WOOD.split, x + dx, y + 1, 1, 2);
    ink(c, LOG_WOOD.heart, x + dx + 1, y + 2, 1, 2);
  }
}

// Paint inside the existing Arcade outline, with one-pixel bark chips at its
// perimeter. The central support line stays visible and the bodies stay intact.
function deadwood(c, sections) {
  const top = sections[0];
  const base = sections.at(-1);
  const center = (base.x + base.width / 2) / 2;
  const bottom = (base.y + base.height) / 2;
  const isStump = top.kind === 'stump';
  const wood = LOG_WOOD;
  const contains = (x, y) => sections.some(s => x >= s.x / 2 && x < (s.x + s.width) / 2
    && y >= s.y / 2 && y < (s.y + s.height) / 2);
  const visible = (x, y) => {
    if (!contains(x, y)) return false;
    if (!contains(x - 1, y) && noise(Math.floor(y / 3), top.treeIndex + 7) > 0.72) return false;
    if (!contains(x + 1, y) && noise(Math.floor(y / 2), top.treeIndex + 31) > 0.75) return false;
    const corner = x < top.x / 2 + 3 || x >= (top.x + top.width) / 2 - 3;
    return !(y === top.y / 2 && corner && noise(x, top.treeIndex + 4) > 0.45);
  };
  // Clip every bark/cut-face stroke to that same crisp, slightly chipped mask.
  const canvas = c;
  c = { fillStyle: '', fillRect(x, y, width, height) {
    canvas.fillStyle = this.fillStyle;
    for (let dy = y; dy < y + height; dy++) {
      for (let dx = x; dx < x + width; dx++) {
        if (visible(dx, dy)) canvas.fillRect(dx, dy, 1, 1);
      }
    }
  } };
  for (const s of sections) {
    for (let y = s.y / 2; y < (s.y + s.height) / 2; y++) {
      for (let x = s.x / 2; x < (s.x + s.width) / 2; x++) {
        const edge = !contains(x - 1, y) || !contains(x + 1, y) || !contains(x, y + 1);
        // Furrows follow the widening base like the roots of a riverbank tree.
        const rootFlare = Math.max(0, y - bottom + 14) / 14;
        const grainX = Math.round(center + (x - center) / (1 + rootFlare * 0.4));
        const grain = noise(grainX, top.treeIndex + 21);
        const fleck = noise(x, y);
        const color = edge ? wood.outline : grain < 0.20 ? wood.dark
          : grain < 0.48 ? wood.bark : grain < 0.80 ? wood.grain
            : grain < 0.96 ? wood.light : wood.highlight;
        ink(c, color, x, y);
        if (!edge && fleck > 0.97) ink(c, wood.highlight, x, y);
        if (!edge && fleck < 0.035) ink(c, wood.split, x, y);
      }
    }
    // A lit upper edge marks each visible shoulder/root as a real ledge.
    for (let x = s.x / 2; x < (s.x + s.width) / 2; x++) {
      if (!contains(x, s.y / 2 - 1)) ink(c, wood.light, x, s.y / 2);
    }
  }
  const x = top.x / 2, y = top.y / 2, w = top.width / 2;
  // Every upward-facing vertical crown is hollow, including tall deadwood.
  hollowCut(c, x, y, w, Math.min(12, Math.max(9, top.height / 2 - 1)), top.treeIndex);
  if (!isStump) {
    // A dry bark split below the small, level cut of the taller trunks.
    for (let row = 13; row < 28; row++) {
      const splitX = Math.round(x + w * 0.6 + Math.floor(row / 7) % 2);
      if (contains(splitX, y + row)) ink(c, wood.split, splitX, y + row, 1, 1);
    }
  }
  // Warm worn root tips; no secondary grey/green wood palette.
  for (let dx = 2; dx < base.width / 2 - 2; dx += 3) {
    if (noise(dx, top.treeIndex) > 0.45) ink(c, wood.light, base.x / 2 + dx, bottom - 2, 2, 1);
  }
}

export function makeLandscape(scene, { width, height, worldWidth, groundY, gaps, surfaces }) {
  const backgrounds = [];
  const layer = (name, factor, paint) => {
    const texture = scene.textures.createCanvas(name, width / 2, height / 2);
    paint(texture.context);
    texture.refresh();
    for (let x = 0; x < width + worldWidth * factor; x += width) {
      backgrounds.push(scene.add.image(x, 0, name).setOrigin(0).setScale(2).setScrollFactor(factor, 0));
    }
  };
  layer('sunset', 0, c => {
    const stops = [[0, [114, 137, 40]], [90, [205, 177, 47]], [165, [245, 153, 43]], [211, [225, 107, 45]]];
    for (let y = 0; y < 212; y++) {
      let i = 0;
      while (i < stops.length - 2 && y > stops[i + 1][0]) i++;
      const [a, ca] = stops[i], [b, cb] = stops[i + 1];
      const t = Math.round((y - a) / (b - a) * 24) / 24;
      ink(c, `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * t)).join(',')})`, 0, y, 640, 1);
    }
    oval(c, '#ffdc70', 465, 178, 27, 27);
    for (const [x, y, w] of [[82, 74, 83], [298, 53, 60], [542, 101, 66]]) {
      for (let dx = 0; dx < w; dx++) {
        const h = Math.max(1, Math.sin(Math.PI * dx / w) * (3 + 8 * Math.sin(dx * 0.08) ** 2));
        ink(c, '#f9cd6b', x + dx, y - h, 1, h);
      }
      ink(c, '#edb552', x + 5, y + 1, w - 10, 1);
    }
    for (let y = 210; y < 360; y++) {
      const t = (y - 210) / 150;
      const rgb = [168 - 102 * t, 150 - 38 * t, 85 + 17 * t].map(Math.round);
      ink(c, `rgb(${rgb.join(',')})`, 0, y, 640, 1);
      for (let j = 0; j < 10; j++) {
        const x = noise(j * 17, y) * 640;
        if (y % 3 === 0) ink(c, y % 2 ? '#9fa574' : '#699385', x, y, 3 + noise(y, j) * 20, 1);
      }
      if (y % 3 === 0) {
        const span = 16 + t * 48;
        ink(c, y % 2 ? '#efbd5c' : '#f7ce70', 465 - span / 2 + (noise(y, 6) - 0.5) * 20, y, span * (0.5 + noise(y, 3)), 1);
      }
    }
  });
  layer('distant-islands', 0.16, c => {
    island(c, -20, 214, 184, 12, false);
    island(c, 238, 218, 120, 23, false);
    island(c, 508, 213, 146, 45, false);
  });
  layer('near-islands', 0.32, c => {
    island(c, 42, 257, 169, 83, true);
    willow(c, 116, 250, 0.77, 15, true);
    island(c, 512, 268, 121, 41, true);
    willow(c, 575, 260, 0.6, 27, true);
    for (const [x, y, w] of [[51, 264, 155], [522, 274, 102]]) {
      for (let i = 0; i < 4; i++) ink(c, '#6e927c', x + i * 9, y + i * 3, w - i * 21, 1);
    }
  });

  const texture = scene.textures.createCanvas('level-terrain', worldWidth / 2, height / 2);
  const c = texture.context;
  for (const gap of gaps) {
    const x = gap.x / 2, w = gap.width / 2, y = groundY / 2 + 10;
    ink(c, '#18535a', x, y, w, 40);
    for (let dy = 0; dy < 40; dy += 2) {
      for (let dx = 0; dx < w; dx += 6) {
        const col = dy < 4 ? ['#c6d8b1', '#82b9a4', '#4d9b91'] : ['#25717b', '#368a8c', '#519f97'];
        ink(c, col[Math.floor(noise(dx, dy) * 3)], x + dx, y + dy + Math.round(noise(dy, dx)), Math.min(w - dx, 3 + noise(dx, 2) * 7), 1);
      }
    }
  }
  for (const surface of surfaces) {
    if (surface.treeIndex !== undefined) continue;
    const x = surface.x / 2, y = surface.y / 2, w = surface.width / 2, h = surface.height / 2;
    if (surface.kind === 'log') {
      // Tiny stepped bark chips at the ends, within the original bounds.
      // Keep the entire upper support line intact, rather than rounding it.
      const ends = row => row < 2 ? [0, 0] : row >= h - 2
        ? [2 + row % 2, 1 + row % 2]
        : [Math.floor(noise(Math.floor(row / 2), x) * 3),
          Math.floor(noise(Math.floor(row / 3), x + 19) * 3)];
      c.save();
      c.beginPath();
      for (let row = 0; row < h; row++) {
        const [left, right] = ends(row);
        c.rect(x + left, y + row, w - left - right, 1);
      }
      c.clip();
      ink(c, LOG_WOOD.outline, x, y, w, h);
      ink(c, LOG_WOOD.bark, x + 1, y + 1, w - 2, h - 2);
      for (let row = 2; row < h - 2; row++) {
        const color = row < 8 ? LOG_WOOD.light : row > h - 7 ? LOG_WOOD.dark : LOG_WOOD.grain;
        ink(c, color, x + 1, y + row, w - 3, 1);
        for (let dx = 3; dx < w - 14; dx += 8) {
          if (noise(row, dx) > 0.5) ink(c, row % 3 ? LOG_WOOD.furrow : LOG_WOOD.highlight, x + dx, y + row, 4 + noise(dx, row) * 6, 1);
        }
      }
      oval(c, LOG_WOOD.rim, x + w - 9, y + h / 2, 8, h / 2 - 1);
      oval(c, LOG_WOOD.cut, x + w - 9, y + h / 2, 6, h / 2 - 3);
      for (const r of [8, 4]) {
        oval(c, LOG_WOOD.ring, x + w - 9, y + h / 2, r / 2, r);
        oval(c, LOG_WOOD.heart, x + w - 9, y + h / 2, Math.max(1, r / 2 - 1), r - 1);
      }
      branch(c, LOG_WOOD.split, x + w - 9, y + 3, x + w - 8, y + 9, 1);
      for (let dx = 4; dx < w - 22; dx++) if (noise(dx, 15) > 0.3) ink(c, dx % 3 ? LOG_WOOD.bark : LOG_WOOD.light, x + dx, y + 1, 1, 1 + noise(dx, 3) * 2);
      for (let row = 2; row < h; row++) {
        const [left, right] = ends(row);
        ink(c, LOG_WOOD.outline, x + left, y + row);
        ink(c, LOG_WOOD.rim, x + w - right - 1, y + row);
        if (row % 5 === 2) {
          ink(c, LOG_WOOD.highlight, x + left + 1, y + row, 3, 1);
          ink(c, LOG_WOOD.light, x + w - right - 4, y + row, 3, 1);
        }
      }
      c.restore();
      continue;
    }
    ink(c, '#49351f', x, y, w, h);
    ink(c, '#a85b2e', x + 1, y + 6, w - 2, h - 6);
    for (let dy = 7; dy < h; dy++) {
      for (let dx = 1; dx < w - 1; dx++) {
        const n = noise(Math.floor((x + dx) / 3), Math.floor((y + dy) / 2));
        if (n > 0.69) ink(c, n > 0.89 ? '#794829' : '#bc7037', x + dx, y + dy);
        if (noise(x + dx, y + dy) > 0.975) ink(c, '#d28b45', x + dx, y + dy, 1, 1);
      }
    }
    for (let dx = 0; dx < w; dx++) {
      const tuft = 4 + Math.round(2 * Math.sin(dx * 0.7) + noise(dx + x, 6) * 3);
      ink(c, '#293e24', x + dx, y + 2, 1, tuft + 3);
      ink(c, '#527527', x + dx, y + 1, 1, tuft);
      ink(c, '#829634', x + dx, y + 1, 1, Math.max(1, tuft - 3));
      ink(c, dx % 4 ? '#b2b64c' : '#d0c760', x + dx, y, 1, 1);
      if (dx % 6 === 0) ink(c, '#a0ad42', x + dx, y + 2, 1, 2);
    }
    // Short exposed roots blend the grass edge into the barranca.
    for (let dx = 9; dx < w - 4; dx += 23) {
      branch(c, '#714725', x + dx, y + 8, x + dx - 2, y + 14, 1);
    }
  }
  for (const worldX of [96, 624, 1464, 2320, 3320, 4020, 4296,
    4504, 4770, 5008, 5270, 5598, 5880, 6160, 6420, 6656]) {
    const x = worldX / 2, y = groundY / 2;
    for (let i = 0; i < 9; i++) {
      const dx = (i - 4) * 2;
      const top = y - 5 - noise(i, x) * 10;
      branch(c, '#29462a', x, y - 1, x + dx, top, 2);
      branch(c, i % 2 ? '#769033' : '#a4ac42', x, y - 1, x + dx, top, 1);
    }
    if (worldX === 96 || worldX === 4020 || worldX === 5270 || worldX === 6656) {
      for (let i = 0; i < 3; i++) {
        branch(c, '#506b30', x + i * 4, y, x + i * 4 - 2, y - 21 - i * 3, 1);
        ink(c, '#694a29', x + i * 4 - 3, y - 25 - i * 3, 2, 6);
      }
    }
  }
  const trees = new Map();
  for (const surface of surfaces) {
    if (surface.treeIndex === undefined) continue;
    if (!trees.has(surface.treeIndex)) trees.set(surface.treeIndex, []);
    trees.get(surface.treeIndex).push(surface);
  }
  for (const sections of trees.values()) deadwood(c, sections);
  texture.refresh();
  scene.add.image(0, 0, 'level-terrain').setOrigin(0).setScale(2);
  return backgrounds;
}
