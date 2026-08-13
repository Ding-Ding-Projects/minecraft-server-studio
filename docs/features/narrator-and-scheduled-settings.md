# Event narrator and scheduled language settings

Minecraft Server Studio includes a local foundation for optional spoken event narration and bounded scheduled language overrides. It implements only the behavior described here. It does not claim a cloud text-to-speech service, a remote scheduler, a Home Assistant connection, or a general appearance scheduler.

## Local storage and boundaries

The Electron main process stores `narration-schedule-settings.json` in the app's private settings directory. The record uses schema version `1`, exact object keys, maximum file and collection sizes, bounded labels and voice identities, atomic replacement, and strict validation before use.

The renderer receives only the narrator preferences, safe schedule records, effective language result, and non-secret platform accessibility state. It never receives a credential, a source token, a Home Assistant response, or a raw external schedule payload.

| Source option | State in this build | Reason |
| --- | --- | --- |
| Local schedule | Available | It evaluates validated local settings against the computer's local clock. |
| Validated HTTPS API | Visible but disabled | This build has no validated privileged HTTPS schedule-source adapter. No request is made. |
| Home Assistant boolean entity | Visible but disabled | This build has no validated Home Assistant adapter or protected token route. No request is made. |

The disabled options are intentionally visible so the desktop does not imply that an unsupported network source is configured or silently falls back to one.

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

Each local rule contains a bounded label, enabled state, priority, one target language, optional start/end dates, required start/end local times, and either all weekdays or an explicit weekday set.

### Local-time semantics

- The timezone is the operating system's current local timezone and is shown in the settings surface.
- A normal window matches from its start time up to, but not including, its end time.
- Equal start and end times are rejected; this foundation never guesses that they mean all day.
- When the start time is later than the end time, the rule is cross-midnight. The rule belongs to its start date and start weekday, including its date bounds and weekday check after midnight.
- Optional date bounds are inclusive and apply to that start date.
- A local clock change is evaluated against the local clock each time the scheduler refreshes. A skipped daylight-saving wall-clock time does not match; a repeated fall-back wall-clock time may match on both real occurrences if it is inside the configured window.
- Matching rules resolve deterministically: highest numeric priority wins, then the stable schedule identifier in ascending lexical order. When no rule matches, the saved local base language remains active.

The main process periodically re-evaluates the safe local rule model and publishes a new presentation snapshot. A scheduled override does not overwrite the user's saved base language; the base value returns automatically when the window ends.

## Search and regex builder access

The preferences dialog and its saved-rule list each include independent local plain-text search. Each has an adjacent regex builder with raw pattern, flags, sample text, syntax feedback, and guided literal, anchor, character-class, group, alternation, and quantifier inserts. The bounded renderer uses JavaScript regular expressions with only `i`, `m`, and `u` flags accepted. Plain text remains the default, and an invalid pattern produces an explicit local no-match state rather than changing a rule.

## Failure and privacy behavior

- Missing, invalid, or unreadable narrator/schedule data leaves the narrator off and uses the saved local base language.
- Saving a malformed rule, equal-time window, invalid date range, unsupported source, or too many rules is rejected before storage.
- No schedule-source network request, Home Assistant request, analytics event, or remote text-to-speech request is made by this foundation.
- Voice display names are discovered at runtime. Only bounded stable voice identities are persisted; the persisted identity is not an executable path or a provider credential.

## Verification status

This feature was implemented during the active fast-delivery workflow. Tests, linting, review, built-artifact interaction, runtime verification, and screenshots were intentionally not run or claimed. The desktop completeness inventory records this as in progress; localization breadth, accessibility validation, runtime speech validation, tests, captures, and full universal-settings proof remain pending.

## Suggested related articles

- [Presentation settings and shared School mode](experience-settings.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
