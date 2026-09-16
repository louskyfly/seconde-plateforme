import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.cwd(), 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

type RGB = [number, number, number];

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIcon(size: number, color1: RGB, color2: RGB): Buffer {
  const w = size;
  const h = size;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = y / h;
      const r = Math.round(color1[0] * (1 - t) + color2[0] * t);
      const g = Math.round(color1[1] * (1 - t) + color2[1] * t);
      const b = Math.round(color1[2] * (1 - t) + color2[2] * t);
      const radius = size * 0.22;
      const cx = Math.min(x, w - 1 - x);
      const cy = Math.min(y, h - 1 - y);
      let a = 255;
      if (cx < radius && cy < radius) {
        const dx = radius - cx;
        const dy = radius - cy;
        if (Math.sqrt(dx * dx + dy * dy) > radius) a = 0;
      }
      const idx = y * (w * 4 + 1) + 1 + x * 4;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const indigo: RGB = [99, 102, 241];
const violet: RGB = [168, 85, 247];
const dark: RGB = [15, 23, 42];

fs.writeFileSync(path.join(outDir, 'icon-192.png'), makeIcon(192, indigo, violet));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makeIcon(512, indigo, violet));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), makeIcon(180, indigo, dark));

console.log('Icônes PWA générées dans public/icons/');