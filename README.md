# PCD Viewer for VS Code

A VS Code extension for previewing Point Cloud Data (PCD) files directly in the editor with 3D visualization and interactive controls.

## Features

### 🎨 Point Cloud Visualization

- **3D Preview**: Open any `.pcd` file and instantly view it in a 3D viewer powered by Three.js
- **Field-based Coloring**: Colorize point clouds by any field value (x, y, z, intensity, rgb, rgba, etc.)
- **Multiple Colormaps**: Choose from 8 different colormaps for visualization:
  - Rainbow, Jet, HSV, Hot, Cool, Bone, Ocean, Parula

### 🕹️ Interactive Controls

- **Orbit Navigation**: Rotate, pan, and zoom the point cloud using mouse controls
  - Left-click + drag: Rotate
  - Right-click + drag: Pan
  - Scroll: Zoom
- **Preset Views**: Fit the complete cloud to standard viewing angles (X+, X-, Y+, Y-, Z+, Z-), including portrait editors and clouds offset from the origin
- **Center Mode**: Toggle between coordinate origin (O) and point cloud center (C) as the rotation pivot

### 🔍 Point Selection

- **Selection Mode**: Click the "Select" button to enable point selection
- **Point Inspector**: View all field values of a selected point in the selection panel
- **Responsive Picking**: Nearest-point selection yields to the UI and cancels stale work when the camera or cloud changes

### Large Clouds and Split Editors

- Scalar coloring reuses one buffer; colormap changes run on the GPU without rebuilding a full RGB array.
- Rendering runs on demand, pauses in hidden editors, and retains the loaded cloud when switching tabs.
- Toolbars wrap, metadata panels scroll within the available space, and the bottom field list scrolls horizontally. Selection details appear when selection mode is enabled.

### ⚙️ Customization

- **Point Size**: Adjust point size using `+` / `-` buttons or keyboard shortcuts
- **Size Mode**: Toggle between perspective-based size and fixed pixel size
- **Background Color**: Customize background color via VS Code settings
- **Reverse Background**: Quick toggle to invert background color

### 📊 Info Panel

- Click the "Info" button to display point cloud metadata:
  - File size
  - PCD version
  - Number of points
  - Dimensions (Width × Height)
  - Field names and types
  - Data format (ascii/binary/binary_compressed)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` - `9`, `0` | Select field 1-10 for coloring |
| `` ` `` (backtick) | Reset to default color |
| `+` / `=` | Increase point size |
| `-` | Decrease point size |

## Extension Settings

This extension contributes the following settings:

- `pcdViewer.backgroundColor`: Set the background color of the viewer (default: `#000000`)
- `pcdViewer.maxPreviewPoints`: Maximum displayed points (default: `1000000`, range: `0`–`5000000`). Set it to `0` for full resolution. Reopen the preview after changing this setting.

By default, large files are sampled evenly across the complete record, including the first and last point. Click **Full** to parse and display every point, or **Preview** to return to the configured preview budget. Full resolution bypasses both the point-count and 64 MiB preview field-data limits, so memory/GPU work scales with the complete cloud. Parsing remains in a background worker in both modes. The viewer shows the original and displayed point counts separately and reports the original point index when selecting a preview point. Sampling affects only the display: the original PCD and saved data remain unchanged. Compressed data larger than 512 MiB after decompression is rejected with a visible error.

## Supported PCD Formats

- PCD Version 0.7
- Data formats: ASCII, Binary, Binary Compressed (LZF)
- All standard PCD fields (x, y, z, intensity, rgb, rgba, normal_x, etc.)

## Screenshots

<!-- Add screenshots here to showcase the extension -->
<!-- ![Point Cloud Preview](images/preview.png) -->
<!-- ![Colormap Selection](images/colormap.png) -->
<!-- ![Point Selection](images/selection.png) -->

## Requirements

- VS Code version 1.57.0 or higher

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "wind-pcd-viewer"
4. Click Install

Or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=windzu.wind-pcd-viewer).

## Usage

1. Open any `.pcd` file in VS Code
2. The point cloud will automatically be displayed in the 3D viewer
3. Use mouse controls to navigate the view
4. Select a field from the bottom field list to colorize by that field's values
5. Click on the colormap bar to change the color scheme

## Known Issues

- Large files still need to be read and transferred to the viewer. Parsing runs in a background worker, and preview memory and GPU allocations are bounded.

## Development

`npm test` compiles the extension and self-contained browser worker, runs TypeScript linting, and checks the PCD parser and packaged worker, including a 12-million-point regression fixture. `npm run test:vscode` runs the VS Code extension integration suite. `npx vsce package` produces the installable extension.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests on [GitHub](https://github.com/windzu/vscode-pcd-viewer).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
