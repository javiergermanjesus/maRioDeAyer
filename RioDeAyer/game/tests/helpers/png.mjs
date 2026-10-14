import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// Small RGBA8 decoder for measuring the real assets without a DOM or dependency.
export function readRgbaPng(url) {
  const png = readFileSync(url);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  assert.equal(png[28], 0);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const encoded = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = encoded[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? pixels[index - 4] : 0;
      const above = y > 0 ? pixels[index - stride] : 0;
      const corner = y > 0 && x >= 4 ? pixels[index - stride - 4] : 0;
      const p = left + above - corner;
      const distances = [Math.abs(p - left), Math.abs(p - above), Math.abs(p - corner)];
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2]
        ? left : distances[1] <= distances[2] ? above : corner;
      const predictor = [0, left, above, Math.floor((left + above) / 2), paeth][filter];
      pixels[index] = (encoded[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

export function alphaBounds(image, { x = 0, y = 0, width, height }, threshold = 128) {
  let left = width, top = height, right = 0, bottom = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (image.pixels[((y + row) * image.width + x + col) * 4 + 3] < threshold) continue;
      left = Math.min(left, col);
      top = Math.min(top, row);
      right = Math.max(right, col + 1);
      bottom = Math.max(bottom, row + 1);
    }
  }
  assert.ok(right > left && bottom > top);
  return { left, top, right, bottom };
}
