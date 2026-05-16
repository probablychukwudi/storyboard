export function slugifyName(value: string, style: "kebab" | "snake" = "kebab") {
  const separator = style === "snake" ? "_" : "-";
  const fallback = "asset";
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`${separator}+`, "g"), separator)
    .replace(new RegExp(`^${separator}|${separator}$`, "g"), "");

  return slug || fallback;
}

export function createAssetName(index: number, prefix = "asset") {
  return `${prefix || "asset"}-${String(index + 1).padStart(3, "0")}`;
}

export function createAssetSlug(
  index: number,
  prefix = "asset",
  style: "kebab" | "snake" = "kebab",
) {
  return slugifyName(createAssetName(index, prefix), style);
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
