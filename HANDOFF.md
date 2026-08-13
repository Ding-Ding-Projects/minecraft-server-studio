# Handoff

## Minecraft Server Studio expanded candidate

The application source provides a Windows Electron control center, shared CLI, structured Paper/Spigot settings, local lifecycle control, version-aware Java planning, BuildTools preflight planning, plugin metadata discovery, a capability-first Command Center, management-protocol discovery, protected credential storage, and automatic Java/Git detection and installation fallback. The companion site is a public marketing surface with browser-local controls only; it does not claim to operate a server.

### Changed areas

- `src/main/server-manager.cjs`: server registry, Paper/Spigot provisioning, dependency bootstrap, lifecycle, plugins, and RCON.
- `src/main/buildtools-adapter.cjs`, `command-center-registry.cjs`, `minecraft-management-protocol.cjs`, `credential-vault.cjs`, and `desktop-status-model.cjs`: capability, safety, status, and secret-boundary modules.
- `src/main/main.cjs` and `src/main/preload.cjs`: desktop process and safe IPC boundary for status, BuildTools planning, runtime inventory, protocol discovery, and command planning.
- `src/renderer/`: desktop UI with rich server controls, capability-first management, Command Center, confirmation, and Local status destination.
- `src/cli/mss.cjs`: shared local CLI.
- `site/`: public marketing and browser-local interaction source, including a local Status destination.
- `.github/workflows/windows-package.yml`: unsigned Windows Squirrel packaging source with artifact collection only.
- `assets/minecraft-server-studio.svg`, `assets/minecraft-server-studio.ico`, and `scripts/generate-app-icon.ps1`: original vector master and reproducible multi-resolution Windows icon source.
- `package.json`: local Windows executable icon plus an immutable commit-pinned Squirrel icon metadata URL.

### Verification state

This is an ultra-speed candidate. Tests, lint, type checks, reviews, runtime interaction, and screenshots have not been run or claimed. The local status/completeness inventories intentionally show those evidence types as pending rather than verified. A packaging attempt against `7671f55f2cc6642df274d2352015661b534253b1` reached Squirrel.Windows but stopped because `squirrelWindows.iconUrl` was absent; that output is superseded. The follow-up candidate pins both the local executable icon and an immutable Squirrel icon metadata URL. No release, deployment, tag, or publish action was performed here.

### Remaining work

- Complete a dedicated Java runtime-manager discovery/preflight module beyond the current version matrix and runtime inventory.
- Add a provider-specific authenticated WebSocket connector before treating a stored management bearer credential as transmitted authentication.
- Run the repository's normal focused verification after the speed-delivery boundary is lifted.
- Build/package against the immutable candidate if the delivery owner authorizes the package pass, then inspect and report only the package output.
- Integrate, publish, and release through the repository owner workflow when external authority is available.
