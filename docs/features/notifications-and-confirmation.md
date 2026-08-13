# Notification center and destructive confirmation

Minecraft Server Studio has a local notification foundation and one reusable
destructive-action confirmation surface. This article describes the source that
is present in this candidate. It does not claim that every desktop operation,
every language string, or every universal user-interface contract is complete.

## Notification center

Informational, success, progress, warning, and error messages appear as
non-blocking corner toasts. Informational, success, and progress toasts
auto-dismiss; warnings and errors stay visible until the user dismisses them.
Each toast can be reached with the keyboard, announces a semantic status or
alert role, offers an explicit dismiss control, and respects the persisted
decorative-emoji presentation preference.

Every toast also attempts to create a bounded local history record. The
user-opened **Notification center** lists current local records, supports plain
text filtering, selection, bulk mark-read, and bulk dismiss. Dismissed records
are hidden from the normal center view rather than presented as a claim that
they never existed. The local file keeps at most 400 records; newer records
replace the oldest retained metadata.

The center uses the existing language and message-style hooks for toast titles.
Complete localization, a regex builder beside this new filter, export, local
version-history integration, and built-artifact proof remain separate pending
work and are intentionally not claimed by this feature foundation.

## Safe local persistence boundary

The Electron main process owns notification-history persistence under this
app's private application-data directory. It stores only a bounded record ID,
kind, generic title/detail, local source label, timestamp, read state, and
dismissed state. Before writing, the store scrubs credential-shaped fragments,
Bearer/Basic values, local paths, file URLs, URL query values, control
characters, and overlong text. It never persists:

- credentials, passwords, tokens, or protected-vault values;
- action callbacks or privileged IPC capability;
- raw server, RCON, management-protocol, or external-service responses; or
- an upload, synchronization, analytics, or network copy of the history.

If the local history file cannot be initialized or later written, the app
reports the unavailable center honestly and continues to render the session's
non-blocking toast. That fallback is deliberately not represented as durable
history.

## Destructive-action confirmation

The shared confirmation component names the exact action and affected resource,
requires two independently operated confirmations, then enables a full-range
authorization slider. Authorization becomes available only at 100%. It also
provides **Emergency exit**, the platform Escape route, focus restoration to
the originating control, semantic progress text, visible slider progress, and
a reduced-motion completion state.

The component itself does not execute a privileged operation. It returns a
short-lived approval result to the existing caller, which must still submit its
current reviewed plan/digest to the main process. That keeps the existing
server-side plan checks in force rather than treating renderer UI state as
authority.

This candidate uses the component for:

- snapshot restore;
- Paper server-JAR replacement and rollback;
- BuildTools staged-JAR promotion; and
- Command Center operations that already require super confirmation.

Existing backup-plan, stopped-server, digest, checksum, rollback, and
credential-vault boundaries remain independent from the confirmation surface.
The feature does not claim that every destructive action in every future
desktop surface is wired yet.

## Failure and recovery states

| State | Behavior |
| --- | --- |
| Notification history unavailable | The center states that durable history is unavailable while the current-session toast remains usable. |
| Malformed or unsupported history data | Invalid records are ignored rather than partially trusted; future valid records can replace the unusable data. |
| Persisted content looks credential- or path-shaped | The history stores a scrubbed placeholder rather than the original fragment. |
| Confirmation component unavailable | The requested action is not started and the app shows an error toast. |
| Only one confirmation, a partial slider, or Escape | Authorization remains disabled or the dialog cancels without calling the action. |
| Reviewed plan changed before execution | Existing main-process digest/plan validation rejects the request and requires a fresh preview. |

## Verification boundary

This source-only delivery did not run tests, linting, type checks, package
builds, installed-app interaction, screenshots, or an independent review.
The implementation and inventory rows remain in progress until focused
interaction, accessibility, persistence, localization, and built-artifact
evidence are recorded.
