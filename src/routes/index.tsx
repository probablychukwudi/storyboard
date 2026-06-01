import { createFileRoute } from "@tanstack/react-router";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type ReactNode,
  type SetStateAction,
  type WheelEvent,
} from "react";
import {
  Archive,
  Check,
  Copy,
  Download,
  FileJson,
  Image as ImageIcon,
  Info,
  Loader2,
  Maximize2,
  Minus,
  Moon,
  Move,
  Package,
  PenTool,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createManualAssetFromSelection, extractAssetsFromSource } from "@/lib/extractor";
import {
  downloadBlob,
  exportAssetZip,
  getZipPreviewPaths,
  platformAssetFileBase,
  selectAssetsForExport,
} from "@/lib/export-zip";
import { formatBytes, slugifyName } from "@/lib/naming";
import { loadImageFile, rgbaToHex } from "@/lib/image-utils";
import { storyboardReducer } from "@/state/storyboard-reducer";
import { initialStoryboardState } from "@/state/default-state";
import type {
  ActiveView,
  StoryboardState,
  DetectionSettings,
  ExportSettings,
  ExtractionMode,
  ExtractedAsset,
  ManualSelection,
  PlatformPreset,
  Point,
  SourceImage,
} from "@/state/storyboard-types";

export const Route = createFileRoute("/")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Storyboard — Screenshot-to-SwiftUI Studio" },
      {
        name: "description",
        content: "Extract, inspect, and package implementation-ready UI assets locally.",
      },
    ],
  }),
});

const navItems: Array<{ id: ActiveView; label: string; icon: typeof ImageIcon }> = [
  { id: "extract", label: "Extract", icon: ImageIcon },
  { id: "assets", label: "Assets", icon: Archive },
  { id: "export", label: "Export", icon: Package },
  { id: "settings", label: "Settings", icon: Settings },
];

type ManualTool = "box" | "pen" | null;
type ThemeMode = "light" | "dark";

const MIN_CANVAS_ZOOM = 0.05;
const MAX_CANVAS_ZOOM = 6;
const CANVAS_ZOOM_STEP = 1.18;

function clampCanvasZoom(value: number) {
  return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Number(value.toFixed(4))));
}

function Page() {
  const [state, dispatch] = useReducer(storyboardReducer, initialStoryboardState);
  const [theme, setTheme] = useState<ThemeMode>("light");

  const activeAssets = useMemo(
    () => state.assets.filter((asset) => !asset.rejected),
    [state.assets],
  );
  const visibleAssets = useMemo(
    () => (state.showRejected ? state.assets : activeAssets),
    [activeAssets, state.assets, state.showRejected],
  );
  const selectedAsset = useMemo(
    () => state.assets.find((asset) => asset.id === state.selectedAssetId) ?? null,
    [state.assets, state.selectedAssetId],
  );
  const exportableAssets = useMemo(
    () => selectAssetsForExport(state.assets, state.exportSettings.scope),
    [state.assets, state.exportSettings.scope],
  );

  const selectedCount = activeAssets.filter((asset) => asset.selected).length;
  const rejectedCount = state.assets.length - activeAssets.length;
  const allActiveSelected =
    activeAssets.length > 0 && activeAssets.every((asset) => asset.selected);

  useEffect(() => {
    window.localStorage.removeItem("storyboard-theme");

    const storedTheme = window.localStorage.getItem("storyboard-color-mode");
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("storyboard-color-mode", theme);
  }, [theme]);

  const runDetection = useCallback(
    async (source = state.sourceImage, settings = state.detectionSettings) => {
      if (!source) return;
      dispatch({ type: "ANALYSIS_STARTED" });
      try {
        const result = await extractAssetsFromSource(source, settings);
        dispatch({
          type: "ANALYSIS_COMPLETED",
          assets: result.assets,
          backgroundColor: result.backgroundColor,
        });
      } catch (error) {
        dispatch({
          type: "ANALYSIS_FAILED",
          error:
            error instanceof Error ? error.message : "Detection failed while reading canvas data.",
        });
      }
    },
    [state.detectionSettings, state.sourceImage],
  );

  const handleFile = useCallback(
    async (file: File) => {
      dispatch({ type: "ANALYSIS_STARTED" });
      try {
        const image = await loadImageFile(file);
        dispatch({ type: "IMAGE_LOADED", image });
        await runDetection(image, state.detectionSettings);
      } catch (error) {
        dispatch({
          type: "ANALYSIS_FAILED",
          error: error instanceof Error ? error.message : "Could not import that image.",
        });
      }
    },
    [runDetection, state.detectionSettings],
  );

  const handleExport = useCallback(async () => {
    if (!state.sourceImage || !exportableAssets.length) return;
    const zip = await exportAssetZip({
      sourceImage: state.sourceImage,
      assets: exportableAssets,
      detectionSettings: state.detectionSettings,
      exportSettings: state.exportSettings,
      backgroundColor: state.backgroundColor,
    });
    const fileName = "storyboard-export.zip";
    downloadBlob(zip, fileName);
    dispatch({
      type: "EXPORT_COMPLETED",
      summary: {
        assetCount: exportableAssets.length,
        pngCount: state.exportSettings.includePng ? exportableAssets.length : 0,
        pixelSvgCount: state.exportSettings.includePixelSvg ? exportableAssets.length : 0,
        includesManifest: state.exportSettings.includeManifest,
        includesReadme: state.exportSettings.includeReadme,
        fileName,
        createdAt: new Date().toISOString(),
      },
    });
  }, [
    exportableAssets,
    state.backgroundColor,
    state.detectionSettings,
    state.exportSettings,
    state.sourceImage,
  ]);

  const handleCreateManualAsset = useCallback(
    async (selection: ManualSelection) => {
      if (!state.sourceImage) return;
      try {
        const asset = await createManualAssetFromSelection(
          state.sourceImage,
          selection,
          state.assets.length,
        );
        dispatch({ type: "ADD_MANUAL_ASSET", asset });
      } catch (error) {
        dispatch({
          type: "ANALYSIS_FAILED",
          error: error instanceof Error ? error.message : "Manual crop failed.",
        });
      }
    },
    [state.assets.length, state.sourceImage],
  );

  const handleExtractionModeChange = useCallback((mode: ExtractionMode) => {
    dispatch({ type: "SET_EXTRACTION_MODE", mode });
  }, []);

  const handleCanvasViewportChange = useCallback(
    (viewport: Partial<StoryboardState["canvasViewport"]>) => {
      dispatch({ type: "UPDATE_CANVAS_VIEWPORT", viewport });
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTyping) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        dispatch({ type: "SET_ALL_ACTIVE_SELECTED", selected: true });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        if (exportableAssets.length) void handleExport();
      }
      if (event.key === "Escape") {
        dispatch({ type: "SELECT_ASSET", assetId: null });
      }
      if ((event.key === "Backspace" || event.key === "Delete") && state.selectedAssetId) {
        dispatch({ type: "REJECT_ASSET", assetId: state.selectedAssetId });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exportableAssets.length, handleExport, state.selectedAssetId]);

  return (
    <div className="grid h-screen w-screen grid-cols-[220px_minmax(0,1fr)_340px] grid-rows-[58px_minmax(0,1fr)_238px] overflow-hidden bg-background text-foreground">
      <Sidebar
        activeView={state.activeView}
        onViewChange={(view) => dispatch({ type: "SET_VIEW", view })}
      />
      <TopBar
        state={state}
        theme={theme}
        activeCount={activeAssets.length}
        selectedCount={selectedCount}
        rejectedCount={rejectedCount}
        exportableCount={exportableAssets.length}
        onExportView={() => dispatch({ type: "SET_VIEW", view: "export" })}
        onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />

      <main className="min-h-0 min-w-0 overflow-hidden bg-background">
        {state.activeView === "extract" && (
          <ExtractWorkspace
            state={state}
            selectedAsset={selectedAsset}
            onFile={handleFile}
            onRunDetection={() => runDetection()}
            onSelectAsset={(assetId) => dispatch({ type: "SELECT_ASSET", assetId })}
            onHoverAsset={(assetId) => dispatch({ type: "HOVER_ASSET", assetId })}
            onSettingsChange={(settings) =>
              dispatch({ type: "UPDATE_DETECTION_SETTINGS", settings })
            }
            onCreateManualAsset={handleCreateManualAsset}
            onExtractionModeChange={handleExtractionModeChange}
            onCanvasViewportChange={handleCanvasViewportChange}
          />
        )}
        {state.activeView === "assets" && (
          <AssetLibrary
            assets={visibleAssets}
            activeAssets={activeAssets}
            selectedAssetId={state.selectedAssetId}
            showRejected={state.showRejected}
            allActiveSelected={allActiveSelected}
            onSelectAsset={(assetId) => dispatch({ type: "SELECT_ASSET", assetId })}
            onHoverAsset={(assetId) => dispatch({ type: "HOVER_ASSET", assetId })}
            onToggleSelected={(assetId) => dispatch({ type: "TOGGLE_ASSET_SELECTED", assetId })}
            onReject={(assetId) => dispatch({ type: "REJECT_ASSET", assetId })}
            onRestore={(assetId) => dispatch({ type: "RESTORE_ASSET", assetId })}
            onToggleAll={(selected) => dispatch({ type: "SET_ALL_ACTIVE_SELECTED", selected })}
            onShowRejected={(showRejected) => dispatch({ type: "SET_SHOW_REJECTED", showRejected })}
          />
        )}
        {state.activeView === "export" && (
          <ExportPanel
            state={state}
            exportableAssets={exportableAssets}
            onSettingsChange={(settings) => dispatch({ type: "UPDATE_EXPORT_SETTINGS", settings })}
            onExport={handleExport}
          />
        )}
        {state.activeView === "settings" && (
          <SettingsPanel
            state={state}
            onReset={() => dispatch({ type: "RESET_SETTINGS" })}
            onClear={() => dispatch({ type: "CLEAR_PROJECT" })}
          />
        )}
      </main>

      <AssetInspector
        sourceImage={state.sourceImage}
        selectedAsset={selectedAsset}
        activeCount={activeAssets.length}
        selectedCount={selectedCount}
        rejectedCount={rejectedCount}
        backgroundColor={state.backgroundColor}
        detectionSettings={state.detectionSettings}
        onRename={(assetId, name) => dispatch({ type: "RENAME_ASSET", assetId, name })}
        onToggleSelected={(assetId) => dispatch({ type: "TOGGLE_ASSET_SELECTED", assetId })}
        onReject={(assetId) => dispatch({ type: "REJECT_ASSET", assetId })}
        onRestore={(assetId) => dispatch({ type: "RESTORE_ASSET", assetId })}
      />

      <BottomAssetTray
        assets={visibleAssets}
        selectedAssetId={state.selectedAssetId}
        hoveredAssetId={state.hoveredAssetId}
        showRejected={state.showRejected}
        allActiveSelected={allActiveSelected}
        isAnalyzing={state.isAnalyzing}
        error={state.error}
        hasSource={Boolean(state.sourceImage)}
        onSelectAsset={(assetId) => dispatch({ type: "SELECT_ASSET", assetId })}
        onHoverAsset={(assetId) => dispatch({ type: "HOVER_ASSET", assetId })}
        onToggleSelected={(assetId) => dispatch({ type: "TOGGLE_ASSET_SELECTED", assetId })}
        onReject={(assetId) => dispatch({ type: "REJECT_ASSET", assetId })}
        onRestore={(assetId) => dispatch({ type: "RESTORE_ASSET", assetId })}
        onToggleAll={(selected) => dispatch({ type: "SET_ALL_ACTIVE_SELECTED", selected })}
        onShowRejected={(showRejected) => dispatch({ type: "SET_SHOW_REJECTED", showRejected })}
      />
    </div>
  );
}

function Sidebar({
  activeView,
  onViewChange,
}: {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
}) {
  return (
    <aside className="row-span-3 flex min-h-0 flex-col border-r bg-card">
      <div className="border-b px-4 py-4">
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight tracking-normal">Storyboard</div>
          <div className="truncate text-[11px] text-muted-foreground">Screenshot-to-SwiftUI</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
              activeView === item.id
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto border-t p-4">
        <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <Info className="h-3.5 w-3.5" />
            Local only
          </div>
          <p className="text-muted-foreground">
            Images are processed in this browser. Pixel SVG preserves appearance but is not editable
            vector.
          </p>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  state,
  theme,
  activeCount,
  selectedCount,
  rejectedCount,
  exportableCount,
  onExportView,
  onThemeToggle,
}: {
  state: StoryboardState;
  theme: ThemeMode;
  activeCount: number;
  selectedCount: number;
  rejectedCount: number;
  exportableCount: number;
  onExportView: () => void;
  onThemeToggle: () => void;
}) {
  return (
    <header className="col-span-2 flex items-center justify-between border-b bg-card px-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{state.sourceImage?.name ?? "No image loaded"}</span>
          {state.isAnalyzing && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {state.sourceImage ? (
            <>
              <span>
                {state.sourceImage.width}x{state.sourceImage.height}
              </span>
              <span>{formatBytes(state.sourceImage.size)}</span>
              <span>{activeCount} detected</span>
              <span>{selectedCount} selected</span>
              {rejectedCount > 0 && <span>{rejectedCount} rejected</span>}
            </>
          ) : (
            <span>Drop an image to extract implementation-ready asset packs.</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onThemeToggle}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Switch to {theme === "dark" ? "light" : "dark"} mode
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button onClick={onExportView} disabled={!exportableCount} className="gap-2">
          <Download className="h-4 w-4" />
          Export {exportableCount ? `(${exportableCount})` : ""}
        </Button>
      </div>
    </header>
  );
}

function ExtractWorkspace({
  state,
  onFile,
  onRunDetection,
  onSelectAsset,
  onHoverAsset,
  onSettingsChange,
  onCreateManualAsset,
  onExtractionModeChange,
  onCanvasViewportChange,
}: {
  state: StoryboardState;
  selectedAsset: ExtractedAsset | null;
  onFile: (file: File) => void;
  onRunDetection: () => void;
  onSelectAsset: (assetId: string | null) => void;
  onHoverAsset: (assetId: string | null) => void;
  onSettingsChange: (settings: Partial<DetectionSettings>) => void;
  onCreateManualAsset: (selection: ManualSelection) => Promise<void>;
  onExtractionModeChange: (mode: ExtractionMode) => void;
  onCanvasViewportChange: (viewport: Partial<StoryboardState["canvasViewport"]>) => void;
}) {
  const [manualTool, setManualTool] = useState<ManualTool>(null);
  const [manualSelection, setManualSelection] = useState<ManualSelection | null>(null);
  const [draftRect, setDraftRect] = useState<(ManualSelection & { type: "rect" }) | null>(null);
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  const resetManualSelection = useCallback(() => {
    setManualTool(null);
    setManualSelection(null);
    setDraftRect(null);
    setPolyPoints([]);
    setHoverPoint(null);
  }, []);

  const createManualAsset = async () => {
    if (!manualSelection) return;
    await onCreateManualAsset(manualSelection);
    resetManualSelection();
  };

  useEffect(() => {
    if (state.extractionMode === "auto") resetManualSelection();
  }, [resetManualSelection, state.extractionMode]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <ExtractionModeSwitch
        mode={state.extractionMode}
        disabled={!state.sourceImage}
        onChange={onExtractionModeChange}
      />
      <div className="min-h-0 flex-1 rounded-md border bg-card">
        {state.sourceImage ? (
          <SourceCanvas
            extractionMode={state.extractionMode}
            sourceImage={state.sourceImage}
            assets={state.assets}
            selectedAssetId={state.selectedAssetId}
            hoveredAssetId={state.hoveredAssetId}
            showRejected={state.showRejected}
            isAnalyzing={state.isAnalyzing}
            manualTool={manualTool}
            manualSelection={manualSelection}
            draftRect={draftRect}
            polyPoints={polyPoints}
            hoverPoint={hoverPoint}
            canvasViewport={state.canvasViewport}
            onManualToolChange={(tool) => {
              setManualTool((current) => (current === tool ? null : tool));
              setManualSelection(null);
              setDraftRect(null);
              setPolyPoints([]);
              setHoverPoint(null);
            }}
            onManualSelectionChange={setManualSelection}
            onDraftRectChange={setDraftRect}
            onPolyPointsChange={setPolyPoints}
            onHoverPointChange={setHoverPoint}
            onResetManualSelection={resetManualSelection}
            onCreateManualAsset={createManualAsset}
            onCanvasViewportChange={onCanvasViewportChange}
            onSelectAsset={onSelectAsset}
            onHoverAsset={onHoverAsset}
          />
        ) : (
          <UploadDropzone onFile={onFile} />
        )}
      </div>

      {state.extractionMode === "auto" && (
        <DetectionControls
          settings={state.detectionSettings}
          backgroundColor={state.backgroundColor}
          disabled={!state.sourceImage}
          isAnalyzing={state.isAnalyzing}
          onChange={onSettingsChange}
          onRunDetection={onRunDetection}
        />
      )}
    </div>
  );
}

function ExtractionModeSwitch({
  mode,
  disabled,
  onChange,
}: {
  mode: ExtractionMode;
  disabled: boolean;
  onChange: (mode: ExtractionMode) => void;
}) {
  const modes: Array<{ id: ExtractionMode; label: string; detail: string; icon: typeof Sparkles }> =
    [
      {
        id: "auto",
        label: "Auto",
        detail: "Detect regions from the source image.",
        icon: Sparkles,
      },
      {
        id: "manual",
        label: "Manual",
        detail: "Draw Box or Pen selections yourself.",
        icon: PenTool,
      },
    ];

  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">
        {mode === "auto"
          ? "Auto Mode tunes detection before you package assets."
          : "Manual Mode lets you draw the exact crop areas you want."}
      </div>
      <div className="inline-flex rounded-md border bg-muted/35 p-0.5">
        {modes.map((item) => (
          <button
            key={item.id}
            disabled={disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              "flex h-8 min-w-24 items-center justify-center gap-2 rounded-[5px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              mode === item.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={item.detail}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadDropzone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptFile = (file?: File) => {
    if (file) onFile(file);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-[360px] items-center justify-center p-6 transition-colors",
        isDragging && "bg-primary-soft/40",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        acceptFile(event.dataTransfer.files?.[0]);
      }}
    >
      <button
        onClick={() => inputRef.current?.click()}
        className={cn(
          "checkerboard flex h-full w-full max-w-3xl flex-col items-center justify-center rounded-md border border-dashed p-8 text-center transition-all",
          isDragging ? "border-primary shadow-sm" : "border-border hover:border-primary/70",
        )}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border bg-card shadow-sm">
          <Upload className="h-5 w-5 text-primary" />
        </div>
        <div className="text-base font-semibold">Drop an image to extract assets.</div>
        <div className="mt-1 max-w-lg text-sm text-muted-foreground">
          Best for AI-generated mockups, icon sheets, UI screenshots, sprite sheets, and visual
          concept images.
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {["Mockup", "Icon Sheet", "Sprite Sheet", "Screenshot", "Poster"].map((label) => (
            <span key={label} className="rounded-md border bg-card px-2 py-1 text-[11px]">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-5 text-xs text-muted-foreground">Runs locally in your browser.</div>
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => acceptFile(event.target.files?.[0])}
      />
    </div>
  );
}

function SourceCanvas({
  extractionMode,
  sourceImage,
  assets,
  selectedAssetId,
  hoveredAssetId,
  showRejected,
  isAnalyzing,
  manualTool,
  manualSelection,
  draftRect,
  polyPoints,
  hoverPoint,
  canvasViewport,
  onManualToolChange,
  onManualSelectionChange,
  onDraftRectChange,
  onPolyPointsChange,
  onHoverPointChange,
  onResetManualSelection,
  onCreateManualAsset,
  onCanvasViewportChange,
  onSelectAsset,
  onHoverAsset,
}: {
  extractionMode: ExtractionMode;
  sourceImage: SourceImage;
  assets: ExtractedAsset[];
  selectedAssetId: string | null;
  hoveredAssetId: string | null;
  showRejected: boolean;
  isAnalyzing: boolean;
  manualTool: ManualTool;
  manualSelection: ManualSelection | null;
  draftRect: (ManualSelection & { type: "rect" }) | null;
  polyPoints: Point[];
  hoverPoint: Point | null;
  canvasViewport: StoryboardState["canvasViewport"];
  onManualToolChange: (tool: Exclude<ManualTool, null>) => void;
  onManualSelectionChange: (selection: ManualSelection | null) => void;
  onDraftRectChange: (rect: (ManualSelection & { type: "rect" }) | null) => void;
  onPolyPointsChange: Dispatch<SetStateAction<Point[]>>;
  onHoverPointChange: (point: Point | null) => void;
  onResetManualSelection: () => void;
  onCreateManualAsset: () => void;
  onCanvasViewportChange: (viewport: Partial<StoryboardState["canvasViewport"]>) => void;
  onSelectAsset: (assetId: string | null) => void;
  onHoverAsset: (assetId: string | null) => void;
}) {
  const drawableAssets = assets.filter((asset) => showRejected || !asset.rejected);
  const manualMode = extractionMode === "manual";
  const activeManualTool = manualMode ? manualTool : null;
  const zoomPercent = Math.round(canvasViewport.zoom * 100);
  const canvasRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<Point | null>(null);
  const latestDraftRectRef = useRef<(ManualSelection & { type: "rect" }) | null>(null);
  const panStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);

  const toNorm = (event: { clientX: number; clientY: number }): Point => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const updateDraftRect = (rect: (ManualSelection & { type: "rect" }) | null) => {
    latestDraftRectRef.current = rect;
    onDraftRectChange(rect);
  };

  const finishPolygon = useCallback(() => {
    if (polyPoints.length < 3) return;
    onManualSelectionChange({ type: "poly", points: polyPoints });
    onHoverPointChange(null);
    onPolyPointsChange([]);
  }, [onHoverPointChange, onManualSelectionChange, onPolyPointsChange, polyPoints]);

  const fitImage = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const availableWidth = Math.max(160, rect.width - 96);
    const availableHeight = Math.max(160, rect.height - 96);
    const nextZoom = clampCanvasZoom(
      Math.min(availableWidth / sourceImage.width, availableHeight / sourceImage.height),
    );
    onCanvasViewportChange({ zoom: nextZoom, panX: 0, panY: 0 });
  }, [onCanvasViewportChange, sourceImage.height, sourceImage.width]);

  const zoomToPoint = useCallback(
    (nextZoomValue: number, clientX?: number, clientY?: number) => {
      const nextZoom = clampCanvasZoom(nextZoomValue);
      const rect = canvasRef.current?.getBoundingClientRect();

      if (!rect || clientX === undefined || clientY === undefined) {
        onCanvasViewportChange({ zoom: nextZoom });
        return;
      }

      const pointX = clientX - rect.left;
      const pointY = clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const ratio = nextZoom / canvasViewport.zoom;

      onCanvasViewportChange({
        zoom: nextZoom,
        panX: pointX - centerX - (pointX - centerX - canvasViewport.panX) * ratio,
        panY: pointY - centerY - (pointY - centerY - canvasViewport.panY) * ratio,
      });
    },
    [canvasViewport.panX, canvasViewport.panY, canvasViewport.zoom, onCanvasViewportChange],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const zoomFactor = Math.exp(-event.deltaY * 0.0015);
        zoomToPoint(canvasViewport.zoom * zoomFactor, event.clientX, event.clientY);
        return;
      }

      onCanvasViewportChange({
        panX: canvasViewport.panX - event.deltaX,
        panY: canvasViewport.panY - event.deltaY,
      });
    },
    [
      canvasViewport.panX,
      canvasViewport.panY,
      canvasViewport.zoom,
      onCanvasViewportChange,
      zoomToPoint,
    ],
  );

  const startPanning = (event: PointerEvent<HTMLDivElement>) => {
    const isDirectBoardDrag = event.target === event.currentTarget;
    const wantsPan = event.button === 1 || spacePressed || (!activeManualTool && isDirectBoardDrag);
    if (!wantsPan) return;

    event.preventDefault();
    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: canvasViewport.panX,
      panY: canvasViewport.panY,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePanning = (event: PointerEvent<HTMLDivElement>) => {
    if (!panStartRef.current) return;
    onCanvasViewportChange({
      panX: panStartRef.current.panX + event.clientX - panStartRef.current.pointerX,
      panY: panStartRef.current.panY + event.clientY - panStartRef.current.pointerY,
    });
  };

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    if (!panStartRef.current) return;
    panStartRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitImage);
    return () => window.cancelAnimationFrame(frame);
  }, [fitImage, sourceImage.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <ImageIcon className="h-3.5 w-3.5" />
          Source
          <Badge variant="outline" className="h-5 rounded-[5px] px-1.5 text-[10px]">
            {manualMode ? "Manual Mode" : "Auto Mode"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {manualMode && (
            <>
              <Button
                variant={manualTool === "box" ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => onManualToolChange("box")}
              >
                <Square className="h-3.5 w-3.5" />
                Box
              </Button>
              <Button
                variant={manualTool === "pen" ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => onManualToolChange("pen")}
              >
                <PenTool className="h-3.5 w-3.5" />
                Pen
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!manualSelection}
                onClick={onCreateManualAsset}
              >
                Create Asset
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!manualTool && !manualSelection && !polyPoints.length}
                onClick={onResetManualSelection}
              >
                Reset
              </Button>
              <div className="h-5 w-px bg-border" />
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="Zoom out"
            onClick={() => zoomToPoint(canvasViewport.zoom / CANVAS_ZOOM_STEP)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <div className="flex h-7 min-w-16 items-center justify-center gap-1 rounded-md border bg-muted/25 px-2 text-[11px] text-muted-foreground">
            <Move className="h-3.5 w-3.5" />
            {zoomPercent}%
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="Zoom in"
            onClick={() => zoomToPoint(canvasViewport.zoom * CANVAS_ZOOM_STEP)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={fitImage}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Fit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onCanvasViewportChange({ zoom: 1 })}
          >
            100%
          </Button>
          <div className="ml-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{drawableAssets.length} boxes</span>
          </div>
        </div>
      </div>
      <div
        ref={canvasRef}
        className={cn(
          "asset-canvas-grid relative min-h-0 flex-1 overflow-hidden",
          isPanning
            ? "cursor-grabbing"
            : spacePressed && !activeManualTool
              ? "cursor-grab"
              : "cursor-default",
        )}
        onWheel={handleWheel}
        onPointerDown={startPanning}
        onPointerMove={movePanning}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
      >
        {isAnalyzing && (
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Analyzing foreground regions...
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
          Wheel pans. Cmd/Ctrl + wheel zooms. Hold Space and drag to pan.
        </div>
        <div
          className="absolute"
          style={{
            height: sourceImage.height,
            left: `calc(50% + ${canvasViewport.panX}px)`,
            top: `calc(50% + ${canvasViewport.panY}px)`,
            transform: `translate(-50%, -50%) scale(${canvasViewport.zoom})`,
            transformOrigin: "center center",
            width: sourceImage.width,
          }}
        >
          <img
            src={sourceImage.dataUrl}
            alt={sourceImage.name}
            className={cn(
              "block h-full w-full rounded-sm object-contain shadow-sm",
              isAnalyzing && "opacity-80",
            )}
            draggable={false}
          />
          <div
            className={cn(
              "absolute inset-0",
              (activeManualTool || spacePressed) && "pointer-events-none",
            )}
          >
            {drawableAssets.map((asset) => {
              const selected = selectedAssetId === asset.id;
              const hovered = hoveredAssetId === asset.id;
              const width = asset.analysisSize.width;
              const height = asset.analysisSize.height;
              return (
                <button
                  key={asset.id}
                  aria-label={`Select ${asset.name}`}
                  onClick={() => onSelectAsset(asset.id)}
                  onMouseEnter={() => onHoverAsset(asset.id)}
                  onMouseLeave={() => onHoverAsset(null)}
                  className={cn(
                    "absolute border transition-colors",
                    selected
                      ? "border-primary bg-primary/10 shadow-[0_0_0_1px_var(--color-primary)]"
                      : hovered
                        ? "border-primary/80 bg-primary/5"
                        : "border-primary/45 hover:border-primary",
                    asset.rejected && "border-destructive/50 bg-destructive/10 opacity-60",
                  )}
                  style={{
                    left: `${(asset.bbox.x / width) * 100}%`,
                    top: `${(asset.bbox.y / height) * 100}%`,
                    width: `${(asset.bbox.w / width) * 100}%`,
                    height: `${(asset.bbox.h / height) * 100}%`,
                  }}
                />
              );
            })}
          </div>
          <ForwardedManualSelectionLayer
            ref={overlayRef}
            manualTool={activeManualTool}
            manualSelection={manualSelection}
            draftRect={draftRect}
            polyPoints={polyPoints}
            hoverPoint={hoverPoint}
            onMouseDown={(event) => {
              if (!activeManualTool || spacePressed) return;
              const point = toNorm(event);
              if (activeManualTool === "box") {
                dragStartRef.current = point;
                onManualSelectionChange(null);
                updateDraftRect({ type: "rect", x: point.x, y: point.y, w: 0, h: 0 });
              } else {
                if (polyPoints.length >= 3) {
                  const first = polyPoints[0];
                  if (Math.hypot(first.x - point.x, first.y - point.y) < 0.025) {
                    finishPolygon();
                    return;
                  }
                }
                onManualSelectionChange(null);
                onPolyPointsChange((points) => [...points, point]);
              }
            }}
            onMouseMove={(event) => {
              if (!activeManualTool || spacePressed) return;
              const point = toNorm(event);
              if (activeManualTool === "box" && dragStartRef.current) {
                const start = dragStartRef.current;
                updateDraftRect({
                  type: "rect",
                  x: Math.min(start.x, point.x),
                  y: Math.min(start.y, point.y),
                  w: Math.abs(point.x - start.x),
                  h: Math.abs(point.y - start.y),
                });
              } else if (activeManualTool === "pen" && polyPoints.length > 0) {
                onHoverPointChange(point);
              }
            }}
            onMouseUp={(event) => {
              let finalRect = latestDraftRectRef.current;
              if (activeManualTool === "box" && dragStartRef.current) {
                const point = toNorm(event);
                const start = dragStartRef.current;
                finalRect = {
                  type: "rect",
                  x: Math.min(start.x, point.x),
                  y: Math.min(start.y, point.y),
                  w: Math.abs(point.x - start.x),
                  h: Math.abs(point.y - start.y),
                };
              }
              if (
                activeManualTool === "box" &&
                finalRect &&
                finalRect.w > 0.01 &&
                finalRect.h > 0.01
              ) {
                onManualSelectionChange(finalRect);
              }
              dragStartRef.current = null;
              updateDraftRect(null);
            }}
            onDoubleClick={finishPolygon}
          />
        </div>
      </div>
      {manualMode && (
        <div className="border-t bg-card px-3 py-2 text-[11px] text-muted-foreground">
          {!manualTool &&
            !manualSelection &&
            "Choose Box or Pen, then draw directly on the source image."}
          {manualSelection && "Manual selection ready. Create Asset adds it to the tray."}
          {!manualSelection &&
            manualTool === "box" &&
            "Drag a rectangle over any region, then create a manual asset."}
          {!manualSelection &&
            manualTool === "pen" &&
            "Click polygon points. Double-click, or click near the first point, to close the selection."}
        </div>
      )}
    </div>
  );
}

const ManualSelectionLayer = (
  {
    manualTool,
    manualSelection,
    draftRect,
    polyPoints,
    hoverPoint,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDoubleClick,
  }: {
    manualTool: ManualTool;
    manualSelection: ManualSelection | null;
    draftRect: (ManualSelection & { type: "rect" }) | null;
    polyPoints: Point[];
    hoverPoint: Point | null;
    onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
    onMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
    onMouseUp: (event: MouseEvent<HTMLDivElement>) => void;
    onDoubleClick: () => void;
  },
  ref: Ref<HTMLDivElement>,
) => {
  const rect = draftRect ?? (manualSelection?.type === "rect" ? manualSelection : null);
  const committedPoly = manualSelection?.type === "poly" ? manualSelection.points : null;
  const draftPoly = manualTool === "pen" ? polyPoints : [];
  const toPct = (value: number) => `${value * 100}%`;
  const polyPointsString = (points: Point[]) =>
    points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
  const capture = Boolean(manualTool);

  return (
    <div
      ref={ref}
      className={cn(
        "absolute inset-0 z-20 select-none",
        capture ? "cursor-crosshair" : "pointer-events-none",
      )}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {rect && (
          <rect
            x={toPct(rect.x)}
            y={toPct(rect.y)}
            width={toPct(rect.w)}
            height={toPct(rect.h)}
            fill="oklch(0.55 0.22 295 / 0.12)"
            stroke="oklch(0.55 0.22 295)"
            strokeWidth="0.45"
            strokeDasharray="1.2 0.8"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {committedPoly && committedPoly.length >= 3 && (
          <polygon
            points={polyPointsString(committedPoly)}
            fill="oklch(0.55 0.22 295 / 0.12)"
            stroke="oklch(0.55 0.22 295)"
            strokeWidth="0.45"
            strokeDasharray="1.2 0.8"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {draftPoly.length > 0 && (
          <>
            <polyline
              points={polyPointsString([...draftPoly, ...(hoverPoint ? [hoverPoint] : [])])}
              fill="none"
              stroke="oklch(0.55 0.22 295)"
              strokeWidth="0.45"
              vectorEffect="non-scaling-stroke"
            />
            {draftPoly.map((point, index) => (
              <circle
                key={`${point.x}-${point.y}-${index}`}
                cx={point.x * 100}
                cy={point.y * 100}
                r={index === 0 ? 1.05 : 0.75}
                fill="white"
                stroke="oklch(0.55 0.22 295)"
                strokeWidth="0.35"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </>
        )}
      </svg>
    </div>
  );
};

const ForwardedManualSelectionLayer = forwardRef(ManualSelectionLayer);

function DetectionControls({
  settings,
  backgroundColor,
  disabled,
  isAnalyzing,
  onChange,
  onRunDetection,
}: {
  settings: DetectionSettings;
  backgroundColor: StoryboardState["backgroundColor"];
  disabled: boolean;
  isAnalyzing: boolean;
  onChange: (settings: Partial<DetectionSettings>) => void;
  onRunDetection: () => void;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <section className="rounded-md border bg-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4" />
            Detection
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-muted-foreground">
              Auto background: {rgbaToHex(backgroundColor) ?? "not sampled"}
            </div>
            <Button
              size="sm"
              onClick={onRunDetection}
              disabled={disabled || isAnalyzing}
              className="gap-2"
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Run Detection
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4">
          <SliderField
            label="Threshold"
            help="How different a pixel must be from the sampled background before it counts as foreground. Higher is stricter and usually finds fewer pixels."
            value={settings.threshold}
            min={0}
            max={100}
            disabled={disabled}
            onChange={(threshold) => onChange({ threshold })}
          />
          <SliderField
            label="Sensitivity"
            help="How aggressively faint foreground detail is kept. Higher sensitivity keeps more subtle edges and tiny marks, but may also include more noise."
            value={settings.sensitivity}
            min={0}
            max={100}
            disabled={disabled}
            onChange={(sensitivity) => onChange({ sensitivity })}
          />
          <SliderField
            label="Min area"
            help="The smallest connected region that can become an asset. Raise it to remove specks; lower it to keep tiny icons or details."
            value={settings.minComponentArea}
            min={8}
            max={1200}
            step={8}
            disabled={disabled}
            onChange={(minComponentArea) => onChange({ minComponentArea })}
          />
          <SliderField
            label="Merge"
            help="How close separate detected regions can be before they are grouped into one asset. Raise it to combine pieces; lower it to split them."
            value={settings.mergeDistance}
            min={0}
            max={40}
            disabled={disabled}
            onChange={(mergeDistance) => onChange({ mergeDistance })}
          />
          <SliderField
            label="Padding"
            help="Extra transparent space added around each crop. Raise it to preserve breathing room and shadows; lower it for tighter assets."
            value={settings.padding}
            min={0}
            max={40}
            disabled={disabled}
            onChange={(padding) => onChange({ padding })}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.preserveShadows}
              disabled={disabled}
              onCheckedChange={(preserveShadows) => onChange({ preserveShadows })}
            />
            Preserve soft shadow edges
          </label>
          <span className="text-muted-foreground">
            Slider changes are staged. Run detection when the settings look right.
          </span>
        </div>
      </section>
    </TooltipProvider>
  );
}

function SliderField({
  label,
  help,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 font-medium">
          {label}
          {help && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`More information about ${label}`}
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
                {help}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0])}
      />
    </div>
  );
}

function BottomAssetTray({
  assets,
  selectedAssetId,
  hoveredAssetId,
  showRejected,
  allActiveSelected,
  isAnalyzing,
  error,
  hasSource,
  onSelectAsset,
  onHoverAsset,
  onToggleSelected,
  onReject,
  onRestore,
  onToggleAll,
  onShowRejected,
}: {
  assets: ExtractedAsset[];
  selectedAssetId: string | null;
  hoveredAssetId: string | null;
  showRejected: boolean;
  allActiveSelected: boolean;
  isAnalyzing: boolean;
  error: string | null;
  hasSource: boolean;
  onSelectAsset: (assetId: string | null) => void;
  onHoverAsset: (assetId: string | null) => void;
  onToggleSelected: (assetId: string) => void;
  onReject: (assetId: string) => void;
  onRestore: (assetId: string) => void;
  onToggleAll: (selected: boolean) => void;
  onShowRejected: (showRejected: boolean) => void;
}) {
  return (
    <section className="col-start-2 row-start-3 min-w-0 border-t bg-card">
      <AssetGrid
        title="Assets"
        assets={assets}
        selectedAssetId={selectedAssetId}
        hoveredAssetId={hoveredAssetId}
        showRejected={showRejected}
        allActiveSelected={allActiveSelected}
        isAnalyzing={isAnalyzing}
        error={error}
        hasSource={hasSource}
        compact
        onSelectAsset={onSelectAsset}
        onHoverAsset={onHoverAsset}
        onToggleSelected={onToggleSelected}
        onReject={onReject}
        onRestore={onRestore}
        onToggleAll={onToggleAll}
        onShowRejected={onShowRejected}
      />
    </section>
  );
}

function AssetLibrary({
  assets,
  activeAssets,
  selectedAssetId,
  showRejected,
  allActiveSelected,
  onSelectAsset,
  onHoverAsset,
  onToggleSelected,
  onReject,
  onRestore,
  onToggleAll,
  onShowRejected,
}: {
  assets: ExtractedAsset[];
  activeAssets: ExtractedAsset[];
  selectedAssetId: string | null;
  showRejected: boolean;
  allActiveSelected: boolean;
  onSelectAsset: (assetId: string | null) => void;
  onHoverAsset: (assetId: string | null) => void;
  onToggleSelected: (assetId: string) => void;
  onReject: (assetId: string) => void;
  onRestore: (assetId: string) => void;
  onToggleAll: (selected: boolean) => void;
  onShowRejected: (showRejected: boolean) => void;
}) {
  return (
    <div className="h-full min-h-0 p-4">
      <div className="h-full rounded-md border bg-card">
        <AssetGrid
          title="Asset contact sheet"
          assets={assets}
          selectedAssetId={selectedAssetId}
          hoveredAssetId={null}
          showRejected={showRejected}
          allActiveSelected={allActiveSelected}
          isAnalyzing={false}
          error={null}
          activeCount={activeAssets.length}
          onSelectAsset={onSelectAsset}
          onHoverAsset={onHoverAsset}
          onToggleSelected={onToggleSelected}
          onReject={onReject}
          onRestore={onRestore}
          onToggleAll={onToggleAll}
          onShowRejected={onShowRejected}
        />
      </div>
    </div>
  );
}

function AssetGrid({
  title,
  assets,
  selectedAssetId,
  hoveredAssetId,
  showRejected,
  allActiveSelected,
  isAnalyzing,
  error,
  hasSource = true,
  activeCount,
  compact = false,
  onSelectAsset,
  onHoverAsset,
  onToggleSelected,
  onReject,
  onRestore,
  onToggleAll,
  onShowRejected,
}: {
  title: string;
  assets: ExtractedAsset[];
  selectedAssetId: string | null;
  hoveredAssetId: string | null;
  showRejected: boolean;
  allActiveSelected: boolean;
  isAnalyzing: boolean;
  error: string | null;
  hasSource?: boolean;
  activeCount?: number;
  compact?: boolean;
  onSelectAsset: (assetId: string | null) => void;
  onHoverAsset: (assetId: string | null) => void;
  onToggleSelected: (assetId: string) => void;
  onReject: (assetId: string) => void;
  onRestore: (assetId: string) => void;
  onToggleAll: (selected: boolean) => void;
  onShowRejected: (showRejected: boolean) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] text-muted-foreground">
            {activeCount ?? assets.filter((asset) => !asset.rejected).length} active ·{" "}
            {assets.length} visible
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={allActiveSelected}
              onCheckedChange={(checked) => onToggleAll(Boolean(checked))}
              disabled={!assets.length}
            />
            Select all
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={showRejected} onCheckedChange={onShowRejected} />
            Show rejected
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {isAnalyzing && !assets.length ? (
          <SkeletonGrid />
        ) : error ? (
          <EmptyGrid title="Detection failed." detail={error} />
        ) : !hasSource ? (
          <EmptyGrid
            title="No source image loaded."
            detail="Drop an image into the canvas to create an asset contact sheet."
          />
        ) : !assets.length ? (
          <EmptyGrid
            title="Nothing detected with current settings."
            detail="Lower threshold, reduce minimum area, or try an image with stronger foreground contrast."
          />
        ) : (
          <div
            className={cn(
              "grid gap-3",
              compact
                ? "grid-cols-[repeat(auto-fill,minmax(118px,1fr))]"
                : "grid-cols-[repeat(auto-fill,minmax(148px,1fr))]",
            )}
          >
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                selected={selectedAssetId === asset.id}
                hovered={hoveredAssetId === asset.id}
                compact={compact}
                onSelect={() => onSelectAsset(asset.id)}
                onHover={(hovered) => onHoverAsset(hovered ? asset.id : null)}
                onToggleSelected={() => onToggleSelected(asset.id)}
                onReject={() => onReject(asset.id)}
                onRestore={() => onRestore(asset.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  selected,
  hovered,
  compact,
  onSelect,
  onHover,
  onToggleSelected,
  onReject,
  onRestore,
}: {
  asset: ExtractedAsset;
  selected: boolean;
  hovered: boolean;
  compact?: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onToggleSelected: () => void;
  onReject: () => void;
  onRestore: () => void;
}) {
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "group rounded-md border bg-background transition-colors",
        selected && "border-primary shadow-[0_0_0_1px_var(--color-primary)]",
        hovered && !selected && "border-primary/70",
        asset.rejected && "opacity-55",
      )}
    >
      <button
        className={cn(
          "checkerboard flex w-full items-center justify-center overflow-hidden rounded-t-md border-b p-2",
          compact ? "h-24" : "h-32",
        )}
        onClick={onSelect}
      >
        <img
          src={asset.preview}
          alt={asset.name}
          className="max-h-full max-w-full object-contain"
        />
      </button>
      <div className="space-y-2 p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{asset.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {asset.bbox.w}x{asset.bbox.h}
            </div>
          </div>
          <Checkbox
            checked={asset.selected}
            disabled={asset.rejected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select ${asset.name}`}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            Pixel SVG
          </Badge>
          {asset.rejected ? (
            <button onClick={onRestore} className="text-[10px] font-medium text-primary">
              Restore
            </button>
          ) : (
            <button onClick={onReject} className="text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetInspector({
  sourceImage,
  selectedAsset,
  activeCount,
  selectedCount,
  rejectedCount,
  backgroundColor,
  detectionSettings,
  onRename,
  onToggleSelected,
  onReject,
  onRestore,
}: {
  sourceImage: SourceImage | null;
  selectedAsset: ExtractedAsset | null;
  activeCount: number;
  selectedCount: number;
  rejectedCount: number;
  backgroundColor: StoryboardState["backgroundColor"];
  detectionSettings: DetectionSettings;
  onRename: (assetId: string, name: string) => void;
  onToggleSelected: (assetId: string) => void;
  onReject: (assetId: string) => void;
  onRestore: (assetId: string) => void;
}) {
  return (
    <aside className="col-start-3 row-span-2 row-start-2 min-h-0 border-l bg-card">
      <div className="flex h-11 items-center justify-between border-b px-4">
        <div className="text-sm font-semibold">Inspector</div>
      </div>
      <div className="h-[calc(100%-44px)] overflow-auto p-4">
        {selectedAsset ? (
          <SelectedAssetInspector
            asset={selectedAsset}
            onRename={onRename}
            onToggleSelected={onToggleSelected}
            onReject={onReject}
            onRestore={onRestore}
          />
        ) : (
          <SourceSummary
            sourceImage={sourceImage}
            activeCount={activeCount}
            selectedCount={selectedCount}
            rejectedCount={rejectedCount}
            backgroundColor={backgroundColor}
            detectionSettings={detectionSettings}
          />
        )}
      </div>
    </aside>
  );
}

function SelectedAssetInspector({
  asset,
  onRename,
  onToggleSelected,
  onReject,
  onRestore,
}: {
  asset: ExtractedAsset;
  onRename: (assetId: string, name: string) => void;
  onToggleSelected: (assetId: string) => void;
  onReject: (assetId: string) => void;
  onRestore: (assetId: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = async (label: string, text: string) => {
    await navigator.clipboard?.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1000);
  };

  return (
    <div className="space-y-4">
      <div className="checkerboard flex h-44 items-center justify-center rounded-md border p-3">
        <img
          src={asset.preview}
          alt={asset.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">Name</label>
        <Input value={asset.name} onChange={(event) => onRename(asset.id, event.target.value)} />
      </div>

      <InfoRows
        rows={[
          ["Slug", asset.slug],
          ["Dimensions", `${asset.bbox.w}x${asset.bbox.h}`],
          ["Bounds", `x ${asset.bbox.x}, y ${asset.bbox.y}`],
          ["Kind", asset.kind],
          ["Origin", asset.origin],
          ["Quality", "Pixel SVG"],
          ["Confidence", `${Math.round(asset.confidence * 100)}%`],
        ]}
      />

      <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
        <div className="font-medium">Quality note</div>
        <p className="mt-1 text-muted-foreground">
          Pixel SVG embeds the PNG crop. It preserves appearance but is not editable vector.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium">Warnings</div>
        <div className="flex flex-wrap gap-1.5">
          {asset.warnings.map((warning) => (
            <Badge key={warning} variant="outline" className="text-[10px]">
              {warning}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleSelected(asset.id)}
          className="gap-2"
        >
          <Check className="h-3.5 w-3.5" />
          {asset.selected ? "Deselect" : "Select"}
        </Button>
        {asset.rejected ? (
          <Button variant="outline" size="sm" onClick={() => onRestore(asset.id)} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onReject(asset.id)} className="gap-2">
            <Trash2 className="h-3.5 w-3.5" />
            Reject
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyText("slug", asset.slug)}
          className="gap-2"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied === "slug" ? "Copied" : "Copy slug"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyText("dimensions", `${asset.bbox.w}x${asset.bbox.h}`)}
          className="gap-2"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied === "dimensions" ? "Copied" : "Copy size"}
        </Button>
      </div>
    </div>
  );
}

function SourceSummary({
  sourceImage,
  activeCount,
  selectedCount,
  rejectedCount,
  backgroundColor,
  detectionSettings,
}: {
  sourceImage: SourceImage | null;
  activeCount: number;
  selectedCount: number;
  rejectedCount: number;
  backgroundColor: StoryboardState["backgroundColor"];
  detectionSettings: DetectionSettings;
}) {
  if (!sourceImage) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        Import an image to inspect source metadata and detected assets.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <InfoRows
        rows={[
          ["File", sourceImage.name],
          ["Dimensions", `${sourceImage.width}x${sourceImage.height}`],
          ["Size", formatBytes(sourceImage.size)],
          ["Type", sourceImage.type.replace("image/", "").toUpperCase()],
          ["Background", rgbaToHex(backgroundColor) ?? "not sampled"],
          ["Detected", `${activeCount}`],
          ["Selected", `${selectedCount}`],
          ["Rejected", `${rejectedCount}`],
        ]}
      />
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="mb-2 text-xs font-medium">Detection settings</div>
        <InfoRows
          compact
          rows={[
            ["Threshold", String(detectionSettings.threshold)],
            ["Sensitivity", String(detectionSettings.sensitivity)],
            ["Min area", String(detectionSettings.minComponentArea)],
            ["Merge", String(detectionSettings.mergeDistance)],
            ["Padding", String(detectionSettings.padding)],
          ]}
        />
      </div>
    </div>
  );
}

function InfoRows({ rows, compact = false }: { rows: Array<[string, string]>; compact?: boolean }) {
  return (
    <div className={cn("divide-y rounded-md border", compact ? "text-[11px]" : "text-xs")}>
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 px-3 py-2">
          <div className="text-muted-foreground">{label}</div>
          <div className="truncate font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ExportPanel({
  state,
  exportableAssets,
  onSettingsChange,
  onExport,
}: {
  state: StoryboardState;
  exportableAssets: ExtractedAsset[];
  onSettingsChange: (settings: Partial<ExportSettings>) => void;
  onExport: () => void;
}) {
  const paths = getZipPreviewPaths(exportableAssets, state.exportSettings);
  const canExport = Boolean(state.sourceImage && exportableAssets.length);
  const exampleName = exportableAssets[0]
    ? `${platformAssetFileBase(exportableAssets[0], state.exportSettings)}.png`
    : `${slugifyName(state.exportSettings.filePrefix, state.exportSettings.namingStyle)}-001.png`;

  return (
    <div className="h-full min-h-0 overflow-auto p-4">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-md border bg-card p-4">
          <div className="mb-4">
            <div className="text-sm font-semibold">Export package</div>
            <div className="text-xs text-muted-foreground">
              Package selected assets for a generic archive, web app, iOS asset catalog, or Android
              drawable folder.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FieldGroup label="Platform">
              <PlatformPresetSelector
                value={state.exportSettings.platformPreset}
                onChange={(platformPreset) => onSettingsChange({ platformPreset })}
              />
            </FieldGroup>

            <FieldGroup label="Scope">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={state.exportSettings.scope === "selected"}
                  onChange={() => onSettingsChange({ scope: "selected" })}
                />
                Selected assets
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={state.exportSettings.scope === "active"}
                  onChange={() => onSettingsChange({ scope: "active" })}
                />
                All active assets
              </label>
            </FieldGroup>

            <FieldGroup label="Formats">
              <ExportCheckbox
                label="Transparent PNG"
                checked={state.exportSettings.includePng}
                onChange={(includePng) => onSettingsChange({ includePng })}
              />
              <ExportCheckbox
                label="Pixel SVG wrapper"
                checked={state.exportSettings.includePixelSvg}
                onChange={(includePixelSvg) => onSettingsChange({ includePixelSvg })}
              />
              <ExportCheckbox
                label="Manifest JSON"
                checked={state.exportSettings.includeManifest}
                onChange={(includeManifest) => onSettingsChange({ includeManifest })}
              />
              <ExportCheckbox
                label="README"
                checked={state.exportSettings.includeReadme}
                onChange={(includeReadme) => onSettingsChange({ includeReadme })}
              />
            </FieldGroup>

            <FieldGroup label="Naming">
              <label className="text-xs font-medium">Prefix</label>
              <Input
                value={state.exportSettings.filePrefix}
                onChange={(event) => onSettingsChange({ filePrefix: event.target.value })}
                className="mt-1"
              />
              <label className="mt-3 block text-xs font-medium">Style</label>
              <select
                value={state.exportSettings.namingStyle}
                onChange={(event) =>
                  onSettingsChange({
                    namingStyle: event.target.value as ExportSettings["namingStyle"],
                  })
                }
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="kebab">kebab-case</option>
                <option value="snake">snake_case</option>
              </select>
              <div className="mt-2 text-[11px] text-muted-foreground">Example: {exampleName}</div>
            </FieldGroup>

            <FieldGroup label="Quality note">
              <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                Pixel SVG preserves appearance by embedding the transparent PNG crop. Editable
                vector tracing is not included in v1.
              </div>
            </FieldGroup>
          </div>
        </section>

        <section className="rounded-md border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileJson className="h-4 w-4" />
            ZIP contents
          </div>
          <div className="max-h-[420px] overflow-auto rounded-md border bg-muted/20 p-3 font-mono text-[11px] leading-5">
            {paths.length ? (
              paths.map((path) => <div key={path}>{path}</div>)
            ) : (
              <div className="font-sans text-sm text-muted-foreground">
                No assets ready to export.
              </div>
            )}
          </div>
          {state.lastExport && (
            <div className="mt-3 rounded-md border bg-primary-soft/35 p-3 text-xs">
              Exported {state.lastExport.assetCount} assets · {state.lastExport.fileName}
            </div>
          )}
          <Button disabled={!canExport} onClick={onExport} className="mt-4 w-full gap-2">
            <Download className="h-4 w-4" />
            Export ZIP
          </Button>
        </section>
      </div>
    </div>
  );
}

const platformPresetOptions: Array<{
  id: PlatformPreset;
  label: string;
  detail: string;
}> = [
  {
    id: "generic",
    label: "Generic",
    detail: "Current archive layout with PNG, Pixel SVG, manifest, and README folders.",
  },
  {
    id: "web",
    label: "Web",
    detail: "Adds src/assets folders and a TypeScript asset map for app imports.",
  },
  {
    id: "ios",
    label: "iOS",
    detail: "Creates Assets.xcassets image set folders with Contents.json files.",
  },
  {
    id: "android",
    label: "Android",
    detail: "Writes PNGs into app/src/main/res/drawable-nodpi using Android-safe names.",
  },
];

function PlatformPresetSelector({
  value,
  onChange,
}: {
  value: PlatformPreset;
  onChange: (value: PlatformPreset) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
      {platformPresetOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-md border p-2 text-left transition-colors",
            value === option.id
              ? "border-primary bg-primary-soft/55 text-foreground"
              : "bg-background hover:bg-muted/50",
          )}
        >
          <div className="text-xs font-semibold">{option.label}</div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {option.detail}
          </div>
        </button>
      ))}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function ExportCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mb-2 flex items-center gap-2 text-sm last:mb-0">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(Boolean(next))} />
      {label}
    </label>
  );
}

function SettingsPanel({
  state,
  onReset,
  onClear,
}: {
  state: StoryboardState;
  onReset: () => void;
  onClear: () => void;
}) {
  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-md border bg-card p-4">
          <div className="text-sm font-semibold">Tool defaults</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Storyboard is currently a local browser workflow. It does not upload source images or
            exports.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <InfoRows
              rows={[
                ["Threshold", String(state.detectionSettings.threshold)],
                ["Sensitivity", String(state.detectionSettings.sensitivity)],
                ["Min area", String(state.detectionSettings.minComponentArea)],
                ["Padding", String(state.detectionSettings.padding)],
              ]}
            />
            <InfoRows
              rows={[
                ["Platform", state.exportSettings.platformPreset],
                ["Scope", state.exportSettings.scope],
                ["PNG", state.exportSettings.includePng ? "included" : "off"],
                ["Pixel SVG", state.exportSettings.includePixelSvg ? "included" : "off"],
                ["Prefix", state.exportSettings.filePrefix],
              ]}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={onReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset settings
            </Button>
            <Button variant="outline" onClick={onClear} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Clear current project
            </Button>
          </div>
        </section>

        <section className="rounded-md border bg-card p-4">
          <div className="text-sm font-semibold">Shortcuts</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Shortcut label="Select all active" keys="Cmd/Ctrl + A" />
            <Shortcut label="Export" keys="Cmd/Ctrl + E" />
            <Shortcut label="Reject selected" keys="Delete" />
            <Shortcut label="Clear selection" keys="Escape" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Shortcut({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span>{label}</span>
      <code className="text-xs text-muted-foreground">{keys}</code>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-3">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-md border bg-muted/40" />
      ))}
    </div>
  );
}

function EmptyGrid({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center text-center">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 max-w-md text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
