# Local file-converter foundation

Minecraft Server Studio includes an in-app, local-only file-converter
foundation. It currently provides a guided source picker, bounded byte-based
source inspection, a persistent inspection queue, and an honest adapter
catalog. It does not claim that a conversion, preview, output write, archive,
or external tool invocation has occurred.

## Source selection and bounded inspection

The desktop process owns source selection through the native file picker. The
renderer cannot provide an arbitrary source path for inspection. After a user
chooses a file, the converter verifies that it is a regular local file, rejects
network-share paths and files larger than 8 GiB, and reads at most the first
64 KiB for type detection.
It classifies signatures and bounded text shapes rather than trusting a file
extension alone.

The current classifier recognizes PDF, common image/audio/video signatures,
ZIP/7z/gzip archives, JSON/XML/delimited text candidates, ordinary text, and
unclassified binary data. A classification is descriptive only: it is not a
promise that the selected content is safe, complete, or convertible.

The source file is never written, copied, uploaded, or opened through a shell.
The app records only an app-private queue item after inspection. The queue item
states explicitly that no conversion started.

## Adapter catalog

The catalog always renders these categories:

- Documents/PDF
- Images
- Audio
- Video
- Archives
- Structured Data/Spreadsheets
- Code/Text
- Binary Encodings

Every known adapter remains visible. An adapter is enabled only when its
converter engine is bundled inside the installed application, can operate
offline, has a declared output validator, and has packaged-artifact proof. This
foundation deliberately enables none of the current adapters because the
package does not yet include verified offline PDF, image, audio, video,
archive, spreadsheet, text, or binary conversion engines. Each disabled card
names its exact missing engine class instead of hiding the gap or offering a
nonfunctional Convert button.

No environment `PATH` lookup, command discovery, arbitrary command input,
shell, external process launch, network request, remote converter, CDN, or
developer-machine dependency is used by this feature.

## Search and pattern helper

The adapter catalog uses plain-text filtering by default. Its adjacent local
ECMAScript pattern helper supports a raw pattern, case-insensitive and
multiline flags, a bounded sample field, and construction tokens for character
classes, anchors, groups, alternation, and quantifiers. Query and pattern stay
synchronized. Patterns are limited to 128 characters, samples to 512
characters, and evaluation to the small visible catalog. The helper rejects a
common nested-quantifier shape before evaluation and reports invalid syntax
inline; it does not silently fall back to a different query.

This narrow helper is local to the converter catalog. The broader application
regex-builder, command-palette, settings-search, and menu-search requirements
remain separate incomplete work.

## Persistent queue boundary

The app stores a versioned converter queue under its private application-data
directory. The record is capped at 256 items and 512 KiB, validates every
loaded item, and uses a staged local write. It preserves only inspection
metadata needed to show the user's own selected queue item; it has no output
path, output bytes, conversion status, or completion event because no adapter
is enabled. A malformed or oversized queue remains unavailable rather than
being partially applied or silently overwritten.

The queue is not an export, history, synchronization, telemetry, or backup
format. It is private local state and is intentionally omitted from normal
server records.

## Failure and recovery states

| Situation | Visible result | Recovery |
| --- | --- | --- |
| File picker is cancelled | No queue item is created. | Choose a source file when ready. |
| Selected item is not a regular file | Inspection is refused. | Choose a local file rather than a folder or special item. |
| Source exceeds the 8 GiB intake bound | Inspection is refused before a byte read. | Use a supported bounded input in a future adapter. |
| Source resolves to a network share | Inspection is refused before the source is read. | Choose a local file. |
| Signature is unknown | The source is labeled unclassified binary. | Review the visible unavailable adapter catalog; no guessed conversion runs. |
| Queue storage is unavailable, malformed, or oversized | The catalog remains visible but new inspection entries are refused. | Restore the app-private converter storage before selecting another source. |
| No output adapter is bundled | The inspected item remains awaiting an adapter. | Do not expect an output until a future verified bundled adapter ships. |

Informational outcomes use the app's non-blocking notification surface. No
modal decision is shown for a successful inspection because the selected source
is not changed.

## Security and privacy boundary

- The native desktop process, not renderer code, opens and reads source files.
- The maximum source size, prefix bytes, path length, queue count, and queue
  record bytes are bounded before state is accepted.
- The feature has no network API, no external upload, no analytics, no cloud
  adapter catalog, no shell, no `PATH` discovery, and no arbitrary command
  input.
- The source file stays untouched. The queue records that it was inspected only
  and never represents an output as available.
- A future adapter must validate its exact input and output type and run inside
  an explicit least-privilege bundled boundary before it can become enabled.

## Verification boundary

This is source-level delivery only. No tests, linting, static analysis, build,
packaging, installed-artifact interaction, conversion run, accessibility pass,
or capture was performed in the active speed-delivery pass. The desktop
completeness inventory keeps localization, test, capture, and evidence states
incomplete. It does not infer a successful conversion from source registration.

## Suggested related articles

- [Local status and completeness](local-status-and-completeness.md)
- [Automatic dependency bootstrap](dependency-bootstrap.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
