# Browser-local contract engine

`contract.js` is the browser-local state and interaction contract for the Minecraft Server Studio companion site. It exposes one frozen global object:

```js
window.MinecraftServerStudioContract
```

The file is deliberately framework-free. It has no fetch calls, WebSocket calls, analytics, remote fonts, remote assets, workers, hidden browser automation, shell access, installer access, or server-process controls. It uses the browser's `localStorage` only, under the key `minecraft-server-studio.site.contract.v2`.

The companion site is a planning and host-integration surface. The contract layer must not claim that browser-local state created a Minecraft server, installed Java, downloaded Paper or Spigot, executed a command, started a process, or transferred a plugin. The public page has one separately documented exception: a visitor-triggered, read-only Ollama observer may issue only three fixed `GET` requests to `http://127.0.0.1:11434`. That observer is not a desktop bridge, server-control channel, configurable endpoint, or general local-network capability.

## Fixed installer browser-handoff boundary

The public page's installer controller is not a transfer contract and does not call a release API, installer service, extension, background worker, or download observer. It reads exactly one static `application/json` record from `#mss-fixed-installer-manifest` in `index.html`. The host accepts only schema version 1 with exactly these fields: `schemaVersion`, `releaseTag`, `version`, `platform`, `assetName`, `assetUrl`, `releaseUrl`, and `unsigned`. It rejects a missing field, extra field, unexpected type, unknown platform, non-immutable tag, inconsistent package name/version, a URL outside the exact project-release path, or any signature status other than the explicitly documented `unsigned` value.

Once valid, the fixed manifest can populate a native start decision and the single real asset link inside that decision. Until the visitor activates that link, no installer URL is available to the browser. Cancel, Escape, and dialog dismissal leave contract state, audit history, and notifications unchanged. Link activation is the only browser-visible event this page records: it may add bounded local audit and notification metadata saying that a browser handoff was requested, but it must not infer a transfer start, byte count, speed, destination, pause, resume, cancellation, completion, checksum result, installer execution, or application installation. The page must preserve those states as explicitly unobservable after handoff.

The host may expose the start decision through the browser-local command palette, but palette activation must reveal the exact Downloads panel and open the same decision rather than start a link automatically. The browser's ordinary navigation or download handling owns the link after activation. No contract method stores or exposes a browser-download record, and no local-history or notification entry is proof of a download or installation outcome.

## Host connection

Load this file before the host interaction file:

```html
<script src="contract.js"></script>
<script src="app.js"></script>
```

The host reads the current snapshot through `getState()` or `getEffectiveSettings()`, subscribes with `subscribe(listener)`, and writes only through the public methods. The companion page uses `updateSettings`, `setLogoMetadata`, `recordAudit`, `notify`, `createExport`, `registerCommand`, `searchCommandPalette`, `teleportTo`, `loadPersonalVocabulary`, `clearPersonalVocabulary`, `updateStatusModel`, and `setCompletenessInventory`; it does not rely on undocumented getters, setters, nested namespaces, or compatibility fallbacks. A subscriber receives a cloned snapshot and a small change descriptor; it never receives a mutable reference to internal state.

The command palette uses `registerCommand({ id, title, description, group, elementId, keywords, action })`. A host can provide an accessible tab or panel teleport implementation with `setTeleportHandler(handler)`. The fallback uses the registered `action`, then `elementId` or `data-contract-id`, scrolls the target into view, and focuses it. A host must continue to implement the visual focus indicator, tab-panel selection, and any richer navigation behavior on its own surface.

The engine does not create markup, inject styles, or attach controls automatically. This keeps it reusable and ensures that a rendered control belongs to the page that owns it. The host must build real keyboard-accessible controls, connect their events to the public methods, reflect saved state after a reload, and surface any returned error to the user.

## Persistence, schema, and migration

The persisted root schema is version `5`.

```text
{
  version: 5,
  settings: { ... },
  notifications: [ ... ],
  audit: [ ... ],
  tabs: { ... },
  collections: [ ... ],
  personalVocabulary: { ... },
  schoolModeCredential: { ... },
  locks: [ ... ],
  totp: [ ... ],
  schedules: [ ... ],
  logo: { ... },
  conversion: { jobs: [ ... ] },
  status: { ... },
  completenessInventory: { surfaces: [ ... ] },
  ollama: { ... }
}
```

Every load is normalized before use. Values with an unexpected type, unsafe object key, duplicate identifier, invalid enum value, oversized text, unsupported endpoint, or malformed nested record are removed or returned to an ordinary default. Version 1 funny-level data with one number is migrated to separate English and Cantonese values. Version 3 adds the browser-local presentation-mode credential record; pre-version-3 records migrate with no configured verifier. Version 4 adds normalized version-1 schedule records while preserving a valid legacy local rule as version 1 and keeps bounded browser-local conversion metadata beside them. Version 5 normalizes legacy logo metadata into the bounded companion-site logo record. Later hosts can add migrations beside `migrate(source)` without changing the storage key.

The entire normalized record is limited to 1 MiB measured as encoded text where the browser supports `TextEncoder`. If an attempted save reaches that boundary, the engine retains the newest half of notification and audit history before trying to save again. If the bounded record is still too large, or browser storage is unavailable or throws, the in-memory model remains usable for the current page lifetime and `isStorageAvailable()` reports `false`; the host must show that persistence did not succeed.

The companion page does not keep a parallel `sessionStorage` settings model. Its visible language, funny-level, theme, density, emoji, narrator preferences, schedules, status, inventory, notification, audit, and validated vocabulary state hydrate from and write through this one browser-local contract record. That record belongs only to this origin in this browser. It is not shared with another browser profile, device, user account, server, chat, status hub, or the installed desktop application.

`resetLocalState({ confirm: true })` removes only this site's contract key and restores an empty local state. It does not affect the desktop application, Minecraft server folders, installed tools, browser downloads, or another site's data.

## Settings and presentation state

`updateSettings(patch)` persists the following rich-control values:

| Setting | Stored value | Allowed range or values |
| --- | --- | --- |
| Language mode | `languageMode` | `english`, `cantonese`, `bilingual` |
| English funny level | `funnyLevel.english` | integer 1–5 |
| Cantonese funny level | `funnyLevel.cantonese` | integer 1–5 |
| Dialog/message emoji | `showDialogEmoji` | boolean |
| Theme | `appearance.theme` | `system`, `light`, `dark` |
| Density | `appearance.density` | `compact`, `comfortable`, `spacious` |
| Accent | `appearance.accent` | six- or eight-digit hexadecimal color |
| Font family | `appearance.font.family` | up to 120 characters |
| Font scale | `appearance.font.scale` | 0.75–2 |
| Font weight | `appearance.font.weight` | 100–900 |
| Narrator enabled | `narrator.enabled` | boolean |
| Narrator language | `narrator.language` | `english`, `cantonese`, `bilingual` |
| English and Cantonese voices | `narrator.englishVoice`, `narrator.cantoneseVoice` | browser voice identifier or `auto` |
| Narrator rate and pitch | `narrator.rate`, `narrator.pitch` | rate 0.5–2; pitch 0–2 |

`getNarratorCapabilities()` returns browser speech-synthesis availability and actual currently available voices with a non-empty stable `voiceURI`; a display name is never substituted as an identity. `observeNarratorVoices(listener)` reports immediately and again on `voiceschanged`; its return value unsubscribes. The host exposes an automatic choice and explains a missing selected voice without silently erasing it. The contract does not speak text itself; `app.js` owns an opt-in serialized `SpeechSynthesisUtterance` queue that uses actual browser voice objects, queues English before Cantonese in bilingual mode, debounces ordinary rapid events for 250 milliseconds, applies a per-category cooldown, replaces pending superseded events, and never begins speech until a visitor has enabled narration and a page event occurs. Browser APIs do not reliably report an active screen reader, so the host states that limitation rather than claiming it can duck or yield to one.

### Browser-local appearance and navigation foundation

The companion site uses this same record for its bounded appearance and navigation preferences. It stores system/light/dark theme, density, accent, and safe typography choices as validated settings, then applies those choices only to this browser-local page. The host retains bounded accent, font-scale, and font-weight overrides or resets for the page, tab strip, and selected tab; these controls do not affect the installed application, an operating-system setting, a server, an installer, or another website.

The browser-local tab state records `tabs.dock` (`left`, `right`, `top`, or `bottom`) in addition to a derived accessible vertical/horizontal orientation, active selection, ordered items, pinned state, group membership, group ordering, and collapsed state. A host maps left/right to `aria-orientation="vertical"` with Up/Down traversal, and top/bottom to `aria-orientation="horizontal"` with Left/Right traversal. It must retain an overflow route when labels do not fit and must not rotate labels to simulate a side dock. `setTabDock` changes the persisted dock, while `setTabAppearance` writes only the bounded tab-strip appearance values; a selected-tab override uses the existing bounded `updateTab` path. These methods leave unrelated companion-site and installed-application state untouched.

The page keeps independent current-strip, group-list, and master tab searches. Each has its own plain-text default, adjacent anchored regular-expression builder, pattern, flags, validation feedback, and locally bounded candidate set. A search route must not silently reuse the state of another route or query local files, browser history, an installed application, or a remote service.

This section records a browser-local foundation only. It does not promise every-element appearance editing, complete editor export/import, every menu or dropdown builder, a full command palette, cross-window discovery, complete bulk-close behavior, or evidence that the feature has been exercised in a built or deployed artifact.

### Browser-local companion-site logo

`setLogoMetadata({ sourceType, presetId, custom })` persists only a normalized companion-site mark. A preset must be one of `studio-aqua`, `server-slate`, or `world-spruce`. A custom source is accepted only when it carries a bounded `data:image/png;base64,...` or `data:image/jpeg;base64,...` display representation, never a source path, filename, browser file handle, `file:` URL, remote URL, SVG, or WebP value. The contract bounds a derived display URL to 512 KiB of characters, each rendered side to 512 logical pixels, and its format to PNG or JPEG.

The custom record also carries only its derived width, height, fit (`contain`, `cover`, or `fill`), background mode (`transparent` or `color`), six-digit background color, and 0–100 horizontal and vertical focal values. `setLogoMetadata` rejects an invalid requested custom source without replacing the existing valid mark. A successful result includes `persisted`; when browser storage is unavailable, a host must present the result as current-visit-only rather than as saved.

`getState()` can expose the bounded data URL only to the same in-page host that renders it. `redactStateForExport()` removes that URL and records only safe display metadata plus an omission marker. Audit records must never include logo bytes, a source name, or a source path. While the renamed browser-local presentation mode is active, the host must omit custom-logo controls and render `studio-aqua`; the underlying browser-local choice can return only after that mode is turned off.

### Renamed browser-local presentation mode

`setSchoolMode({ enabled, name, credentialAccepted })` stores a browser-local user-renamable presentation mode. The host first derives a local one-way SHA-256 verifier from a user-entered unlock code and fresh random salt, then calls `setSchoolModeCredential({ algorithm: "SHA-256", salt, verifier })`. The engine validates only the fixed-size encoding and stores the verifier record; it never receives, stores, exports, logs, or returns the unlock code.

`getSchoolModeCredentialState()` reports only whether the verifier exists, its algorithm, and its configuration time. `getSchoolModeCredentialSalt()` makes the non-secret local salt available to the host. The host derives the candidate verifier and passes it to `verifySchoolModeCredential(verifier)`, whose bounded comparison returns only `{ ok }`. `clearSchoolModeCredential({ credentialAccepted: true })` removes the verifier and turns the mode off after a host has obtained a successful local match.

`getEffectiveSettings()` applies matching local schedules to supported language and appearance values without overwriting the saved base settings. It then forces English while the renamed mode is active, reports that personal-vocabulary replacement and dim sum are inactive, and suppresses all scheduled overrides until that mode is unlocked. The host omits the suppressed language, tone, vocabulary, narrator, and schedule controls rather than merely disabling them, cancels queued speech, and uses the exact chosen name wherever it introduces the mode. `getSchoolModeResetBoundary()` returns the exact local-storage boundary that the host should present to users: clearing this site's local storage resets the browser-local preferences, vocabulary cache, local lock metadata, schedule records, and verifier only. This is a user-experience lock, not a security boundary, and it does not change desktop-app or server data.

## Notifications, browser-local audit history, and exports

`notify`, `dismissNotification`, and `clearNotifications` manage a local notification history. Notification kinds are `info`, `success`, `warning`, `error`, and `progress`; each can include up to four safe id/label actions. The engine stores up to 200 notification records and 500 audit records. The host owns visible toast timing, focus, live-region behavior, notification-center layout, and real action handlers.

`recordAudit(action, target, detail)` writes a bounded local audit record. A normalized record contains only `id`, `action`, `target`, `detail`, and `createdAt`; action and target are bounded labels, detail is bounded non-secret text, and the contract keeps at most 500 records. It is not Git history, a server log, a filesystem history, a browser-history reader, or a source-of-truth record for a server operation. It records only what the browser-local surface did.

The public landing page uses this bounded contract only for page-local notices and audit records. Its visible Notification center labels its messages as browser-local, gives `info`, `success`, and `progress` notices a bounded in-page auto-dismiss path, keeps `warning` and `error` notices until dismissal, and does not interpret any notice as a server, installer, transfer, file, desktop, or external-service result. The static host exposes only local dismissal and notification-metadata clear actions; it cannot perform any of those operations.

The local version-history destination may read and filter only this bounded page-owned audit list. Date, action, and plain-text filters compose against the same list; plain text is the default search mode; and an explicit regular-expression mode uses `evaluateRegex` locally and must surface invalid input rather than silently return an unrelated empty list. The host may select only visible filtered audit records for export or local deletion. It must not inspect a desktop application, selected converter file content, browser file handles, source paths, browser history, server output, or the separate authenticator/toy-lock store.

`createExport(format, records)` generates text for `json`, `jsonl`, `csv`, `tsv`, or `markdown`. The browser-local history destination supplies only selected audit records. Exports are UTF-8 text supplied to the host; the host may prepare a browser download but cannot know its destination or prove its completion. The static page has no desktop handoff, remote transfer, archive, encryption, or unsupported-format fallback. `redactStateForExport()` never exports personal-vocabulary replacements or file metadata, a custom-logo data URL, raw secrets, TOTP secrets, passwords, codes, pairing data, Support Tickets note content, or the presentation-mode verifier; it reports only safe omission metadata. The engine does not store raw credentials or codes.

Removing selected audit records, clearing the audit list, or clearing dismissed/all notification metadata is limited to this page's browser-local state. The host must use the existing two-key/full-slider destructive-action state machine, expose an Emergency exit and Escape cancellation path, return focus to the originating control, and leave records unchanged after cancellation or an incomplete slider. It must never treat a page-local deletion as a server, desktop, file, download, or authenticator mutation.

## Browser-local changelog preview

The `changelog-preview` host surface is registered as
`browser-local-changelog-viewer`. It renders only a bounded, committed static
catalog supplied with the companion-site source. This general contract does
not fetch, refresh, synchronize, or persist that catalog. The surface's
plain-text/default search, explicit regex mode, date filter, selected rows,
copy action, and Markdown/plain-text download projection operate only on the
current in-memory catalog.

The catalog viewer does not create audit records or add catalog entries,
filters, selection state, copied text, or download metadata to `getState()`,
`redactStateForExport()`, `createExport()`, notifications, personal-vocabulary
state, the authenticator/toy-lock module, or the browser-local status model.
It makes no runtime request to a release API, source-control host, server,
installed application, local filesystem, or loopback service. A browser
download request is not evidence that a destination was selected, a file was
saved, or a listed release remains current or available.

The host keeps invalid filter input visible and returns an honest local
validation or no-selection state. It must not infer missing catalog fields,
fetch a replacement record, or silently broaden a date/regex query. The
existing bounded `evaluateRegex` helper may evaluate the explicit regex route;
it does not authorize the viewer to inspect other page data or another
application.

## Regex evaluation and palette search

`evaluateRegex({ pattern, flags, sample })` evaluates in the browser only. It limits patterns to 512 characters, sample text to 16 KiB, and returned matches to 200. It rejects duplicate or unsupported flags, backreferences, named backreferences, and simple nested-quantifier shapes that can cause excessive evaluation time. It returns an ordinary error message instead of throwing malformed input into the host UI.

This is a bounded helper, not a replacement for a page's adjacent regex builder. Every search field still needs its own visible plain-text default, explicit regex opt-in, pattern/flag synchronization, error feedback, and accessible results. The page must pass the search field's exact current pattern and sample data to this helper and must not use the helper to search unrelated content.

## Tabs, groups, and collections

`registerTab`, `createTabGroup`, `updateTab`, `moveTab`, `setActiveTab`, `setTabDock`, `setTabAppearance`, and `closeTab` persist browser-local tab state. The tab model includes dock/orientation, active tab, group association, pinned state, locked state, closability, display order, collapsed-group state, bounded per-tab appearance, and panel association. `getAccessibleTabs()` returns tab roles, selected state, `aria-controls`, item position, set size, and correct orientation so the host can render a real tab strip. It supports up to 120 tabs and 40 groups.

Closing a pinned, locked, or non-closable tab is refused unless the caller explicitly supplies `includeProtected: true`. The host still needs to display the affected-tab preview, collect any required destructive confirmation, return focus, and apply real keyboard behavior.

`saveCollection`, `getCollection`, `selectCollectionRecords`, and `previewBulkAction` model local record collections and their selection state. A collection has a stable id, a label, and up to 500 bounded records. `previewBulkAction` reports selection count, affected count, excluded protected records, and up to 50 preview rows. It does not silently perform deletion, move, export, or any other action.

## Destructive-action state machine

`beginDestructiveAction({ id, title, affected })` creates an in-memory confirmation session. `advanceDestructiveAction(session, { key, slider, confirm, cancel })` requires both independent key controls and a slider value of 100 before confirmation. It returns an explicit cancelled, awaiting-keys, awaiting-slider, or confirmed state.

The engine never calls a destructive operation. A host must place this state machine in its own accessible UI: identify the real affected data, expose two independently operated controls, add the full-range slider, offer an emergency exit and Escape/back route, honor reduced motion, return focus, and execute the actual operation only after `confirmed` is returned.

The public landing page identifies only its own notification metadata as affected data. Its dismissed/all-record clear flows require two independent acknowledgements and the full slider before the host calls `clearNotifications()`, with Emergency exit, Escape cancellation, and focus return. It must not be represented as deletion, modification, upload, transfer, installation, desktop control, or server authorization beyond that origin-scoped metadata clear.

## Personal vocabulary loader

The personal-vocabulary setting begins empty. `site/vocabulary-loader.js` is a browser-safe ES module with no DOM, network, storage, or logging access. The page calls `validatePersonalVocabularyPayload(input)` before `loadPersonalVocabulary(text)` and serializes only the frozen normalized result into the contract. The module also exposes `validatePersonalVocabularyCache`, `createPersonalVocabularyCacheEnvelope`, and `createClearedPersonalVocabularyCacheEnvelope` for a host that owns a distinct versioned cache envelope. The companion page uses the contract's one local-storage record and validates its payload again before display or replacement.

`loadPersonalVocabulary(text)` is the contract ingestion path and it keeps the valid payload in this browser's local storage only. No default mappings, samples, source filename, path, network request, telemetry event, export payload, or public record are created.

The accepted schema is exactly:

```json
{
  "version": 1,
  "replacements": [
    { "from": "ordinary source text", "to": "local replacement text" }
  ]
}
```

The payload must be at most 64 KiB measured as UTF-8 bytes; contain no duplicate JSON object keys (including equivalent escaped keys); have no more than three structural levels (root object, replacement array, replacement object); use only `version` and `replacements` at the root; contain at most 250 replacement records; use exactly `from` and `to` in each record; and have unique, nonempty source strings no longer than 128 Unicode code points and target strings no longer than 512 Unicode code points. An empty target is allowed because a user may deliberately remove a visible phrase; an empty source is never allowed. Unsafe object keys, unknown fields, malformed JSON or UTF-8, unsupported versions, incomplete cache envelopes, partial input, duplicate source strings, and over-limit input are rejected as a whole.

`applyPersonalVocabulary(text)` applies the stored local replacement list only while School mode is inactive. `clearPersonalVocabulary()` immediately removes the local cache. The host must preserve commands, URLs, code, paths, external records, and technical identifiers rather than applying replacement indiscriminately.

## Conversion, logo, toy-lock, and TOTP metadata

`getFileAdapters()` returns the catalog categories Documents/PDF, Images, Audio, Video, Archives, Structured Data/Spreadsheets, Code/Text, and Binary Encodings. `getFileAdapterAvailability()` exposes an exact enabled/disabled reason for each card. The browser-local converter is intentionally limited to UTF-8 text, validated JSON/CSV/TSV, a deliberately limited YAML-style output, and Base64/hex encodings. It does not turn an extension or MIME label into an eligibility decision: JSON/CSV/TSV must pass bounded byte/content validation first.

The host accepts at most 12 user-selected sources per action, each no larger than 1 MiB, and inspects at most the first 512 bytes before creating a queue record. It keeps at most 24 selected files in the current-page queue. The supported host methods are `recordBrowserConversionJob()`, `updateBrowserConversionJob()`, `getBrowserConversionJobs()`, and `removeBrowserConversionJob()`; `planConversion()` remains only as a compatibility path. A persistent record is metadata only, with bounded `id`, sanitized `sourceName`, `sourceType`, `sourceBytes`, `detectedKind`, `category`, `targetType`, `targetFormat`, `targetName`, `status`, `adapterId`, `createdAt`, `updatedAt`, `downloadRequestedAt`, and `reason` fields. `downloadRequestedAt` records only that this page asked the browser to download an in-memory output; it never implies that the page knows a destination or completion result. The contract limits this history to 100 records and rejects raw source/output bytes, preview text, browser file handles, source paths, and download locations.

PDF, image, audio, video, and archive entries remain disabled because no safe browser-local parser/encoder is bundled. Native spreadsheet/workbook entries remain disabled because no local workbook parser is bundled. Base64 and hex are representations of bounded bytes, never an assertion that another binary format was parsed or converted. `planConversion()` or a browser conversion record must never be shown as a desktop-app conversion, upload, or server action.

`setLogoMetadata()` persists bounded rendering metadata only: preset or custom source selection, format, dimensions, fit, background color, and normalized crop. It does not decode, save, upload, convert, or export image bytes. A host that implements image selection and conversion must validate actual bytes and keep raw local assets out of exports, history, and telemetry.

`createToyLock()` and `resolveToyLock()` save only target, method, duration, lock state, and timestamps. They reject inputs with password, token, secret, code, OTP, credential, or URI-like secret fields. `resolveToyLock` takes only a host verification result. The host is responsible for any credential-vault behavior and recovery disclosure.

`createTotpShell()` and `markTotpEnrollment()` are metadata-only helpers. The shell rejects secrets, codes, tokens, URIs, passwords, and credentials. It stores a label, issuer, account label, algorithm, digits, period, enrollment result, and timestamp—never a TOTP secret or current code. A real authenticator must be implemented behind an operating-system credential vault or another dedicated safe storage boundary; this static engine does not substitute for one.

## Separate browser-local authenticator and toy-lock module

`site/authenticator-locks.js` is deliberately separate from this general
contract record. It owns the actual companion-site authenticator, QR pairing
reveal, per-target toy locks, and local Support Tickets surface. The module uses
the origin-scoped `minecraft-server-studio.site.authenticator-locks.v1` record
because a static site has no operating-system credential vault. Its bounded
state is never included in `getState()`, `redactStateForExport()`,
`createExport()`, audit history, the status model, or personal-vocabulary
state.

The module validates manual Base32 and standard `otpauth://totp/` registration,
uses browser Web Crypto for RFC 4226/HOTP and RFC 6238/TOTP (SHA-1, SHA-256, or
SHA-512; 6–8 digits; offered 15/30/45/60/90-second periods), and calculates
only current/next code snapshots in the rendered list. Its pure local QR
renderer emits a standard TOTP URI after an explicit reveal and clears the QR
canvas and manual secret from the DOM after 60 seconds. The user must type a
current code from the paired authenticator before the entry is marked pairing
confirmed. It has no fetch, CDN,
camera, QR decoder, QR image import, clipboard import, backend, telemetry, or
sync path.

Toy locks in that module are local user-experience locks, not security
protection. Password locks retain an independently salted PBKDF2 verifier;
TOTP locks retain their separate local Base32 secret. Both are excluded from
ordinary export and the general contract record. Registered lock targets are
the authenticator tab, entry list, and pairing reveal. Unlock duration remains
in memory and reload returns the target to locked. The local Support Tickets
surface persists only non-sensitive ticket number/category/status; it discards
free-text notes and directs recovery to clearing this site's storage.

## Local schedules

`createSchedule()` accepts at most 100 normalized version-1 local-only schedule rules. Each rule has a stable id, bounded label, one supported setting id, validated scalar value, enabled state, optional inclusive date bounds, optional local time bounds, every-day or selected-weekday state, and priority `0`–`999`. The available setting ids are `languageMode`, `appearance.theme`, `appearance.density`, `appearance.accent`, `appearance.font.family`, `appearance.font.scale`, and `appearance.font.weight`. Font-family rules accept only the shipped browser-safe fallback stacks. The contract rejects unsupported versions, unknown setting ids, invalid colors, out-of-range font values, invalid dates or times, reversed date bounds, unsafe keys, and any source other than `local`. `getSchedules()` returns a clone of the saved rules, and `removeSchedule(id)` removes one local rule and records a bounded local audit event.

`getActiveScheduleValues(date)` resolves matching local rules deterministically: highest numeric priority first, then stable id in ascending lexical order. For one setting, the first result wins. A normal time window includes its start and excludes its end. Equal start/end times deliberately create no active window. A cross-midnight rule applies after midnight against the previous local start date and weekday, so its date bounds and weekday selection remain anchored to the rule's start. A start-only time means from that time onward; an end-only time means until that time; neither means all day. The host shows the browser's local timezone and states that daylight-saving behavior follows the local clock: skipped wall-clock values do not match and repeated wall-clock values can match twice when in range.

The static companion page keeps HTTPS API and Home Assistant options visibly unavailable. It has no privileged network adapter, URL-validation route, redirect handling, token vault, or request path for either source, and neither this contract nor the host makes a request for them.

The host's saved-rule removal surface identifies the selected local rule, requires two separate acknowledgements plus a 100-percent slider before calling `removeSchedule(id)`, offers an Emergency exit action and Escape cancellation, and returns focus to the originating removal control. The contract itself never opens a dialog or performs a desktop or network action.

## Browser-local Ollama observation boundary

The companion page's browser-local observer is deliberately smaller than the generic host-handoff model. It remains idle until the visitor selects **Refresh local Ollama**, then uses only `GET /api/version`, `GET /api/tags`, and `GET /api/ps` at the literal `http://127.0.0.1:11434` origin. It has no configurable endpoint, host, port, path, proxy, redirect, token, account, cloud fallback, request body, automatic refresh, or background polling.

The observer applies bounded abort-timeout and response validation before it derives a displayable version, installed-model, and running-model snapshot. It reports `healthy`, `unavailable`, `blocked` (browser or CORS), `unsupported`, or `rejected` states without treating one as another. A blocked state can include CORS, mixed-content, privacy, or other browser refusal and is not misreported as a diagnosed local-service failure. It retains only a bounded normalized non-secret last-success snapshot in `sessionStorage` for the current browser session and labels that snapshot stale until a later accepted refresh. The snapshot contains the service version and observation time plus only safe model name, size, VRAM size, modification or expiry timestamp, family, parameter-size label, and quantization label; it excludes raw payloads, digests, endpoint configuration, credentials, prompts, and local paths.

The existing handoff helpers do not themselves make the browser-local request and do not authorize the page to expand this allowlist. In particular, they do not enable a Model Store catalog, pull, chat, delete, copy, hardware-fit, or harness action. Those remain visible unavailable browser-only boundaries until a complete independently implemented surface exists.

## Browser-local status model

The independent status model is intentionally separate from chat and from server execution. It persists:

```text
{
  currentState: idle | running | waiting | blocked | verified | failed,
  summary: string,
  lastUpdatedAt: ISO timestamp or null,
  evidence: [{ id, label, state, detail, reference, updatedAt }],
  activeInteractions: [{ id, label, state, detail, updatedAt }],
  nextSteps: [{ id, label, state, detail }],
  chatBridge: { available: false, message: "No chat bridge is connected..." }
}
```

Use `getStatusModel()`, `updateStatusModel(input)`, and `upsertStatusEvidence(input)`. Evidence is limited to 160 items, active local interactions to 100, and next steps to 100. The engine always overrides `chatBridge` to an unavailable browser-local status. A host must never display this model as a delivered chat message, remote task update, deployed status service, or server health report unless it actually implements and verifies that separate bridge.

## Per-surface completeness inventory

The completeness inventory is a browser-local, fail-closed record for every visible surface the host chooses to inventory. It is not a substitute for a repository inventory, tests, runtime interaction, or capture evidence; it is the site surface's local model for exposing what is still missing.

```text
{
  surfaces: [{
    id, label, route, updatedAt,
    features: [{
      id, label, state,
      evidence: {
        implementation, documentation, localization, persistence,
        test, interaction, capture
      },
      notes, updatedAt
    }]
  }]
}
```

Every evidence field has a `status` of `missing`, `planned`, `in-progress`, `verified`, or `not-applicable`, plus bounded reference and detail fields. A `not-applicable` entry is counted as such only when it includes a reason. `getCompletenessSummary()` treats any non-verified evidence item as incomplete and returns per-category verified, incomplete, and reasoned-not-applicable counts.

Use `setCompletenessInventory(input)` for a complete authoritative replacement or `upsertCompletenessSurface(input)` for one surface. The local bounds are 80 surfaces and 320 features per surface. The companion page seeds a hand-written inventory for its landing shell, settings, documentation, converter, authenticator, Ollama, history, changelog, notifications, and download surfaces, then renders its incomplete count in the browser-local status panel. Hosts should use stable ids and hand-written feature entries; automatically discovering only current UI elements cannot prove that a required feature was not omitted. This local view does not replace repository-level documentation, tests, real built-artifact interaction, or captures.

## Limits and unavailable capability boundary

In addition to the limits documented above, the engine caps command-palette entries at 600, tab groups at 40, lock metadata at 250, TOTP metadata records at 250, schedules at 100, browser conversion history at 100, and notification actions at four per notification. The browser-local presentation-mode code must be 4–64 Unicode code points; its code value is never persisted, only its SHA-256 verifier and fresh 16-byte salt. Text fields are normalized to the documented per-field bounds before persistence.

The following capabilities are intentionally unavailable from this file:

- Server creation, configuration writes, EULA acceptance, dependency installation, Paper downloads, Spigot BuildTools execution, process control, RCON, plugin installation, filesystem browsing, and terminal commands.
- Network requests, remote configuration, remote fonts, analytics, telemetry, cloud model services, non-loopback Ollama access, and a chat/status delivery bridge.
- PDF, image, audio, video, archive, and native-workbook conversion. The bounded browser-local text/structured-data/encoding routes above are the only exception; they do not create a general document, media, archive, or spreadsheet converter.
- Raw password, token, TOTP secret, current TOTP code, or credential storage and display **through this general contract record**. The separately documented browser-local authenticator module owns its own bounded storage boundary.
- Browser-local data synchronization across browsers, accounts, devices, or desktop applications.

A host can add a separate, reviewed local bridge for a capability, but it must retain explicit user initiation, provide truthful availability and failure states, validate inputs at the privileged boundary, and update this model only after real evidence exists.
