# Event narrator and scheduled language settings

Minecraft Server Studio includes a source-level foundation for optional spoken event narration and bounded scheduled **language** overrides. Schema version 2 retains local calendar rules and adds configured, main-process-only HTTPS API and Home Assistant boolean source choices. It implements only the behavior described here. It does not claim a cloud text-to-speech service, a general appearance scheduler, a successful external connection, or a remotely enforced setting.

## Local storage and boundaries

The Electron main process stores `narration-schedule-settings.json` in the app's private settings directory. The record uses schema version `2`, exact object keys, maximum file and collection sizes, bounded labels and voice identities, atomic replacement, and strict validation before use. Its exact non-secret `sources` object contains `httpsApi` configuration (`endpoint`, `allowInsecureLoopback`, and `refreshSeconds`) and `homeAssistant` configuration (`endpoint`, `allowInsecureLoopback`, `entityId`, and `refreshSeconds`). A migration accepts only the previous validated local shape and rewrites it as version 2; an unsupported or malformed record fails closed to narrator-off and the saved local base language.

The renderer receives only narrator preferences, safe schedule records, the effective language result, source state, and non-secret platform accessibility state. A token entry is passed once through narrow IPC to protected operating-system storage and is cleared from the control; no stored credential, authorization header, Home Assistant token, raw external response body, or raw external schedule payload is returned to the renderer.

| Source option | State in this build | Reason |
| --- | --- | --- |
| Local schedule | Available | It evaluates validated local settings against the computer's local clock. No request is made. |
| Validated HTTPS API | Available when configured | Only the main process may call a configured, validated HTTPS endpoint and accept a bounded versioned language decision. |
| Home Assistant boolean entity | Available when configured | Only the main process may read a configured boolean entity through a validated endpoint and a protected local credential. |

An unavailable, incomplete, malformed, or failing external source remains visible as its honest configuration/error state. It never silently becomes a local rule, rewrites the base language, or reports that a remote value was applied.

## Schema-version-2 external-source boundary

The source selector is per scheduled rule, but the value surface remains deliberately narrow: every current rule can resolve **only** English, Cantonese, or bilingual presentation. Theme, density, accent, font, display name, and other appearance values are not obtained from an external source by this foundation.

External source configuration is validated in the Electron main process before a rule can use it. The renderer can request configuration or a refresh through narrow IPC, but it cannot create an arbitrary network request, supply an authorization header to a renderer fetch, inspect a raw response, or choose a redirect target. Endpoints must use HTTPS, except for an explicitly enabled development route at the numeric loopback host `127.0.0.1` or `::1`; URL credentials, queries, fragments, redirects, malformed entity identifiers, unknown source fields, unsafe object keys, unsupported response versions, unexpected response fields, oversized or over-nested bodies, and values outside the language allowlist are rejected. The main-process client applies bounded DNS/IP validation to prevent server-side request forgery before it connects.

| Source | Activation contract | Private boundary |
| --- | --- | --- |
| Validated HTTPS API | The main process accepts only the exact object shape `{"version":1,"settings":{"language":"<allowed-language>"}}`, where `language` is exactly `english`, `cantonese`, or `bilingual`; the body is capped at 64 KiB and the request at 8 seconds. A missing, malformed, timed-out, redirected, or otherwise rejected response does not activate the rule. | The renderer does not fetch the endpoint or receive request headers, raw response text, or diagnostic payloads; its safe source state may identify only the accepted language. |
| Home Assistant boolean entity | The main process makes only `GET api/states/<entityId>` for the exact configured `input_boolean` or `binary_sensor` entity, then accepts only a matching `entity_id` and `on`/`off` state. `on` can activate the rule's already stored language value; `off` leaves the local base language or another valid matching rule in effect. | The entity identifier is validated, while its access token is held only by the operating-system credential vault and is never stored in the schedule document or returned in an IPC snapshot. Its safe source state may identify only whether the entity is active. |

Each source's `refreshSeconds` is a whole number from 30 through 3,600 seconds, defaulting to 300 seconds. The schedule document stores no credential value, token, header, secret, or response body. Credentials and raw response data are excluded from local history, ordinary exports, logs, telemetry, screenshots, and public records. A separate privileged clear route removes a protected credential; a renderer-visible status can say only whether the credential/configuration is usable, missing, or unavailable, plus the accepted API language or active Home Assistant state when one exists.

### Configuring an external source

1. Choose either **Validated HTTPS API** or **Home Assistant boolean entity** for a rule.
2. Save its non-secret endpoint configuration before saving a credential. The HTTPS source uses an endpoint, optional numeric-loopback development permission, and refresh interval. The Home Assistant source adds an exact lower-case `input_boolean` or `binary_sensor` entity identifier.
3. Save the bearer token separately. The renderer sends that one input only to the privileged credential-storage route; it does not put the token in the settings document, return it to the page, or render it again. Changing an endpoint, loopback permission, or Home Assistant entity clears that source's prior protected token before the new configuration is retained, so an old token can never follow a changed destination.
4. Use the explicit refresh action, or wait for the bounded source-specific refresh interval. The scheduler checks whether a configured source is due without exposing a request route to the renderer. A newer refresh cancels a superseded response rather than allowing an older response to overwrite current source state.

The safe runtime state names configuration, credential availability, idle/refreshing/inactive/ready/failed status, and checked/accepted timestamps. It does not render a bearer value, response body, redirect location, DNS result, or a remote diagnostic payload.

## Event narrator

The narrator is **off by default**. When the user enables it, it can read app event notifications using only the platform speech-synthesis API exposed to the Electron renderer. It does not upload text, select a cloud provider, or invent voice choices.

| Control | Behavior |
| --- | --- |
| Narrated language | English, Cantonese, or Both. Both queues English first and Cantonese second; the utterances do not overlap. |
| English and Cantonese voice pickers | Each track persists its own platform `voiceURI` identity. The default is **Choose automatically**. |
| Missing saved voice | The saved identity remains stored. The UI says it is not installed on this computer and uses a compatible automatic voice when one is available. |
| Rate and pitch | Each language has independent, persisted rate (`0.5`–`2`) and pitch (`0`–`2`) values. |
| Platform enumeration | The renderer reads real `speechSynthesis.getVoices()` output and listens for late `voiceschanged` delivery. It never renders a hard-coded voice list. |
| Unavailable runtime | If Electron exposes no usable platform speech API, the UI says so and does not claim that a narrator voice exists. |

Narration uses a bounded serialized queue. A per-category cooldown prevents repeated event spam, and an already queued message from the same category is replaced rather than stacked. Visible toast messages and accessible text remain available whether narration is enabled or not.

When Electron reports an active accessibility client, the narrator yields rather than speaking over the screen reader. If this Electron runtime cannot expose that accessibility state, the narrator also yields rather than guessing. The user can keep their narrator preferences, but no utterance starts while the platform state is active or unavailable.

## Scheduled language rules

The current scheduler applies the stored **language mode only**. It does not quietly change an unimplemented theme, density, accent, font, display name, or other appearance value.

Each rule contains a bounded label, enabled state, priority, one target language, a selected source, optional start/end dates, required start/end local times, and either all weekdays or an explicit weekday set. Local and Home Assistant rules use their stored target language; a valid HTTPS API rule uses its accepted API language instead. No source broadens the setting domain beyond English, Cantonese, or bilingual presentation.

### Local-time semantics

- The timezone is the operating system's current local timezone and is shown in the settings surface.
- A normal window matches from its start time up to, but not including, its end time.
- Equal start and end times are rejected; this foundation never guesses that they mean all day.
- When the start time is later than the end time, the rule is cross-midnight. The rule belongs to its start date and start weekday, including its date bounds and weekday check after midnight.
- Optional date bounds are inclusive and apply to that start date.
- A local clock change is evaluated against the local clock each time the scheduler refreshes. A skipped daylight-saving wall-clock time does not match; a repeated fall-back wall-clock time may match on both real occurrences if it is inside the configured window.
- A source condition is evaluated only after the rule's local time, date, and weekday window matches. Local rules are active from their calendar window; a valid HTTPS result supplies an allowed language for its matching rule, while an `on` Home Assistant state activates its matching rule's stored language.
- Matching rules resolve deterministically: highest numeric priority wins, then the stable schedule identifier in ascending lexical order. When no valid rule matches, the saved local base language remains active.

The main process periodically re-evaluates the safe rule model and refreshes configured external sources only through their validated bounded refresh intervals. A scheduled override does not overwrite the user's saved base language; the base value returns automatically when the window or source condition ends.

## Search and regex builder access

The preferences dialog and its saved-rule list each include independent local plain-text search. Each has an adjacent regex builder with raw pattern, flags, sample text, syntax feedback, and guided literal, anchor, character-class, group, alternation, and quantifier inserts. The bounded renderer uses JavaScript regular expressions with only `i`, `m`, and `u` flags accepted. Plain text remains the default, and an invalid pattern produces an explicit local no-match state rather than changing a rule.

## Failure and privacy behavior

- Missing, invalid, unreadable, or unsupported narrator/schedule data leaves the narrator off and uses the saved local base language.
- Saving a malformed rule, equal-time window, invalid date range, unsupported source, invalid endpoint/entity configuration, or too many rules is rejected before storage.
- A local rule makes no network request. An external source request happens only from the main process after its configuration has passed validation; renderer code has no direct HTTPS or Home Assistant route.
- An offline source, rejected endpoint, missing protected credential, `off` entity, malformed response, timeout, rate limit, or authentication refusal is non-blocking. The last valid local/base result remains in effect and the source is reported as unavailable rather than being persisted as a new base setting.
- Voice display names are discovered at runtime. Only bounded stable voice identities are persisted; the persisted identity is not an executable path or a provider credential.

## Verification status

This feature was implemented during the active fast-delivery workflow. Tests, linting, review, built-artifact interaction, runtime verification, external endpoint/Home Assistant connection validation, and screenshots were intentionally not run or claimed. The desktop completeness inventory records this as in progress; localization breadth, accessibility validation, runtime speech validation, external-source behavior, tests, captures, and full universal-settings proof remain pending.

## Suggested related articles

- [Presentation settings and shared School mode](experience-settings.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
