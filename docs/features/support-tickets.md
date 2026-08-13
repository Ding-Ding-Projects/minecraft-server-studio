# Support Tickets recovery desk

## Scope

Minecraft Server Studio includes a fictional **Support Tickets** desk for the
local recovery route used by toy locks. It is an in-app aid for finding the
application-data folder when a user has lost a toy-lock credential. It is not a
security service, account system, help desk, or contact channel.

The desk is local-only. It does not create a remote ticket, send an email,
open a network connection, collect telemetry, or wait for a person to reply.
Its plain disclosure states that no ticket leaves the computer and that nobody
is reading it.

## Recovery flow

The recovery route is available from the toy-lock unlock prompt, the toy-lock
settings surface, and Help. A user can create a locally numbered ticket with a
category and description, then review its local status and the desk's canned
response. The ticket is a local record that helps explain the recovery step; it
does not represent a request sent to a real support team.

When the desk reaches its local resolution, it shows the exact application-data
folder returned for the current installation and provides a copyable path. The
**Open application-data folder** action asks the operating system file manager
to open that same folder. The app never deletes the folder, its contents, or a
toy-lock record on the user's behalf.

Deleting the application-data folder is a user-directed reset route, not an
in-app action. It can remove local Studio data in addition to a toy lock, so
the person using the app must review that consequence and perform any deletion
themselves in their own file manager.

## Privacy and secret boundary

The desk does not need a password, one-time code, authenticator secret, or
credential-vault value. Do not enter any of those values in a ticket
description. The desk never displays a stored secret, asks for one, or turns a
ticket into an export, status event, analytics payload, or network request.

Ticket records and their status are local application data. A local ticket
number is only a local reference; it has no meaning outside this installation.
The actual folder path is shown only at the time the recovery route is used, so
the documentation does not guess a machine-specific location.

## Failure behavior

- If the app cannot resolve its application-data folder, the recovery action
  reports that unavailable state and does not invent a path.
- If the operating system file manager cannot be launched, the desk reports
  the failure and leaves the ticket and application data unchanged.
- Cancelling the recovery route leaves the local ticket state unchanged and
  does not trigger an external fallback.
- The desk never claims that a password, one-time code, or toy lock was reset
  merely because a ticket was created or a folder-open attempt was made.

## Current boundary

This foundation does not turn local records into a real support operation. It
does not send messages, create an account, delete application data, recover a
credential, or bypass a toy lock. The existing toy-lock recovery boundary
remains the user-directed application-data-folder reset route.

## Verification state

This source and documentation lane was prepared under the fast-delivery
boundary. No focused tests, linting, build, package, installed-app interaction,
or screen capture was run or claimed for this feature. The implementation and
its recovery behavior require their own later verification evidence.

## Suggested articles

- [Authenticator and toy locks](authenticator-and-toy-locks.md)
- [Local status and completeness](local-status-and-completeness.md)
- [Offline documentation browser](offline-documentation-browser.md)
