# Browser-local companion-site file converter

The public companion site includes a deliberately narrow, browser-local file
converter. It is independent of the installed desktop application's
file-converter foundation: it never opens a desktop folder picker, launches a
server process, invokes a command, or hands a selected file to the desktop
application.

The supported slice is intentionally small. It makes a few bounded
text/structured-data/encoding transformations useful without pretending to be
a general document, media, archive, or workbook converter.

## Guided local flow

1. Select up to 12 files through the browser's standard file input.
2. The page rejects each file above 1 MiB and inspects at most its first 512
   bytes before creating a local queue record.
3. The active-page queue holds at most 24 selected files. Detection uses the
   bounded bytes and eligible content shape, not the file extension or MIME
   label alone.
4. Choose one of the enabled targets presented for that source. The converter
   shows a local preview and any relevant loss/normalization notice before the
   visitor explicitly requests a download.
5. The browser creates the download only after that explicit action. The
   browser, not the site, selects or remembers the download destination.

The page's browser-local history keeps at most 100 metadata-only records. A
record has the bounded fields `id`, `sourceName`, `sourceType`, `sourceBytes`,
`detectedKind`, `category`, `targetType`, `targetFormat`, `targetName`,
`status`, `adapterId`, `createdAt`, `updatedAt`, `downloadRequestedAt`, and `reason`.
`sourceName` is sanitized and the record contains no source or output bytes,
preview text, file-system handle, download location, or source path. A source
may need to be selected again after a reload.

## Supported conversion boundary

The converter enables only these bounded, in-browser transformations:

| Source accepted after local validation | Available targets | Important boundary |
| --- | --- | --- |
| UTF-8 text | UTF-8 text | This is a local text representation change, not source-code execution or document rendering. |
| Valid JSON, CSV, or TSV | JSON, CSV, TSV, or deliberately limited YAML-style text | Eligibility comes from bounded bytes and parser validation. The YAML-style target is a narrow emitted representation, not a general YAML parser or an arbitrary-YAML round trip. |
| Any source that stays within the input bound | Base64 or hexadecimal text | These are binary encodings only. They do not decode or semantically convert PDF, image, audio, video, archive, workbook, or other binary formats. |

Structured-data transformations can normalize delimiters, quoting, field
order, whitespace, escaping, number-like values, and line endings. The preview
and target description disclose that a conversion may change representation.
The original selected file is never changed.

## Visible unavailable adapters

The catalog always shows these categories so a missing capability is visible
rather than silently omitted:

- Documents/PDF
- Images
- Audio
- Video
- Archives
- Structured Data/Spreadsheets
- Code/Text
- Binary Encodings

PDF, image, audio, video, and archive entries remain disabled because the page
does not bundle a safe parser/encoder for them. Native spreadsheet/workbook
formats remain disabled because no browser-local workbook parser is bundled.
Within Structured Data/Spreadsheets, only the bounded JSON/CSV/TSV routes above
can be enabled; a workbook file is not treated as CSV merely because its name
suggests a table. The disabled card explains the exact missing adapter rather
than offering a nonfunctional conversion button.

## Catalog search and pattern helper

Each catalog category has its own plain-text filter and its own adjacent,
anchored pattern helper. Plain text is the default. A visitor can deliberately
enable pattern mode, edit the pattern and flags for that category, see invalid
syntax inline, and return to the same category filter without changing another
category's query. Pattern evaluation is browser-local and bounded; it cannot
search selected file contents, browser history, or another category's data.

## Privacy and security boundary

- File processing is performed with browser-provided file and byte APIs only.
  The site has no network upload, remote conversion service, analytics
  endpoint, desktop bridge, shell, or server-process channel.
- The browser does not expose a selected file's path to the page. The page does
  not persist a path, a browser file handle, source bytes, output bytes, or a
  download destination.
- Source bytes remain in the current browser flow only long enough for the
  selected local inspection, preview, or requested conversion. Browser-local
  persistence contains only the bounded metadata history described above.
- The page does not guess a type from a name alone. Malformed JSON, invalid
  delimited input, invalid UTF-8, or an input outside the enabled adapter's
  limits is refused without creating a misleading output.
- A generated file is downloaded only after an explicit visitor action. The
  page does not claim transfer progress, installation, or desktop-app use.

## Failure and recovery states

| Situation | Result | Recovery |
| --- | --- | --- |
| More than 12 files are selected | The excess selection is not admitted to the local queue. | Select a smaller batch. |
| A file exceeds 1 MiB | The file is refused before conversion. | Choose a file within the visible bound. |
| The first 512 bytes identify a PDF, media, archive, workbook, or unknown binary route | No semantic converter is enabled for that type; Base64 and hex encodings remain available for bounded bytes. | Use an explicitly supported local text/structured-data/encoding route, or another tool for semantic conversion. |
| JSON, CSV, TSV, or UTF-8 validation fails | No structured-data/text output is offered for that route. | Correct or choose a source that meets the displayed validation boundary. |
| PDF, media, archive, or workbook conversion is selected | The unavailable adapter states its missing parser/encoder. | Use another tool; this page does not provide a substitute. |
| Browser-local storage is unavailable | The current interaction can remain visible for the open page, but history cannot be promised after reload. | Restore browser storage access, then select files again if needed. |
| A visitor does not confirm download | No output download is started. | Review the preview and choose Download when ready. |

## Configuration and history

There is no account, server setting, cloud endpoint, or desktop-app setting for
this feature. Its durable state belongs only to this site's browser origin. The
history list is a convenience record of local outcomes, not an audit trail for
the installed application and not evidence that a desktop conversion occurred.
Clearing this site's browser storage removes the local converter history along
with the other browser-local site preferences.

## Verification boundary

This documentation describes the source-level browser-local converter lane.
The speed-delivery pass did not run tests, linting, static analysis, independent
review, build/package verification, installed-artifact interaction, or capture
work. The site completeness inventory must keep those evidence categories
unverified until they are actually completed. A visible preview or an available
download action is not evidence of a successful conversion on a particular
browser or input.

## Suggested related articles

- [Local file-converter foundation](file-converter.md)
- [Local status and completeness](local-status-and-completeness.md)
- [Offline documentation browser](offline-documentation-browser.md)
