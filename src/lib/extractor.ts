// Image asset extraction pipeline (browser-side, deterministic).

export type AssetKind = "icon" | "illustration" | "text" | "button" | "unknown";

export interface DetectedAsset {
  id: string;
  name: string;
  bbox: { x: number; y: number; w: number; h: number };
  preview: string; // transparent PNG data URL
  selected: boolean;
  confidence: number;
  kind: AssetKind;
}

export type Roi =
  | { type: "rect"; x: number; y: number; w: number; h: number } // normalized 0..1
  | { type: "poly"; points: { x: number; y: number }[] } // normalized 0..1
  | null;

export interface ExtractOptions {
  threshold: number; // 0..100
  sensitivity: number; // 0..100
  maxWidth?: number;
  roi?: Roi;
}

interface RGB { r: number; g: number; b: number }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawScaled(img: HTMLImageElement, maxWidth: number) {
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx, w, h, scale };
}

function estimateBackground(data: Uint8ClampedArray, w: number, h: number): RGB {
  // Sample edge pixels and quantize
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  const sample = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.n++;
    buckets.set(key, bucket);
  };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 100));
  for (let x = 0; x < w; x += step) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += step) { sample(0, y); sample(w - 1, y); }
  let best = { r: 255, g: 255, b: 255, n: 0 };
  for (const b of buckets.values()) if (b.n > best.n) best = b;
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
}

function colorDist(r: number, g: number, b: number, bg: RGB) {
  const dr = r - bg.r, dg = g - bg.g, db = b - bg.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function buildMask(data: Uint8ClampedArray, w: number, h: number, bg: RGB, threshold: number): Uint8Array {
  // threshold 0..100 -> distance 10..120
  const cutoff = 10 + (threshold / 100) * 110;
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (colorDist(data[i], data[i + 1], data[i + 2], bg) > cutoff) mask[p] = 1;
  }
  return mask;
}

interface Component {
  minX: number; minY: number; maxX: number; maxY: number; size: number;
}

function connectedComponents(mask: Uint8Array, w: number, h: number): Component[] {
  const labels = new Int32Array(w * h);
  const comps: Component[] = [];
  const stackX = new Int32Array(w * h);
  const stackY = new Int32Array(w * h);
  let nextLabel = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || labels[idx]) continue;
      nextLabel++;
      let sp = 0;
      stackX[sp] = x; stackY[sp] = y; sp++;
      labels[idx] = nextLabel;
      let minX = x, minY = y, maxX = x, maxY = y, size = 0;
      while (sp > 0) {
        sp--;
        const cx = stackX[sp], cy = stackY[sp];
        size++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        // 8-connected
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (mask[ni] && !labels[ni]) {
              labels[ni] = nextLabel;
              stackX[sp] = nx; stackY[sp] = ny; sp++;
            }
          }
        }
      }
      comps.push({ minX, minY, maxX, maxY, size });
    }
  }
  return comps;
}

function mergeOverlapping(boxes: Component[], pad: number): Component[] {
  // Merge boxes whose padded rectangles intersect.
  const merged: Component[] = [];
  const used = new Array(boxes.length).fill(false);
  for (let i = 0; i < boxes.length; i++) {
    if (used[i]) continue;
    let cur = { ...boxes[i] };
    used[i] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < boxes.length; j++) {
        if (used[j]) continue;
        const b = boxes[j];
        const ax1 = cur.minX - pad, ay1 = cur.minY - pad, ax2 = cur.maxX + pad, ay2 = cur.maxY + pad;
        const bx1 = b.minX - pad, by1 = b.minY - pad, bx2 = b.maxX + pad, by2 = b.maxY + pad;
        if (ax1 <= bx2 && ax2 >= bx1 && ay1 <= by2 && ay2 >= by1) {
          cur.minX = Math.min(cur.minX, b.minX);
          cur.minY = Math.min(cur.minY, b.minY);
          cur.maxX = Math.max(cur.maxX, b.maxX);
          cur.maxY = Math.max(cur.maxY, b.maxY);
          cur.size += b.size;
          used[j] = true;
          changed = true;
        }
      }
    }
    merged.push(cur);
  }
  return merged;
}

function classify(w: number, h: number): AssetKind {
  const ar = w / h;
  const area = w * h;
  if (area < 4000) return "icon";
  if (ar > 3) return "button";
  if (ar > 1.6 && h < 60) return "text";
  if (area > 30000) return "illustration";
  return "unknown";
}

function cropTransparent(
  srcCanvas: HTMLCanvasElement,
  bbox: { x: number; y: number; w: number; h: number },
  bg: RGB,
  threshold: number,
): string {
  const cutoff = 10 + (threshold / 100) * 110;
  const c = document.createElement("canvas");
  c.width = bbox.w; c.height = bbox.h;
  const cctx = c.getContext("2d")!;
  cctx.drawImage(srcCanvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
  const img = cctx.getImageData(0, 0, bbox.w, bbox.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const dist = colorDist(d[i], d[i + 1], d[i + 2], bg);
    if (dist <= cutoff) {
      d[i + 3] = 0;
    } else if (dist < cutoff * 1.4) {
      // soft edge alpha
      d[i + 3] = Math.round(((dist - cutoff) / (cutoff * 0.4)) * 255);
    }
  }
  cctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export async function extractAssets(src: string, opts: ExtractOptions): Promise<DetectedAsset[]> {
  const { threshold, sensitivity, maxWidth = 1200 } = opts;
  const img = await loadImage(src);
  const { canvas, ctx, w, h } = drawScaled(img, maxWidth);
  const imageData = ctx.getImageData(0, 0, w, h);
  const bg = estimateBackground(imageData.data, w, h);
  const mask = buildMask(imageData.data, w, h, bg, threshold);

  const comps = connectedComponents(mask, w, h);

  // Sensitivity 0..100: map to min size threshold
  // higher sensitivity -> keep smaller
  const minSize = Math.max(8, Math.round((1 - sensitivity / 100) * 800 + 20));
  const filtered = comps.filter(c => c.size >= minSize);

  const padding = 12;
  const merged = mergeOverlapping(filtered, padding);

  // Drop components that span almost the whole image
  const fullWidthLimit = w * 0.95;
  const fullHeightLimit = h * 0.95;
  const final = merged.filter(c => {
    const cw = c.maxX - c.minX + 1;
    const ch = c.maxY - c.minY + 1;
    return !(cw > fullWidthLimit && ch > fullHeightLimit);
  });

  // Sort by reading order (top, then left)
  final.sort((a, b) => a.minY - b.minY || a.minX - b.minX);

  const assets: DetectedAsset[] = final.map((c, i) => {
    const x = Math.max(0, c.minX - padding);
    const y = Math.max(0, c.minY - padding);
    const x2 = Math.min(w - 1, c.maxX + padding);
    const y2 = Math.min(h - 1, c.maxY + padding);
    const bbox = { x, y, w: x2 - x + 1, h: y2 - y + 1 };
    const kind = classify(bbox.w, bbox.h);
    const preview = cropTransparent(canvas, bbox, bg, threshold);
    const density = c.size / (bbox.w * bbox.h);
    return {
      id: `asset-${i}-${bbox.x}-${bbox.y}`,
      name: `${kind}-${i + 1}`,
      bbox,
      preview,
      selected: false,
      confidence: Math.min(1, 0.4 + density * 1.5),
      kind,
    };
  });

  return assets;
}

export function assetToSvg(asset: DetectedAsset): string {
  const { w, h } = asset.bbox;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="${asset.preview}" width="${w}" height="${h}" />
</svg>`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
