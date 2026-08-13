# Browser-local narrator and schedules

The public Minecraft Server Studio companion page includes two browser-local settings foundations: an optional event narrator and local schedules for this page's language and appearance settings. Neither feature reaches the installed desktop application, a Minecraft server, an installer, a status service, Home Assistant, or a remote text-to-speech provider.

## Event narrator

The narrator is off by default. A visitor must turn it on before a browser-local page event can be spoken. Visible notices and their accessible live-region text remain available whether narration is enabled or not.

### Language and voice selection

The narrator offers three modes:

- **English** speaks only the English event line.
- **Playful Hong Kong-style Cantonese** speaks only the Cantonese event line.
- **Both** queues English first and Cantonese second; the two utterances never overlap.

Each language has an independent voice selector. The default is **Choose automatically**. The page reads actual voices from the browser `speechSynthesis` API and subscribes to the browser `voiceschanged` event because some browsers return an empty voice list before that event arrives.

The persisted value is the browser's non-empty `voiceURI` identity, never a display name. A browser voice without a usable `voiceURI` is not selectable because this page cannot honestly preserve it as a stable choice. If a saved voice is absent later, its identity remains stored. The page says that the saved choice is unavailable and uses a matching automatic voice only when one actually exists. If there is no matching voice, that language track remains silent rather than pretending a fallback will speak it. A browser voice marked as non-local is described as possibly network-backed and may be silent while offline; the page itself does not make a network request.

### Queue, rate, and pitch

Rate is bounded to `0.5` through `2`, and pitch is bounded to `0` through `2`. A browser-local event is placed on one serialized queue. Ordinary rapid events are debounced for 250 milliseconds, while each category has a two-second cooldown; a newer queued event replaces pending event lines instead of accumulating an announcement backlog. Error narration bypasses that cooldown so an actual error remains reportable. The queue uses real `SpeechSynthesisUtterance` objects, does not create audio files, and is cancelled when the page is hidden by the renamed presentation mode.

The public page cannot reliably discover whether a screen reader is active. It says so plainly, keeps narration opt-in, does not start speech at page load, and waits for an actual page event or the explicit preview control. A visitor who uses assistive technology can leave narration off without losing any visible notice or status information.

### Failure states

- If speech synthesis is unavailable, the controls state that no browser narrator is available and no voice is claimed.
- If voices are not available yet, the controls say that they are waiting for `voiceschanged` rather than claiming that the computer has no voices.
- If a selected voice is missing, the saved identity is preserved and the current fallback or silence boundary is named.
- If the renamed presentation mode is active, narrator controls are omitted and queued speech is cancelled. Preferences remain browser-local and return after a successful local unlock.

## Local schedule editor

The schedule editor stores at most 100 version-1 rules in this page's `localStorage` contract record. A rule is local to this browser and origin; it never changes the installed application or any desktop preference.

### Supported values

Each rule changes exactly one of the following while it matches:

| Setting | Valid values |
| --- | --- |
| Language mode | `english`, `cantonese`, `bilingual` |
| Theme | `system`, `light`, `dark` |
| Density | `compact`, `comfortable`, `spacious` |
| Accent color | six- or eight-digit hexadecimal color |
| Font family | one of the shipped browser-safe fallback stacks |
| Font scale | `0.75` through `2` |
| Font weight | 100 through 900 in 100-point steps |

The saved base preference is never overwritten. When a matching rule ends, the base preference appears again automatically.

### Local-time behavior

The editor shows the browser's current local timezone. It evaluates date and time windows against that local clock, including daylight-saving behavior.

- Start and end dates are optional, inclusive, and cannot be reversed.
- With both times present, a normal window includes the start time and excludes the end time.
- Equal start and end times are saved but intentionally inactive; the page never guesses that they mean all day.
- A start time later than an end time is cross-midnight. After midnight, the rule remains associated with the previous local start date and weekday.
- A start-only time means from that time onward; an end-only time means until that time; no times means all day.
- The day selector offers every day or an explicit weekday set.
- A local daylight-saving gap has no matching wall-clock time. A repeated fall-back time can match on both real occurrences when it is inside the saved window.

Matching rules resolve predictably: the highest numeric priority wins, followed by the stable rule identifier in ascending lexical order when priorities tie. The saved-rule list names the current timezone, window, date bounds, and active effective overrides. Its plain-text search has an adjacent local regular-expression builder; no pattern or sample is sent anywhere.

Removing a rule uses the page's destructive-action confirmation surface. It names the exact local rule, requires two independent acknowledgements and a 100-percent slider, offers an **Emergency exit** action and Escape cancellation, then removes only the selected browser-local rule. The saved base settings remain unchanged.

### Unavailable external sources

The editor displays two unavailable choices:

- **Validated HTTPS API** is unavailable because this static page has no privileged request layer, URL allowlist, redirect policy, bounded response validator, or failure-recovery path.
- **Home Assistant boolean entity** is unavailable because this page has no protected token store, entity validator, or local adapter.

Those choices cannot be saved. The page does not silently turn either one into a browser-local rule, and it makes no network request.

When the renamed presentation mode is active, rules remain stored but do not override the forced English presentation. The schedule and narrator controls are omitted rather than appearing disabled.

## Privacy and persistence

The browser-local record uses root schema version `4`; schedule entries use rule version `1`. It is bounded and normalized before use. The schedule source is always `local`. The feature does not store a file path, server configuration, credential, token, voice recording, audio file, schedule-source response, or desktop application state.

Clearing this site's storage resets the page's local settings, schedule records, narrator preferences, personal-vocabulary cache, presentation-mode metadata, notifications, and audit preview. It does not change the installed desktop application, a Minecraft server, browser downloads, or another website.

## Verification boundary

This source-only fast-delivery lane did not run tests, linting, review, a build, package, browser interaction, or screen capture. The browser-local completeness inventory marks the narrator and schedule foundations as in progress and leaves localization breadth, accessibility validation, built-artifact interaction, and capture evidence incomplete. No runtime speech, voice enumeration, local-storage persistence, schedule transition, or external-source behavior is claimed as verified by this article.

## Suggested articles

- [Landing-page boundary and local settings overview](README.md)
- [Browser-local contract reference](CONTRACT.md)
- [The public settings preview](index.html#settings-preview)
