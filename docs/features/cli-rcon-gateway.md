# CLI RCON gateway

The `mss command <server-id> <Minecraft command>` and `mss stop <server-id>` routes send one Minecraft command through a short-lived Electron main-process gateway. The Node CLI never reads or accepts the RCON password.

## Configuration

Before using either route:

1. Open Minecraft Server Studio under the same Windows account that will run the CLI.
2. Select the local server profile and enable RCON in the Network tab.
3. Save the RCON password in that tab so the desktop app stores it through its protected credential vault.
4. Start the local server, then run `mss command` or `mss stop` from the default desktop registry.

`stop` is the ordinary serialized Minecraft `stop` command sent through this same route. It never terminates a process directly.

The gateway reads only the credential key derived from the selected server ID, fixes the network destination to `127.0.0.1`, validates the persisted RCON port, sends direct RCON packets, bounds the request and response, redacts credential-shaped response text, and exits. It creates no application window.

## Credential boundary

The CLI has no password flag or password prompt. It does not read an RCON password from environment variables, stdin, `servers.json`, command arguments, exports, or history. `mss config --set rcon.password=...` is rejected before it reaches the server registry. If an older registry contains that field, CLI JSON output omits it.

The Node CLI passes only a bounded server ID, data-directory selection, and Minecraft command to the child process through a bounded local standard-input message. The child is launched with an environment allowlist that excludes CLI configuration and RCON credential variables. Electron's protected storage decrypts the credential only in the one-shot main process, which sends it directly to the loopback RCON socket and never returns it to Node.

`command` and `stop` use only the desktop app's default local registry. A custom `MSS_DATA_DIR` is deliberately rejected for these operations because it has no explicit protected-vault profile binding. Other local CLI operations retain their existing data-directory behavior.

## Failure and recovery

The route fails closed when any of these conditions is true:

- Electron's local runtime cannot start the gateway.
- The selected profile is absent from the desktop registry or is not a local server profile.
- RCON is disabled, the desktop marker says no protected credential was configured, or protected storage cannot read it.
- The RCON port is invalid, the loopback server is not running, authentication is rejected, or a bounded response does not arrive in time.

Each failure names a desktop configuration or local-server recovery action. The CLI never asks for a password as a fallback and never enables remote RCON routing.

## Security considerations

The child process uses direct executable invocation with `shell: false`, uses fixed `127.0.0.1` networking, and rejects control characters in commands. The gateway ignores raw registry password fields and consumes only the protected vault entry under the current Windows user context. RCON response text is untrusted and is redacted and bounded before the CLI prints it.

This design does not change the desktop renderer's separate RCON response presentation. That surface remains outside the CLI gateway scope and needs its own focused hardening before it can claim the same response-redaction boundary.

## Verification boundary

This feature was implemented during the active speed-delivery workflow. Tests, linting, review, runtime interaction, package production, and captures were intentionally not run for this lane. The source documents the no-password boundary and fail-closed gateway flow; it is not a claim that a live server or protected credential was exercised.

## Suggested related articles

- [Server orchestration](server-orchestration.md)
- [Command Center](command-center.md)
- [Local status and completeness](local-status-and-completeness.md)
