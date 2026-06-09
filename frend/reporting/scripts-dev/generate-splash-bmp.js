/*
 * Generates the portable-extraction splash (splash-dark.bmp) directly from a branded SVG
 * using sharp — no Electron screen-capture needed. The artwork matches app/splash-bmp.html
 * and the brand: daisyUI dark base-100 (#1d232a) background, temple icon from
 * brand.component, "D" in foreground white + "P" in terracotta (#d18361).
 *
 * Writes a 32-bit BGRA bottom-up BI_RGB .bmp — the exact format electron-builder's portable
 * splashImage consumes (and the same format main.ts' writeBmpFromNativeImage produced).
 *
 * Run:  node scripts-dev/generate-splash-bmp.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 360;
const H = 300;

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="warm" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d18361"/>
      <stop offset="1" stop-color="#d4a843"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#1d232a"/>
  <rect width="${W}" height="5" fill="url(#warm)"/>

  <!-- Temple of Pallas Athena — identical artwork to brand.component, centred. -->
  <svg x="${(W - 116) / 2}" y="56" width="116" height="116" viewBox="0 0 256 256">
    <rect x="32" y="56" width="192" height="14" fill="#f0e2c0"/>
    <rect x="32" y="70" width="192" height="22" fill="#c9603a"/>
    <rect x="32" y="92" width="192" height="8" fill="#e8d4a8"/>
    <rect x="32" y="100" width="192" height="6" fill="#d4a843"/>
    <rect x="44"  y="106" width="36" height="98" fill="#f8f2e8"/>
    <rect x="110" y="106" width="36" height="98" fill="#f8f2e8"/>
    <rect x="176" y="106" width="36" height="98" fill="#f8f2e8"/>
    <rect x="77"  y="106" width="5" height="98" fill="#b89858"/>
    <rect x="143" y="106" width="5" height="98" fill="#b89858"/>
    <rect x="209" y="106" width="3" height="98" fill="#b89858"/>
    <rect x="32" y="204" width="192" height="6" fill="#d4a843"/>
    <rect x="20"  y="210" width="216" height="10" fill="#e8d4a8"/>
    <rect x="0"   y="220" width="256" height="14" fill="#c8a860"/>
  </svg>

  <!-- "DP" monogram: D italic (foreground), P upright (terracotta), Garamond stack. -->
  <text x="${W / 2}" y="244" text-anchor="middle"
        font-family="Georgia,'Times New Roman',serif"
        font-weight="700" font-size="104" letter-spacing="2">
    <tspan font-style="italic" fill="#e8ebf2">D</tspan><tspan font-style="normal" fill="#d18361">P</tspan>
  </text>
</svg>`;

async function main() {
  // RGBA, top-down, premultiplied-against-nothing (opaque background fills everything).
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const rowBytes = width * 4;
  const pixels = Buffer.alloc(data.length);

  // sharp gives RGBA top-down; BMP wants BGRA bottom-up.
  for (let y = 0; y < height; y++) {
    const src = y * rowBytes;
    const dst = (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const s = src + x * 4;
      const d = dst + x * 4;
      pixels[d] = data[s + 2];     // B
      pixels[d + 1] = data[s + 1]; // G
      pixels[d + 2] = data[s];     // R
      pixels[d + 3] = data[s + 3]; // A
    }
  }

  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const pixelDataOffset = fileHeaderSize + infoHeaderSize;
  const fileSize = pixelDataOffset + pixels.length;
  const header = Buffer.alloc(pixelDataOffset);

  header.writeUInt16LE(0x4d42, 0);            // 'BM'
  header.writeUInt32LE(fileSize, 2);
  header.writeUInt32LE(pixelDataOffset, 10);
  header.writeUInt32LE(infoHeaderSize, 14);   // biSize
  header.writeInt32LE(width, 18);             // biWidth
  header.writeInt32LE(height, 22);            // biHeight (positive = bottom-up)
  header.writeUInt16LE(1, 26);                // biPlanes
  header.writeUInt16LE(32, 28);               // biBitCount
  header.writeUInt32LE(0, 30);                // BI_RGB
  header.writeUInt32LE(pixels.length, 34);    // biSizeImage

  const bmp = Buffer.concat([header, pixels]);

  const targets = [
    path.resolve(__dirname, '../src/assets/images/splash-dark.bmp'),
    path.resolve(__dirname, '../dist/assets/images/splash-dark.bmp'),
  ];
  for (const t of targets) {
    if (fs.existsSync(path.dirname(t))) {
      fs.writeFileSync(t, bmp);
      console.log('wrote', t, `(${width}x${height}, ${bmp.length} bytes)`);
    } else {
      console.log('skip (dir missing)', t);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
