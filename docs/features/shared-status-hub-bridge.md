# Shared Status Hub bridge

Minecraft Server Studio can expose a deliberately narrow, opt-in bridge from its desktop status destination to a separately operated Status Hub. `src/main/shared-status-hub-client.cjs` owns this bridge; `src/main/desktop-status-model.cjs` remains the pure local-only status model. The bridge is not enabled by default, does not create an external session on application startup, and does not grant the Hub any server-management or command-execution authority.

The desktop's local status destination remains useful when no bridge exists. It continues to show local operations, local evidence, next steps, and the incomplete completeness inventory without requiring an endpoint, account, network connection, or external service.

## Explicit connection states

The bridge reports one of the following states instead of inferring success from configuration or a network attempt:

| State | Meaning | Local-status behavior |
| --- | --- | --- |
| `unconfigured` | No external Hub session has been accepted for this app. This covers both no endpoint and an endpoint saved but awaiting an explicit **Connect** action. No external request is made until Connect. | Local status remains the only status destination. |
| `credential-unavailable` | The bridge has configuration, but its protected credential store is unavailable or lacks the required enrollment token. No request is made with a substitute value. | Local status remains available and names the credential boundary. |
| `connecting` | The main process has started a bounded registration or reconnection request. This is not a connected claim. | Local status remains available while the request is pending. |
| `connected` | The bridge received and validated an accepted registration or reconnection response. A later update or inbox poll still needs its own accepted response before it is reported as delivered. | Local status remains the fallback and records only safe bridge state. |
| `failed` | Validation, timeout, network, authentication, or response-schema handling failed. The exact safe error category is retained without exposing secrets or raw response bodies. | Local status remains available; the application does not silently retry without bounds or pretend delivery occurred. |

An external registration, status update, inbox poll, or reply delivery is never claimed merely because the bridge was configured, a request was started, or a socket opened. Each action needs its own accepted and validated transport response.

## Endpoint and transport boundary

The bridge accepts an HTTPS endpoint only. HTTP is permitted solely for an explicitly enabled development route using the exact numeric loopback host `127.0.0.1` or `::1`; DNS names that happen to resolve to loopback are not accepted. Ordinary LAN, public, redirected, or credential-bearing HTTP URLs are not an alternative. The bridge never treats an endpoint embedded with a user name, password, or access token as valid configuration.

All bridge traffic is created by the privileged Electron main process. The renderer does not receive an enrollment token, bearer token, session key, or a form that accepts one. Only after an eligible endpoint and an enrollment token are both available through the protected credential-vault boundary does the main process generate a fresh session key and store it through `CredentialVault`; the Status Hub contract does not return that key. It is treated as a protected secret rather than normal application state.

The renderer may send a validated non-secret endpoint setting through narrow IPC. Enrollment credentials are never accepted by that IPC route. The client uses the documented Hub API operations: `POST` for registration, `PATCH` for a status update, and `GET` for replies. Those requests remain main-process operations, and each one requires its own accepted response before the application reports a delivered result.

The bridge sends only a bounded status projection needed for the selected session. It is not a general desktop telemetry channel, remote desktop protocol, Minecraft server API, RCON route, command executor, file-transfer facility, or chat-injection mechanism.

## Replies and local privacy

An inbox poll is an opt-in, bounded transport action. The main process validates the response before deriving a small safe state update. Raw Hub replies, response envelopes, credentials, session keys, and authentication headers never enter the renderer, local status history, completeness evidence, exports, diagnostics, or application logs.

The bridge does not claim that a response has appeared in a coding chat. A reply is only available to an agent-side bridge after that bridge has actually polled, accepted, and delivered a validated inbox item through its own authorized path.

## Failure and recovery

- Review the exact displayed connection state before retrying. `connecting` and `failed` are not evidence of delivery.
- Correct an invalid endpoint in the non-secret bridge settings rather than placing credentials in a server record, renderer form, or command argument. The endpoint travels through narrow IPC; enrollment credentials are never accepted there.
- Restore protected credential storage before retrying `credential-unavailable`; the app never falls back to plaintext storage or an environment value copied into the renderer.
- If the bridge remains unavailable, keep using the local status destination. Local server setup, lifecycle operations, and the completeness inventory do not depend on the Hub.
- A user can intentionally remove the bridge configuration. That returns the bridge to `unconfigured` and preserves the local-only status experience.

## Completeness and verification

The bridge has its own desktop completeness-inventory record. It cannot make the overall desktop inventory complete by itself: localization, tests, built-artifact interaction, and real capture evidence are separate required proof records. The current speed-delivery pass does not claim tests, linting, review, runtime interaction, built-artifact capture, package verification, or a real external registration/update/poll/reply acceptance for this feature.

## Suggested related articles

- [Local status and completeness](local-status-and-completeness.md)
- [Server lifecycle and Paper/Spigot setup](server-orchestration.md)
- [Automatic dependency installation](dependency-bootstrap.md)
