# Desktop tab workspace

Minecraft Server Studio provides a browser-style tab workspace for the desktop server-settings surface. This feature belongs to one desktop application window. It manages the settings tabs that the current window owns; it does not create, inspect, synchronize, or control tabs in another application window, another process, the companion website, or a Minecraft server.

## Behavior

The workspace keeps the server-settings destinations in a tab strip that can dock at the left, right, top, or bottom edge. Left remains the default. A visitor can select tabs, change their displayed order, pin or unpin them, and place them in named groups. Group membership, group order, collapsed state, pin state, tab order, active tab, and dock edge are restored from the local desktop settings record when that record is valid.

Pinned tabs remain in their dedicated visible region when ordinary tabs overflow. A collapsed group stays collapsed when a tab is moved into it. The overflow surface remains a real selection route instead of clipping labels, and it reports the same tab state as the strip.

The workspace has three separate discovery routes:

| Search | Scope |
| --- | --- |
| Current-strip search | Tabs visible in the current desktop window's server-settings strip. |
| Group search | Named tab groups and their current membership controls. |
| Master tab search | Every managed server-settings tab in this one desktop window. |

Each search starts in plain-text mode and has its own adjacent anchored regular-expression builder. A builder keeps its own query, pattern, flags, validation result, guided tokens, bounded local sample text, and candidate labels. A pattern applies only after validation; invalid or empty patterns do not close, move, or hide a tab. The desktop does not send a query, pattern, sample, or tab label to a network service.

Bulk close actions match the bounded local tab descriptors, including each visible tab label and its local group/pin/lock state. They show the affected labels and count before any close is requested. Pinned and locked tabs are excluded by default. Including either protected set requires the user to choose that inclusion explicitly, and the existing two-key, full-slider confirmation foundation authorizes the reviewed close action. An empty query or invalid regular expression cannot close tabs.

## Keyboard and accessibility behavior

The tab strip exposes tab-list semantics and changes its orientation with the dock:

| Dock edge | Orientation | Navigation axis |
| --- | --- | --- |
| Left or right | Vertical | Up and Down arrows |
| Top or bottom | Horizontal | Left and Right arrows |

The active tab remains a reachable focused tab, and each selected tab identifies its controlled panel. Search results identify the group and pin state before selection. Group and overflow controls retain keyboard paths and visible focus instead of depending on a pointer-only arrangement.

## Local persistence and boundaries

Workspace preferences remain app-private state in the existing strict appearance/navigation settings record. They are validated before use and preserved independently from server configuration, server data, credentials, update metadata, and the shared School-mode credential. Invalid or unavailable local state falls back to safe in-memory defaults and is not silently replaced.

This feature does not make the desktop workspace a multi-window browser. It does not discover tabs outside the current window, read another application, open an external editor, transfer an installer, or contact an account, browser, or server backend. It also does not claim every-element appearance editing, complete command-palette coverage, complete localization, or evidence that a tab action operated a running Minecraft server.

## Verification boundary

This source/documentation lane was prepared under the active fast-delivery workflow. Tests, linting, type checks, independent review, built-artifact interaction, accessibility validation, and screenshots were not run or claimed. The local completeness inventory keeps localization, automated test, capture, and interaction evidence pending until separately obtained.

## Suggested related articles

- [Appearance and tab-navigation foundations](appearance-and-tabs.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
- [Presentation settings and shared School mode](experience-settings.md)
- [Offline documentation browser](offline-documentation-browser.md)
