import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Image as ImageIcon, Sun, Moon,
  Download, Upload, Trash2, RefreshCw, ChevronLeft, ChevronRight,
  Lightbulb, Loader2, Square, PenTool, X, FileImage, FileCode2, Copy, Pencil, Check,
} from "lucide-react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  extractAssets, assetToSvg, downloadBlob, dataUrlToBlob,
  type DetectedAsset, type Roi, type AssetKind,
} from "@/lib/extractor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Page,
  head: () => ({
    meta: [
      { title: "SVG Extractor — AI Image to SVG Assets" },
      { name: "description", content: "Turn AI-generated UI mockups into reusable SVG assets in your browser." },
    ],
  }),
});

const NAV = [
  { icon: ImageIcon, label: "Extract", active: true },
  { icon: Layers, label: "Assets" },
  { icon: Layers, label: "Layers" },
  { icon: Palette, label: "Colors" },
  { icon: History, label: "Export History" },
];

const PAGE_SIZE = 16;
const KIND_FILTERS: { key: AssetKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "icon", label: "Icons" },
  { key: "button", label: "Buttons" },
  { key: "text", label: "Text" },
  { key: "illustration", label: "Illustrations" },
];
type ExportFormat = "svg" | "png" | "both";

function Page() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [assets, setAssets] = useState<DetectedAsset[]>([]);
  const [threshold, setThreshold] = useState(() => readNum("svgex.threshold", 68));
  const [sensitivity, setSensitivity] = useState(() => readNum("svgex.sensitivity", 50));
  const [format, setFormat] = useState<ExportFormat>(() => (localStorage.getItem("svgex.format") as ExportFormat) || "svg");
  const [filter, setFilter] = useState<AssetKind | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [tool, setTool] = useState<"rect" | "pen" | null>(null);
  const [roi, setRoi] = useState<Roi>(null);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [polyPoints, setPolyPoints] = useState<{ x: number; y: number }[]>([]);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverAssetId, setHoverAssetId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { localStorage.setItem("svgex.threshold", String(threshold)); }, [threshold]);
  useEffect(() => { localStorage.setItem("svgex.sensitivity", String(sensitivity)); }, [sensitivity]);
  useEffect(() => { localStorage.setItem("svgex.format", format); }, [format]);

  const runExtraction = useCallback(async (src: string, t: number, s: number, r: Roi) => {
    setLoading(true); setError(null);
    try {
      const result = await extractAssets(src, { threshold: t, sensitivity: s, roi: r });
      setAssets(prev => {
        const selected = new Set(prev.filter(a => a.selected).map(a => a.id));
        const names = new Map(prev.map(a => [a.id, a.name]));
        return result.map(a => ({
          ...a,
          selected: selected.has(a.id),
          name: names.get(a.id) ?? a.name,
        }));
      });
      setPage(0);
    } catch (e) {
      console.error(e);
      setError("Failed to analyze image. Please try a different file.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!imageSrc) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      runExtraction(imageSrc, threshold, sensitivity, roi);
    }, 250);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [imageSrc, threshold, sensitivity, roi, runExtraction]);

  // Track natural image size for bbox overlay
  useEffect(() => {
    if (!imageSrc) { setImageSize(null); return; }
    const img = new Image();
    img.onload = () => {
      const max = 1200;
      const scale = img.width > max ? max / img.width : 1;
      setImageSize({ w: Math.round(img.width * scale), h: Math.round(img.height * scale) });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a PNG or JPEG image.");
      toast.error("Unsupported file type");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setImageSrc(reader.result as string); setRoi(null); toast.success("Image loaded"); };
    reader.onerror = () => setError("Could not read file.");
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  };

  // Paste image from clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) handleFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const filteredAssets = useMemo(
    () => filter === "all" ? assets : assets.filter(a => a.kind === filter),
    [assets, filter],
  );
  const selectedAssets = useMemo(() => filteredAssets.filter(a => a.selected), [filteredAssets]);
  const allSelected = filteredAssets.length > 0 && selectedAssets.length === filteredAssets.length;

  const toggleAll = () => {
    const ids = new Set(filteredAssets.map(a => a.id));
    setAssets(prev => prev.map(a => ids.has(a.id) ? { ...a, selected: !allSelected } : a));
  };
  const toggleAsset = (id: string) =>
    setAssets(prev => prev.map(a => a.id === id ? { ...a, selected: !a.selected } : a));

  const renameAsset = (id: string, name: string) => {
    const safe = name.trim().replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 60) || "asset";
    setAssets(prev => prev.map(a => a.id === id ? { ...a, name: safe } : a));
  };

  const downloadOne = (a: DetectedAsset, fmt: ExportFormat) => {
    if (fmt === "svg" || fmt === "both") {
      downloadBlob(new Blob([assetToSvg(a)], { type: "image/svg+xml" }), `${a.name}.svg`);
    }
    if (fmt === "png" || fmt === "both") {
      downloadBlob(dataUrlToBlob(a.preview), `${a.name}.png`);
    }
    toast.success(`Downloaded ${a.name}`);
  };

  const copySvg = async (a: DetectedAsset) => {
    try {
      await navigator.clipboard.writeText(assetToSvg(a));
      toast.success("SVG copied to clipboard");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const exportZip = async (which: DetectedAsset[]) => {
    if (!which.length) { toast.error("Nothing to export"); return; }
    const zip = new JSZip();
    which.forEach((a, i) => {
      const base = a.name || `asset-${i}`;
      if (format === "svg" || format === "both") zip.file(`${base}.svg`, assetToSvg(a));
      if (format === "png" || format === "both") zip.file(`${base}.png`, dataUrlToBlob(a.preview));
    });
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "svg-extractor-assets.zip");
    toast.success(`Exported ${which.length} asset${which.length > 1 ? "s" : ""}`);
  };

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE));
  const visible = filteredAssets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const hoveredAsset = hoverAssetId ? assets.find(a => a.id === hoverAssetId) : null;

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") { setTool(null); setPolyPoints([]); setDraftRect(null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && assets.length) {
        e.preventDefault(); toggleAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAssets.length) setAssets(prev => prev.map(a => ({ ...a, selected: false })));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assets, selectedAssets, toggleAll]);

  const kindCount = (k: AssetKind | "all") =>
    k === "all" ? assets.length : assets.filter(a => a.kind === k).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r bg-card">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">SVG Extractor</div>
            <div className="text-[11px] text-muted-foreground">AI Image to SVG Assets</div>
          </div>
        </div>

        <nav className="mt-2 flex flex-col gap-1 px-3">
          {NAV.map(n => (
            <button
              key={n.label}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                n.active
                  ? "bg-primary-soft text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4">
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Pro tip
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Paste an image with ⌘V. Use Box or Pen to limit detection. Press Esc to cancel.
            </p>
          </div>
          <button className="mt-3 flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="flex items-center gap-2"><Sun className="h-4 w-4" /> Light Mode</span>
            <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-end gap-2 border-b bg-card px-6 py-3">
          <div className="mr-2 flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
            {(["svg", "png", "both"] as ExportFormat[]).map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium uppercase transition-colors",
                  format === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >{f}</button>
            ))}
          </div>
          <Button
            onClick={() => exportZip(selectedAssets.length ? selectedAssets : filteredAssets)}
            disabled={!filteredAssets.length}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export {selectedAssets.length ? `Selected (${selectedAssets.length})` : "All"} (ZIP)
          </Button>
          <Button variant="outline" className="gap-2">
            <Settings className="h-4 w-4" /> Settings
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-auto p-6">
          <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Upload panel */}
            <section className="flex flex-col rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold">1. Upload your AI-generated UI image</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Drop, click, or paste (⌘V). We'll detect and extract individual assets.
              </p>

              <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border bg-muted/30 p-4 min-h-[400px]">
                {!imageSrc ? (
                  <button
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={onDrop}
                    className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed bg-background/50 p-10 text-center transition-colors hover:border-primary hover:bg-primary-soft/30"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
                      <Upload className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Drop a PNG or JPEG here</div>
                      <div className="text-xs text-muted-foreground">click to choose · or paste from clipboard</div>
                    </div>
                  </button>
                ) : (
                  <ImageRoiCanvas
                    src={imageSrc}
                    tool={tool}
                    roi={roi}
                    draftRect={draftRect}
                    polyPoints={polyPoints}
                    hoverPoint={hoverPoint}
                    overlayRef={overlayRef}
                    hoverBbox={hoveredAsset && imageSize ? {
                      x: hoveredAsset.bbox.x / imageSize.w,
                      y: hoveredAsset.bbox.y / imageSize.h,
                      w: hoveredAsset.bbox.w / imageSize.w,
                      h: hoveredAsset.bbox.h / imageSize.h,
                    } : null}
                    onPointerDown={(p, e) => {
                      if (tool === "rect") {
                        dragStartRef.current = p;
                        setDraftRect({ x: p.x, y: p.y, w: 0, h: 0 });
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                      } else if (tool === "pen") {
                        if (polyPoints.length >= 3) {
                          const first = polyPoints[0];
                          if (Math.hypot(first.x - p.x, first.y - p.y) < 0.02) {
                            setRoi({ type: "poly", points: polyPoints });
                            setPolyPoints([]); setHoverPoint(null); setTool(null);
                            return;
                          }
                        }
                        setPolyPoints(pts => [...pts, p]);
                      }
                    }}
                    onPointerMove={(p) => {
                      if (tool === "rect" && dragStartRef.current) {
                        const s = dragStartRef.current;
                        setDraftRect({
                          x: Math.min(s.x, p.x), y: Math.min(s.y, p.y),
                          w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y),
                        });
                      } else if (tool === "pen" && polyPoints.length > 0) {
                        setHoverPoint(p);
                      }
                    }}
                    onPointerUp={() => {
                      if (tool === "rect" && draftRect && draftRect.w > 0.01 && draftRect.h > 0.01) {
                        setRoi({ type: "rect", ...draftRect });
                        setTool(null);
                      }
                      setDraftRect(null);
                      dragStartRef.current = null;
                    }}
                    onDoubleClick={() => {
                      if (tool === "pen" && polyPoints.length >= 3) {
                        setRoi({ type: "poly", points: polyPoints });
                        setPolyPoints([]); setHoverPoint(null); setTool(null);
                      }
                    }}
                  />
                )}
              </div>

              <input
                ref={fileRef} type="file" accept="image/*" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Replace
                </Button>
                <div className="mx-1 h-6 w-px bg-border" />
                <Button
                  variant={tool === "rect" ? "default" : "outline"}
                  size="sm" className="gap-2"
                  onClick={() => { setTool(t => t === "rect" ? null : "rect"); setPolyPoints([]); setHoverPoint(null); }}
                  disabled={!imageSrc}
                ><Square className="h-3.5 w-3.5" /> Box</Button>
                <Button
                  variant={tool === "pen" ? "default" : "outline"}
                  size="sm" className="gap-2"
                  onClick={() => { setTool(t => t === "pen" ? null : "pen"); setPolyPoints([]); setHoverPoint(null); setDraftRect(null); }}
                  disabled={!imageSrc}
                ><PenTool className="h-3.5 w-3.5" /> Pen</Button>
                <Button
                  variant="outline" size="sm" className="gap-2"
                  onClick={() => { setRoi(null); setPolyPoints([]); setHoverPoint(null); setDraftRect(null); setTool(null); }}
                  disabled={!roi && !polyPoints.length && !tool}
                ><X className="h-3.5 w-3.5" /> Reset Selection</Button>
                <div className="ml-auto flex items-center gap-2">
                  {roi && (
                    <span className="text-[11px] text-muted-foreground">
                      {roi.type === "rect" ? "Box selection active" : `Polygon (${roi.points.length} pts)`}
                    </span>
                  )}
                  <Button
                    variant="outline" size="icon"
                    onClick={() => { setImageSrc(null); setAssets([]); setRoi(null); }}
                    disabled={!imageSrc}
                  ><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </section>

            {/* Assets panel */}
            <section className="flex flex-col rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold">
                    2. Detected Assets {assets.length > 0 && <span className="text-muted-foreground">({assets.length})</span>}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Hover for actions. Click to select.</p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={!filteredAssets.length} />
                  Select All
                </label>
              </div>

              {/* Filter chips */}
              {assets.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {KIND_FILTERS.map(f => {
                    const count = kindCount(f.key);
                    if (f.key !== "all" && count === 0) return null;
                    return (
                      <button
                        key={f.key}
                        onClick={() => { setFilter(f.key); setPage(0); }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                          filter === f.key
                            ? "border-primary bg-primary-soft text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        )}
                      >{f.label} <span className="opacity-60">{count}</span></button>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex-1">
                {loading && !assets.length ? (
                  <div className="flex h-full min-h-[400px] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing image…
                  </div>
                ) : error ? (
                  <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-destructive">{error}</div>
                ) : !filteredAssets.length ? (
                  <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-muted-foreground">
                    {assets.length ? "No assets match this filter." : "Upload an image to see detected assets."}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {visible.map(a => (
                      <div
                        key={a.id}
                        className="group relative"
                        onMouseEnter={() => setHoverAssetId(a.id)}
                        onMouseLeave={() => setHoverAssetId(prev => prev === a.id ? null : prev)}
                      >
                        <button
                          onClick={() => toggleAsset(a.id)}
                          className={cn(
                            "checkerboard relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border-2 p-2 transition-all",
                            a.selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
                          )}
                        >
                          <img src={a.preview} alt={a.name} className="max-h-full max-w-full object-contain" />
                          {a.selected && (
                            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                        {/* Hover actions */}
                        <div className="pointer-events-none absolute inset-x-1 top-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                          <IconAction title="Download SVG" onClick={() => downloadOne(a, "svg")}><FileCode2 className="h-3 w-3" /></IconAction>
                          <IconAction title="Download PNG" onClick={() => downloadOne(a, "png")}><FileImage className="h-3 w-3" /></IconAction>
                          <IconAction title="Copy SVG" onClick={() => copySvg(a)}><Copy className="h-3 w-3" /></IconAction>
                        </div>
                        {/* Name */}
                        <div className="mt-1.5 flex items-center gap-1 px-0.5">
                          {renamingId === a.id ? (
                            <>
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") { renameAsset(a.id, renameValue); setRenamingId(null); }
                                  if (e.key === "Escape") setRenamingId(null);
                                }}
                                onBlur={() => { renameAsset(a.id, renameValue); setRenamingId(null); }}
                                className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-[11px] outline-none focus:border-primary"
                              />
                            </>
                          ) : (
                            <>
                              <span className="truncate text-[11px] text-muted-foreground" title={a.name}>{a.name}</span>
                              <button
                                onClick={() => { setRenameValue(a.name); setRenamingId(a.id); }}
                                className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                                title="Rename"
                              ><Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {filteredAssets.length > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <Button key={i} variant={i === page ? "default" : "ghost"} size="sm" onClick={() => setPage(i)} className="h-8 w-8 p-0">{i + 1}</Button>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedAssets.length} of {filteredAssets.length} selected
                  </span>
                </div>
              )}
            </section>
          </div>

          {/* Detection controls */}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">3. Adjust Detection</h2>
            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium">Threshold</span>
                  <span className="text-muted-foreground">{threshold}%</span>
                </div>
                <Slider value={[threshold]} onValueChange={v => setThreshold(v[0])} max={100} step={1} />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium">Sensitivity</span>
                  <span className="text-muted-foreground">{sensitivity}%</span>
                </div>
                <Slider value={[sensitivity]} onValueChange={v => setSensitivity(v[0])} max={100} step={1} />
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-primary-soft/40 p-3">
                <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
                <div className="text-xs leading-relaxed">
                  <div>Higher threshold = cleaner separation</div>
                  <div className="text-muted-foreground">Higher sensitivity = keep smaller assets</div>
                </div>
              </div>
            </div>
            {loading && assets.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Recomputing…
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function readNum(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function IconAction({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary hover:text-primary"
    >{children}</button>
  );
}

interface Pt { x: number; y: number }
interface ImageRoiCanvasProps {
  src: string;
  tool: "rect" | "pen" | null;
  roi: Roi;
  draftRect: { x: number; y: number; w: number; h: number } | null;
  polyPoints: Pt[];
  hoverPoint: Pt | null;
  hoverBbox: { x: number; y: number; w: number; h: number } | null;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (p: Pt, e: React.PointerEvent) => void;
  onPointerMove: (p: Pt) => void;
  onPointerUp: () => void;
  onDoubleClick: () => void;
}

function ImageRoiCanvas(props: ImageRoiCanvasProps) {
  const { src, tool, roi, draftRect, polyPoints, hoverPoint, hoverBbox, overlayRef } = props;
  const toNorm = (e: React.PointerEvent): Pt => {
    const r = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const toPct = (n: number) => `${n * 100}%`;
  const cursor = tool ? "crosshair" : "default";
  const previewRect = draftRect ?? (roi?.type === "rect" ? roi : null);
  const previewPoly = roi?.type === "poly" ? roi.points : null;

  return (
    <div className="relative inline-block max-h-[460px]">
      <img src={src} alt="uploaded mockup" className="block max-h-[460px] w-auto rounded-md object-contain select-none" draggable={false} />
      <div
        ref={overlayRef}
        className="absolute inset-0 touch-none"
        style={{ cursor }}
        onPointerDown={e => { if (tool) props.onPointerDown(toNorm(e), e); }}
        onPointerMove={e => { if (tool) props.onPointerMove(toNorm(e)); }}
        onPointerUp={() => { if (tool) props.onPointerUp(); }}
        onDoubleClick={() => props.onDoubleClick()}
      >
        <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
          {(previewRect || (previewPoly && previewPoly.length >= 3)) && (
            <defs>
              <mask id="roi-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {previewRect && (
                  <rect x={toPct(previewRect.x)} y={toPct(previewRect.y)} width={toPct(previewRect.w)} height={toPct(previewRect.h)} fill="black" />
                )}
                {previewPoly && previewPoly.length >= 3 && (
                  <polygon points={previewPoly.map(p => `${p.x * 100}%,${p.y * 100}%`).join(" ")} fill="black" />
                )}
              </mask>
            </defs>
          )}
          {(previewRect || (previewPoly && previewPoly.length >= 3)) && (
            <rect x="0" y="0" width="100%" height="100%" fill="oklch(0 0 0 / 0.45)" mask="url(#roi-mask)" />
          )}

          {previewRect && (
            <rect x={toPct(previewRect.x)} y={toPct(previewRect.y)} width={toPct(previewRect.w)} height={toPct(previewRect.h)}
              fill="none" stroke="oklch(0.55 0.22 295)" strokeWidth="2" strokeDasharray="4 3" />
          )}
          {previewPoly && previewPoly.length >= 3 && (
            <polygon points={previewPoly.map(p => `${p.x * 100}%,${p.y * 100}%`).join(" ")}
              fill="none" stroke="oklch(0.55 0.22 295)" strokeWidth="2" strokeDasharray="4 3" />
          )}
          {tool === "pen" && polyPoints.length > 0 && (
            <>
              <polyline
                points={[
                  ...polyPoints.map(p => `${p.x * 100}%,${p.y * 100}%`),
                  ...(hoverPoint ? [`${hoverPoint.x * 100}%,${hoverPoint.y * 100}%`] : []),
                ].join(" ")}
                fill="oklch(0.55 0.22 295 / 0.15)" stroke="oklch(0.55 0.22 295)" strokeWidth="2"
              />
              {polyPoints.map((p, i) => (
                <circle key={i} cx={toPct(p.x)} cy={toPct(p.y)} r={i === 0 ? 5 : 3} fill="white" stroke="oklch(0.55 0.22 295)" strokeWidth="2" />
              ))}
            </>
          )}
          {/* Hover bbox highlight from assets grid */}
          {hoverBbox && (
            <rect
              x={toPct(hoverBbox.x)} y={toPct(hoverBbox.y)}
              width={toPct(hoverBbox.w)} height={toPct(hoverBbox.h)}
              fill="oklch(0.55 0.22 295 / 0.12)" stroke="oklch(0.55 0.22 295)" strokeWidth="2"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
