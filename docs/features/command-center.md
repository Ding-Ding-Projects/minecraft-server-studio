# Command Center registry

The Command Center registry describes rich, typed Minecraft command forms for Paper, Spigot, and vanilla-compatible server command surfaces. It is intentionally a registry and composer, not a command executor: it does not start Java, call a network endpoint, inspect a JAR, or write to a server.

## Broad command families

The built-in schema covers these families without claiming that every listed command exists on every runtime:

- Lifecycle and diagnostics: saving, stopping, host-managed restart, reload warnings, and capability-gated Paper profiling, JFR, and tick diagnostics.
- Moderation and access: operator access, allowlist or legacy whitelist forms, bans, pardons, kicks, and player lists.
- Settings and game rules.
- World and gameplay: difficulty, game mode, time, weather, borders, force-loaded chunks, and spawn positions.
- Entity and player operations: inventory, effects, attributes, teleportation, entities, riding, and rotation.
- Terrain, data, and automation: block operations, functions, schedules, data, scoreboards, teams, tags, and execution contexts.
- Communication and effects: chat, rich text, titles, sounds, particles, and sound cancellation.
- Datapacks, plugins, and descriptor-discovered plugin commands and permissions.

Each action includes a structured control schema, source and capability badge rules, a risk category, backup and confirmation requirements, and an explicitly bounded tokenized raw fallback.

## Runtime evidence

The registry accepts evidence collected elsewhere through four merge paths:

1. rpc.discover supplies advertised runtime protocol methods and any advertised command names.
2. Paper /paper usage supplies current Paper runtime forms. Profiling, JFR, and tick actions remain unavailable until this evidence identifies their command tokens.
3. Spigot JAR --help output supplies observed launch flags and command evidence without assuming a fixed Spigot command list.
4. Parsed plugin.yml descriptors add plugin commands, aliases, permissions, and permission metadata.

Version metadata records the detected flavor, Minecraft version, implementation version, build, and available local transports. It is advisory where a runtime did not advertise a command surface.

Paper current and legacy forms are deliberately separate. A current form is selected only from Paper runtime evidence; a legacy form appears with a compatibility badge and a warning that it must be verified before use.

## Execution routes

The schema distinguishes command composition from execution:

- A runtime-protocol method may be selected only if that exact method was advertised by rpc.discover.
- An unadvertised protocol method is never treated as callable.
- Console and RCON are explicit alternate routes. A caller must show the selected route and its connected state before execution.
- Host-managed actions such as restart require a configured local lifecycle route, not an invented Minecraft command.

## Safe composition

composeCommand creates bounded tokenized command output from structured field values. The composer validates player names, selectors, resource locations, numeric ranges, coordinates, duration syntax, JSON text components, and token lists. It rejects control characters, incomplete quotes, oversized values, oversized token lists, and line breaks.

The raw fallback is also tokenized. It is not a shell field and cannot inject an additional console line. Minecraft command text is routed only to the chosen local console or RCON transport.

## Failure modes

- Missing runtime discovery leaves capability badges in an honest unknown state; it does not turn them into a claim of support.
- A mismatched server flavor yields an unsupported-flavor source state.
- Older version metadata can yield a below-minimum-version badge where an action has a known version floor.
- A requested protocol route fails closed when its method was not advertised.
- Plugin descriptors are evidence of declared commands and permissions, not a guarantee that a plugin is loaded, authorized, safe, or compatible.

## Security considerations

The registry does not create shell strings, execute a command, or inspect a remote service. Structured values are bounded before output. The local console and RCON layers remain responsible for authentication, authorization, connection handling, audit logging, confirmation presentation, and actual process control.

## Verification boundary

The module is designed to be consumed by the application process and renderer. Runtime discovery and UI interaction are intentionally separate from registry construction so that the UI can show pending, verified, and unsupported states without guessing command availability.
