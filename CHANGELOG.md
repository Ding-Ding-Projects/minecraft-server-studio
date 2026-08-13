# Changelog

## 0.1.0 — Unreleased

### Added

- Windows Electron control center for Paper and Spigot Minecraft servers.
- Structured server creation, rich server-property controls, lifecycle controls, local console, plugin installation, and shared CLI commands.
- Version-aware Java compatibility source for Paper and Spigot/BuildTools, including Java 8, 11, 16, 17, 21, and Paper 26.1+ Java 25 requirements.
- Automatic Java/Git detection, installation, retry status, and user-scoped portable fallback installation.
- Dedicated Java runtime manager with strict Paper/Spigot compatibility gaps, direct `--version` then `-version` probing, bounded configured/PATH/JAVA_HOME candidate discovery, explicit package-manager plans, configured-only portable source handling, and direct-argv launch preflight token rejection.
- Typed Paper JAR CLI profile with direct post-`-jar` argument planning, explicit bounded `--help`/`--version` evidence collection, inside-server configuration/plugin/PID paths, world and network overrides, bootstrap/console/JFR controls, a read-only argv preview, and disabled world-changing upgrade/cache/region flags until an exact destructive-confirmation preflight is wired.
- Persistent app-managed Java runtime inventory and official Adoptium metadata fallback for supported Windows JDK features, with architecture/type selection, provider size and SHA-256 validation, staged direct-argument extraction, startup revalidation, and no-shell recovery behavior.
- Windows unsigned-update controller for the fixed approved public latest-release Squirrel.Windows feed, usable only from a packaged Windows install. It distinguishes unconfigured, disabled, idle, checking, current, available, downloading, ready, offline, and failed states; validates `RELEASES` before Electron update events, never claims code signing, and requires a user-selected restart.
- Local file-converter foundation with a native source picker, bounded byte-signature and text-shape inspection, an app-private persistent inspection queue, and a visible eight-category adapter catalog. Every current conversion adapter remains disabled with its exact missing bundled-engine reason; no source conversion, shell launch, PATH discovery, network request, or remote tool is claimed.
- Capability-first Minecraft Server Management Protocol transport: TLS-first JSON-RPC WebSocket discovery with `rpc.discover`, advertised-method allowlisting, and protected credential boundary.
- Version/flavor/capability Command Center registry with typed action families, source badges, tokenized Minecraft-only fallback, and high-impact confirmation metadata.
- Explicit Command Center runtime discovery: bounded direct selected-JAR `--help`/`--version` probes; user-selected, provenance-bearing local-console and protected loopback-RCON `help`/`plugins`/Paper `paper` evidence; live-command origin, version/flavor, capability, permission, risk, and truthful raw-token fallback states. Plugin descriptor commands now remain non-executable until the running server confirms them.
- Official Spigot metadata and BuildTools preflight source, safe workspace planning, structured flag composer, generated configuration preservation, plugin metadata inspection, and staged JAR rollback plan.
- Protected main-process credential-vault source for RCON and management-protocol credentials.
- Lossless, comment- and unknown-key-preserving `server.properties` updates with line-ending retention and atomic same-directory writes.
- Minecraft 1.21.9+ gamerule delivery states for `pvp`, `allowEnteringNetherUsingPortals`, `spawnMonsters`, `commandBlocksEnabled`, and `spawnerBlocksEnabled`, using serialized local-console or configured RCON command routes instead of obsolete server-property keys.
- Bounded local plugin JAR safety plans with ZIP signature, SHA-256, manifest and descriptor inspection, dependency/alias/cycle checks, active-server staging, stopped-server atomic promotion, and local rollback records.
- Bounded local directory-snapshot backups for world, configuration, plugin JAR/configuration, logs, and `server.jar`, with free-space preflight, manifest hashes, local save acknowledgement for running managed servers, and explicit restore confirmation.
- Explicit stopped-server Paper stable-update and retained-JAR rollback source using official Downloads Service metadata, reviewed byte size/SHA-256, local staging, pre-replacement backup, and plugin-update exclusion.
- Independent local desktop status destination and browser-local public-site status destination, both with explicit no-external-bridge boundaries and incomplete-evidence disclosure.
- Optional desktop Status Hub bridge contract with HTTPS-only endpoint rules, protected enrollment/session credentials, explicit connection states, local-status fallback, and no claim of external registration, updates, inbox polls, or replies until each action receives an accepted transport response.
- Pages-ready public marketing source with `contract.js` loaded before its browser-local interaction engine.
- Windows-only GitHub Actions release workflow source for every push and manual dispatch: unsigned Squirrel.Windows packaging, artifact-set and `NotSigned` verification, safe package-evidence upload, line-count release notes, and a rerun-unique non-draft GitHub Release when the workflow reaches publication. The workflow intentionally has no test or lint jobs.
- Original vector application mark, multi-resolution Windows ICO, local executable icon wiring, and immutable Squirrel icon metadata source.
- Desktop presentation-settings foundation: persisted English, playful Hong Kong-style Cantonese, and bilingual modes; independent 1–5 message-playfulness levels; optional decorative dialog/message emoji; a display-name label that preserves installed identity; and a watched shared local School-mode record with protected password/PIN unlock storage and honest unavailable-state handling.
- Local Ollama suite foundation: a fixed-loopback, main-process-only version/installed-model/running-model inventory with bounded response normalization, explicit local-service status, and an honest disabled boundary for Model Store catalog, pull, chat, and harness-launch workflows.

### Fixed

- Route CLI `command` and `stop` through a one-shot protected Electron gateway that fixes RCON to loopback, keeps the password out of CLI arguments, environment variables, registry JSON, and output, and fails closed to desktop configuration recovery.
- Reject `mss config --set rcon.password=...` and omit legacy RCON password fields from CLI JSON output.
- Normalize `rpc.discover` descriptors before persistence, bind the stored allowlist to its endpoint, expire it after a bounded lifetime, and restore it only when a reconnect targets the same current endpoint.
- Keep a protected management credential out of the generic WebSocket transport, show the provider-adapter-required state, and disable authenticated protocol routes until a documented provider-specific adapter exists.
- Redact and byte-bound desktop RCON responses before IPC, reject malformed response envelopes in the renderer path, and visibly label redacted, sanitized, or truncated console output instead of silently changing it.

Commit link: pending the consolidated implementation commit.
