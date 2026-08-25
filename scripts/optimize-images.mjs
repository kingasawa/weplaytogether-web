// Nén ảnh trong public/images sang WebP với kích thước vừa đúng nhu cầu hiển thị.
//
// Vì sao cần: app deploy trên Cloudflare Workers (OpenNext). Không có binding IMAGES nên
// /_next/image trả nguyên file gốc, và mỗi request ảnh là một lần Worker chạy + đệm cả file
// trong RAM -> vượt giới hạn 128 MB -> lỗi 1102. Sau khi nén, next.config bật images.unoptimized
// để ảnh đi thẳng qua CDN static asset, Worker không đụng tới nữa.
//
// Chạy: node scripts/optimize-images.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve("public/images");
const DRY = process.argv.includes("--dry");

// Kích thước tối đa lấy từ số đo thực tế trên UI (CSS px) nhân 3 cho màn retina.
const PLANS = [
  { test: /^avatars\//, maxWidth: 160, quality: 82 },        // hiển thị tối đa 36px
  { test: /^boards\/cards\/avalon\//, maxWidth: 320, quality: 82 },
  { test: /^boards\/cards\/wolf\//, maxWidth: 640, quality: 78 }, // hiển thị tối đa 204px
  { test: /^boards\/avalon-bg\.png$/, maxWidth: 960, quality: 68 },
  { test: /^boards\/[^/]+\.png$/, maxWidth: 480, quality: 80 },   // ảnh bìa game, hiển thị 90px
  { test: /^home-bg\.png$/, maxWidth: 960, quality: 68 },
  { test: /^ui\/wolf_game_bg\.png$/, maxWidth: 960, quality: 68 },
  { test: /^ui\/mask_card\.png$/, maxWidth: 900, quality: 80 },
  { test: /^ui\/.+_btn\.png$/, maxWidth: 900, quality: 82 },
];
const DEFAULT_PLAN = { maxWidth: 960, quality: 78 };

// icon.png giữ nguyên định dạng PNG: dùng cho apple-touch-icon và manifest.
const KEEP_AS_PNG = new Set(["icon.png"]);
const ICON_SIZE = 512;

function listImages(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      out.push(...listImages(full, base));
      continue;
    }
    if (!/\.(png|jpe?g)$/i.test(name)) continue;
    out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

function planFor(rel) {
  return PLANS.find((plan) => plan.test.test(rel)) ?? DEFAULT_PLAN;
}

const rows = [];
let beforeTotal = 0;
let afterTotal = 0;

for (const rel of listImages(ROOT)) {
  const input = path.join(ROOT, rel);
  const before = fs.statSync(input).size;
  const meta = await sharp(input).metadata();
  beforeTotal += before;

  if (KEEP_AS_PNG.has(rel)) {
    const pipeline = sharp(input)
      .resize({ width: ICON_SIZE, height: ICON_SIZE, fit: "cover", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 90 });
    const buffer = await pipeline.toBuffer();
    afterTotal += buffer.length;
    rows.push({ rel, out: rel, before, after: buffer.length, dim: `${Math.min(meta.width, ICON_SIZE)}px` });
    if (!DRY) fs.writeFileSync(input, buffer);
    continue;
  }

  const plan = planFor(rel);
  const width = Math.min(meta.width, plan.maxWidth);
  const buffer = await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: plan.quality, effort: 6 })
    .toBuffer();
  const outRel = rel.replace(/\.(png|jpe?g)$/i, ".webp");
  afterTotal += buffer.length;
  rows.push({ rel, out: outRel, before, after: buffer.length, dim: `${meta.width}→${width}px` });
  if (!DRY) {
    fs.writeFileSync(path.join(ROOT, outRel), buffer);
    if (outRel !== rel) fs.unlinkSync(input);
  }
}

rows.sort((a, b) => b.before - a.before);
for (const r of rows) {
  const pct = Math.round((1 - r.after / r.before) * 100);
  console.log(
    `${String(Math.round(r.before / 1024)).padStart(6)} KB -> ${String(Math.round(r.after / 1024)).padStart(5)} KB  (-${String(pct).padStart(2)}%)  ${r.dim.padEnd(14)} ${r.out}`
  );
}
console.log(
  `\nTỔNG: ${(beforeTotal / 1024 / 1024).toFixed(1)} MB -> ${(afterTotal / 1024 / 1024).toFixed(2)} MB ` +
    `(-${Math.round((1 - afterTotal / beforeTotal) * 100)}%)${DRY ? "  [DRY RUN, chưa ghi file]" : ""}`
);
