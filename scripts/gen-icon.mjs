// Generate a source app icon (a small node-graph motif) as a PNG, with zero deps.
// Then `npm run tauri icon src-tauri/app-icon.png` rasterizes the platform set.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const S = 1024;
const buf = Buffer.alloc(S * S * 4);

const px = (x, y, [r, g, b, a = 255]) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const ia = a / 255;
  buf[i] = buf[i] * (1 - ia) + r * ia;
  buf[i + 1] = buf[i + 1] * (1 - ia) + g * ia;
  buf[i + 2] = buf[i + 2] * (1 - ia) + b * ia;
  buf[i + 3] = Math.max(buf[i + 3], a);
};

// Background: solid deep indigo with rounded corners.
const bg = [21, 24, 42];
const radius = 180;
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const cx = Math.min(x, S - 1 - x);
    const cy = Math.min(y, S - 1 - y);
    if (cx < radius && cy < radius) {
      const dx = radius - cx, dy = radius - cy;
      if (dx * dx + dy * dy > radius * radius) continue; // transparent corner
    }
    px(x, y, [...bg, 255]);
  }

const disc = (cx, cy, r, color) => {
  for (let y = cy - r - 2; y <= cy + r + 2; y++)
    for (let x = cx - r - 2; x <= cx + r + 2; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = d <= r ? 255 : d <= r + 1.5 ? Math.round(255 * (r + 1.5 - d) / 1.5) : 0;
      if (a > 0) px(x, y, [...color, a]);
    }
};

const segment = (x0, y0, x1, y1, w, color) => {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    disc(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), w, color);
  }
};

const nodes = {
  a: [512, 512],
  b: [512, 252],
  c: [296, 736],
  d: [728, 736],
};
const teal = [56, 189, 248];
const amber = [245, 184, 64];
const magenta = [232, 121, 222];
const edge = [120, 130, 170];

for (const [p, q] of [["a", "b"], ["a", "c"], ["a", "d"], ["c", "d"]])
  segment(...nodes[p], ...nodes[q], 9, edge);

disc(...nodes.b, 92, teal);
disc(...nodes.c, 80, amber);
disc(...nodes.d, 80, magenta);
disc(...nodes.a, 74, [236, 240, 248]);

// Encode PNG (truecolor + alpha, filter 0 per scanline).
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../src-tauri/app-icon.png", import.meta.url), png);
console.log(`wrote src-tauri/app-icon.png (${png.length} bytes)`);
