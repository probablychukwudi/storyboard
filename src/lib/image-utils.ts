import type { RGB, SourceImage } from "@/state/asset-spark-types";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `image-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not load image dimensions."));
    img.src = src;
  });
}

export async function loadImageFile(file: File): Promise<SourceImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Unsupported file type. Use PNG, JPEG, or WebP.");
  }

  const dataUrl = await fileToDataUrl(file);
  const { width, height } = await getImageDimensions(dataUrl);

  return {
    id: createId(),
    name: file.name,
    type: file.type,
    size: file.size,
    width,
    height,
    dataUrl,
    createdAt: new Date().toISOString(),
  };
}

export function rgbaToHex(color: RGB | null | undefined) {
  if (!color) return null;
  const toHex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`.toUpperCase();
}
