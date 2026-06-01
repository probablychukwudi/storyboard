<p align="center">
  <img src="public/storyboard-logo.svg" alt="Storyboard" width="560" />
</p>

<p align="center">
  <strong>Turn generated app screens into local assets, structured crops, and SwiftUI-ready starter packs.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#workflow">Workflow</a> ·
  <a href="#exports">Exports</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

# Storyboard

Storyboard is a local-first asset extraction studio for the new design loop: generate a beautiful
app screen, drop the screenshot in, tune the detected regions, and export the pieces a developer can
actually use.

It is intentionally practical. Storyboard does not pretend a screenshot is magic editable vector UI.
It gives you inspectable crops, platform-aware file structure, pixel-preserving SVG wrappers, a
manifest, and a tighter bridge from "this AI screen looks amazing" to "I can build from this."

## Why It Exists

AI image tools are excellent at vibe, composition, and visual ambition. They are much weaker at
handoff. Storyboard sits in that gap.

Use it when you have:

- A generated mobile app screen you want to turn into implementation assets.
- A UI screenshot that contains icons, cards, buttons, or illustration fragments worth reusing.
- A concept image that needs to become a tidy export folder instead of a single flattened PNG.
- A fast prototype loop where screenshots should become design/development material in minutes.

## Highlights

- Local browser processing for source images.
- Automatic region detection with threshold, sensitivity, merge, padding, and shadow controls.
- Manual box and pen selection tools for exact crops.
- Asset library for selecting, rejecting, restoring, and renaming detections.
- Export presets for generic, web, iOS, and Android asset layouts.
- PNG export plus pixel SVG export for appearance-preserving embeds.
- JSON manifest with bounds, confidence, origin, quality, and generated file paths.
- Light/dark UI with an adaptive monochrome Storyboard logo.

## The Demo Loop

Storyboard is built for a short, shareable loop:

1. Generate a polished app screen with your favorite image model.
2. Drop the screenshot into Storyboard.
3. Watch it split the screen into usable regions.
4. Export the pack and wire the assets into a real prototype.

That is the hook: the screenshot stops being a dead image and becomes raw material.

## Current Limits

Storyboard is an extraction tool, not a full semantic vectorizer. Pixel SVG exports wrap the crop as
raster data inside SVG so the asset preserves appearance. They are not editable vector geometry.

Text recognition, native SwiftUI hierarchy generation, and higher-level component inference are on
the roadmap.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Production check:

```bash
npm run build
npm run preview
```

No API keys or hosted services are required for the core app.

## Workflow

1. Drop in a PNG, JPEG, or WebP screenshot.
2. Let Storyboard detect candidate UI regions.
3. Tune detection settings until the crops feel useful.
4. Switch to manual mode for precise box or pen selections.
5. Review, rename, reject, and restore assets.
6. Choose an export preset and download a ready-to-wire ZIP.

## Exports

Storyboard can package:

- `assets/png`: transparent raster crops.
- `assets/svg-pixel`: SVG files that embed the PNG crop.
- `manifest/asset-manifest.json`: metadata for bounds, confidence, warnings, and file paths.
- Platform-specific folders for web, iOS asset catalogs, and Android drawable resources.
- A generated README inside the export ZIP describing settings and formats.

## Tech Stack

- React 19
- TanStack Router and TanStack Start
- Tailwind CSS v4
- Radix UI primitives
- JSZip
- Canvas-based browser image analysis

## Roadmap

- Screenshot-to-SwiftUI draft exports.
- OCR-assisted text region detection.
- Smarter grouping for cards, tab bars, buttons, and icon sets.
- Batch extraction for multi-screen flows.
- Better design token hints from color and spacing analysis.
- Drag-to-recompose storyboards from extracted assets.

## Contributing

Issues, experiments, and sharp critiques are welcome. The most useful contributions are:

- Better detection heuristics across real app screenshots.
- Export presets that match production platform conventions.
- Small UX improvements that make the crop review loop faster.
- Example screenshots and before/after exports for the README.

Before opening a pull request, run:

```bash
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
