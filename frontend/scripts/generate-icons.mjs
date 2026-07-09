// Gera os PNGs do PWA a partir do mesmo desenho do icon.svg,
// sem depender de nenhuma biblioteca externa.
// Uso: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');
mkdirSync(OUT, { recursive: true });

// ---- utilidades de cor / geometria ----
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
const BG1 = [74, 143, 212];  // #4a8fd4
const BG2 = [58, 175, 169];  // #3aafa9
const MARK = [255, 255, 255];
const MARK2 = [169, 203, 236]; // #a9cbec

// point in triangle
function inTri(px, py, a, b, c) {
  const d1 = sign(px, py, a, b);
  const d2 = sign(px, py, b, c);
  const d3 = sign(px, py, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function sign(px, py, p1, p2) {
  return (px - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (py - p2[1]);
}

// Desenha 1 pixel (supersample) do ícone. Retorna [r,g,b,a] 0..255.
// coords normalizadas 0..512.
function sample(x, y, { radius, transparentBg, monochrome, padding }) {
  const S = 512;
  // safe-area para maskable: encolhe o conteúdo
  const p = padding || 0;
  // cantos arredondados
  const r = radius;
  let insideRound = true;
  if (r > 0) {
    const cx = Math.min(Math.max(x, r), S - r);
    const cy = Math.min(Math.max(y, r), S - r);
    const dx = x - cx, dy = y - cy;
    insideRound = dx * dx + dy * dy <= r * r;
  }

  // fundo
  let bg;
  if (transparentBg) {
    bg = null;
  } else {
    const t = (x + y) / (2 * S);
    bg = mix(BG1, BG2, t);
  }

  // marca (paper plane) — escala com padding
  const sc = (v) => p + (v / S) * (S - 2 * p);
  const A = [sc(150), sc(150)];
  const B = [sc(378), sc(256)];
  const C = [sc(150), sc(362)];
  const M = [sc(188), sc(256)];

  let color = bg;
  let alpha = bg ? 255 : 0;

  // triângulo inferior (sombra) M,B,C
  if (inTri(x, y, M, B, C)) {
    color = monochrome ? MARK : MARK2;
    alpha = 255;
  }
  // corpo principal A,B,M (e A,M,C)
  if (inTri(x, y, A, B, M) || inTri(x, y, A, M, C)) {
    color = MARK;
    alpha = 255;
  }

  if (!insideRound) {
    // fora dos cantos arredondados -> transparente
    return [0, 0, 0, 0];
  }
  if (!color) return [0, 0, 0, 0];
  return [Math.round(color[0]), Math.round(color[1]), Math.round(color[2]), alpha];
}

function render(size, opts) {
  const SS = 3; // supersample
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = ((px + (sx + 0.5) / SS) / size) * 512;
          const ny = ((py + (sy + 0.5) / SS) / size) * 512;
          const [cr, cg, cb, ca] = sample(nx, ny, opts);
          r += cr; g += cg; b += cb; a += ca;
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      buf[i] = Math.round(r / n);
      buf[i + 1] = Math.round(g / n);
      buf[i + 2] = Math.round(b / n);
      buf[i + 3] = Math.round(a / n);
    }
  }
  return buf;
}

// ---- encoder PNG (RGBA, filtro 0) ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // filtro 0 por linha
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function save(name, size, opts) {
  const rgba = render(size, opts);
  writeFileSync(join(OUT, name), encodePNG(size, size, rgba));
  console.log('gerado', name);
}

// cantos ~112/512 do SVG
save('icon-192.png', 192, { radius: 42 });
save('icon-512.png', 512, { radius: 112 });
save('icon-maskable-512.png', 512, { radius: 0, padding: 80 }); // safe area p/ máscara
save('apple-touch-icon.png', 180, { radius: 0 }); // iOS aplica a própria máscara
save('icon-badge.png', 96, { radius: 0, transparentBg: true, monochrome: true });

console.log('OK');
