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

The app writes `server.properties` and `eula.txt` atomically before setup or startup. It allows only the documented property key set managed by the GUI; arbitrary shell arguments are never accepted.

## Paper setup

For Paper, the app reads the official Paper project metadata, selects the latest downloadable build for the chosen Minecraft revision, downloads it into `server.jar`, and validates the file with the publisher-provided SHA-256 value when it is available.

## Spigot setup

For Spigot, the app downloads the official BuildTools JAR, requires Java and Git, executes BuildTools with the selected revision through direct executable arguments, and promotes the generated Spigot JAR to `server.jar`. BuildTools can take several minutes because it assembles the requested revision locally.

## Operate

The desktop lifecycle controls start Java with the configured fixed memory allocation and `nogui`, keep standard output and error in the built-in console, and send console commands through the child process standard input. Stop requests send Minecraft's `stop` command first and only terminate the local Java process after a 20-second grace period.

The CLI shares the registry. `start` remains foreground so the operator can observe the process. `command` and `stop` use RCON and intentionally require that the server's Network settings enable RCON and provide a password.

## Plugin installation

The Plugins tab accepts a user-selected local `.jar` file and copies it into the selected server's `plugins` directory. The app lists installed JARs, but it does not claim that a third-party plugin is compatible or safe. Restart the server after installing a plugin.

## Failure modes

- A missing Java runtime blocks setup and startup until the app's automatic installer completes.
- A missing Git runtime blocks Spigot BuildTools only; Paper setup can continue without Git.
- An unsupported version or an unavailable upstream build reports the publisher response instead of substituting a different revision.
- A missing EULA acceptance blocks startup without changing any server process state.
- A failed RCON authentication reports the failure without revealing the configured password.

## Security considerations

The app runs server Java with `shell: false`, does not interpolate settings into shell commands, redacts password-like output patterns in its own console feed, and uses a private application-data registry rather than a repository inside a server folder. The Minecraft server itself still owns `server.properties`, including RCON configuration; protect that folder according to your local access policy.

## Verification boundary

This initial implementation records the intended lifecycle and configuration behavior in source. The speed-delivery pass intentionally did not run tests, visual captures, or runtime interaction verification.
