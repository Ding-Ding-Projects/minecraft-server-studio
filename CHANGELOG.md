# Changelog

## 0.1.0 — Unreleased

### Added

- Windows Electron control center for Paper and Spigot Minecraft servers.
- Structured server creation, rich server-property controls, lifecycle controls, local console, plugin installation, and shared CLI commands.
- Version-aware Java compatibility source for Paper and Spigot/BuildTools, including Java 8, 11, 16, 17, 21, and Paper 26.1+ Java 25 requirements.
- Automatic Java/Git detection, installation, retry status, and user-scoped portable fallback installation.
- Dedicated Java runtime manager with strict Paper/Spigot compatibility gaps, direct `--version` then `-version` probing, bounded configured/PATH/JAVA_HOME candidate discovery, explicit package-manager plans, configured-only portable source handling, and direct-argv launch preflight token rejection.
- Capability-first Minecraft Server Management Protocol transport: TLS-first JSON-RPC WebSocket discovery with `rpc.discover`, advertised-method allowlisting, and protected credential boundary.
- Version/flavor/capability Command Center registry with typed action families, source badges, tokenized Minecraft-only fallback, and high-impact confirmation metadata.
- Official Spigot metadata and BuildTools preflight source, safe workspace planning, structured flag composer, generated configuration preservation, plugin metadata inspection, and staged JAR rollback plan.
- Protected main-process credential-vault source for RCON and management-protocol credentials.
- Independent local desktop status destination and browser-local public-site status destination, both with explicit no-external-bridge boundaries and incomplete-evidence disclosure.
- Pages-ready public marketing source with `contract.js` loaded before its browser-local interaction engine.
- Windows-only GitHub Actions release workflow source for every push and manual dispatch: unsigned Squirrel.Windows packaging, artifact-set and `NotSigned` verification, safe package-evidence upload, line-count release notes, and a rerun-unique non-draft GitHub Release when the workflow reaches publication. The workflow intentionally has no test or lint jobs.
- Original vector application mark, multi-resolution Windows ICO, local executable icon wiring, and immutable Squirrel icon metadata source.

### Fixed

- Route CLI `command` and `stop` through a one-shot protected Electron gateway that fixes RCON to loopback, keeps the password out of CLI arguments, environment variables, registry JSON, and output, and fails closed to desktop configuration recovery.
- Reject `mss config --set rcon.password=...` and omit legacy RCON password fields from CLI JSON output.
- Normalize `rpc.discover` descriptors before persistence, bind the stored allowlist to its endpoint, expire it after a bounded lifetime, and restore it only when a reconnect targets the same current endpoint.
- Keep a protected management credential out of the generic WebSocket transport, show the provider-adapter-required state, and disable authenticated protocol routes until a documented provider-specific adapter exists.

Commit link: pending the consolidated implementation commit.
