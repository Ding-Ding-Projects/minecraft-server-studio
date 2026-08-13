# Configuration and plugin safety

Minecraft Server Studio keeps a server definition in local application data, but it treats the server folder as the source of truth for server-owned files. The desktop application never rewrites a player-list JSON file: access-list and operator changes remain Minecraft command operations.

## Preserving `server.properties`

The application parses `server.properties` as a bounded line model before it changes a GUI-managed property. Comments, blank lines, unknown keys, separator style, byte-order mark, final-newline state, and the existing LF or CRLF convention are retained. The updater changes only known property keys requested by the current settings save, and it writes the completed file through a same-directory temporary file followed by an atomic rename. When a validated Paper JAR CLI profile explicitly supplies `-c`, that inside-server properties path is the file the same bounded writer updates; an empty profile field retains the normal server-root `server.properties` path.

This design deliberately does not turn unknown settings into defaults, sort the file, remove comments, or silently move third-party keys. If the file is malformed beyond its size and text bounds, the application leaves it unchanged and reports the safety boundary.

RCON passwords remain outside the local server registry. When RCON is enabled and a protected vault value is available, the main process materializes it only into the managed `server.properties` update that Minecraft itself needs. The stored registry value stays blank.

## Current game rules

Minecraft Java Edition 1.21.9 moved several settings out of `server.properties` and into live game rules: `pvp`, `allowEnteringNetherUsingPortals`, `spawnMonsters`, `commandBlocksEnabled`, and `spawnerBlocksEnabled`. Minecraft Server Studio exposes those five switches as **Minecraft 1.21.9+** controls rather than obsolete property keys. The source of this compatibility boundary is Mojang’s [Minecraft Java Edition 1.21.9 release note](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-9), which also documents the removal of the former `pvp`, `allow-nether`, `spawn-monsters`, and command-block property forms.

Each game-rule state is saved locally with the selected target version and an honest delivery state:

- **Sent to local console** means the managed local Java process received a serialized `gamerule <name> <boolean>` command. The console output remains the server-side confirmation record.
- **Sent through RCON** means the same bounded command sequence was sent one at a time through the vault-backed RCON route.
- **Saved for next managed start** or **saved locally only** means no compatible live transport was available. The request remains a saved intent, not a claim that an offline world has changed.
- **Target version is too old** means the selected server is below 1.21.9, so the application retains the requested value but does not send an unsupported command.

The generic management protocol is intentionally unavailable for these switches until `rpc.discover` supplies an exact descriptor-backed parameter schema. The app does not synthesize an undocumented management request or bearer handshake. This preserves the protocol’s capability-first boundary while local-console and protected RCON delivery remain available where configured.

## Local plugin JAR plans

The Plugins tab accepts only a user-selected local `.jar`; it never searches for, downloads, or silently acquires a third-party plugin. Before it copies anything, the app creates a bounded local plan:

1. Reject symlinks, non-regular files, oversize archives, encrypted ZIP entries, ZIP64 archives, duplicate descriptors, unsafe archive names, and malformed ZIP structures.
2. Verify the JAR’s standard ZIP signature, calculate a SHA-256 streamingly, and inspect only bounded root `plugin.yml`, `paper-plugin.yml`, and `META-INF/MANIFEST.MF` records.
3. Read plugin identity, version, `api-version`, required and optional dependencies, declared aliases, and load-order information. It recognizes both Bukkit-style and Paper plugin descriptors.
4. Compare the selected descriptor against installed identities and aliases, declared required dependencies, load-order cycles, destination-name collisions, the selected Paper/Spigot target, and a declared API version that is newer than the selected Minecraft version.

Paper documents `plugin.yml` dependencies, `softdepend`, `loadbefore`, aliases, and cycle hazards in its [plugin descriptor reference](https://docs.papermc.io/paper/dev/plugin-yml/). Paper-specific dependency declarations and cycles are documented in the [Paper plugin guide](https://docs.papermc.io/paper/dev/getting-started/paper-plugins/). The plan is intentionally conservative: a missing or uninspectable installed descriptor blocks a new install instead of pretending the dependency graph is complete.

Compatibility evidence is not a malware scan, code-signature trust decision, or a promise that the plugin will run. It records only the bounded descriptor evidence available locally and leaves third-party plugin safety with the operator and plugin author.

## Staging, promotion, and rollback record

When a managed server is stopped, a reviewed JAR is copied into its final `plugins` destination through a same-filesystem temporary file and atomic rename. Existing JARs are never overwritten. If the validated Paper JAR CLI profile supplies `-P`, that inside-server directory becomes the same plugin destination for inspection, dependency planning, staging promotion, and launch; a plugin JAR is never converted into a CLI token.

When the managed server is running, the reviewed JAR is copied instead to an app-managed staging directory outside `plugins`. It is not promoted into the live folder. The operator can choose **Promote staged plugins** once the process has stopped, and the next managed start also revalidates and promotes eligible staged JARs before Java starts. A staged JAR is re-inspected and SHA-256 checked before that atomic move; a new duplicate, dependency, cycle, or compatibility blocker prevents promotion and startup rather than replacing a file.

Every stage or promotion adds a local rollback record identifying the created plugin file and the fact that removing it is a later destructive action. The record does not delete the plugin automatically and never overwrites another plugin as a rollback shortcut.

## Failure modes and recovery

- A malformed, encrypted, oversized, ambiguous, or changed JAR is left outside the server plugin folder.
- A duplicate identity, alias conflict, missing required dependency, unsafe destination, declared incompatible API target, or cycle blocks the plan before a copy occurs.
- A separately running server without local-console or configured RCON delivery retains a game-rule request as saved intent only.
- A target below Minecraft 1.21.9 retains the request with a version-incompatible badge and does not send the new game-rule command.
- If promotion fails, the staged JAR remains outside `plugins` with its reason recorded; the existing server folder is not modified.

## Verification boundary

This fast-delivery change did not run tests, linters, reviews, builds, runtime interaction, or visual captures. The implementation, inventory, documentation, and local state labels deliberately distinguish saved intent, sent command, and unverified server-side effect.

## Suggested articles

- [Server orchestration](server-orchestration.md) for Paper/Spigot lifecycle behavior and RCON credentials.
- [Command Center](command-center.md) for the typed console-command surface.
- [Spigot BuildTools planning](spigot-buildtools.md) for separate server-JAR staging and rollback records.
