# Appearance and tab-navigation foundation

Minecraft Server Studio now has a bounded, local desktop appearance and tab-navigation foundation. It is intentionally a foundation rather than a claim that every visual property or every tab-management behavior is complete.

## Implemented behavior

Open **Studio preferences** and use **Appearance and tabs foundation** to apply these settings to the running desktop shell:

| Control | Implemented behavior |
| --- | --- |
| Theme | Persists `system`, `light`, or `dark`. `system` reads the current operating-system color preference when the renderer initializes. |
| Density | Persists `compact`, `comfortable`, or `spacious` control and layout spacing. |
| Seed color | Persists one six-digit hexadecimal Material primary color. |
| Typography | Persists a bounded local list of font families, a 85%–125% type scale, and weights 400, 500, 600, or 700. |
| Tab dock | Persists the server-settings tab strip at the left, right, top, or bottom edge. Left is the default. The tab list updates its `aria-orientation`, and keyboard navigation uses Up/Down for side docks and Left/Right for top or bottom docks. |
| Active tab | Persists the currently selected server-settings tab after a short local debounce. |
| Direct target editor | Applies and persists color and corner-radius overrides for the app shell, server-settings tab strip, and primary actions. Reset restores a target to the active theme's inherited values. |

The server-settings strip, including the Paper JAR CLI tab, has a working all-tabs overflow list and a local tab search. Both the tab search and the appearance-settings search keep plain text as their default and expose an anchored regex builder with raw patterns, flags, construction tokens, local sample text, live match counts, and capture-group feedback. An invalid regex leaves all entries visible and reports the error instead of applying a partial filter.

Each query and pattern is limited to 256 characters and is evaluated only against the small local tab/control labels owned by this desktop surface. The builder does not send the query or sample labels to a network service.

## Local storage and validation

`src/main/appearance-navigation-settings.cjs` owns a separate `appearance-navigation-settings.json` record under the application's existing private settings directory. It is deliberately separate from the presentation and shared School-mode records so an appearance change does not migrate or overwrite the shared mode state.

The record uses an exact-key, versioned schema with:

- a 64 KiB maximum file size;
- allowlisted theme, density, font, tab, and target values;
- strict six-digit hexadecimal color validation;
- bounded type scale and corner-radius values; and
- atomic same-directory replacement with restrictive file permissions.

The renderer receives only the validated snapshot through the existing narrow Electron IPC bridge. There is no network request, telemetry event, export, credential, server setting, or command execution in this feature.

If the record is invalid or unavailable, the renderer uses safe in-memory defaults but disables editing and states that the local record must be repaired or reset. It does not silently overwrite an invalid record.

## Current boundary

The direct target editor currently covers only the app shell, the server-settings tab strip, and primary actions. It does not claim a complete every-element editor.

The following remain incomplete and visibly identified as such in the preferences inventory:

- installed-font enumeration, variable-font axes, and word-processor-depth typography;
- an infinite color picker, color-space translator, contrast audit, and per-property locks;
- per-element editors for every dialog, menu, control, state, and pseudo-state;
- tab pinning, reordering, grouping, cross-window discovery, and bulk tab actions;
- a full command palette; and
- full application-wide localization and every-search-surface regex coverage.

The overflow list and tab search are real controls, not placeholders. The boundary above means only that the unlisted behaviors have not been represented as shipped.

## Update and recovery behavior

An unsaved direct-target preview is tracked as local pending work. The unsigned application-update controller therefore continues to prevent a restart while a preview or the preferences dialog remains unresolved. Closing preferences without applying an appearance preview restores the last persisted values.

No appearance value changes package identity, executable name, installer identity, update feed, application-data location, server data, or shared School-mode credential.

## Verification status

This source lane ran under the active fast-delivery boundary. Tests, linting, type checks, package builds, runtime interaction, accessibility review, and screenshots were intentionally not run or claimed. The desktop completeness inventory remains in progress and records this foundation separately from complete appearance, tab-management, localization, and evidence requirements.

## Suggested related articles

- [Presentation settings and shared School mode](experience-settings.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
