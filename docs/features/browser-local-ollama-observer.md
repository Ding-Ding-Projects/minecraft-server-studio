# Browser-local Ollama observer

The public Minecraft Server Studio marketing page includes a deliberately narrow Ollama observation surface. It is a browser-only convenience for reading a local service after a visitor asks for that read. It is not the desktop application's complete local Ollama suite manager, a remote-control bridge, or a general browser-to-machine access channel.

## Exact request boundary

The observer makes no request when the page loads, when the browser restores a tab, when a visitor changes a setting, when a snapshot is read from browser storage, or on a timer. A request begins only after a visitor selects **Refresh local Ollama**.

The refresh flow has one literal origin and three permitted reads:

| Request | Normalized result | Purpose |
| --- | --- | --- |
| `GET http://127.0.0.1:11434/api/version` | Local service version summary | Determine whether the fixed local API responded with accepted version data. |
| `GET http://127.0.0.1:11434/api/tags` | Installed-model summary | Show a bounded local list of models the service reports as installed. |
| `GET http://127.0.0.1:11434/api/ps` | Running-model summary | Show a bounded local list of models the service reports as loaded. |

There is no editable endpoint, hostname, port, path, proxy, redirect destination, token, account, cloud fallback, request body, or background poll. The page does not follow a response into another request target. A visitor cannot use this surface to reach a LAN host, a public service, a desktop command channel, or an arbitrary URL.

## Bounded data handling

Each allowed read uses a bounded abort timeout. Before the page renders a result, it checks the HTTP outcome, fixed response URL, declared and actual response bytes, JSON shape, field text limits, and collection limits. A malformed, oversized, unexpected, or incomplete response is rejected as a whole; the page never exposes raw payloads or combines a partial result with fresh-looking state.

A successful refresh may save only a bounded normalized last-success snapshot in `sessionStorage` for the current browser session. It contains the displayable non-secret service version and observation time plus, for each installed or running model, only its safe name, size, VRAM size, modification or expiry timestamp, family, parameter-size label, and quantization label. It never retains raw response bodies, headers, tokens, prompt or chat content, local paths, credentials, browser request errors, model digests, or visitor-selected endpoint data. The snapshot is labelled stale until another refresh is accepted and is not proof that the local service or any model is available now.

## Truthful states

| State | Exact meaning |
| --- | --- |
| Not checked | This page has not made an Ollama request. |
| Refreshing | A visitor-triggered request to the fixed allowlist is in progress. |
| Local service healthy | The permitted reads returned accepted, bounded data. |
| Local service unavailable | The browser could not complete the fixed local read. The page does not guess whether Ollama is absent, stopped, or otherwise unreachable. |
| Browser or CORS blocked | The browser made no readable local response available. This can mean CORS, mixed-content or privacy blocking, or an unavailable local runtime; the page cannot distinguish or bypass those conditions. |
| Browser capability unsupported | The browser lacks a required request or cancellation capability. |
| Local response rejected | A response arrived but failed status, content, size, or JSON validation. |

The observer does not turn a blocked, unavailable, unsupported, or rejected result into a healthy state. It keeps any prior last-success data separate and visibly stale.

## Local search without extra requests

Installed and running model summaries each have browser-local plain-text search with a regex route. Those filters run only against the accepted bounded snapshot already held by the page. They do not issue an Ollama request, query a catalog, change a model, or create a search history outside browser-local state.

## Visible browser-only limits

The public surface keeps these capabilities visibly unavailable and states that the limitation belongs to the browser-only boundary:

- Model Store catalog and variant discovery;
- pull or download operations;
- chat or generation;
- delete and copy operations;
- hardware-fit assessment; and
- harness profile registration or launch.

The page does not simulate any unavailable feature with sample models, fabricated availability, an arbitrary command, a hidden desktop handoff, or a cloud request. Those operations require independently implemented desktop application workflows with their own safety, privacy, and runtime evidence.

## Privacy and failure behavior

The browser observer has no account, sign-in, analytics, token collection, credential storage, telemetry, remote model service, or general local-network setting. It does not upload its snapshot. A browser-or-CORS-blocked result is shown as a non-bypassable boundary rather than as a request to weaken policy or use a proxy. A rejected response remains rejected rather than being shown as a model list.

## Verification boundary

This documentation records a source-level fast-delivery lane. Tests, linting, independent review, build, package, live browser interaction, packaged-runtime interaction, and captures were not run in this lane. The page's public-source completeness inventory must continue to show localization, automated tests, interaction evidence, and capture evidence as incomplete until they are separately obtained.

This observer is not evidence that Ollama is installed, that browser CORS permits access on a particular computer, that any model can run, or that a complete Model Store, pull, chat, delete, copy, hardware-fit, or harness workflow exists.

## Suggested articles

- [Local Ollama suite foundation](local-ollama-suite.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
- [Shared Status Hub bridge](shared-status-hub-bridge.md)
