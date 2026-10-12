# Change Log

All notable changes to the "pcd-viewer" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.12] - 2026-10-12

### Fixed

- Opening large binary PCD files no longer converts the entire binary payload into a JavaScript string.
- Background parsing and a bounded preview prevent full-resolution field and GPU allocations from freezing the editor.
- Preserve typed-array byte offsets, original point indices during selection, and multi-value fields in compressed PCD files.
- Report malformed-file and worker errors in the viewer, and fit the initial camera to finite point bounds.

### Added

- `pcdViewer.maxPreviewPoints`, defaulting to 1,000,000 displayed points. Preview field data is additionally capped at 64 MiB; the source file remains unchanged.
- A Full/Preview toggle. Full resolution displays every point; setting `pcdViewer.maxPreviewPoints` to `0` makes it the default.
- Constant coloring uses a uniform instead of allocating a full RGB array, reducing full-resolution GPU memory.
- Display both original and displayed point counts, plus a sampling notice for large clouds.
- Regression tests covering 12 million packed binary points, ASCII, compressed PCD, sliced buffers and malformed data.

Closes #11.

## [0.0.6] - 2025-08-24

### Added

- Added a configuration for specifying the background color.
- The default color of the point cloud is automatically selected based on the background color.
- Added a button to quickly reverse the background color.

## [0.0.5] - 2022-11-12

### Added

- Added adjustable point style and point size.
- Added reset the visual center to the coordinate origin or point cloud center.

### Changed

- Changed vscode dependency to `^1.57.0` to pass data useing `TypedArray` without serialization.
