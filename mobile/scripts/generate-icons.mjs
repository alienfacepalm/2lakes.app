import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "../public/icons");
const svg = readFileSync(join(iconsDir, "icon.svg"));

const sizes = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-512.png", size: 512, padding: 64 },
];

for (const { name, size, padding = 0 } of sizes) {
  const inner = size - padding * 2;
  await sharp(svg)
    .resize(inner, inner)
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 30, b: 64, alpha: 1 },
    })
    .png()
    .toFile(join(iconsDir, name));
  console.log(`Wrote ${name}`);
}
