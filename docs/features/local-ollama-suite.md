# Local Ollama suite foundation

Minecraft Server Studio has a deliberately narrow, local-only Ollama foundation. It lets the desktop application check the fixed local Ollama service and show bounded inventories of models already installed or currently running. It does not yet implement the complete Model Store, a pull cart, chat, hardware-fit decisions, or harness launch.

## What the foundation does

The main process owns every Ollama request. The renderer never receives a network endpoint, an authentication token, a raw response body, or permission to issue arbitrary requests.

The only permitted target is `http://127.0.0.1:11434`. The foundation uses these documented local API reads:

| Local API read | Desktop result |
| --- | --- |
| `GET /api/version` | Local service version and health evidence. |
| `GET /api/tags` | Bounded inventory of models installed in the local runtime. |
| `GET /api/ps` | Bounded inventory of models currently loaded by the local runtime. |

The main-process manager lives in `src/main/ollama-suite-manager.cjs`. It validates the fixed loopback target, bounds and normalizes JSON before deriving renderer-safe summaries, and rejects malformed or unexpected local API responses. Its narrow renderer boundary is exposed through `window.studio.ollamaStatus()` and `window.studio.refreshOllama()`, backed by `studio:ollama-status` and `studio:refresh-ollama` IPC handlers. The desktop uses the `ollama-suite` event and the **Local Ollama** destination (`panel-ollama`) to refresh and render that state.

The destination includes a **Refresh local Ollama** action. Installed and running inventories offer plain-text-first searching and an inline route to the attached regex builder. The refresh action is a local API read; it does not download, pull, create, delete, copy, generate from, or chat with a model.

## Truthful service states

The user-visible state is intentionally small and factual:

| State | Meaning |
| --- | --- |
| `Checking local service` | A bounded main-process request is in progress. |
| `Local service healthy` | The fixed local API accepted a valid response. |
| `Local service unavailable` | The local API did not accept a connection; Ollama may be stopped or not installed. The application does not pretend it distinguished those cases. |
| `Local API offline` | A local request could not complete because the local service was unreachable. |
| `Local API response rejected` | The local service responded, but the response did not satisfy the bounded expected shape. |

The app keeps the last valid summary only as an explicitly stale local observation. It never turns stale data into a claim that a model is installed, running, compatible, or ready now.

## What remains unavailable

The Local Ollama destination keeps the following capabilities visible but disabled with their exact capability gap:

- **Model Store catalog:** unavailable until the app implements complete official-catalog pagination, revision/age evidence, and variant-level completeness.
- **Pull cart:** unavailable until bounded local pulls, space disclosure, progress, cancellation, retry, and durable partial outcomes exist.
- **Chat:** unavailable until streamed local sessions, model-parameter validation, history, exports, resource bounds, and capability-gated attachments exist.
- **Harness launch:** unavailable until registered allowlisted profiles, semantic executable selection, preflight, reviewable launch previews, snapshots, and rollback exist.

The app never invents model names, variants, tags, hardware-fit results, catalog entries, or command lines to make any unavailable surface look complete.

## Configuration and privacy

There is no user-configurable endpoint, cloud proxy, account, token, authentication prompt, or arbitrary shell command in this foundation. Requests are restricted to numeric IPv4 loopback on the fixed local port. The renderer receives only the normalized status and bounded inventory information required by the destination.

The local API defaults documented by Ollama are the basis for this boundary: the service is commonly exposed at `http://localhost:11434/api`, and its documented version, installed-model, and running-model reads are `/api/version`, `/api/tags`, and `/api/ps`. This app deliberately narrows the address further to `127.0.0.1` so it never follows a hostname, proxy, redirect, or remote endpoint. See Ollama’s [API introduction](https://docs.ollama.com/api/introduction), [version endpoint](https://docs.ollama.com/api-reference/get-version), [installed-model endpoint](https://docs.ollama.com/api/tags), and [running-model endpoint](https://docs.ollama.com/api/ps).

No secret, environment value, raw model payload, local path, prompt, conversation, or response body is deliberately copied into renderer state, local status history, exports, logs, or documentation by this foundation.

## Failure and recovery behavior

| Situation | Desktop behavior | Recovery route |
| --- | --- | --- |
| Ollama is not installed or is stopped | Show **Local service unavailable** without guessing which condition applies. | Start or install Ollama through its official local installation route, then use **Refresh local Ollama**. |
| Local API is offline | Preserve the last valid summary as stale and show **Local API offline**. | Restore the local service and refresh; no remote fallback is attempted. |
| Local API returns malformed or over-bounded data | Reject the response and show **Local API response rejected**. | Refresh after the local service is healthy; no partial raw response is applied. |
| No models are installed or running | Show an honest empty inventory. | The future pull capability remains disabled until it is implemented; the foundation does not substitute a web catalog or shell command. |

## Verification boundary

This article documents the planned bounded local foundation that is integrated with its source lane. During the active speed-delivery workflow, tests, linting, type checks, independent review, package production, runtime interaction, built-artifact interaction, and captures were intentionally not run or claimed. The `ollama` completeness-inventory row remains incomplete until its own localization, focused test, built-artifact interaction, capture, and evidence records are independently verified.

This foundation is not evidence that an Ollama service exists on a device, that any listed model can run successfully, or that any future Model Store, pull, chat, or harness workflow has shipped.

## Suggested articles

- [Local status and desktop completeness](local-status-and-completeness.md)
- [Presentation settings and shared School mode](experience-settings.md)
- [Automatic dependency bootstrap](dependency-bootstrap.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
