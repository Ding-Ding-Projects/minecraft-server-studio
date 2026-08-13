# Desktop command palette foundation

Minecraft Server Studio has a bounded desktop command-palette foundation for
finding real, local renderer destinations and controls. Press `Ctrl+Shift+F`
to open it. `Ctrl+K` deliberately has no competing palette binding.

The palette is a local renderer surface. It is not a server-command console,
an RCON client, a lifecycle controller, or a general-purpose IPC launcher.

## What the palette indexes

Each time it opens, the palette builds a local index from the renderer's
currently available non-secret surfaces:

- actual application destinations;
- visible server tabs and panels;
- bundled offline-document records after the existing documentation loader has
  supplied them; and
- actual non-secret controls that the renderer exposes.

The index is intentionally derived from live renderer elements rather than a
separate hand-maintained list of labels. A result identifies the destination
and control that the user can actually open and focus.

Credential, password, token, and secret controls are excluded from indexing.
The palette does not read or expose their labels, values, or state.

## Search and keyboard operation

Plain-text search is the default. The palette also provides its own bounded
local regular-expression builder with flags and guided construction tokens.
The result count and search status remain visible, including an invalid-pattern
or no-match state.

Arrow keys move through results, `Enter` activates the selected result, and
`Escape` closes the palette. These controls act only on the palette and the
currently indexed local renderer surfaces.

## Exact-element navigation

Activating a destination or control opens its owning application destination,
settings dialog, or server tab as needed. The renderer then scrolls the exact
real element into view, focuses it, and gives it a brief visible highlight.
The palette does not fabricate a substitute control or route a result through
an arbitrary command path.

One immediate setting control is deliberately narrow: the update-check toggle
mirrors the existing `#updates-enabled` control and uses that control's
existing change handler. It does not add a new update IPC route or claim that
an update check, download, or restart occurred.

## Failure and security boundaries

- A bundled documentation record is indexed only after the existing local
  documentation loader has supplied it; the palette does not fetch an article
  or replacement from the network.
- Secret-like controls remain excluded instead of appearing as partially
  usable results.
- A result can only reveal and focus its known local renderer target. It cannot
  execute an arbitrary command, contact a Minecraft server, invoke RCON, start
  a process, or call a newly invented IPC endpoint.
- Search is bounded locally. An invalid or oversized regular expression remains
  an honest search error rather than being silently treated as a command.

## Completeness and verification boundary

This is a source-level palette foundation, not a claim that every application
feature, setting, documentation article, appearance property, tab group, menu,
or dropdown is indexed. It does not establish full localization, voice
behavior, accessibility, runtime interaction, package behavior, or capture
evidence.

Under the active fast-delivery workflow, no automated tests, linting, type
checks, independent review, package build, runtime interaction, accessibility
review, or screen capture was run or claimed for this documentation and source
lane. The desktop completeness inventory must keep its implementation,
localization, interaction, test, and capture proofs pending until real evidence
is recorded for the exact palette surface.

## Suggested related articles

- [Appearance and tab-navigation foundation](appearance-and-tabs.md)
- [Offline documentation browser](offline-documentation-browser.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
