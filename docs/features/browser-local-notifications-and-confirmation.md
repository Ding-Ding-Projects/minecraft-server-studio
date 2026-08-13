# Browser-local notification center and destructive confirmation

## Scope

The public landing page has a browser-local notification center and an
affected-data confirmation flow for clearing notification metadata. Both
features run only in the visitor's browser for this page's origin. They are not
the installed Windows application, a Minecraft server control surface, a
download manager, an installer service, an account service, or a remote support
channel.

The page can record that its own browser-local preview did something, such as
adding a notice, dismissing a notice, or clearing notification metadata. It
cannot use a notice or a confirmation step to start, stop,
inspect, upload, download, install, or change a server, a local file, a
browser download, or the installed application. The only destructive page
action clears notification metadata in this origin's local-storage record.

## Browser-local notification records

The page uses schema version 5 of the versioned
`minecraft-server-studio.site.contract.v2` local-storage record for bounded
notification and audit data when browser storage is available. Notification
records have a bounded identifier, kind, title, body, creation time, dismissal
state, and at most four safe identifier/label action descriptors. The contract
accepts the `info`, `success`, `warning`, `error`, and `progress` kinds and
retains at most 200 notification records. It retains at most 500 associated
browser-local audit records.

The landing page's visible center renders only messages created by this page.
Its messages explicitly distinguish browser-local activity from an external
outcome. A browser-local notice is not proof that an installer downloaded, a
server changed state, a local file changed, or an external service accepted a
request. A transient bulk selection is capped at 50 visible notification
records.

The center has plain-text search, a separate adjacent anchored full
regular-expression builder, and a show-dismissed control. An individual
dismissal marks one notification dismissed and records a contract audit event.
The center can select visible records, dismiss selected records, and request to
clear dismissed or all notification records. These are browser-local metadata
operations only. They do not retract a server operation, alter a browser
download, erase a desktop log, or delete anything outside this origin's stored
page data.

Info, success, and progress toasts auto-dismiss after seven seconds while the
page remains open. Warning and error toasts remain until the visitor dismisses
them. Toast timing is an in-page presentation behavior; it does not establish
that an external operation completed.

## Destructive confirmation for notification metadata

Every clear-notification flow starts a local confirmation session through
`beginDestructiveAction()` and advances it through
`advanceDestructiveAction()`. The page identifies the exact dismissed or all
notification-record count that will be removed, requires two separately
operated acknowledgements, and keeps the final clear control disabled until a
0–100 slider reaches 100. It calls `clearNotifications()` only after the state
machine returns `confirmed`.

The confirmation surface includes an Emergency exit and Escape cancellation
path and returns focus to the initiating control. Cancelling leaves notification
records unchanged. Confirming clears only the dismissed or all records selected
in this page's notification center. It does not clear browser downloads, server
data, installed-application data, credentials, local files, or external data.

The site retains an in-memory confirmation state machine, not a generic
destructive-operation service. A desktop or future privileged surface must
identify its own real target, provide its own accessible cancellation route,
and perform an operation only after its own confirmation flow has completed.

## Privacy and failure boundaries

- The notification center and confirmation flow make no network request, use no
  analytics, and do not contact a server, installer, account, or support desk.
- Local notification and audit text is limited to this page's origin and
  browser profile. It is not a credential vault or security boundary.
- The general contract excludes personal-vocabulary replacements, raw
  authenticator secrets, passwords, codes, and presentation-mode verifiers
  from ordinary exports. The notification center does not create an exception
  to that rule.
- If browser local storage is unavailable or a bounded record cannot be
  persisted, the in-memory page can still report its current-session state but
  must not claim that persistence succeeded.
- The static notification center does not implement external action handlers,
  server-result notifications, download progress, installation completion, or
  a destructive operation beyond clearing its own notification metadata.

## Verification state

This article records the current source boundary only. No automated tests,
linting, build, package, deployed-page interaction, cross-browser exercise, or
real capture ran in this fast-delivery lane. Complete localization,
accessibility validation, keyboard and assistive-technology evidence,
notification-action coverage, persistent-state exercise, and real
built-artifact evidence remain incomplete.

## Suggested articles

- [Local status and completeness](local-status-and-completeness.md)
- [Browser-local authenticator, toy locks, and recovery](browser-local-authenticator-and-toy-locks.md)
- [Offline documentation browser](offline-documentation-browser.md)
