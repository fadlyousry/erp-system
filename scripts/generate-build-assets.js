const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { execFile } = require("child_process");
const { promisify } = require("util");

const ICON_SIZE = 256;
const projectRoot = process.cwd();
const buildDir = path.join(projectRoot, "build");
const sourceBrandPath = path.join(buildDir, "source-brand.png");
const iconPngPath = path.join(buildDir, "icon.png");
const iconIcoPath = path.join(buildDir, "icon.ico");
const installerIconPath = path.join(buildDir, "installerIcon.ico");
const uninstallerIconPath = path.join(buildDir, "uninstallerIcon.ico");
const execFileAsync = promisify(execFile);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const dataBuffer = Buffer.from(data);
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(dataBuffer.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, dataBuffer])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, dataBuffer, crcBuffer]);
}

function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgbaBuffer.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIcoFromPng(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const directoryEntry = Buffer.alloc(16);
  directoryEntry[0] = size >= 256 ? 0 : size;
  directoryEntry[1] = size >= 256 ? 0 : size;
  directoryEntry[2] = 0;
  directoryEntry[3] = 0;
  directoryEntry.writeUInt16LE(1, 4);
  directoryEntry.writeUInt16LE(32, 6);
  directoryEntry.writeUInt32LE(pngBuffer.length, 8);
  directoryEntry.writeUInt32LE(22, 12);

  return Buffer.concat([header, directoryEntry, pngBuffer]);
}

function escapePowerShellLiteral(value) {
  return String(value).replace(/'/g, "''");
}

async function resizeBrandSourceToPng(sourcePath, targetPath, size) {
  const command = [
    "Add-Type -AssemblyName System.Drawing;",
    `$src='${escapePowerShellLiteral(sourcePath)}';`,
    `$dst='${escapePowerShellLiteral(targetPath)}';`,
    `$size=${Number(size) || ICON_SIZE};`,
    "$image=[System.Drawing.Image]::FromFile($src);",
    "try {",
    "  if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }",
    "  $bitmap=New-Object System.Drawing.Bitmap $size,$size;",
    "  try {",
    "    $graphics=[System.Drawing.Graphics]::FromImage($bitmap);",
    "    try {",
    "      $graphics.Clear([System.Drawing.Color]::Transparent);",
    "      $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;",
    "      $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality;",
    "      $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality;",
    "      $graphics.DrawImage($image, 0, 0, $size, $size);",
    "      $bitmap.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png);",
    "    } finally { if ($graphics) { $graphics.Dispose() } }",
    "  } finally { if ($bitmap) { $bitmap.Dispose() } }",
    "} finally { if ($image) { $image.Dispose() } }",
  ].join(" ");

  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    command,
  ], {
    windowsHide: true,
  });
}

async function buildFromBrandSource() {
  await resizeBrandSourceToPng(sourceBrandPath, iconPngPath, ICON_SIZE);

  const pngBuffer = await fs.readFile(iconPngPath);
  const icoBuffer = createIcoFromPng(pngBuffer, ICON_SIZE);

  await fs.writeFile(iconIcoPath, icoBuffer);
  await fs.writeFile(installerIconPath, icoBuffer);
  await fs.writeFile(uninstallerIconPath, icoBuffer);

  return {
    iconPngPath,
    iconIcoPath,
    installerIconPath,
    uninstallerIconPath,
  };
}

function setPixel(buffer, x, y, color) {
  if (x < 0 || y < 0 || x >= ICON_SIZE || y >= ICON_SIZE) {
    return;
  }

  const index = (y * ICON_SIZE + x) * 4;
  buffer[index] = color[0];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[2];
  buffer[index + 3] = color[3];
}

function blendPixel(buffer, x, y, color, alphaScale = 1) {
  if (x < 0 || y < 0 || x >= ICON_SIZE || y >= ICON_SIZE) {
    return;
  }

  const index = (y * ICON_SIZE + x) * 4;
  const sourceAlpha = (color[3] / 255) * alphaScale;
  const destinationAlpha = buffer[index + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

  if (outputAlpha <= 0) {
    return;
  }

  buffer[index] = Math.round(
    (color[0] * sourceAlpha + buffer[index] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha
  );
  buffer[index + 1] = Math.round(
    (color[1] * sourceAlpha + buffer[index + 1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha
  );
  buffer[index + 2] = Math.round(
    (color[2] * sourceAlpha + buffer[index + 2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha
  );
  buffer[index + 3] = Math.round(outputAlpha * 255);
}

function fillBackground(buffer) {
  const topColor = [14, 116, 144];
  const bottomColor = [8, 47, 73];

  for (let y = 0; y < ICON_SIZE; y += 1) {
    const t = y / (ICON_SIZE - 1);
    const rowColor = [
      Math.round(topColor[0] + (bottomColor[0] - topColor[0]) * t),
      Math.round(topColor[1] + (bottomColor[1] - topColor[1]) * t),
      Math.round(topColor[2] + (bottomColor[2] - topColor[2]) * t),
      255,
    ];

    for (let x = 0; x < ICON_SIZE; x += 1) {
      const glow = Math.max(0, 1 - Math.hypot(x - 196, y - 54) / 210);
      const color = [
        Math.min(255, rowColor[0] + Math.round(24 * glow)),
        Math.min(255, rowColor[1] + Math.round(40 * glow)),
        Math.min(255, rowColor[2] + Math.round(56 * glow)),
        255,
      ];
      setPixel(buffer, x, y, color);
    }
  }
}

function drawRoundedRect(buffer, x, y, width, height, radius, color) {
  const right = x + width;
  const bottom = y + height;
  const radiusSquared = radius * radius;

  for (let py = y; py < bottom; py += 1) {
    for (let px = x; px < right; px += 1) {
      const cornerX = px < x + radius ? x + radius : px > right - radius ? right - radius - 1 : px;
      const cornerY = py < y + radius ? y + radius : py > bottom - radius ? bottom - radius - 1 : py;
      const dx = px - cornerX;
      const dy = py - cornerY;

      if (dx * dx + dy * dy <= radiusSquared) {
        blendPixel(buffer, px, py, color);
      }
    }
  }
}

function drawBorder(buffer, x, y, width, height, radius, thickness, color) {
  drawRoundedRect(buffer, x, y, width, height, radius, color);
  carveRoundedRect(
    buffer,
    x + thickness,
    y + thickness,
    width - thickness * 2,
    height - thickness * 2,
    Math.max(0, radius - thickness)
  );
}

function carveRoundedRect(buffer, x, y, width, height, radius) {
  const right = x + width;
  const bottom = y + height;
  const radiusSquared = radius * radius;

  for (let py = y; py < bottom; py += 1) {
    for (let px = x; px < right; px += 1) {
      const cornerX = px < x + radius ? x + radius : px > right - radius ? right - radius - 1 : px;
      const cornerY = py < y + radius ? y + radius : py > bottom - radius ? bottom - radius - 1 : py;
      const dx = px - cornerX;
      const dy = py - cornerY;

      if (dx * dx + dy * dy <= radiusSquared) {
        const index = (py * ICON_SIZE + px) * 4;
        buffer[index + 3] = 0;
      }
    }
  }
}

function addSoftGlow(buffer, centerX, centerY, radius, color, opacity = 0.24) {
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(ICON_SIZE - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(ICON_SIZE - 1, Math.ceil(centerY + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > radius) {
        continue;
      }

      const intensity = (1 - distance / radius) * opacity;
      blendPixel(buffer, x, y, color, intensity);
    }
  }
}

function drawBlock(buffer, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      blendPixel(buffer, px, py, color);
    }
  }
}

function drawGlyph(buffer, glyph, offsetX, offsetY, scale, color) {
  glyph.forEach((row, rowIndex) => {
    [...row].forEach((cell, cellIndex) => {
      if (cell !== "1") {
        return;
      }

      drawBlock(
        buffer,
        offsetX + cellIndex * scale,
        offsetY + rowIndex * scale,
        scale,
        scale,
        color
      );
    });
  });
}

function drawLettering(buffer) {
  const glyphs = {
    S: [
      "11111",
      "10000",
      "11110",
      "00001",
      "11111",
    ],
    M: [
      "10001",
      "11011",
      "10101",
      "10001",
      "10001",
    ],
  };

  const letters = ["S", "M"];
  const scale = 16;
  const gap = 12;
  const glyphWidth = 5 * scale;
  const totalWidth = glyphWidth * letters.length + gap * (letters.length - 1);
  const startX = Math.round((ICON_SIZE - totalWidth) / 2);
  const startY = 102;

  addSoftGlow(buffer, 128, 144, 92, [249, 115, 22, 255], 0.22);

  let x = startX;
  for (const key of letters) {
    drawGlyph(buffer, glyphs[key], x + 3, startY + 4, scale, [12, 30, 46, 90]);
    drawGlyph(buffer, glyphs[key], x, startY, scale, [255, 244, 219, 255]);
    x += glyphWidth + gap;
  }
}

function drawAccentBars(buffer) {
  const accent = [249, 115, 22, 255];
  const muted = [255, 255, 255, 130];

  drawRoundedRect(buffer, 34, 34, 188, 188, 42, [255, 255, 255, 20]);
  drawRoundedRect(buffer, 42, 42, 172, 172, 36, [255, 255, 255, 8]);

  drawRoundedRect(buffer, 48, 54, 62, 10, 5, accent);
  drawRoundedRect(buffer, 146, 192, 62, 10, 5, accent);
  drawRoundedRect(buffer, 48, 192, 32, 6, 3, muted);
  drawRoundedRect(buffer, 176, 58, 32, 6, 3, muted);
}

function renderIconBuffer() {
  const rgba = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4, 0);
  fillBackground(rgba);
  drawAccentBars(rgba);
  drawLettering(rgba);
  drawBorder(rgba, 18, 18, 220, 220, 54, 2, [255, 255, 255, 70]);
  return rgba;
}

async function generateBuildAssets() {
  await fs.mkdir(buildDir, { recursive: true });

  try {
    await fs.access(sourceBrandPath);
    return await buildFromBrandSource();
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const rgba = renderIconBuffer();
  const pngBuffer = createPng(ICON_SIZE, ICON_SIZE, rgba);
  const icoBuffer = createIcoFromPng(pngBuffer, ICON_SIZE);

  await fs.writeFile(iconPngPath, pngBuffer);
  await fs.writeFile(iconIcoPath, icoBuffer);
  await fs.writeFile(installerIconPath, icoBuffer);
  await fs.writeFile(uninstallerIconPath, icoBuffer);

  return {
    iconPngPath,
    iconIcoPath,
    installerIconPath,
    uninstallerIconPath,
  };
}

module.exports = {
  generateBuildAssets,
};

if (require.main === module) {
  generateBuildAssets()
    .then((result) => {
      console.log(`generate-build-assets: wrote ${result.iconIcoPath}`);
    })
    .catch((error) => {
      console.error("generate-build-assets: failed:", error.message);
      process.exit(1);
    });
}
