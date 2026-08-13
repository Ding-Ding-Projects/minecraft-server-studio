# Appearance and tab-navigation foundations

Minecraft Server Studio has separate bounded foundations for the installed desktop application and its public companion site. Each surface keeps its own local state and does not delegate its appearance or navigation controls to the other surface. Neither foundation is a claim that every visual property, editor capability, or tab-management behavior is complete.

## Desktop foundation

The installed desktop application has a bounded local appearance and tab-navigation foundation.

### Implemented behavior

Open **Studio preferences** and use **Appearance and tabs foundation** to apply these settings to the running desktop shell:

| Control | Implemented behavior |
| --- | --- |
| Theme | Persists `system`, `light`, or `dark`. `system` reads the current operating-system color preference when the renderer initializes. |
| Density | Persists `compact`, `comfortable`, or `spacious` control and layout spacing. |
| Seed color | Persists one six-digit hexadecimal Material primary color. |
| Typography | Persists a bounded local list of font families, a 85%–125% type scale, and weights 400, 500, 600, or 700. |
| Tab dock | Persists the server-settings tab strip at the left, right, top, or bottom edge. Left is the default. The tab list updates its `aria-orientation`, and keyboard navigation uses Up/Down for side docks and Left/Right for top or bottom docks. |
| Active tab | Persists the currently selected server-settings tab after a short local debounce. |
| Canonical target profile editor | Applies and persists a bounded profile for the app shell, server-settings tab strip, primary actions, secondary actions, preference cards, status cards, or dialog surfaces. Each target can locally override surface/text colors, corner radius, font family, type scale, font weight, density, and motion; every unset profile field inherits the active theme or base appearance setting. |

The server-settings strip, including the Paper JAR CLI tab, has a working all-tabs overflow list, local tab search, persisted ordering, pinning, grouping, and protected bulk-close controls. Its context menu contains **Edit tab appearance…**, and `Ctrl+Alt+A` on a focused tab plus Shift+right-click both open the persisted **Settings-tab strip** profile. That profile changes the strip as a whole, not one individual tab. The advanced workspace remains intentionally limited to the current desktop window. It does not claim multi-window tab discovery or control. See [Desktop tab workspace](desktop-tab-workspace.md) for its persistence, search, grouping, accessible-orientation, and protected-close boundaries.

The current-strip, group, and master tab searches keep plain text as their default and expose separate anchored regex builders with raw patterns, flags, construction tokens, local sample text, live match counts, and capture-group feedback. An invalid regex leaves all entries visible and reports the error instead of applying a partial filter.

Each query and pattern is limited to 256 characters and is evaluated only against the small local tab/control labels owned by this desktop surface. The builder does not send the query or sample labels to a network service.

### Local storage and validation

`src/main/appearance-navigation-settings.cjs` owns a separate `appearance-navigation-settings.json` record under the application's existing private settings directory. It is deliberately separate from the presentation and shared School-mode records so an appearance change does not migrate or overwrite the shared mode state.

The current version-3 record uses an exact-key, versioned schema with:

- a 64 KiB maximum file size;
- seven canonical profile target identifiers: `shell`, `tabStrip`, `primaryAction`, `secondaryAction`, `settingsCard`, `statusCard`, and `dialogSurface`;
- allowlisted theme, density, font, tab, motion, and target-profile values;
- strict six-digit hexadecimal color validation;
- bounded type scale and corner-radius values;
- atomic same-directory replacement with restrictive file permissions.

Older version-1 and version-2 records, plus the prior tab-workspace version-3
record shape, remain readable. Their shell, tab-strip, and primary-action
colors/radius values retain their meaning while the new canonical targets and
profile fields initialize to inherited values. The record is written as version
3 on the next accepted appearance update; an otherwise readable legacy record
is not overwritten just because it was loaded.

The renderer receives only the validated snapshot through the existing narrow Electron IPC bridge. There is no network request, telemetry event, export, credential, server setting, or command execution in this feature.

If the record is invalid or unavailable, the renderer uses safe in-memory defaults but disables editing and states that the local record must be repaired or reset. It does not silently overwrite an invalid record.

### Current boundary

The canonical profile editor renders the eight listed properties only for its
seven named targets. It does not claim a complete every-element editor. The
preferences surface names the selected target, reports which values are local
instead of inherited, and displays a separate unsupported-property statement.
Resetting a selected profile clears all eight values and returns that profile to
the active theme/base-setting provenance.

The following remain incomplete and visibly identified as such in the preferences inventory:

- installed-font enumeration, variable-font axes, and word-processor-depth typography;
- an infinite color picker, color-space translator, contrast audit, and per-property locks;
- gradients, borders, elevation, state/pseudo-state profiles, and per-element editors for every dialog, menu, control, state, and pseudo-state;
- cross-window tab discovery or a multi-window tab workspace;
- a full command palette; and
- full application-wide localization and every-search-surface regex coverage.

The overflow list and tab search are real controls, not placeholders. The boundary above means only that the unlisted behaviors have not been represented as shipped.

### Update and recovery behavior

An unsaved profile preview is tracked as local pending work. The unsigned
application-update controller therefore continues to prevent a restart while a
preview or the preferences dialog remains unresolved. Closing preferences
without applying a profile preview restores the last persisted values. Context
opening from a tab returns focus to that tab after the preferences dialog
closes.

No appearance value changes package identity, executable name, installer identity, update feed, application-data location, server data, or shared School-mode credential.

### Verification status

This source lane ran under the active fast-delivery boundary. Tests, linting, type checks, package builds, runtime interaction, accessibility review, and screenshots were intentionally not run or claimed. The desktop completeness inventory remains in progress and records this foundation separately from complete appearance, tab-management, localization, and evidence requirements.

## Public companion-site foundation

The public companion site has its own browser-local appearance and tab-navigation foundation. It is a real page-local interaction layer for the companion site only: it does not alter an installed application, operate a Minecraft server, install an update, access a local file, or contact a backend.

### Browser-local appearance

The companion site persists the following bounded presentation preferences in this site's browser storage:

| Control | Browser-local behavior |
| --- | --- |
| Theme | Uses `system`, `light`, or `dark`; the system choice follows the visitor's browser/operating-system preference where the browser exposes it. |
| Density | Uses compact, comfortable, or spacious layout density. |
| Accent | Uses a validated local accent color. |
| Typography | Uses safe bounded family, scale, and weight choices that the site can render locally. |
| Appearance targets | Provides local editor controls for the page, tab strip, and selected tab using bounded accent, font-scale, and font-weight values. A reset clears or resets only the values this foundation manages. |

The page records only validated browser-local preference state. It does not upload a font choice, color, layout preference, tab label, or editor value. If browser storage is unavailable or rejects a write, the page can remain usable for the current visit but must state that persistence did not succeed.

### Browser-local tabs and search

The companion site uses browser-style tabs for its registered product-preview destinations. Visitors can choose a dock at the left, right, top, or bottom; the active dock changes layout responsively rather than rotating text. A left or right dock exposes vertical tab semantics and Up/Down navigation, while a top or bottom dock exposes horizontal semantics and Left/Right navigation.

The browser-local tab record keeps a dock edge, derived accessible orientation, the active destination, display order, pinned state, group membership, group order, and collapsed-group state. Overflow remains reachable through a real overflow surface instead of clipping excess tab labels. The public contract exposes `setTabDock` and `setTabAppearance` alongside tab registration, grouping, updating, movement, selection, and accessible-tab retrieval. The current tab strip, the browser-local group list, and the site-wide tab list each have an independent plain-text search with an adjacent anchored regular-expression builder. Each builder stays bound to its own query, pattern, flags, validation feedback, and local candidate labels; it does not search the installed application or a remote service.

The local appearance editor and the tab controls are intentionally bounded. They preserve only browser-local companion-site state and present honest unavailable states when a requested action needs an installed application or a backend.

### Current public boundary

The companion-site foundation does not claim any of the following as complete:

- every-element appearance editing, word-processor-depth typography, a full color-space translator, or complete appearance export/import;
- every menu, dropdown, nested settings surface, and context menu having a live anchored regex builder;
- complete cross-window tab discovery, destructive bulk-close workflows, all tab-management keyboard paths, or a complete command palette;
- a browser-to-desktop bridge, server control, installer-transfer management, account system, credential storage, or external status delivery; or
- page-wide localization, accessibility verification, runtime interaction proof, or real built-artifact captures.

The controls described above are browser-local foundations, not static mockups. Their scope remains deliberately limited until the missing behavior and evidence are implemented and recorded independently.

### Public verification status

This documentation candidate was prepared under the active fast-delivery boundary. No tests, linting, independent review, build, package, runtime interaction, accessibility review, deployment verification, or screenshots were run or claimed for this documentation lane. The public companion-site completeness inventory must continue to show implementation, localization, interaction, test, and capture evidence honestly rather than treating this article as proof.

## Suggested related articles

- [Presentation settings and shared School mode](experience-settings.md)
- [Desktop command palette foundation](desktop-command-palette.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
