# Minecraft Server Studio

Minecraft Server Studio is a Windows desktop control center for creating, configuring, setting up, and operating local Minecraft servers. It supports Paper and Spigot, gives every supported server setting a structured GUI control, and keeps a companion command-line interface for scripted local administration.

## What it manages

- Create Paper or Spigot servers in a folder selected through the app.
- Select a Minecraft version, memory allocation, server ports, and EULA acceptance before setup.
- Download official Paper builds with publisher-provided SHA-256 validation.
- Build Spigot from the official BuildTools process for the selected revision.
- Detect Java and Git, select the Java feature required by the chosen Paper or Spigot/BuildTools revision, install missing tools from Windows package managers, and fall back to an app-private portable toolchain when no package manager is available.
- Configure gameplay, world generation, network/RCON, Java runtime, resource-pack, plugin, and server-property settings with switches, sliders, number steppers, selects, type-ahead version input, file pickers, and browse controls.
- Start and stop a local Java process safely without a shell, read live output, and send console commands.
- Install local Paper/Spigot plugin JARs through a file picker.
- Use the CLI for setup, foreground operation, RCON commands, plugin installation, and configuration automation.
- Discover an advertised Minecraft Server Management Protocol schema with `rpc.discover` before enabling any live protocol operation; use the local console or opt-in RCON fallback where an operation is not advertised.
- Use the capability-first Command Center for structured command families, source badges, typed controls, tokenized Minecraft-only raw fallback, and guarded consequential operations.
- Review an independent in-app Local status destination that reports local operations, evidence, next steps, and an honest completeness inventory without a chat or external status-service bridge.
- Set persisted language mode, independent English/Cantonese message-playfulness levels, dialog/message emoji decoration, and a display name through Studio preferences; use the shared local School-mode control for a live English-only user-experience state with protected unlock credentials.

## Desktop workflow

1. Open **Create server** and choose Paper or Spigot, a version, a root folder, capacity, and initial network port.
2. Read and accept the Minecraft EULA for that server.
3. Use **Install missing tools** if the Java runtime required by the selected version or Git is not detected. The app uses Winget or Chocolatey where available, then downloads a user-scoped portable Java/Git fallback itself. The app never requires a manual prerequisite installation before setup can continue.
4. Select **Set up server**. Paper is downloaded from the Paper API; Spigot is built through BuildTools with the selected revision.
5. Edit the structured controls on the General, World, Gameplay, Network, Runtime, BuildTools, Live management, Command Center, Plugins, Console, and Local status tabs.
6. Start the server and use the local console. Enable RCON and save its protected password only when the external CLI must issue commands to a running server.

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

`start` intentionally stays attached to the foreground process so output remains observable. `command` and `stop` use RCON, which must be enabled and given a password in the Network tab.

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
- RCON passwords and management bearer credentials are stored through the operating system protected-storage boundary and omitted from the local registry, exports, and console logs. Minecraft still requires its active RCON password in its local configuration; treat the server folder as sensitive.
- Plugins are local JARs selected through the operating-system file picker. Minecraft Server Studio does not claim to audit third-party plugin safety.

## Companion Sites source

The `site/` directory contains a Pages-ready public marketing landing page with browser-local interaction equivalents and a separate local Status destination. Its browser state remains local to the visitor and it never claims to install, create, launch, operate, or contact a Minecraft server. It loads `contract.js` before `app.js` and keeps unavailable desktop-only operations visibly unavailable until an installed app or verified release provides them.

## Documentation

- [Server lifecycle and Paper/Spigot setup](docs/features/server-orchestration.md)
- [Automatic dependency installation](docs/features/dependency-bootstrap.md)
- [Version-aware Java runtime and launch profiles](docs/features/java-runtime-and-launch.md)
- [Spigot BuildTools planning](docs/features/spigot-buildtools.md)
- [Command Center](docs/features/command-center.md)
- [Presentation settings and shared School mode](docs/features/experience-settings.md)
- [Local status and completeness](docs/features/local-status-and-completeness.md)
- [Feature documentation index](docs/features/README.md)
- [Changelog](CHANGELOG.md)
- [Handoff](HANDOFF.md)
