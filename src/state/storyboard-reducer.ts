import { initialStoryboardState } from "./default-state";
import type { StoryboardAction, StoryboardState } from "./storyboard-types";
import { slugifyName } from "@/lib/naming";

function selectNextAssetId(state: StoryboardState, rejectedAssetId: string) {
  const next = state.assets.find((asset) => asset.id !== rejectedAssetId && !asset.rejected);
  return next?.id ?? null;
}

export function storyboardReducer(
  state: StoryboardState,
  action: StoryboardAction,
): StoryboardState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, activeView: action.view };

    case "SET_EXTRACTION_MODE":
      return { ...state, extractionMode: action.mode };

    case "IMAGE_LOADED":
      return {
        ...state,
        activeView: "extract",
        extractionMode: "auto",
        sourceImage: action.image,
        assets: [],
        selectedAssetId: null,
        hoveredAssetId: null,
        backgroundColor: null,
        canvasViewport: initialStoryboardState.canvasViewport,
        error: null,
        lastExport: null,
      };

    case "ANALYSIS_STARTED":
      return { ...state, isAnalyzing: true, error: null };

    case "ANALYSIS_COMPLETED": {
      const manualAssets = state.assets.filter((asset) => asset.origin === "manual");
      const assets = [...action.assets, ...manualAssets];
      const selectedAssetId =
        assets.find((asset) => asset.id === state.selectedAssetId && !asset.rejected)?.id ??
        assets.find((asset) => !asset.rejected)?.id ??
        null;
      return {
        ...state,
        assets,
        selectedAssetId,
        hoveredAssetId: null,
        backgroundColor: action.backgroundColor,
        isAnalyzing: false,
        error: null,
      };
    }

    case "ANALYSIS_FAILED":
      return { ...state, isAnalyzing: false, error: action.error };

    case "ADD_MANUAL_ASSET":
      return {
        ...state,
        assets: [...state.assets, action.asset],
        selectedAssetId: action.asset.id,
        hoveredAssetId: null,
        error: null,
      };

    case "UPDATE_DETECTION_SETTINGS":
      return {
        ...state,
        detectionSettings: { ...state.detectionSettings, ...action.settings },
      };

    case "UPDATE_CANVAS_VIEWPORT":
      return {
        ...state,
        canvasViewport: { ...state.canvasViewport, ...action.viewport },
      };

    case "UPDATE_EXPORT_SETTINGS":
      return {
        ...state,
        exportSettings: { ...state.exportSettings, ...action.settings },
      };

    case "SELECT_ASSET":
      return { ...state, selectedAssetId: action.assetId };

    case "HOVER_ASSET":
      return { ...state, hoveredAssetId: action.assetId };

    case "TOGGLE_ASSET_SELECTED":
      return {
        ...state,
        assets: state.assets.map((asset) =>
          asset.id === action.assetId ? { ...asset, selected: !asset.selected } : asset,
        ),
      };

    case "SET_ALL_ACTIVE_SELECTED":
      return {
        ...state,
        assets: state.assets.map((asset) =>
          asset.rejected ? asset : { ...asset, selected: action.selected },
        ),
      };

    case "RENAME_ASSET":
      return {
        ...state,
        assets: state.assets.map((asset) =>
          asset.id === action.assetId
            ? {
                ...asset,
                name: action.name,
                slug: slugifyName(action.name, state.exportSettings.namingStyle),
              }
            : asset,
        ),
      };

    case "REJECT_ASSET":
      return {
        ...state,
        selectedAssetId:
          state.selectedAssetId === action.assetId
            ? selectNextAssetId(state, action.assetId)
            : state.selectedAssetId,
        assets: state.assets.map((asset) =>
          asset.id === action.assetId ? { ...asset, rejected: true, selected: false } : asset,
        ),
      };

    case "RESTORE_ASSET":
      return {
        ...state,
        assets: state.assets.map((asset) =>
          asset.id === action.assetId ? { ...asset, rejected: false, selected: true } : asset,
        ),
      };

    case "SET_SHOW_REJECTED":
      return { ...state, showRejected: action.showRejected };

    case "EXPORT_COMPLETED":
      return { ...state, lastExport: action.summary };

    case "CLEAR_PROJECT":
      return {
        ...initialStoryboardState,
        detectionSettings: state.detectionSettings,
        exportSettings: state.exportSettings,
      };

    case "RESET_SETTINGS":
      return {
        ...state,
        detectionSettings: initialStoryboardState.detectionSettings,
        exportSettings: initialStoryboardState.exportSettings,
      };

    default:
      return state;
  }
}
