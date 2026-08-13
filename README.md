# Minecraft Server Studio

Minecraft Server Studio is a Windows desktop control center for creating, configuring, setting up, and operating local Minecraft servers. It supports Paper and Spigot, gives every supported server setting a structured GUI control, and keeps a companion command-line interface for scripted local administration.

## What it manages

- Create Paper or Spigot servers in a folder selected through the app.
- Select a Minecraft version, memory allocation, server ports, and EULA acceptance before setup.
- Download official Paper builds with publisher-provided SHA-256 validation.
- Build Spigot from the official BuildTools process for the selected revision.
- Detect Java and Git, select the Java feature required by the chosen Paper or Spigot/BuildTools revision, install missing tools from Windows package managers, and fall back to an app-private portable toolchain when no package manager is available.
- Plan typed Paper JAR CLI arguments after `-jar server.jar`, including bounded help/version evidence, configuration and plugin-directory paths, world/network overrides, startup/console/JFR controls, and a read-only direct-argv preview. World-changing Paper upgrade/cache/region flags remain disabled until an exact destructive-confirmation preflight is wired.
- Configure gameplay, world generation, network/RCON, Java runtime, resource-pack, plugin, and server-property settings with switches, sliders, number steppers, selects, type-ahead version input, file pickers, and browse controls.
- Start and stop a local Java process safely without a shell, read live output, and send console commands.
- Inspect, dependency-plan, stage, and atomically promote local Paper/Spigot plugin JARs through a file picker without acquiring third-party downloads.
- Use the CLI for setup, foreground operation, protected loopback RCON commands, plugin installation, and configuration automation.
- Discover an advertised Minecraft Server Management Protocol schema with `rpc.discover` before enabling any live protocol operation; use the local console or opt-in RCON fallback where an operation is not advertised.
- Use the capability-first Command Center for structured command families, source badges, typed controls, explicit selected-JAR and live runtime evidence collection, tokenized Minecraft-only raw fallback, and guarded consequential operations.
- Review an independent in-app Local status destination that reports local operations, evidence, next steps, and an honest completeness inventory. An optional main-process Status Hub bridge can be configured separately; it keeps the local destination as the fallback and never reports registration, update, inbox-poll, or reply delivery without an accepted transport response.
- Set persisted language mode, independent English/Cantonese message-playfulness levels, dialog/message emoji decoration, and a display name through Studio preferences; use the shared local School-mode control for a live English-only user-experience state with protected unlock credentials.

## Desktop workflow

1. Open **Create server** and choose Paper or Spigot, a version, a root folder, capacity, and initial network port.
2. Read and accept the Minecraft EULA for that server.
3. Use **Install missing tools** if the Java runtime required by the selected version or Git is not detected. The app uses Winget or Chocolatey where available, then downloads a user-scoped portable Java/Git fallback itself. The app never requires a manual prerequisite installation before setup can continue.
4. Select **Set up server**. Paper is downloaded from the Paper API; Spigot is built through BuildTools with the selected revision.
5. Edit the structured controls on the General, World, Gameplay, Network, Runtime, Paper JAR CLI, BuildTools, Live management, Command Center, Plugins, Console, and Local status tabs.
6. Start the server and use the local console. Enable RCON and save its protected password in the desktop app only when the external CLI must issue commands to a running server.

## Command-line interface

After dependencies are installed, use the same local registry as the desktop application:

```text
npm run start:cli -- list
npm run start:cli -- versions
npm run start:cli -- install-deps java git
npm run start:cli -- create --name "Weekend Paper" --root "D:\\Minecraft" --software paper --version 1.21.4 --memory 6 --accept-eula
npm run start:cli -- setup <server-id>
npm run start:cli -- start <server-id>
npm run start:cli -- command <server-id> "say Hello from RCON"
npm run start:cli -- stop <server-id>
npm run start:cli -- plugin-install <server-id> "D:\\Downloads\\ExamplePlugin.jar"
npm run start:cli -- config <server-id> --set pvp=false --set max-players=40
```

`start` intentionally stays attached to the foreground process so output remains observable. `command` and `stop` use a one-shot Electron main-process gateway for RCON. Before either command, open the desktop app on the same Windows account, enable RCON in the Network tab, and save its protected password for that server. The CLI sends only the server ID and Minecraft command to the gateway; it has no password option and rejects `config --set rcon.password=...`. The gateway fixes RCON to `127.0.0.1`, requires the desktop app's default local registry, and redacts its bounded response before the CLI prints it. `MSS_DATA_DIR` remains available for the other local CLI operations, but `command` and `stop` deliberately reject it until an explicit shared-profile design exists.

## Build on a new Windows machine

Run `build.bat` from the repository root. It detects or installs Node.js LTS, installs project dependencies, builds the runnable Electron directory, and then offers to launch it. Use `build.bat /s`, `build.bat --silent`, or `SILENT=1 build.bat` for a non-interactive build.

Run `build-installer.bat` to create the unsigned Squirrel.Windows installer assets. It checks that `Setup.exe` exists, reports its SHA-256, and verifies that the installer is unsigned. The script builds only; it never creates a tag, release, or upload.

## GitHub Actions release workflow

The Windows release workflow at `.github/workflows/windows-package.yml` runs for every GitHub push and for manual `workflow_dispatch` runs. It builds the Windows Squirrel.Windows package with signing disabled, then verifies the expected release set before publication:

- the generated `Setup.exe` installer;
- the `RELEASES` index and its full-package entry;
- the full `.nupkg` package; and
- the installer signature state, which must be `NotSigned`.

Each workflow execution uploads safe package evidence, including the bounded Squirrel output and build context, even when an earlier packaging step fails. It also runs `node scripts/line-count.cjs --format markdown` to create the release-note line-count table from the tagged source tree. The table separates source, tests, styles/markup, documentation, workflows/configuration, other hand-written text, and generated text; it also records tracked-file exclusions and surviving-line automation-versus-human attribution.

When the workflow reaches publication, it creates one non-draft GitHub Release with a rerun-unique tag, attaches the validated unsigned Squirrel assets, and includes the line-count table plus verified workflow timing in the release notes. The release remains unsigned by design and may trigger the operating system's unknown-publisher warning. A dim sum code name or photo is not asserted unless a separately verified catalog asset is available; this workflow neither fetches nor copies catalog assets. The workflow does not run tests or lint jobs; package production and release evidence are not test or runtime-interaction evidence.

## Security and operational boundaries

- Server Java commands use direct executable arguments with `shell: false`; the app does not compose user settings into shell commands.
- The app keeps its own server registry and portable toolchain in the per-user application-data directory. It does not write a `.git` directory into server folders.
- Paper downloads are selected from official project metadata and validated when the upstream API provides a SHA-256 value.
- Spigot setup uses a dedicated BuildTools workspace and a preflight-driven stage/swap/rollback plan. Java and Git are automatically detected and installable from the app.
- The management protocol is TLS-first and stores any bearer credential reference through protected storage. The generic WebSocket transport does not invent a provider-specific bearer handshake; it never enables methods before `rpc.discover` advertises them and is not a Paper HTTP API.
- Command discovery never scrapes or invents commands. It runs only selected-JAR `--help`/`--version` probes with direct Java arguments, or user-selected fixed `help`, `plugins`, and Paper `paper` queries against an already-running local console or protected loopback RCON route. Every bounded response keeps source, route, timestamp, truncation, and failure state; plugin descriptor metadata remains non-executable until live runtime evidence confirms the command name.
- Paper JAR CLI controls build only typed server tokens after `-jar`; the Runtime profile owns JVM tokens before it. The app rejects raw argument strings, argument files, Java/native agents, class-path routes, and shell syntax, and requires custom Paper configuration/plugin/PID paths to remain inside the selected server folder.
- RCON passwords and management bearer credentials are stored through the operating system protected-storage boundary and omitted from the local registry, exports, and console logs. Minecraft still requires its active RCON password in its local configuration; treat the server folder as sensitive.
- The CLI never accepts an RCON password from command-line arguments, environment variables, stdin, or `servers.json`. Its one-shot local gateway reads the app-private protected value only under the same Windows account, uses it only for a fixed loopback connection, and emits no credential data.
- Plugins are local JARs selected through the operating-system file picker. Minecraft Server Studio calculates SHA-256 and inspects bounded JAR, manifest, descriptor, dependency, duplicate, and cycle evidence before staging, but it does not claim to audit or trust third-party plugin safety.
- The optional Status Hub bridge is HTTPS-only except for an explicitly enabled HTTP development route at the exact numeric loopback host `127.0.0.1` or `::1`. Once an eligible endpoint and vault enrollment token are available, the main process generates and stores a fresh session key through `CredentialVault`; it is not returned by the Hub. Enrollment tokens and session keys are not accepted by renderer forms, placed in exports, or copied into local status history. An attempted connection does not claim external delivery.

## Companion Sites source

The `site/` directory contains a Pages-ready public marketing landing page with browser-local interaction equivalents and a separate local Status destination. Its browser state remains local to the visitor and it never claims to install, create, launch, operate, or contact a Minecraft server. It loads `contract.js` before `app.js` and keeps unavailable desktop-only operations visibly unavailable until an installed app or verified release provides them.

## Documentation

- [Server lifecycle and Paper/Spigot setup](docs/features/server-orchestration.md)
- [Automatic dependency installation](docs/features/dependency-bootstrap.md)
- [Version-aware Java runtime and launch profiles](docs/features/java-runtime-and-launch.md)
- [Paper JAR CLI controls](docs/features/paper-jar-cli-controls.md)
- [Spigot BuildTools planning](docs/features/spigot-buildtools.md)
- [Command Center](docs/features/command-center.md)
- [Presentation settings and shared School mode](docs/features/experience-settings.md)
- [CLI RCON gateway](docs/features/cli-rcon-gateway.md)
- [Local status and completeness](docs/features/local-status-and-completeness.md)
- [Shared Status Hub bridge](docs/features/shared-status-hub-bridge.md)
- [Feature documentation index](docs/features/README.md)
- [Changelog](CHANGELOG.md)
- [Handoff](HANDOFF.md)
