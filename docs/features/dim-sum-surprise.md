# Dim sum startup surprise

## Behavior

The desktop application has a small, non-blocking startup delight. On a
post-first launch, it makes one fresh cryptographic 1-in-10 draw. A selected
draw can appear only when all of the following are true:

- the shared School mode is not effective;
- the application is not checking, downloading, staging, or reporting an
  update failure;
- startup did not report an application error;
- no application-owned draft or modal dialog is active; and
- a previously validated public-photo cache entry is available.

The surface is a corner `status` region, never a modal dialog. It does not take
focus, has a labelled close control, auto-dismisses after seven seconds, and
has no animation when the operating-system reduced-motion preference is on.
Any keyboard, pointer, click, or input activity dismisses it immediately so it
does not remain over a newly started task.
The displayed dish name follows the application's English, Cantonese, or
bilingual language presentation. Its image always retains an English/Cantonese
text alternative from the public catalog. The surrounding surprise heading uses
the independently persisted English and Cantonese playfulness levels; the dish
name and alternative text remain factual. When the optional app narrator is
enabled, the same English/Cantonese dish fact is placed in its existing
serialized event queue.

The delight is intentionally not a setting. It cannot be opted out of, and it
does not write a notification-center record, local-history record, server
record, export, or log entry.

## Public catalog and cache boundary

The application does not track, bundle, generate, copy into a consumer
release, or attach dim-sum photos. The source keeps a deliberately small
metadata cache for four records from the authoritative public catalog:

- source: `https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json`
- observed catalog revision: `736e8c1d9e40e1d146f3c3b11bb329b97c4ef515`
- observed catalog schema: `1.0.0`
- photo release: `catalog-v1-part-003`

The records are `hk-dish-3001` through `hk-dish-3004`; their bilingual names,
image filenames, and text alternatives were copied from that revision of the
catalog after confirming that each PNG is a published asset of that release.
This small revision-pinned metadata cache is not a second catalog authority and
does not contain photo bytes.

The main process alone may, after the window is ready and only while School
mode and an active update are absent, warm an app-private cache from the exact
allowlisted public release-asset URLs. It follows at most four HTTPS redirects
only across an allowlisted GitHub release host set, applies a 12-second timeout,
and reads at most 3 MiB per response. The renderer never performs this network
request and receives only a bounded in-memory PNG data URL after a cache entry
has been revalidated. The main window is created before any cached photo is
read, decoded, or converted to a data URL; cache validation runs only after the
renderer has completed its ordinary startup work, so the delight cannot gate
application usability.

Every cache hit is checked again for a real PNG signature, byte count,
SHA-256, decoded dimensions, maximum 4,096-pixel edge, 16-megapixel area, and
the packaged image decoder before it can be displayed. Cache state persists
only the launch counter and non-secret digest/size/dimension metadata; it does
also records the fixed public catalog source URL and revision needed to validate
that metadata. It does not retain a per-photo response URL, photo contents in settings,
or a user choice. A missing, corrupt, oversized, untrusted, or offline cache is silent:
the application simply does not show a surprise on that launch.

This is the specific public-catalog/cache route allowed for consumer products.
It deliberately does not claim the older bundled-local-assets/no-network form
of the general surprise contract, because bundling the public catalog's photo
assets in this consumer repository would conflict with the public dim-sum photo
source policy. A future complete implementation needs a sanctioned offline
distribution path that satisfies both contracts without vendoring a photo here.

## School mode and update safety

School mode suppresses both candidate delivery and background cache warming.
The previous cache remains private and dormant; turning School mode off does
not cause an already-running application to retroactively show a surprise.
While it is active, the desktop offline-documentation list and command palette
also omit this article; an already-open copy is cleared and returns to the
server workspace.
Likewise, a candidate is withheld or dismissed as soon as the update controller
enters checking, available, downloading, ready-to-restart, offline, failed, or
unconfigured states. The surface therefore never competes with an update or
startup error.

## Failure modes

| Condition | Result |
| --- | --- |
| First feature launch | No surprise is shown; a later, non-blocking cache warm may run. |
| No validated private cache | No surprise is shown. |
| Public asset unavailable, invalid, too large, or redirected outside the allowlist | The cache entry is not used or persisted. No error dialog or toast is created. |
| Shared School mode unavailable or active | The delight is suppressed. |
| Update in progress or update failure | The delight is suppressed or dismissed. |
| Startup error, unsaved draft, or open modal | The delight is suppressed. |

## Verification boundary

This source-only fast-delivery lane did not run tests, linting, independent
review, built-artifact interaction, packaging, release publication, browser or
desktop runtime interaction, accessibility validation, or screen capture. The
local status inventory keeps localization breadth, cache/network exercise,
random-draw distribution, School-mode/update suppression, reduced-motion,
assistive technology, packaged-runtime proof, and captures pending.

## Suggested articles

- [Presentation settings and shared School mode](experience-settings.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
- [Desktop notifications and destructive confirmation](desktop-notifications-and-destructive-confirmation.md)
- [Local status and completeness](local-status-and-completeness.md)
