import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Image as ImageIcon, Layers, Palette, History, Sun,
  Download, Settings, Upload, Trash2, RefreshCw, ChevronLeft, ChevronRight,
  Lightbulb, Loader2, Square, PenTool, X,
} from "lucide-react";
import JSZip from "jszip";
import { extractAssets, assetToSvg, downloadBlob, type DetectedAsset, type Roi } from "@/lib/extractor";
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

function Page() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [assets, setAssets] = useState<DetectedAsset[]>([]);
  const [threshold, setThreshold] = useState(68);
  const [sensitivity, setSensitivity] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [tool, setTool] = useState<"rect" | "pen" | null>(null);
  const [roi, setRoi] = useState<Roi>(null);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [polyPoints, setPolyPoints] = useState<{ x: number; y: number }[]>([]);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const runExtraction = useCallback(async (src: string, t: number, s: number, r: Roi) => {
    setLoading(true); setError(null);
    try {
      const result = await extractAssets(src, { threshold: t, sensitivity: s, roi: r });
      setAssets(prev => {
        const selected = new Set(prev.filter(a => a.selected).map(a => a.id));
        return result.map(a => ({ ...a, selected: selected.has(a.id) }));
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

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a PNG or JPEG image."); return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.onerror = () => setError("Could not read file.");
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  };

  const selectedAssets = useMemo(() => assets.filter(a => a.selected), [assets]);
  const allSelected = assets.length > 0 && selectedAssets.length === assets.length;

  const toggleAll = () => {
    setAssets(prev => prev.map(a => ({ ...a, selected: !allSelected })));
  };
  const toggleAsset = (id: string) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, selected: !a.selected } : a));
  };

  const exportZip = async (which: DetectedAsset[]) => {
    if (!which.length) return;
    const zip = new JSZip();
    which.forEach((a, i) => zip.file(`${a.name || `asset-${i}`}.svg`, assetToSvg(a)));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "svg-extractor-assets.zip");
  };

  const totalPages = Math.max(1, Math.ceil(assets.length / PAGE_SIZE));
  const visible = assets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

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
              Use the threshold slider to get cleaner separation.
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
          <Button onClick={() => exportZip(selectedAssets.length ? selectedAssets : assets)} disabled={!assets.length} className="gap-2">
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
                We'll automatically detect and extract the individual assets.
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
                      <div className="text-xs text-muted-foreground">or click to choose a file</div>
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
                    onPointerDown={(p, e) => {
                      if (tool === "rect") {
                        dragStartRef.current = p;
                        setDraftRect({ x: p.x, y: p.y, w: 0, h: 0 });
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                      } else if (tool === "pen") {
                        if (polyPoints.length >= 3) {
                          const first = polyPoints[0];
                          const dx = (first.x - p.x), dy = (first.y - p.y);
                          if (Math.hypot(dx, dy) < 0.02) {
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
                          x: Math.min(s.x, p.x),
                          y: Math.min(s.y, p.y),
                          w: Math.abs(p.x - s.x),
                          h: Math.abs(p.y - s.y),
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
                >
                  <Square className="h-3.5 w-3.5" /> Box
                </Button>
                <Button
                  variant={tool === "pen" ? "default" : "outline"}
                  size="sm" className="gap-2"
                  onClick={() => { setTool(t => t === "pen" ? null : "pen"); setPolyPoints([]); setHoverPoint(null); setDraftRect(null); }}
                  disabled={!imageSrc}
                >
                  <PenTool className="h-3.5 w-3.5" /> Pen
                </Button>
                <Button
                  variant="outline" size="sm" className="gap-2"
                  onClick={() => { setRoi(null); setPolyPoints([]); setHoverPoint(null); setDraftRect(null); setTool(null); }}
                  disabled={!roi && !polyPoints.length && !tool}
                >
                  <X className="h-3.5 w-3.5" /> Reset Selection
                </Button>
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
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
                  <p className="mt-0.5 text-xs text-muted-foreground">Click an asset to preview and export.</p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={!assets.length} />
                  Select All
                </label>
              </div>

              <div className="mt-4 flex-1">
                {loading && !assets.length ? (
                  <div className="flex h-full min-h-[400px] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing image…
                  </div>
                ) : error ? (
                  <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-destructive">{error}</div>
                ) : !assets.length ? (
                  <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-muted-foreground">
                    Upload an image to see detected assets.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {visible.map(a => (
                      <button
                        key={a.id}
                        onClick={() => toggleAsset(a.id)}
                        className={cn(
                          "checkerboard relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 p-2 transition-all",
                          a.selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
                        )}
                      >
                        <img src={a.preview} alt={a.name} className="max-h-full max-w-full object-contain" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {assets.length > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <Button
                        key={i} variant={i === page ? "default" : "ghost"} size="sm"
                        onClick={() => setPage(i)}
                        className="h-8 w-8 p-0"
                      >{i + 1}</Button>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Layers className="h-3.5 w-3.5" /> View Layers
                  </Button>
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
                  <div>Higher values = cleaner separation</div>
                  <div className="text-muted-foreground">Lower values = more details</div>
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
