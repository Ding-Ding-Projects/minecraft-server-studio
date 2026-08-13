# Browser-local companion-site logo customization

## Scope

The public Minecraft Server Studio companion site has a browser-local logo
customization foundation. It changes the visual mark rendered by that public
page in the current browser profile only. It does not rename, repackage, or
control the installed desktop application, a Minecraft server, a release asset,
or an installer.

The feature has no account, upload endpoint, remote image converter, CDN
request, server process, desktop bridge, or file-system path access. Selecting
an image is a local browser action; the site never receives a usable path to
the selected file.

## Available marks

The logo picker starts with three shipped browser-rendered presets:

| Preset | Behavior |
| --- | --- |
| Studio Aqua | Default mark and the result of a reset. |
| Server Slate | A quieter slate companion-site mark. |
| World Spruce | A green companion-site mark. |

The preset catalog has its own local plain-text search and adjacent anchored
regular-expression builder. Plain text remains the default. Pattern entry,
flags, validation feedback, and matching remain local to this picker; they do
not search browser history, local files, the installed application, or a
network service.

A visitor can also choose a local PNG or JPEG. The browser uses the selected
bytes only to validate and derive a bounded display representation. It does
not retain a source filename, source path, `file:` URL, or original source
file as a site-owned file.

## Local validation and derived representation

The page does not trust a file extension or MIME label. Before applying a
custom mark, it verifies an actual PNG or JPEG header and enforces these
bounds:

| Check | Bound or rule |
| --- | --- |
| Selected source | At most 512 KiB. |
| Image type | PNG or JPEG only. |
| Decoded dimensions | No side may exceed 4,096 pixels. |
| Decoded pixel area | At most 4,000,000 pixels. |
| Derived display image | Downscaled to at most 512 logical pixels and encoded only as `data:image/png;base64,...` or `data:image/jpeg;base64,...`. |

The persisted logo record is part of the existing
`minecraft-server-studio.site.contract.v2` browser-storage record under
`logo`. It contains a validated `sourceType`, a shipped `presetId` when
applicable, and the bounded custom display metadata: the derived data URL,
format, dimensions, fit, background, and focal point. It does not contain a
path or filename. The record belongs only to this site origin and browser
profile; it is not synchronized to another browser, device, account, desktop
application, or server.

If validation fails, the page does not partially apply the image. A visitor can
keep the current valid mark, choose a supported smaller image, select a shipped
preset, or reset the mark.

## Rendering controls

For a custom derived image, the companion site exposes browser-local rendering
controls for:

- fit: contain, cover, or fill;
- background: transparent or a six-digit hexadecimal color; and
- focal point: horizontal and vertical values from 0 through 100.

These choices affect only the public page's rendered mark. They never alter
the source image, package identifier, executable filename, installer identity,
update feed, application-data location, or release metadata.

## School mode and reset

While the site’s browser-local presentation mode is active, custom-logo input,
custom image data, and custom mark rendering are omitted from the visible
surface. The page renders the shipped Studio Aqua mark instead. The saved
browser-local preference remains intact and can return after that mode is
turned off.

**Reset logo** removes the bounded derived custom data URL from this site's
browser-local record and restores Studio Aqua. It never modifies the original
file chosen through the browser picker.

## Privacy and failure behavior

| Situation | Result | Recovery |
| --- | --- | --- |
| File is larger than the input bound, has an unsupported type, or fails byte validation | The custom mark is not applied. | Choose a smaller valid PNG or JPEG, use a preset, or reset. |
| Image cannot decode or exceeds dimension/pixel bounds | The custom mark is not applied. | Choose a smaller static image within the displayed limits. |
| Browser storage cannot retain the derived preference | The page must not claim a saved preference. | Restore browser storage access, then choose the mark again. |
| Browser-local presentation mode is active | Studio Aqua is rendered while custom-logo controls and custom image data are suppressed. | Turn the mode off through its local unlock flow. |
| Reset is chosen | Only this site's derived local custom mark is removed. | Choose a preset or a new valid local image. |

No image is uploaded, sent to analytics, routed through a remote image host,
or used as a desktop-app file. The feature is presentation customization only;
it is not a file-conversion service, authentication mechanism, or package
rebranding route.

## Current boundary and verification status

This is a bounded browser-local foundation. It does not claim universal
every-element logo editing, a desktop-app logo change, cross-device sync,
image sharing, remote conversion, or a completed public-site deployment.

The speed-delivery lane did not run automated tests, linting, independent
review, browser interaction, build/package validation, deployment validation,
or real captures for this feature. Localization breadth, accessibility
verification, browser interaction proof, and capture evidence remain pending
until they are separately completed and recorded.

## Suggested related articles

- [App-logo customization](app-logo-customization.md)
- [Appearance and tab-navigation foundations](appearance-and-tabs.md)
- [Browser-local companion-site file converter](browser-local-file-converter.md)
- [Local status and completeness](local-status-and-completeness.md)
