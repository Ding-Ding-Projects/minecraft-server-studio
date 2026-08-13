# Presentation settings and shared School mode

Minecraft Server Studio provides a persisted presentation-settings foundation for the desktop application. It covers three language modes, separate message-playfulness levels, decorative dialog/message emoji, a display-name label, and a shared local School-mode control. This article documents the implemented foundation only; it does not claim that every desktop surface or every universal settings contract is complete.

## Where settings are stored

The desktop main process owns the settings files. The renderer can use only the narrow IPC methods exposed by `src/main/preload.cjs`.

| Record | Location | Contents | Secret boundary |
| --- | --- | --- | --- |
| App-logo settings and cache | This app's per-user application-data logo-customization directory | Schema version, selected shipped preset or validated derived custom asset metadata, presentation controls, and a private derived asset cache | The original source path is never persisted; the renderer receives only a bounded validated display representation. |
| App presentation settings | This app's per-user application-data `settings` directory | Schema version, language mode, English/Cantonese message-playfulness values, dialog/message emoji preference, and display name | No credential is stored in this file. |
| Appearance and tab-navigation settings | This app's per-user application-data `settings` directory | Versioned theme, density, seed color, bounded typography, selected server-settings tab, dock edge, and direct-target overrides | No credential, server setting, or shared School-mode state is stored in this record. |
| Shared School-mode record | The per-user `Ding Ding Projects/shared-experience-settings` application-data directory | Schema version, mode enabled state, user-selected mode label, and update timestamp | The record contains no password, PIN, or recoverable credential material. |
| Shared unlock credential | The shared record directory's protected credential-vault area | Electron `safeStorage` ciphertext and non-secret key metadata only | The credential is never returned to the renderer, status snapshot, console, export, or log. |

All three settings records use versioned, bounded schemas and atomic replacement. A malformed, unreadable, unsupported, or missing shared record is not treated as evidence that the mode is off.

## Presentation controls

Open **Studio preferences** from the left navigation to use these controls:

| Control | Behavior |
| --- | --- |
| Language mode | Persists **English**, **playful Hong Kong-style Cantonese**, or **bilingual** presentation. The current foundation changes app-owned navigation, headings, dialog framing, and notification framing. Dynamic server facts and external error text remain exact. |
| English message playfulness | Independent integer from 1 through 5. It changes the voice of English app-owned notification framing while preserving factual content. |
| Cantonese message playfulness | Independent integer from 1 through 5. It changes Cantonese app-owned notification framing independently of the English setting. |
| Show emoji decorations in dialogs and message boxes | Persists whether non-semantic decorative emoji appear in app dialogs and toast messages. Emoji are hidden from assistive names and never replace factual copy or a control label. |
| Display name | Persists the user-facing name shown in application title and app-owned copy. It does not change the package identifier, executable name, application-data identity, installer identity, or update identity. |

The saved preference is applied immediately in the running renderer and the native window title. The installed application identity remains stable because the Electron application name and package configuration remain fixed.

The optional spoken-event narrator and bounded scheduled language settings are documented separately in [Event narrator and scheduled language settings](narrator-and-scheduled-settings.md). The schedule can temporarily override the effective language without overwriting this saved base preference. The separate persisted [appearance and tab-navigation foundation](appearance-and-tabs.md) applies its direct targets live without changing this application identity or the shared School-mode record.

## App-logo customization

The same preferences dialog includes a local app-logo surface with three shipped visual presets and a native image picker for PNG or JPEG. The picker and decoder run through a narrow main-process boundary. Actual bytes, image signature, dimensions, decoded size, pixel count, regular-file status, static-image constraints, and a 4 MiB source bound are validated before a private cache changes. Animated PNG, malformed input, unsupported formats, symlink inputs, and unsafe dimensions are rejected without replacing the prior valid mark.

The renderer never receives a local path or a file URL. It receives a bounded PNG/JPEG display representation only after validation. Preset choice, fit/fill/contain behavior, crop position and zoom, focal point, transparent/solid background treatment, background color, reset, and an adjacent bounded regex builder for the preset search are available in the settings card. Reset removes the active private derived asset and restores Studio Aqua; it does not modify the shipped executable, package identifier, application ID, installer, updater feed, or application-data identity.

The logo card is marked for the same live School-mode suppression behavior as other optional presentation controls. While the mode is effective, the visible app mark falls back to the shipped Studio Aqua preset until the mode is turned off.

See [App-logo customization](app-logo-customization.md) for the format, cache, conversion, failure, and security boundaries.

## Shared School mode

The mode's default label is **School mode**, but the user can rename it. After a label is saved, the application renders the selected label in the mode controls instead of relying on the shipped label.

When the shared record is ready and the mode is enabled, the desktop app applies English presentation and suppresses the language-mode and message-playfulness controls in the running preferences dialog. The renderer has a general suppression marker for future routes that must disappear in this mode; this foundation does not add a personal-vocabulary uploader or dim-sum feature route, so there is no such route to expose or hide in this release.

The shared record is watched from the main process. A change written by another compatible local application, or a deletion/replacement observed by the watcher, is sent to the active renderer immediately. The desktop re-applies the effective language and hidden-control state without requiring a restart.

### Honest unavailable states

| State | Desktop behavior | Recovery action |
| --- | --- | --- |
| Missing shared record | English safety presentation remains active. The toggle is indeterminate rather than shown as off. | Use **Create shared local record**. |
| Invalid or unreadable shared record | English safety presentation remains active. The app does not overwrite the unknown record automatically. | Repair the local application-data record, then reopen or wait for the watcher to update it. |
| Credential protection unavailable | The shared record may still be read, but mode changes and credential updates are unavailable. | Restore operating-system credential protection. |
| No unlock credential configured | The mode cannot be enabled. | Create a password or PIN through the preferences dialog. |

The School-mode control is a user-experience lock, not encryption or a security boundary. Enabling it requires a configured protected password/PIN. Turning it off requires a matching protected value. Credential comparison happens in the main process and the supplied value is not persisted in renderer state.

If the credential is lost, the preferences dialog displays the exact shared application-data folder that holds the record and protected vault. The user can delete that folder through the operating system's file manager to reset the local experience control. The app never deletes the folder automatically. This recovery route intentionally clears the mode record and its credential; it is not account recovery and does not protect data from another person with access to the computer.

## Security and failure boundaries

- The renderer never receives the unlock credential, its protected ciphertext, its length, or its composition.
- The shared record has no network client, synchronization service, analytics, or telemetry behavior.
- The service does not write settings into the repository, a server folder, an export, or a console log.
- Missing or unreadable shared state fails closed to English safety presentation instead of pretending that the mode is disabled.
- The current foundation does not implement a personal-vocabulary upload, a full every-element appearance editor, complete tab-management suite, complete regex coverage, or full universal-surface coverage. Local history and redacted exports, narrator, scheduled-language, authenticator, toy-lock, file-converter, local-model, bounded appearance/tab, and local logo foundations are documented separately and remain incomplete where their own articles say so.

## Verification status

This feature was added during the active speed-delivery workflow. Tests, linting, review, built-artifact interaction, runtime verification, and screenshots were intentionally not run or claimed. The desktop completeness inventory records the foundation as in progress and leaves localization breadth, tests, captures, and full evidence pending.

## Suggested related articles

- [Local status and desktop completeness](local-status-and-completeness.md)
- [App-logo customization](app-logo-customization.md)
- [Local history and safe exports](local-history-and-safe-exports.md)
- [Appearance and tab-navigation foundation](appearance-and-tabs.md)
- [Event narrator and scheduled language settings](narrator-and-scheduled-settings.md)
- [Server orchestration](server-orchestration.md)
- [Command Center](command-center.md)
