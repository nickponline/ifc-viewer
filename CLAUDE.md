# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` - Start development server (Vite)
- `npm run build` - TypeScript check + production build
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Architecture

This is a React + Three.js IFC (Industry Foundation Classes) viewer that renders 3D building models in the browser.

### Core Libraries
- **web-ifc**: WASM-based IFC parser - loads `.ifc` files and extracts geometry/metadata
- **three**: WebGL rendering engine
- **React 19**: UI framework with Vite bundler

### Data Flow

1. **File Loading** (`DropZone.tsx`): User drops `.ifc` file → `FileReader` converts to `ArrayBuffer`
2. **IFC Parsing** (`IFCViewer.tsx:498-728`): `web-ifc` parses geometry via `StreamAllMeshes()` and metadata via `GetLine()`
3. **Three.js Rendering**: Each IFC element becomes a `THREE.Mesh` with `BufferGeometry` and `MeshPhongMaterial`
4. **Performance Mode**: Meshes are merged by color into fewer draw calls using `BufferGeometryUtils.mergeGeometries()`

### Key Components

- **IFCViewer**: Main viewer component - handles Three.js scene, camera controls (orbit/pan/zoom), IFC loading, and performance optimizations. Contains custom camera controls using spherical coordinates.
- **FilterPanel**: UI for toggling element categories (walls, doors, etc.) and filtering by building storey
- **CameraInfo**: Debug display showing camera position and rotation matrix

### IFC-Specific Concepts

- **expressID**: Unique identifier for each IFC element
- **Categories**: IFC types like `IFCWALL`, `IFCSLAB`, `IFCWINDOW` (defined in `web-ifc` constants)
- **Storeys**: Building levels extracted via `IFCBUILDINGSTOREY` and spatial containment relationships
- **Metadata**: Project/site/building info, author, units extracted from IFC header

### Performance Optimizations

The viewer implements geometry merging to reduce draw calls:
- Individual meshes are kept in `modelGroupRef` for visibility toggling
- Merged meshes (by color) are kept in `mergedGroupRef` for rendering
- `rebuildMergedMeshes()` regenerates merged geometry when visibility changes
- `matrixAutoUpdate = false` on all meshes since they're static

### WASM Configuration

The `web-ifc` WASM files must be in `/public/` and accessed via `SetWasmPath('/')`. Vite config excludes `web-ifc` from optimization to prevent bundling issues.
