// Browser-side deterministic image asset extraction.

import { createAssetName, createAssetSlug } from "./naming";
import type {
  AssetKind,
  Bounds,
  DetectionSettings,
  ExtractedAsset,
  ManualSelection,
  Point,
  RGB,
  SourceImage,
} from "@/state/storyboard-types";

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  size: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for extraction."));
    img.src = src;
  });
}

function drawScaled(img: HTMLImageElement, maxWidth: number) {
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create image analysis context.");
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

function estimateBackground(data: Uint8ClampedArray, width: number, height: number): RGB {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n++;
    buckets.set(key, bucket);
  };

  const step = Math.max(1, Math.floor(Math.min(width, height) / 100));
  for (let x = 0; x < width; x += step) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    sample(0, y);
    sample(width - 1, y);
  }

  let best = { r: 255, g: 255, b: 255, n: 0 };
  for (const bucket of buckets.values()) {
    if (bucket.n > best.n) best = bucket;
  }
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
}

function colorDistance(r: number, g: number, b: number, bg: RGB) {
  const dr = r - bg.r;
  const dg = g - bg.g;
  const db = b - bg.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function createForegroundMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  background: RGB,
  settings: DetectionSettings,
) {
  const cutoff = 10 + (settings.threshold / 100) * 110;
  const sensitivityBoost = 1 - settings.sensitivity / 300;
  const effectiveCutoff = cutoff * sensitivityBoost;
  const mask = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (colorDistance(data[i], data[i + 1], data[i + 2], background) > effectiveCutoff) {
      mask[p] = 1;
    }
  }

  return mask;
}

function connectedComponents(mask: Uint8Array, width: number, height: number): Component[] {
  const labels = new Int32Array(width * height);
  const comps: Component[] = [];
  const stackX = new Int32Array(width * height);
  const stackY = new Int32Array(width * height);
  let nextLabel = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx] || labels[idx]) continue;

      nextLabel++;
      let sp = 0;
      stackX[sp] = x;
      stackY[sp] = y;
      sp++;
      labels[idx] = nextLabel;

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let size = 0;

      while (sp > 0) {
        sp--;
        const cx = stackX[sp];
        const cy = stackY[sp];
        size++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (mask[ni] && !labels[ni]) {
              labels[ni] = nextLabel;
              stackX[sp] = nx;
              stackY[sp] = ny;
              sp++;
            }
          }
        }
      }

      comps.push({ minX, minY, maxX, maxY, size });
    }
  }

  return comps;
}

function mergeOverlapping(boxes: Component[], distance: number): Component[] {
  const merged: Component[] = [];
  const used = new Array(boxes.length).fill(false);

  for (let i = 0; i < boxes.length; i++) {
    if (used[i]) continue;
    const cur = { ...boxes[i] };
    used[i] = true;
    let changed = true;

    while (changed) {
      changed = false;
      for (let j = 0; j < boxes.length; j++) {
        if (used[j]) continue;
        const b = boxes[j];
        const ax1 = cur.minX - distance;
        const ay1 = cur.minY - distance;
        const ax2 = cur.maxX + distance;
        const ay2 = cur.maxY + distance;
        const bx1 = b.minX - distance;
        const by1 = b.minY - distance;
        const bx2 = b.maxX + distance;
        const by2 = b.maxY + distance;

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

function classify(width: number, height: number): AssetKind {
  const aspectRatio = width / height;
  const area = width * height;
  if (area < 4000) return "icon";
  if (aspectRatio > 3) return "button";
  if (aspectRatio > 1.6 && height < 64) return "text";
  if (area > 30000) return "illustration";
  return "unknown";
}

function componentToBounds(
  component: Component,
  padding: number,
  width: number,
  height: number,
): Bounds {
  const x = Math.max(0, component.minX - padding);
  const y = Math.max(0, component.minY - padding);
  const x2 = Math.min(width - 1, component.maxX + padding);
  const y2 = Math.min(height - 1, component.maxY + padding);
  return { x, y, w: x2 - x + 1, h: y2 - y + 1 };
}

function cropTransparent(
  srcCanvas: HTMLCanvasElement,
  bbox: Bounds,
  bg: RGB,
  settings: DetectionSettings,
) {
  const cutoff = 10 + (settings.threshold / 100) * 110;
  const c = document.createElement("canvas");
  c.width = bbox.w;
  c.height = bbox.h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not crop asset.");
  ctx.drawImage(srcCanvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);

  const image = ctx.getImageData(0, 0, bbox.w, bbox.h);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    const dist = colorDistance(data[i], data[i + 1], data[i + 2], bg);
    if (dist <= cutoff) {
      data[i + 3] = 0;
    } else if (settings.preserveShadows && dist < cutoff * 1.4) {
      data[i + 3] = Math.round(((dist - cutoff) / (cutoff * 0.4)) * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  return c.toDataURL("image/png");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizedRectToBounds(
  rect: { x: number; y: number; w: number; h: number },
  width: number,
  height: number,
): Bounds {
  const x = clamp(Math.round(rect.x * width), 0, width - 1);
  const y = clamp(Math.round(rect.y * height), 0, height - 1);
  const w = clamp(Math.round(rect.w * width), 1, width - x);
  const h = clamp(Math.round(rect.h * height), 1, height - y);
  return { x, y, w, h };
}

function normalizedPolyBounds(points: Point[], width: number, height: number): Bounds {
  const xs = points.map((point) => point.x * width);
  const ys = points.map((point) => point.y * height);
  const minX = clamp(Math.floor(Math.min(...xs)), 0, width - 1);
  const minY = clamp(Math.floor(Math.min(...ys)), 0, height - 1);
  const maxX = clamp(Math.ceil(Math.max(...xs)), minX + 1, width);
  const maxY = clamp(Math.ceil(Math.max(...ys)), minY + 1, height);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function drawPolygonMask(ctx: CanvasRenderingContext2D, points: Point[], bbox: Bounds) {
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x - bbox.x;
    const y = point.y - bbox.y;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function manualWarnings(selection: ManualSelection, bounds: Bounds, source: SourceImage) {
  const warnings = ["Manual selection.", "Pixel SVG is not editable vector."];
  if (
    bounds.x <= 0 ||
    bounds.y <= 0 ||
    bounds.x + bounds.w >= source.width ||
    bounds.y + bounds.h >= source.height
  ) {
    warnings.push("Touches source edge.");
  }
  if (selection.type === "poly") warnings.push("Freeform crop.");
  return warnings;
}

function buildWarnings(
  bounds: Bounds,
  component: Component,
  canvasWidth: number,
  canvasHeight: number,
) {
  const warnings: string[] = ["Pixel SVG is not editable vector."];
  if (bounds.w * bounds.h < 900) warnings.push("Small component.");
  if (
    bounds.x <= 0 ||
    bounds.y <= 0 ||
    bounds.x + bounds.w >= canvasWidth ||
    bounds.y + bounds.h >= canvasHeight
  ) {
    warnings.push("Touches source edge.");
  }
  if (bounds.w > canvasWidth * 0.65 || bounds.h > canvasHeight * 0.65) warnings.push("Large crop.");
  const density = component.size / (bounds.w * bounds.h);
  if (density < 0.04) warnings.push("Sparse crop.");
  return warnings;
}

export async function extractAssetsFromSource(
  source: SourceImage,
  settings: DetectionSettings,
): Promise<{ assets: ExtractedAsset[]; backgroundColor: RGB }> {
  const img = await loadImage(source.dataUrl);
  const { canvas, ctx, width, height } = drawScaled(img, settings.maxWidth);
  const imageData = ctx.getImageData(0, 0, width, height);
  const backgroundColor = estimateBackground(imageData.data, width, height);
  const mask = createForegroundMask(imageData.data, width, height, backgroundColor, settings);
  const components = connectedComponents(mask, width, height);

  const filtered = components.filter((component) => component.size >= settings.minComponentArea);
  const merged = mergeOverlapping(filtered, settings.mergeDistance);
  const final = merged
    .filter((component) => {
      const componentWidth = component.maxX - component.minX + 1;
      const componentHeight = component.maxY - component.minY + 1;
      return !(componentWidth > width * 0.95 && componentHeight > height * 0.95);
    })
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX);

  const assets = final.map((component, index): ExtractedAsset => {
    const bbox = componentToBounds(component, settings.padding, width, height);
    const kind = classify(bbox.w, bbox.h);
    const name = createAssetName(index, "asset");
    const density = component.size / (bbox.w * bbox.h);
    return {
      id: `asset-${index}-${bbox.x}-${bbox.y}-${bbox.w}-${bbox.h}`,
      name,
      slug: createAssetSlug(index, "asset"),
      bbox,
      analysisSize: { width, height },
      preview: cropTransparent(canvas, bbox, backgroundColor, settings),
      selected: true,
      rejected: false,
      confidence: Math.min(1, 0.4 + density * 1.5),
      kind,
      origin: "auto",
      quality: "pixel-svg",
      warnings: buildWarnings(bbox, component, width, height),
    };
  });

  return { assets, backgroundColor };
}

export async function createManualAssetFromSelection(
  source: SourceImage,
  selection: ManualSelection,
  index: number,
): Promise<ExtractedAsset> {
  const img = await loadImage(source.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create manual crop context.");
  ctx.drawImage(img, 0, 0, source.width, source.height);

  const bbox =
    selection.type === "rect"
      ? normalizedRectToBounds(selection, source.width, source.height)
      : normalizedPolyBounds(selection.points, source.width, source.height);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = bbox.w;
  cropCanvas.height = bbox.h;
  const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
  if (!cropCtx) throw new Error("Could not create manual crop.");
  cropCtx.drawImage(canvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);

  if (selection.type === "poly") {
    const pixelPoints = selection.points.map((point) => ({
      x: point.x * source.width,
      y: point.y * source.height,
    }));
    drawPolygonMask(cropCtx, pixelPoints, bbox);
  }

  const name = createAssetName(index, "manual");
  return {
    id: `manual-${Date.now()}-${bbox.x}-${bbox.y}-${bbox.w}-${bbox.h}`,
    name,
    slug: createAssetSlug(index, "manual"),
    bbox,
    analysisSize: { width: source.width, height: source.height },
    preview: cropCanvas.toDataURL("image/png"),
    selected: true,
    rejected: false,
    confidence: 1,
    kind: classify(bbox.w, bbox.h),
    origin: "manual",
    quality: "pixel-svg",
    warnings: manualWarnings(selection, bbox, source),
  };
}
