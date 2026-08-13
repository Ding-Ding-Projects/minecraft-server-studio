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

## Explicit local runtime collection

The desktop app keeps discovery as local evidence, not as a web-scraped command list. The Command Center has three independently selected collection sources. None is queried until the person using the app selects the source and chooses **Collect selected evidence**.

1. **Selected JAR** runs only the direct argument vectors `java -jar <selected-server.jar> --help` and `java -jar <selected-server.jar> --version`. Both use `shell: false`, an absolute regular Java executable path, an absolute regular JAR path, bounded stdout/stderr and total output, a bounded timeout, and no stdin. The adapter does not issue a lifecycle command or write a server file. A JAR is still executable publisher-controlled code, so an unexpected flag interpretation is recorded as failed or unverified probe evidence rather than treated as support.
2. **Running local console** sends only `help`, `plugins`, and, for a Paper server, `paper` to the already-running process the app owns. The collector records a bounded post-request output window with source, route, request, timestamp, timeout/truncation state, and response text. Other server output can arrive in that window, so this is provenance-bearing observed evidence, not a claim that every line belongs to the request.
3. **Loopback RCON** connects only to an existing `127.0.0.1` RCON endpoint using the protected local credential route. It sends only the same fixed `help`, `plugins`, and `paper` discovery queries; it bounds port, packet frame, response, and timeout sizes. The RCON password is never placed in settings JSON, discovery evidence, console output, or returned provenance.

The raw response, its source/route, selected fixed request, capture time, exit or timeout state, truncation state, and safe local provenance are stored in the local server record with bounded history. Discovery output is not an export, telemetry event, or remote request.

The parser is deliberately conservative:

- A selected JAR's observed flags become JAR-help evidence only. They do not create game-command actions.
- A Paper response can fill a current `/paper` usage form only when it supplies tokenizable runtime usage text. The displayed form retains its runtime evidence badge and version/flavor context.
- A live `/help` or `/paper` response can create a tokenized action for a command name actually printed by the running server. The action retains its source, route, request, timestamp, and operational risk metadata.
- A `/plugins` response records observed loaded-plugin names. It does not turn a plugin name into an executable command.
- `plugin.yml` still provides useful command, alias, and permission metadata, but descriptor-derived commands stay disabled until a live runtime response or advertised runtime protocol command confirms the command name. A descriptor is not proof that a plugin loaded, that its command is registered, or that the current sender has permission.

This matches Paper's documentation that `/help` lists registered commands and `/plugins` lists loaded plugins, while Paper's `/paper` subcommands remain version-sensitive. It also aligns with the Spigot command API, where a command carries its own usage and permission metadata rather than a universal command guarantee. See [Paper Commands](https://docs.papermc.io/paper/reference/commands/), [Paper CLI Arguments](https://docs.papermc.io/paper/reference/cli-arguments/), [Spigot Command API](https://hub.spigotmc.org/javadocs/bukkit/org/bukkit/command/Command.html), and [Spigot plugin.yml](https://www.spigotmc.org/wiki/plugin-yml/).

## Execution routes

The schema distinguishes command composition from execution:

- A runtime-protocol method may be selected only if that exact method was advertised by rpc.discover.
- An unadvertised protocol method is never treated as callable.
- Console and RCON are explicit alternate routes. A caller must show the selected route and its connected state before execution.
- Host-managed actions such as restart require a configured local lifecycle route, not an invented Minecraft command.
- The raw composer is not a protocol escape hatch. It can route only to an available local console or protected loopback RCON connection, never to an arbitrary management-protocol method or host lifecycle action. It clearly states that it does not prove command existence, sender permission, or server support.

## Safe composition

composeCommand creates bounded tokenized command output from structured field values. The composer validates player names, selectors, resource locations, numeric ranges, coordinates, duration syntax, JSON text components, and token lists. It rejects control characters, incomplete quotes, oversized values, oversized token lists, and line breaks.

The raw fallback is also tokenized. It is not a shell field and cannot inject an additional console line. Minecraft command text is routed only to the chosen local console or RCON transport.

## Failure modes

- Missing runtime discovery leaves capability badges in an honest unknown state; it does not turn them into a claim of support.
- A mismatched server flavor yields an unsupported-flavor source state.
- Older version metadata can yield a below-minimum-version badge where an action has a known version floor.
- A requested protocol route fails closed when its method was not advertised.
- Plugin descriptors are evidence of declared commands and permissions, not a guarantee that a plugin is loaded, authorized, safe, or compatible.
- A selected JAR can fail to honor `--help` or `--version`; the app reports that bounded probe result and does not infer a server start, compatibility result, or command list from it.
- A live-console capture can be incomplete, time out, truncate, or contain interleaved server output. It retains that state and does not silently promote incomplete output into a capability badge.
- An unavailable local process, disabled RCON, missing protected credential, invalid RCON frame, or RCON timeout remains a skipped or failed evidence record rather than an empty successful result.

## Security considerations

The registry does not create shell strings or call a remote service. The bounded adapter owns only fixed direct-argument JAR probes and fixed loopback RCON discovery queries. Structured values are bounded before output. The local console and RCON layers remain responsible for authentication, authorization, connection handling, audit logging, confirmation presentation, and actual process control.

## Verification boundary

The module is designed to be consumed by the application process and renderer. Runtime discovery and UI interaction are intentionally separate from registry construction so that the UI can show pending, verified, and unsupported states without guessing command availability. This fast-delivery change did not run automated checks, package builds, runtime interaction, or visual captures; those states remain pending in the desktop completeness inventory.
