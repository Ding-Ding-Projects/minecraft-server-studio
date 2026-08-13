# Backups and Paper updates

## What the desktop app does

The **Backups + updates** tab provides two deliberately local workflows:

1. A bounded directory-snapshot backup for a selected Paper or Spigot server.
2. A stopped-server-only Paper `server.jar` update and retained-JAR rollback flow.

The app never treats this as a background auto-updater. A person prepares a current preview, reads the affected resources, and starts each operation explicitly.

## Local snapshot contents

The backup preview inventories these managed resources when they exist:

- the configured primary world plus its `_nether` and `_the_end` companion directories;
- server configuration files such as `server.properties`, `eula.txt`, Paper/Bukkit/Spigot configuration, access lists, and `config/`;
- plugin JARs and plugin-owned configuration beneath `plugins/`;
- `logs/`; and
- the currently selected `server.jar`.

Snapshots are stored below the app's private server-data directory in a timestamped directory. The app copies into a unique temporary directory, writes a JSON manifest with per-file SHA-256 values, then promotes the complete directory with a single local rename. A manifest records file category, relative path, byte size, hash, snapshot time, restore instructions, and the credential boundary.

The snapshot does not read, copy, or serialize the app credential vault. The vault is outside the server backup roots, and the backup module does not receive a credential-vault handle.

## Capacity and path safeguards

Before a snapshot can run, the preview enumerates the selected state, estimates its byte size, checks available destination space with a headroom allowance, and refuses a plan that exceeds the bounded file-count or total-byte limits. The module refuses symbolic links at every selected source path so a snapshot cannot follow a link outside the chosen server home. It also refuses unsupported file kinds and unsafe restore paths.

The app recalculates the inventory immediately before copying, so a preview cannot claim a backup completed after its source files became unavailable. An incomplete or corrupt snapshot directory is not offered as a restore candidate.

## Consistency for a running local server

When the server is stopped, a snapshot can proceed after normal preflight.

When the server is running under Minecraft Server Studio's local process manager, the app sends `save-all` and waits for a local output acknowledgement such as the server's saved-game message. It refuses the consistency-sensitive backup if the local process cannot accept the command, stops, errors, or does not acknowledge the save within the bounded wait. The flow does not claim that an RCON command or an unobserved shell command saved the world.

The log collection is forensic state, not a claim of a globally atomic log stream. The manifest is explicit that consistency is based on the stopped state or the observed local `save-all` acknowledgement.

## Restore behavior

Restore is intentionally destructive and requires all of the following:

- the selected server must be stopped;
- the app must prepare a current restore preview for a complete local snapshot;
- the preview lists the managed top-level roots that will be replaced;
- the user must operate both independent confirmation controls and move the authorization slider to its full value; and
- the app must create a new pre-restore snapshot before it replaces anything.

Restore stages and hash-checks every manifest file inside a server-local control directory before replacing roots. Existing managed roots move into that local staging area first; if a move fails, the app attempts to return previously moved roots and retains the staging directory for manual recovery rather than silently deleting it. Restoring a snapshot that contains `server.jar` clears a previously recorded Paper rollback reference because the old reference may no longer match the restored server state.

## Official Paper update flow

The update preview uses PaperMC's documented Downloads Service v3 endpoint for the selected Minecraft version. It selects only a `STABLE` build and requires the official `server:default` download URL, SHA-256 value, and byte size. The implementation rejects non-HTTPS metadata and data URLs, redirects, missing checksums, unexpected hostnames, and out-of-bound JAR sizes.

The flow is available only for a stopped Paper server with an existing local `server.jar`. It does this in order:

1. prepares and validates a new local backup plan;
2. requires the destructive confirmation controls;
3. creates the required pre-update backup;
4. downloads the reviewed JAR into a server-local staging directory using a direct HTTPS stream;
5. verifies the exact byte count, SHA-256 value, and JAR/ZIP signature;
6. atomically moves the old `server.jar` into the app-controlled rollback directory; and
7. atomically promotes the staged JAR to `server.jar`.

If promotion fails after the previous JAR moved, the implementation attempts to restore that prior JAR and leaves the rollback directory available for recovery. The update flow never runs a shell, never replaces a running JAR, and never downloads, upgrades, reloads, or replaces plugins.

The retained previous JAR appears as a separate rollback preview. Rollback is also stopped-server-only, backup-first, hash-checked, and behind the same two confirmations plus full slider. It preserves the replaced JAR as the next rollback record rather than discarding it.

## Failure modes and recovery

- **No source files or insufficient free space:** the preview is blocked with the exact resource limit or capacity reason.
- **Symbolic link or unsupported source:** the snapshot is refused so it cannot escape the server folder.
- **No local save acknowledgement:** a running-server backup is refused; stop the server and prepare a new preview.
- **Manifest or payload mismatch:** the backup remains unavailable for restore; the app does not guess or partially restore it.
- **Paper metadata or download mismatch:** the existing JAR is unchanged and the user must prepare a new preview when the official service becomes available.
- **Rollback record missing:** the rollback control stays unavailable with that reason; a complete backup restore may still be prepared separately.
- **Restore move failure:** the app retains the server-local staging area for recovery and reports the failure instead of discarding moved state.

## Security and privacy boundary

All filesystem work is bounded and local. The module uses direct Node filesystem APIs and direct HTTP streaming; it never constructs an operating-system shell command. It rejects symbolic-link sources, validates manifest paths and hashes, keeps update staging inside an app-controlled directory below the selected server folder, and only accepts the official Paper HTTPS data host after the official metadata preflight.

Backup and update records are local app data. They are not an export, telemetry payload, credential vault copy, or cloud synchronization mechanism.

## Verification status

This feature was implemented in the active fast-delivery pass. Tests, linting, type checks, runtime interaction, packaging, independent review, and screenshots were intentionally not run in that pass. The desktop completeness inventory records those evidence states as pending rather than verified.

## Suggested articles

- [Server orchestration](server-orchestration.md)
- [Spigot BuildTools planning](spigot-buildtools.md)
- [Version-aware Java runtime and launch profiles](java-runtime-and-launch.md)
- [Local status and completeness](local-status-and-completeness.md)
