# Paper JAR CLI controls

Minecraft Server Studio provides a typed Paper JAR command-line profile for
the arguments that Paper documents after the server JAR. It is not a terminal
or a raw command field. The profile is serialized as direct argument tokens and
the managed launcher uses `shell: false`.

The reference inventory follows Paper's official [CLI arguments
reference](https://docs.papermc.io/paper/reference/cli-arguments/). It is
shown only for a selected Paper server. Spigot start and BuildTools behavior
remain in the separate [Spigot BuildTools planning](spigot-buildtools.md)
surface; the Paper profile never pretends that a Spigot option exists.

## Direct launch boundary

The managed launch has two deliberately separate token regions:

```text
<verified Java executable> <Runtime-tab JVM tokens> -jar <verified server.jar> <typed Paper CLI tokens>
```

The Paper panel builds only the final region. It cannot accept raw JVM text,
argument-file references, Java agents, native agents, class paths, Java remote
management properties, or a shell command. The Runtime tab remains the only
place that owns the bounded reviewed JVM profile. The Java launch preflight
still validates the Java feature, server JAR, EULA, memory, plugin promotion,
and lifecycle state again when Start is selected.

The profile always emits `--nogui` and can independently add:

- `--noconsole` or `--nojline` for Paper's console behavior;
- `--initSettings`, `--demo`, `--bonusChest`, and `--safeMode` for startup and
  initial-world choices;
- `--jfrProfile` for Paper's post-JAR Java Flight Recorder profile;
- `-C`, `-b`, `-c`, `--paper-dir`, `-P`, and `--pidFile` for the documented
  configuration, Paper settings, plugin-directory, and PID-file paths; and
- `-h`, `-p`, `-s`, `-o`, `-w`, `--server-name`, and `--serverId` for typed host,
  port, player-limit, authentication, world-name, name, and identifier
  overrides.

Every custom path is either selected using its native browse control or typed
into the same validated field. It must resolve inside the selected local server
folder; paths with traversal, control bytes, shell syntax, or argument-file
syntax are rejected. A world is a validated name rather than a free-form path,
and its resolved folder is shown as a read-only preview.

## Help and version evidence

The panel's explicit **Collect --help and --version** action reuses the
Command Center's bounded selected-JAR discovery adapter. It runs only these
two vectors when the person using the app chooses the action:

```text
<verified Java executable> -jar <selected server.jar> --help
<verified Java executable> -jar <selected server.jar> --version
```

The adapter keeps direct process arguments, no standard input, bounded
stdout/stderr, bounded total output, and a bounded timeout. A selected JAR is
publisher-controlled executable code, so returned text remains observed local
evidence, not a compatibility promise, capability grant, or command catalog.
The action does not start a server lifecycle and does not invent plugin
commands.

## Plugin JAR boundary

Paper accepts a plugin *directory* through `-P`; it does not accept one plugin
JAR per CLI argument. The Paper profile therefore exposes only a typed plugin
directory. When a custom directory is selected, the local Plugins tab uses that
same validated inside-server directory for inspection, planning, direct
promotion, and staged promotion. Local plugin JAR selection, bounded archive
inspection, descriptor analysis, staging, promotion, and rollback records stay
in the Plugins tab. This avoids treating a descriptor or a JAR filename as
proof that a plugin command exists or is permitted.

Likewise, a custom `-c` properties path is the one the managed properties
writer updates. Leaving it empty retains the normal `server.properties` path
at the server root. The other configuration-path flags remain direct Paper
arguments and are not silently rewritten by the desktop app.

## World-changing flags

Paper documents `--forceUpgrade`, `--eraseCache`, and
`--recreateRegionFiles`. Those choices can materially change world data. This
source lane deliberately keeps all three disabled. Their disabled controls
state that a stored exact launch preflight must first be bound to the existing
two-key destructive-confirmation component. The profile normalizer also rejects
attempts to submit those flags through IPC, so a disabled renderer control is
not the only boundary.

## Failure and recovery behavior

- A selected Spigot server receives an explicit unsupported-flavor state rather
  than a Paper-looking command preview.
- Invalid or outside-server paths, a malformed world name, invalid host, port,
  player count, server identifier, raw-token field, argument-file reference,
  agent option, or shell syntax blocks the preview and launch profile.
- A valid preview only proves token construction. Missing Java, an incompatible
  Java feature, missing JAR, EULA refusal, staged-plugin blocker, or runtime
  launch failure remains a later launch-preflight result.
- A JAR help/version probe may fail, time out, or truncate. The result is kept
  as that failure state and never converted into a supported-command claim.

## Security considerations

This profile does not read credentials, write configuration, acquire plugins,
or open a network connection. It does not add an arbitrary Java option or
shell route. Its only executable action is delegated to the existing bounded
selected-JAR probe after explicit user selection; normal server startup remains
the existing direct child-process path.

## Verification boundary

This feature was implemented during the active fast-delivery workflow. No
tests, linting, independent review, build, package, runtime interaction, or
visual capture was run for this source lane. The local completeness inventory
therefore records the Paper implementation and documentation paths while
leaving localization, test, capture, and interaction evidence pending.

## Suggested related articles

- [Version-aware Java runtime and launch profiles](java-runtime-and-launch.md)
- [Command Center registry](command-center.md)
- [Configuration and plugin safety](configuration-and-plugin-safety.md)
- [Spigot BuildTools planning](spigot-buildtools.md)
