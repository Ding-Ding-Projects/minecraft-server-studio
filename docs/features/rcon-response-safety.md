# RCON response safety

## Behavior

Desktop RCON command responses cross the main-process boundary as a versioned `rcon-response` envelope, not as a raw response string. The main process applies the shared response-safety helper before IPC returns any text. The renderer accepts only that envelope shape, applies the same generic credential-pattern and byte-bound processing again, and writes the result with `textContent` to the local console.

The displayed response carries a factual marker when its contents changed:

- `[redacted]` means the current protected RCON password, its URL-encoded form, or a credential-shaped value was removed.
- `[sanitized]` means unsafe control or bidirectional formatting characters were neutralized.
- `[truncated]` means the response presentation was reduced to the 64 KiB UTF-8 display limit.

An unexpected IPC value is withheld rather than coerced into a renderer-visible string. The console then shows the safety markers and an empty-response state.

## Configuration

There is no setting that weakens this boundary. RCON remains opt-in, loopback-only in the desktop route, and its password is read from the operating-system protected credential vault only for the connection that needs it. The response helper receives that current password in the main process solely to remove any echo before IPC.

## Failure modes

- A response frame above 256 KiB, an accumulated RCON buffer above the bounded allowance, or an invalid packet is rejected with a generic safe error before renderer notification.
- A normal response above 64 KiB may be read only up to the transport frame limit, then is reduced to the display limit and marked `[truncated]`.
- A malformed or legacy IPC return is not rendered as text; it becomes a withheld, marked response instead.
- RCON connection, timeout, and authentication errors are sanitized with the same helper before the renderer notification path receives them.

## Security considerations

The helper removes the exact current RCON password before it leaves the main process, including a URL-encoded occurrence. It also redacts common assignment, JSON-like, bearer/basic authorization, URI-userinfo, and query-string credential patterns. It does not log the source response, the password, a password-derived value, or an unbounded error string.

The desktop console and its in-memory log receive only the safe envelope text. The redacted local-history and export foundation intentionally does not journal or export RCON response text. If a later record or export route adds RCON response content, it must consume the same safe envelope rather than the network response. The helper does not change RCON transport, server settings, vault storage, or CLI behavior.

## Verification boundary

This fast-delivery lane did not run tests, linting, review, runtime interaction, capture, packaging, release, or deployment. The implementation and its documentation are source-level only until a later delivery pass exercises the real RCON route and its malformed, redacted, and oversized response states.

## Suggested related articles

- [Server orchestration](server-orchestration.md)
- [Command Center registry](command-center.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
