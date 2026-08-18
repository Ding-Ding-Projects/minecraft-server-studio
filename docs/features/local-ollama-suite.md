# Local Ollama suite

Minecraft Server Studio includes a deliberately narrow desktop-only Local Ollama suite. It talks only to the documented local Ollama API at the literal `http://127.0.0.1:11434` loopback origin. The Electron main process owns the connection; renderer code cannot choose an endpoint, host, port, method, path, proxy, token, request body, shell command, catalog URL, or cloud route.

The suite can inspect the local runtime and maintain one freshly observed installed model at a time. It is not a complete Model Store, chat client, hardware adviser, or harness launcher.

## Available local operations

| Desktop action | Fixed local API call | Guardrails |
| --- | --- | --- |
| Refresh local runtime | `GET /api/version`, `GET /api/tags`, `GET /api/ps` | Each response is bounded, normalized, and rejected as a whole when malformed. The UI receives only safe status and inventory fields. |
| Re-pull selected installed model | `POST /api/pull` with `{ model, stream: false, insecure: false }` | The model must be an exact name in a fresh installed-model observation. The app does not expose a free-form pull box or invent a catalog entry. |
| Copy selected installed model | `POST /api/copy` with `{ source, destination }` | The source must be a fresh exact installed observation. The destination is a bounded lowercase local model reference, not a URL or command. |
| Delete selected installed model | `DELETE /api/delete` with `{ model }` | The model must be freshly observed and pass a short-lived, selection-bound two-key confirmation plus full slider authorization. |
| Cancel active local request | Aborts the app's bounded request to the fixed local API | Cancellation is best effort. The app refreshes afterward because the local service may have completed work before noticing the closed request. |

The manager serializes mutating requests. A late inventory read cannot overwrite a newer operation state, and a second mutation is refused while one selected-model action remains active. Re-pull has a 15-minute hard request limit; copy and delete have shorter bounded limits. Every response body is capped before parsing. The local HTTP client has no redirect behavior and has no configured proxy or credential path.

## Selection, confirmation, and local records

Only local model names already returned by `GET /api/tags` appear in the selected-model picker. The main process repeats this freshness and exact-membership check before every re-pull, copy, and delete request. A stale or unavailable inventory cannot authorize a model change.

Deletion first creates a one-time in-memory review authority bound to the selected model and the current local observation. The renderer's existing destructive-action surface requires two independently operated confirmations and a slider at 100 percent. The main process verifies that short-lived authority before it sends the fixed `DELETE /api/delete` request; a changed, expired, reused, or mismatched selection is rejected.

Successful model maintenance actions add a redacted local-history event. The event records only that a selected local operation completed. It does not store model names, prompts, raw request or response bodies, paths, credentials, tokens, chat content, or service error text. Operation status and local-history events are app-private; they are not exported as raw service payloads or sent to a cloud service.

## Runtime states and recovery

| State | Meaning | Recovery route |
| --- | --- | --- |
| `Checking local service` | The app is reading the fixed version and inventory endpoints. | Wait for the bounded local read to return. |
| `Local model operation in progress` | One selected-model re-pull, copy, or deletion request is active. | Wait for its result or use **Cancel local operation**. |
| `Local service healthy` | The fixed local API supplied an accepted bounded inventory. | Select one observed installed model if a maintenance action is needed. |
| `Local service unavailable` | The app could not connect to the fixed local service. It does not guess whether Ollama is stopped or absent. | Start or install Ollama through its official local route, then refresh. |
| `Local API offline` | A bounded loopback request could not complete. | Restore the local service and refresh; no remote fallback occurs. |
| `Local API response rejected` | The service replied, but its response did not meet the accepted size or shape. | Correct the local service condition and refresh. No partial response is applied. |

When a refresh fails after a previously accepted read, the last valid inventory is labelled stale session data. It is not eligible to authorize a model mutation.

## Explicitly unavailable boundaries

The feature map keeps these capabilities visible as unavailable rather than making a partial surface look complete:

- **Official Model Store catalog:** no exhaustive official catalog, pagination, revision, or variant evidence is implemented, so no downloadable model is guessed.
- **Batch pull cart:** no catalog selection, disk preflight, streaming progress, durable queue, retry, resume, or partial outcome system exists. Re-pull is limited to one already-installed model.
- **Local chat:** no prompt entry, streamed response, history, attachment, tool, option, export, or response-retention path is implemented.
- **Hardware fit:** no RAM, GPU, VRAM, disk, driver, metadata, or conservative fit calculation is implemented.
- **Harness launch:** no registered profile, executable picker, command, environment, preflight, snapshot, restore, or rollback path is implemented.

The public companion site remains a separate browser-only observer. It does not receive these desktop model-maintenance capabilities.

## Privacy and security boundaries

The fixed local origin is not configurable. The renderer receives no endpoint field, token, raw HTTP body, prompt, chat response, path, credential, or arbitrary API capability. Named IPC methods expose only status refresh, selected-model re-pull, copy, delete preview/delete, and cancellation. There is no generic `request`, arbitrary method, arbitrary path, arbitrary JSON body, shell execution, cloud fallback, or catalog lookup IPC.

Model names displayed in the installed inventory originate only from the local API. Names used for mutation must also match the strict local model-reference validator; nonconforming observed names remain visible but cannot become an operation argument. The app never forwards local service status text or error bodies into toasts, notification history, local history, documentation, exports, or public records.

Ollama documents its default local API base at `http://localhost:11434/api`; this app intentionally narrows the address to numeric IPv4 loopback. The endpoint shapes used here are documented by Ollama: [API introduction](https://docs.ollama.com/api/introduction), [installed models](https://docs.ollama.com/api/tags), [running models](https://docs.ollama.com/api/ps), [pull](https://docs.ollama.com/api/pull), [copy](https://docs.ollama.com/api/copy), and [delete](https://docs.ollama.com/api/delete).

## Verification boundary

This source lane did not run tests, linting, type checks, independent review, runtime interaction, built-artifact interaction, captures, packaging, release, or deployment. It is not evidence that Ollama is installed, that any listed model can run, that a re-pull/copy/delete succeeds on a particular device, or that cancellation stops work inside the Ollama service.

The `ollama` completeness-inventory row remains incomplete until localized copy, focused tests, built-artifact interaction, captures, and independently verified evidence exist.

## Suggested articles

- [Local status and desktop completeness](local-status-and-completeness.md)
- [Local history and safe exports](local-history-and-safe-exports.md)
- [Desktop notifications and destructive confirmation](desktop-notifications-and-destructive-confirmation.md)
- [Browser-local Ollama observer](browser-local-ollama-observer.md)
