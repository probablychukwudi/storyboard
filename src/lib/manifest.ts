import type {
  AssetSparkManifest,
  DetectionSettings,
  ExportSettings,
  ExtractedAsset,
  SourceImage,
} from "@/state/asset-spark-types";
import { rgbaToHex } from "./image-utils";
import type { RGB } from "@/state/asset-spark-types";

export function buildManifest(params: {
  sourceImage: SourceImage;
  assets: ExtractedAsset[];
  detectionSettings: DetectionSettings;
  exportSettings: ExportSettings;
  backgroundColor: RGB | null;
  exportedFiles: Array<{
    assetId: string;
    pngPath?: string;
    pixelSvgPath?: string;
  }>;
}): AssetSparkManifest {
  const fileMap = new Map(params.exportedFiles.map((file) => [file.assetId, file]));

  return {
    app: "Asset Spark",
    version: 1,
    exportedAt: new Date().toISOString(),
    source: {
      id: params.sourceImage.id,
      name: params.sourceImage.name,
      type: params.sourceImage.type,
      size: params.sourceImage.size,
      width: params.sourceImage.width,
      height: params.sourceImage.height,
    },
    detection: {
      ...params.detectionSettings,
      backgroundColor: rgbaToHex(params.backgroundColor),
    },
    export: params.exportSettings,
    assets: params.assets.map((asset) => {
      const files = fileMap.get(asset.id);
      return {
        id: asset.id,
        name: asset.name,
        slug: asset.slug,
        kind: asset.kind,
        origin: asset.origin,
        quality: asset.quality,
        selected: asset.selected,
        bounds: asset.bbox,
        confidence: asset.confidence,
        warnings: asset.warnings,
        files: {
          png: files?.pngPath,
          pixelSvg: files?.pixelSvgPath,
        },
      };
    }),
  };
}
