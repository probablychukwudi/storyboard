export type ActiveView = "extract" | "assets" | "export" | "settings";
export type ExtractionMode = "auto" | "manual";
export type PlatformPreset = "generic" | "web" | "ios" | "android";

export type AssetKind = "icon" | "illustration" | "text" | "button" | "unknown";
export type AssetOrigin = "auto" | "grid" | "manual";
export type AssetQuality = "png" | "pixel-svg" | "trace-candidate";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type ManualSelection =
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "poly"; points: Point[] };

export interface SourceImage {
  id: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  dataUrl: string;
  createdAt: string;
}

export interface ExtractedAsset {
  id: string;
  name: string;
  slug: string;
  bbox: Bounds;
  analysisSize: { width: number; height: number };
  preview: string;
  selected: boolean;
  rejected: boolean;
  confidence: number;
  kind: AssetKind;
  origin: AssetOrigin;
  quality: AssetQuality;
  warnings: string[];
}

export type BackgroundMode = "auto-corners";

export interface DetectionSettings {
  threshold: number;
  sensitivity: number;
  minComponentArea: number;
  mergeDistance: number;
  padding: number;
  backgroundMode: BackgroundMode;
  preserveShadows: boolean;
  maxWidth: number;
}

export interface ExportSettings {
  scope: "selected" | "active";
  platformPreset: PlatformPreset;
  includePng: boolean;
  includePixelSvg: boolean;
  includeManifest: boolean;
  includeReadme: boolean;
  filePrefix: string;
  namingStyle: "kebab" | "snake";
}

export interface ExportSummary {
  assetCount: number;
  pngCount: number;
  pixelSvgCount: number;
  includesManifest: boolean;
  includesReadme: boolean;
  fileName: string;
  createdAt: string;
}

export interface AssetSparkState {
  activeView: ActiveView;
  extractionMode: ExtractionMode;
  sourceImage: SourceImage | null;
  assets: ExtractedAsset[];
  selectedAssetId: string | null;
  hoveredAssetId: string | null;
  backgroundColor: RGB | null;
  detectionSettings: DetectionSettings;
  canvasViewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  exportSettings: ExportSettings;
  showRejected: boolean;
  isAnalyzing: boolean;
  error: string | null;
  lastExport: ExportSummary | null;
}

export type AssetSparkAction =
  | { type: "SET_VIEW"; view: ActiveView }
  | { type: "SET_EXTRACTION_MODE"; mode: ExtractionMode }
  | { type: "IMAGE_LOADED"; image: SourceImage }
  | { type: "ANALYSIS_STARTED" }
  | { type: "ANALYSIS_COMPLETED"; assets: ExtractedAsset[]; backgroundColor: RGB | null }
  | { type: "ANALYSIS_FAILED"; error: string }
  | { type: "ADD_MANUAL_ASSET"; asset: ExtractedAsset }
  | { type: "UPDATE_DETECTION_SETTINGS"; settings: Partial<DetectionSettings> }
  | {
      type: "UPDATE_CANVAS_VIEWPORT";
      viewport: Partial<AssetSparkState["canvasViewport"]>;
    }
  | { type: "UPDATE_EXPORT_SETTINGS"; settings: Partial<ExportSettings> }
  | { type: "SELECT_ASSET"; assetId: string | null }
  | { type: "HOVER_ASSET"; assetId: string | null }
  | { type: "TOGGLE_ASSET_SELECTED"; assetId: string }
  | { type: "SET_ALL_ACTIVE_SELECTED"; selected: boolean }
  | { type: "RENAME_ASSET"; assetId: string; name: string }
  | { type: "REJECT_ASSET"; assetId: string }
  | { type: "RESTORE_ASSET"; assetId: string }
  | { type: "SET_SHOW_REJECTED"; showRejected: boolean }
  | { type: "EXPORT_COMPLETED"; summary: ExportSummary }
  | { type: "CLEAR_PROJECT" }
  | { type: "RESET_SETTINGS" };

export interface AssetSparkManifest {
  app: "Asset Spark";
  version: 1;
  exportedAt: string;
  source: {
    id: string;
    name: string;
    type: string;
    size: number;
    width: number;
    height: number;
  };
  detection: DetectionSettings & {
    backgroundColor: string | null;
  };
  export: ExportSettings;
  assets: Array<{
    id: string;
    name: string;
    slug: string;
    kind: AssetKind;
    origin: AssetOrigin;
    quality: AssetQuality;
    selected: boolean;
    bounds: Bounds;
    confidence: number;
    warnings: string[];
    files: {
      png?: string;
      pixelSvg?: string;
    };
  }>;
}
