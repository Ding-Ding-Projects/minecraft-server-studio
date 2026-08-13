# Minecraft Server Studio

Minecraft Server Studio is a Windows desktop control center for creating, configuring, setting up, and operating local Minecraft servers. It supports Paper and Spigot, gives every supported server setting a structured GUI control, and keeps a companion command-line interface for scripted local administration.

## What it manages

- Create Paper or Spigot servers in a folder selected through the app.
- Select a Minecraft version, memory allocation, server ports, and EULA acceptance before setup.
- Download official Paper builds with publisher-provided SHA-256 validation.
- Build Spigot from the official BuildTools process for the selected revision.
- Detect Java 21 and Git, install missing tools from Windows package managers, and fall back to an app-private portable toolchain when no package manager is available.
- Configure gameplay, world generation, network/RCON, Java runtime, resource-pack, plugin, and server-property settings with switches, sliders, number steppers, selects, type-ahead version input, file pickers, and browse controls.
- Start and stop a local Java process safely without a shell, read live output, and send console commands.
- Install local Paper/Spigot plugin JARs through a file picker.
- Use the CLI for setup, foreground operation, RCON commands, plugin installation, and configuration automation.

## Desktop workflow

1. Open **Create server** and choose Paper or Spigot, a version, a root folder, capacity, and initial network port.
2. Read and accept the Minecraft EULA for that server.
3. Use **Install missing tools** if Java or Git is not detected. The app uses Winget or Chocolatey where available, then downloads a user-scoped portable Java/Git fallback itself. The app never requires a manual prerequisite installation before setup can continue.
4. Select **Set up server**. Paper is downloaded from the Paper API; Spigot is built through BuildTools with the selected revision.
5. Edit the structured controls on the General, World, Gameplay, Network, Runtime, Plugins, and Console tabs.
6. Start the server and use the local console. Enable RCON and set its password only when the external CLI must issue commands to a running server.

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

## Security and operational boundaries

- Server Java commands use direct executable arguments with `shell: false`; the app does not compose user settings into shell commands.
- The app keeps its own server registry and portable toolchain in the per-user application-data directory. It does not write a `.git` directory into server folders.
- Paper downloads are selected from official project metadata and validated when the upstream API provides a SHA-256 value.
- Spigot setup obtains the official BuildTools JAR and needs Java and Git; both are automatically detected and installable from the app.
- RCON passwords are written by Minecraft to `server.properties`. Treat that file as sensitive and avoid exposing it through backups, screenshots, or logs.
- Plugins are local JARs selected through the operating-system file picker. Minecraft Server Studio does not claim to audit third-party plugin safety.

## Companion Sites source

The `site/` directory contains a Sites-compatible companion operations dashboard. It is an explicitly local UI source baseline: it mirrors the product workflow and rich controls but does not impersonate a running server backend. A deployed site must be wired to a protected local bridge before it can execute server operations.

## Documentation

- [Server lifecycle and Paper/Spigot setup](docs/features/server-orchestration.md)
- [Automatic dependency installation](docs/features/dependency-bootstrap.md)
- [Feature documentation index](docs/features/README.md)
- [Changelog](CHANGELOG.md)
- [Handoff](HANDOFF.md)
