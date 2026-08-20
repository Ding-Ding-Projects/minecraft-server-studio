# Local server access records

Minecraft Server Studio can inspect and manage four local Minecraft access-record files for a server that already exists in the app-managed local server registry:

- `ops.json` for operators;
- `whitelist.json` for allowlist members;
- `banned-players.json` for player bans; and
- `banned-ips.json` for IP bans.

The Access records tab is a local file-management surface, not a remote-management or command-execution feature. It never sends a console command, uses RCON, invokes a management protocol, changes `online-mode` or whitelist properties, starts or stops Java, resolves a player name or UUID, queries a network service, or claims that a running server applied a changed record.

## Use the local records

Choose an existing managed local server, then select one of the four record lists. The tab shows whether the list is loaded from a validated local file, missing and therefore using an empty default, or unavailable because the existing file is malformed or cannot be read safely.

Missing access files stay absent until the user deliberately adds a record. They are not silently created during inspection. A malformed, unsupported, oversized, duplicated, or otherwise invalid file remains unchanged; the app reports an unavailable state instead of replacing the file with an empty list.

Plain-text search is the default. The adjacent anchored regex builder can search only the currently rendered bounded local list. It accepts a limited local pattern and flags, rejects malformed or risky expressions, shows a bounded local sample's live match and capture groups, and does not transmit a query or record content.

To add an operator, allowlist member, or player ban, supply both an existing player name and UUID. The app does not derive either value from a name, generate an identity, or contact a player directory. To add an IP ban, supply an IPv4 or IPv6 literal; host names and DNS lookups are not accepted. Operator level, player-limit bypass, optional ban reason, and optional expiration are typed local fields with bounded validation.

Removing an operator or allowlist entry, or unbanning a player or IP, requires the app's two acknowledgements and full authorization slider. The server-side request also binds that confirmation to the reviewed local record through a current authority digest, so a changed selection cannot reuse an earlier confirmation.

## Running and stopped consequences

The tab always reports the app-managed process state for the selected server.

- **Stopped:** a successful record change updates only the validated local JSON file. The server can read the changed record at its next start.
- **Running:** a successful record change still updates only the validated local JSON file. The app does not send a reload, whitelist, ban, unban, op, deop, or other live command, and it does not claim the current process has applied the file.

The user can choose the server's own appropriate reload or restart path separately. This tab intentionally provides no shortcut that could make a local disk write look like a confirmed live moderation action.

## Storage, provenance, and history

Only the app-managed `serverPath` for the selected registry record is eligible. The implementation resolves the root, rejects traversal and symbolic-link escape routes, and selects from a fixed filename allowlist. It reads bounded JSON arrays through typed models and writes a replacement only with a same-directory atomic temporary-file rename.

The app-private local-history journal records only generic action metadata such as "Local server access record added" or "Local server access record removed." Player names, UUIDs, IP addresses, reasons, expiration values, raw file content, server paths, and credentials are intentionally omitted from history and its exports.

## Failure and security boundaries

- Choose a server already registered in the desktop app; arbitrary folders and filenames are not accepted.
- Repair a malformed or unsupported existing JSON file manually before using this surface. The app preserves it rather than guessing a replacement.
- Supply exact values yourself. The app never searches online, contacts Mojang, opens a socket, starts a process, or treats a record as proof that a player exists.
- A destructive-confirmation completion authorizes only the reviewed local deletion or unban record. It never authorizes another list, another server, a console command, or a live server operation.
- This feature does not read or write RCON passwords, protocol credentials, or other secrets.

## Verification boundary

This source-level delivery registers bounded local access-record models, IPC, renderer controls, local-history metadata, and documentation. The active fast-delivery workflow intentionally ran no tests, linting, review, build, package, server-process interaction, runtime validation, or screen captures. Those evidence records remain pending.

## Suggested related articles

- [Server orchestration](server-orchestration.md)
- [Configuration and plugin safety](configuration-and-plugin-safety.md)
- [RCON response safety](rcon-response-safety.md)
- [Local history and safe exports](local-history-and-safe-exports.md)
