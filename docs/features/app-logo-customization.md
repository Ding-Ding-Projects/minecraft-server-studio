# App-logo customization

Minecraft Server Studio includes a local app-logo customization foundation in **Studio preferences**. It changes the visual mark in the running app only. It never changes the package identifier, executable filename, installed application-data identity, Squirrel installer identity, update feed, or the packaged application icon.

## Available sources

The source picker offers three shipped, project-specific presets and a native local-image picker:

| Source | Behavior |
| --- | --- |
| Studio Aqua | The shipped `MS` visual mark and the default after reset. |
| Server Slate | A shipped slate visual mark for a quieter server-console presentation. |
| World Spruce | A shipped green visual mark for a world-management presentation. |
| Custom local raster image | A user-selected PNG or JPEG copied into an app-private cache only after bounded byte, signature, dimension, pixel, static-image, and packaged-decoder checks succeed. |

The source picker is local. It does not upload, synchronize, telemeter, log, export the raw asset or source path, or retain the source path. The renderer receives only a bounded `data:image/png` or `data:image/jpeg` representation after the main process has validated a cached raster asset; it never receives a `file:` URL. A successful logo action records only a generic redacted local-history event; it omits image bytes, source path, hash, dimensions, and other source metadata from that history and its exports.

## Rendering controls

The preferences dialog persists the following presentation settings with the selected source:

- Fit mode for a selected custom raster: contain, cover, or fill. The saved value is retained when a shipped mark is selected and takes effect when a custom raster returns.
- Crop horizontal position, crop vertical position, and zoom.
- Focal-point horizontal and vertical positions.
- Transparent or solid-color background treatment, including a hexadecimal color entry and color picker.

The controls update the preview before saving, then apply to the visible app mark after the user selects **Apply logo rendering**. They do not change the installed product identity or the source asset itself.

## Search and regex builder

Shipped presets have a local plain-text search field. The adjacent **Build regex** control opens an anchored builder for that exact search field. It offers a raw pattern editor, supported flags, bounded sample text, live match/capture feedback, copy, and guided literal, character-class, anchor, group, alternation, and quantifier insertion.

Plain text remains the default. Regex patterns are bounded to 160 characters; the sample is bounded to 1,024 characters; unsupported flags and common nested/unbounded backtracking shapes are rejected before the preset list evaluates them. The builder filters only the three local shipped preset records and never changes the meaning of the source-selection action.

## Validation and private storage

`src/main/logo-manager.cjs` owns the separate versioned `logo-settings.json` record and the app-private `cache` directory under the product's per-user application-data directory. This is deliberately separate from the strict presentation-settings schema.

For a custom image, the main process:

1. Requires a regular, non-symlink local file no larger than 4 MiB.
2. Detects PNG or JPEG from bytes rather than trusting a filename or MIME type.
3. Rejects malformed headers, oversized dimensions, more than 16,777,216 decoded pixels, and animated PNG chunks.
4. Uses the packaged Electron image decoder, verifies a non-empty decoded image, and checks decoded dimensions again.
5. Computes SHA-256, writes the validated raster into an app-private cache through a same-directory temporary file, and atomically promotes it before saving the settings record.
6. Revalidates cached bytes, format, size, SHA-256, and decoded dimensions before displaying the custom asset on later loads.

The app accepts PNG and JPEG in this foundation. SVG, GIF, WebP, animated images, unbounded input, malformed images, unsupported formats, symbolic links, remote images, and arbitrary renderer file paths are not accepted. The prior valid logo remains active if validation or caching fails.

Selecting a shipped preset or resetting the logo removes only the exact app-private cached custom asset that the current validated record referenced. It never changes or deletes the original user-selected file.

## School-mode behavior

The app-logo editor is hidden while the shared School mode is active. The running mark falls back to the shipped Studio Aqua preset while that mode is effective. The user's saved logo selection and rendering values remain stored and return after the mode is turned off.

## Failure states

| State | Visible behavior | Recovery |
| --- | --- | --- |
| Missing logo settings | Studio Aqua is shown. | Select a preset, choose a local image, or leave the default unchanged. |
| Invalid or unsupported settings | Studio Aqua is shown without overwriting the invalid record automatically. | Save a deliberate new preset, custom image, or reset. |
| Missing or invalid custom cache | Studio Aqua is shown and the saved custom state is identified as unavailable. | Choose the image again, select a shipped preset, or reset. |
| Decoder or cache write failure | The prior valid active logo remains unchanged. | Choose a smaller supported image and retry after restoring application-data access. |

## Security boundary

This is a presentation feature, not a file-conversion service or a package rebranding mechanism. The custom asset is processed locally in the main process. It has no network route, no external converter, no CDN, no telemetry path, no raw-image or source-file export path, and no credential access. The implementation does not mutate `assets/minecraft-server-studio.svg`, `assets/minecraft-server-studio.ico`, `package.json`, application ID, Squirrel icon metadata, installer identity, or update configuration.

## Verification status

This source foundation was added during the active speed-delivery workflow. Tests, linting, review, built-artifact interaction, runtime verification, screenshots, packaging, release publication, and deployment were intentionally not run or claimed here. The desktop completeness inventory records the feature through the in-progress settings/appearance/localization row; localization breadth, tests, captures, and complete evidence remain pending.

## Suggested related articles

- [Presentation settings and shared School mode](experience-settings.md)
- [Appearance and tab-navigation foundation](appearance-and-tabs.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
