# Server orchestration

Minecraft Server Studio stores a local registry of server definitions in the application-data directory. Each definition includes the selected server folder, Paper or Spigot software choice, Minecraft revision, Java allocation, EULA state, and editable `server.properties` values.

## Create and configure

The desktop app exposes structured controls instead of requiring a configuration-file editing workflow:

- Software uses Paper/Spigot radio choices.
- Minecraft revision uses a type-ahead version control populated from the Paper API.
- Folders and plugin JARs use native browse controls.
- Memory and distances use range controls with live numeric output.
- Ports, player limits, permission levels, and world-size values use bounded number controls.
- Game mode, difficulty, world type, and permission levels use selects.
- Boolean properties use named switches with explanations.
- Long message values use text areas only where multiline text is meaningful.

The app updates `server.properties` through a bounded lossless line model: GUI-managed keys can change, while comments, unknown keys, original line endings, and file layout are retained. It writes the completed file through a same-directory atomic rename. The detailed [configuration and plugin safety article](configuration-and-plugin-safety.md) describes the preservation and failure boundaries. Arbitrary shell arguments are never accepted.

## Paper setup

For Paper, the app reads the official Paper project metadata, selects the latest downloadable build for the chosen Minecraft revision, downloads it into `server.jar`, and validates the file with the publisher-provided SHA-256 value when it is available.

Paper-specific post-JAR options are planned through the typed [Paper JAR CLI controls](paper-jar-cli-controls.md), not a free-form launcher field. Those controls keep JVM tokens before `-jar`, use only direct arguments after it, provide explicit bounded `--help` and `--version` evidence collection, and leave world-changing upgrade/cache/region flags disabled until an exact destructive confirmation can be bound to a stored launch preflight.

## Spigot setup

For Spigot, the current desktop BuildTools tab exposes a typed plan-only preview. It refreshes official version metadata only when the user requests it, verifies a dedicated workspace outside both the server home and source repository, derives controlled output paths and direct arguments, and surfaces the documented Java/Git readiness state. The renderer creates that plan only through `studio:plan-buildtools` / `planBuildTools`, backed by `BuildToolsOrchestrationController.createPlan()`; it returns unavailable execution with `processStarted: false`. The main/preload boundary has no BuildTools preflight or execution route, and the Spigot provisioning route fails closed, so the current preview does not download BuildTools, start an executor, prepare a promotion/rollback operation, or create a JAR. The generated JAR is never put in the public source repository. See [BuildTools plan-only orchestration](buildtools-orchestration.md) for the exact typed-flag and unavailable-execution boundary.

## Operate

The desktop lifecycle controls start Java with the configured fixed memory allocation and `nogui`, keep standard output and error in the built-in console, and send console commands through the child process standard input. Stop requests send Minecraft's `stop` command first and only terminate the local Java process after a 20-second grace period.

The CLI shares the registry. `start` remains foreground so the operator can observe the process. The desktop app defaults to a local child-process console; RCON is an explicit fallback that requires the Network settings and a protected credential. CLI `command` and `stop` run through a one-shot Electron main-process gateway instead of reading a password in the Node CLI. The gateway is limited to the desktop app's default local registry and a fixed `127.0.0.1` RCON host; it rejects a custom `MSS_DATA_DIR`, remote host routing, and password configuration through the CLI.

## Minecraft Server Management Protocol

The optional Minecraft Server Management Protocol connection begins with `rpc.discover`. The client normalizes that response into validated method names and bounded descriptors before presenting any remote capability. The resulting capability snapshot is bound to its exact endpoint and has a short time-to-live. A reconnect invocation can reuse only a matching, unexpired allowlist; the app requires discovery again after that snapshot expires or the endpoint changes.

The generic client is TLS-first. It permits an insecure connection only for an explicitly local loopback endpoint. It does not send a generic bearer token, custom authentication header, or WebSocket subprotocol handshake. An endpoint that requires authentication is therefore unavailable to this generic client until an explicit, documented provider adapter exists. A protected credential record is never transmitted by the generic management-protocol client.

## Plugin installation

The Plugins tab accepts a user-selected local `.jar` file only. Before staging it, the app checks a bounded JAR signature, SHA-256, manifest, Bukkit or Paper descriptor identity, declared dependencies, aliases, API target, destination collision, and load-order cycle plan. A running managed server receives the JAR only in app-managed staging outside `plugins`; promotion is revalidated, atomic, and only permitted while stopped. The app does not claim that a third-party plugin is compatible, trusted, or safe beyond that local descriptor evidence. Restart the server after promotion; ordinary plugin reload is not the update path.

## Failure modes

- A missing Java runtime blocks setup and startup until the app's automatic installer completes.
- A missing Git runtime blocks Spigot BuildTools only; Paper setup can continue without Git.
- An unsupported version or an unavailable upstream build reports the publisher response instead of substituting a different revision.
- A missing EULA acceptance blocks startup without changing any server process state.
- A failed RCON authentication reports the failure without revealing the configured password.
- CLI command or stop refuses when the desktop app's protected storage is unavailable, the server is not a local profile, RCON is disabled, or a protected password has not been saved in the desktop Network tab. The recovery path is to repair that desktop configuration, not to provide a password on the command line.

## Security considerations

The app runs server Java with `shell: false`, does not interpolate settings into shell commands, redacts password-like output patterns in its own console feed, and uses a private application-data registry rather than a repository inside a server folder. The CLI gateway receives no password in arguments, environment, registry JSON, or standard input; it reads the protected value in Electron only long enough to authenticate one fixed-loopback RCON request, bounds packets and output, then exits. Desktop RCON responses are converted to a bounded, versioned safe envelope before IPC: the helper removes the current protected RCON password, URL-encoded password echoes, and common credential-shaped values, neutralizes unsafe control characters, and marks redaction or truncation in the console. RCON and management-protocol secrets use the operating system protected-storage boundary and are excluded from the registry, exports, and console logs. When RCON is enabled, Minecraft still needs its password in the local server configuration to operate; protect the server folder according to your local access policy. See [RCON response safety](rcon-response-safety.md) for the exact desktop boundary.

## Verification boundary

This initial implementation records the intended lifecycle and configuration behavior in source. The speed-delivery pass intentionally did not run tests, visual captures, or runtime interaction verification, including for management-protocol discovery and reconnect handling.

## Suggested related articles

- [CLI RCON gateway](cli-rcon-gateway.md)
- [Command Center](command-center.md)
- [Paper JAR CLI controls](paper-jar-cli-controls.md)
- [Automatic dependency bootstrap](dependency-bootstrap.md)
