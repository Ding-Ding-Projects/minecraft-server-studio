# Handoff

## Minecraft Server Studio expanded candidate

The application source provides a Windows Electron control center, shared CLI, structured Paper/Spigot settings, local lifecycle control, version-aware Java planning, BuildTools preflight planning, plugin metadata discovery, a capability-first Command Center, management-protocol discovery, protected credential storage, and automatic Java/Git detection and installation fallback. The companion site is a public marketing surface with browser-local controls only; it does not claim to operate a server.

### Changed areas

- `src/main/server-manager.cjs`: server registry, Paper/Spigot provisioning, dependency bootstrap, lifecycle, plugins, and RCON.
- `src/main/server-backup-manager.cjs`: bounded local snapshot inventory, manifest hashing, stopped-server restore staging, official stable Paper update staging, and retained-JAR rollback helpers.
- `src/main/buildtools-adapter.cjs`, `command-center-registry.cjs`, `minecraft-management-protocol.cjs`, `credential-vault.cjs`, `desktop-status-model.cjs`, and `java-runtime-manager.cjs`: capability, safety, status, secret-boundary, and version-aware Java runtime modules.
- `src/main/main.cjs` and `src/main/preload.cjs`: desktop process and safe IPC boundary for status, BuildTools planning, runtime inventory, protocol discovery, and command planning.
- `src/renderer/`: desktop UI with rich server controls, capability-first management, Command Center, confirmation, backup/update/rollback previews, and Local status destination.
- `docs/features/backups-and-paper-updates.md`: local snapshot, restore, Paper update, rollback, failure-mode, and credential-boundary documentation.
- `src/cli/mss.cjs`: shared local CLI.
- `site/`: public marketing and browser-local interaction source, including a local Status destination.
- `.github/workflows/windows-package.yml`: Windows GitHub Actions release workflow source for push and manual dispatch. It packages unsigned Squirrel assets, validates `Setup.exe`, `RELEASES`, the full `.nupkg`, the `RELEASES` index, and `NotSigned` status; uploads safe evidence; generates line-count release notes; verifies published asset download metadata; and publishes one rerun-unique non-draft release when an Actions run reaches publication. It does not assert a dim sum code name or photo unless a separately verified catalog asset is available.
- `assets/minecraft-server-studio.svg`, `assets/minecraft-server-studio.ico`, and `scripts/generate-app-icon.ps1`: original vector master and reproducible multi-resolution Windows icon source.
- `package.json`: local Windows executable icon plus an immutable commit-pinned Squirrel icon metadata URL.

### Verification state

This is an ultra-speed candidate. Tests, lint, type checks, reviews, runtime interaction, and screenshots have not been run or claimed. The local status/completeness inventories intentionally show those evidence types as pending rather than verified. The failed package attempt against `7671f55f2cc6642df274d2352015661b534253b1` is superseded by local package evidence pinned to `4f6021fb40380487a6be919695b936ce18b014e5`: the unsigned Squirrel output contains `Setup.exe`, `RELEASES`, and the full `.nupkg`, while `Setup.exe` reports `NotSigned`. That local evidence is not a tag, GitHub Release, deployment, runtime test, or capture. No release, deployment, tag, or publish action was performed here.

The management-protocol source now normalizes discovered method descriptors into an endpoint-bound, time-limited snapshot. A new client may restore only a matching, unexpired method allowlist before invocation. The generic WebSocket client deliberately does not transmit stored management credentials; the desktop reports an authentication-adapter-required state until a documented provider-specific adapter is implemented. This repair was delivered under the speed-delivery boundary; tests, runtime interaction, screenshots, and independent review remain unrun.

The backup/update candidate adds a bounded local snapshot lifecycle for world, configuration, plugin, log, and server-JAR state. A running locally managed server must acknowledge `save-all` or the snapshot is refused. Restore is stopped-server-only, creates a new pre-restore snapshot, and requires two confirmations plus a full authorization slider. The Paper update flow uses the official stable Downloads Service metadata, requires a pre-update backup, validates the reviewed JAR size/checksum/signature in local staging, swaps only a stopped `server.jar`, retains the old JAR for rollback, and never auto-updates plugins. This source is unverified under the speed-delivery boundary; tests, lint, type checks, runtime interaction, packaging, screenshots, and independent review remain unrun.

### Remaining work

- The dedicated Java runtime-manager now owns strict Paper/Spigot compatibility policy, direct Java probes, bounded configured/PATH/JAVA_HOME discovery, explicit package-manager plans, optional configured portable-source handling, and direct-argv launch preflight. Tests, runtime interaction, and captures remain unrun under the speed-delivery boundary.
- Add a provider-specific authenticated WebSocket connector before treating a stored management bearer credential as transmitted authentication.
- Run the repository's normal focused verification after the speed-delivery boundary is lifted.
- Run and inspect the release workflow against an immutable integrated candidate when external delivery authority is available; verify the resulting non-draft release, tag, assets, line-count note, and workflow timing rather than predicting them.
