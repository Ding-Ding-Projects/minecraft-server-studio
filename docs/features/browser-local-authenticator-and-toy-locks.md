# Browser-local authenticator, toy locks, and recovery

## Scope

The public landing page contains a browser-local authenticator and toy-lock
foundation. It is a real in-page feature, but it is deliberately limited to
one browser origin and one browser profile. It is not the installed desktop
application, a Minecraft server control surface, an account service, a cloud
sync service, or a credential vault.

The feature makes no network request. It does not call a server, analytics,
telemetry, a content delivery network, an authenticator provider, or an
external support desk. All calculations, QR rendering, lock checks, and local
ticket state run in the browser.

## Browser-storage boundary

Authenticator entries, toy-lock records, and local Support Tickets are kept in
a separate, versioned `localStorage` record for this page's origin. The record
is bounded to 100 authenticator entries, 100 locks, and 50 tickets.

This is browser storage, **not a security boundary or an operating-system
credential vault**. A person or program with access to the same browser profile
and origin storage can potentially inspect, alter, or clear it. Do not use this
page to protect high-value credentials or data from another person with access
to the computer.

The page persists the Base32 secret needed to generate an authenticator code.
For a password toy lock it stores only a salted PBKDF2-SHA-256 verifier (a
16-byte salt, 150,000 iterations, and a 32-byte derived verifier), not the
plaintext password. A TOTP toy lock needs its secret in the same browser-local
record so the page can verify a current code. These choices make the feature
usable without a network service; they do not turn browser storage into a
vault.

No secret, password, current code, pairing URI, QR payload, or manual-secret
reveal is copied into the page's general contract state, ordinary export,
ordinary history, browser-local status, or Support Ticket record. An optional
ticket note is intentionally discarded rather than retained.

## Authenticator entries and pairing

An entry starts from one of these bounded, local inputs:

- a manual Base32 TOTP secret; or
- a standard bounded `otpauth://totp/` URI.

The browser uses Web Crypto to calculate RFC 4226/RFC 6238 TOTP codes with
SHA-1, SHA-256, or SHA-512, six through eight digits, and a selected 15, 30,
45, 60, or 90 second period. The visible current code, next code, and countdown
are computed locally from the device clock. The page cannot measure or correct
clock skew, so a device with an incorrect time can produce a code another
service rejects.

After a deliberate **Reveal pairing QR** action, the page generates a standard
TOTP pairing URI and renders its QR code in-process. It also shows the matching
manual Base32 secret and pairing parameters for a short, deliberate transfer to
an authenticator. The QR and manual-secret reveal clear after 60 seconds or
when the visitor hides them. They are not exported or recorded in ordinary
history or status.

Pairing remains unconfirmed until the visitor types the current code from the
paired authenticator back into the page. Only a local match marks the entry as
confirmed. A mismatch leaves it unconfirmed; the page does not claim that an
external authenticator or account accepted the setup.

### QR import boundary

This page can generate a QR code for an entry. It **does not** decode a QR image,
read a QR from the clipboard, scan with a camera, or offer a QR-import route.
There is no bundled QR image, clipboard, or camera decoder in this delivery.
Those options remain unavailable rather than being shown as a non-working
control.

## Registered-target toy locks

Toy locks are optional, local, self-imposed friction. They are not encryption,
access control, or a way to secure content from someone who can access the
browser profile.

Each lock has its own password or TOTP credential and applies only to a
registered target. The current page registers exactly these targets:

- the authenticator tab;
- the authenticator entry list; and
- the authenticator pairing reveal.

The page does not yet implement locks for every rendered element, every tab, or
arbitrary user-selected targets. An unlocked state is held in memory for the
chosen session or minute duration; a reload returns locks to their locked state.
The lock manager must not be interpreted as a complete page-wide locking
system.

## Local Support Tickets and reset

The fictional **Support Tickets** desk is a local recovery explanation, not a
real support operation. It can create a local ticket number, category, and
status, but nothing is sent anywhere: no ticket exists outside this browser, no
network request is made, no data is collected, and nobody is reading it.

The recovery action is intentionally narrow and destructive. After two
independent confirmation checkboxes and a full confirmation slider, it clears
only this module's browser-local authenticator, toy-lock, and ticket record.
It does not clear the installed desktop application, Minecraft server folders,
browser downloads, another site, or the landing page's general settings record.
It cannot restore a cleared secret, password verifier, lock, or ticket.

## Failure behavior and limitations

- Invalid, malformed, duplicate, unsupported, or oversized Base32 and
  `otpauth://totp/` input is rejected without partially creating an entry.
- If the browser cannot use Web Crypto, local storage, or the bundled QR
  renderer, the relevant action reports that failure and has no remote
  fallback.
- A pairing URI that is too large for the bounded in-process QR encoder is not
  rendered as a QR code; the page reports that boundary rather than sending the
  value to a QR service.
- A failed pairing-code check never marks the entry confirmed.
- Clearing this module's record is irreversible from this page. It does not
  reset a desktop-app credential store or a server.
- The feature has no account recovery, cloud backup, cross-device sync,
  authentication-provider integration, secret export, or external support
  route.

## Verification state

This browser-local foundation is documented from its current source boundary.
No automated tests, linting, build, package, deployed-site interaction,
cross-browser exercise, QR scanner/decoder exercise, or real capture was run
for this delivery. Complete localization, every-element lock coverage,
QR-image/clipboard/camera import, synchronization, secret export, and
production evidence remain incomplete. The feature's local completeness entry
is therefore in progress, not verified.

## Suggested articles

- [Authenticator and toy locks](authenticator-and-toy-locks.md)
- [Presentation settings and shared School mode](experience-settings.md)
- [Local status and completeness](local-status-and-completeness.md)
