import type { AssetSparkState, DetectionSettings, ExportSettings } from "./asset-spark-types";

export const defaultDetectionSettings: DetectionSettings = {
  threshold: 68,
  sensitivity: 50,
  minComponentArea: 160,
  mergeDistance: 12,
  padding: 12,
  backgroundMode: "auto-corners",
  preserveShadows: true,
  maxWidth: 1200,
};

export const defaultExportSettings: ExportSettings = {
  scope: "selected",
  platformPreset: "generic",
  includePng: true,
  includePixelSvg: true,
  includeManifest: true,
  includeReadme: true,
  filePrefix: "asset",
  namingStyle: "kebab",
};

export const initialAssetSparkState: AssetSparkState = {
  activeView: "extract",
  extractionMode: "auto",
  sourceImage: null,
  assets: [],
  selectedAssetId: null,
  hoveredAssetId: null,
  backgroundColor: null,
  detectionSettings: defaultDetectionSettings,
  canvasViewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  exportSettings: defaultExportSettings,
  showRejected: false,
  isAnalyzing: false,
  error: null,
  lastExport: null,
};
