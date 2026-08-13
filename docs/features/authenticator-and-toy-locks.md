# Authenticator and toy locks

## Scope

Minecraft Server Studio includes a local desktop foundation for time-based
one-time-password (TOTP) entries and optional toy locks. The foundation is
deliberately local-only: it does not create an account, contact a cloud service,
send telemetry, synchronize secrets, or execute commands for another service.

The authenticator destination is separate from server settings. It shows only
the current code, the next code, the current countdown, and non-secret entry
metadata. The original secret is not rendered back into the page, stored in the
entry metadata file, printed to the console, included in ordinary exports, or
included in status events.

## Authenticator entries

The main process implements RFC 4226 dynamic truncation and RFC 6238 TOTP with
SHA-1, SHA-256, or SHA-512; six through eight digits; and a bounded positive
period. Entries can be created from either:

- a manual Base32 secret; or
- a standard `otpauth://totp/` URI containing bounded TOTP fields.

The URI parser accepts only the TOTP scheme, `secret`, `issuer`, `algorithm`,
`digits`, and `period` query fields. It rejects duplicate, unknown, malformed,
or oversized fields instead of partially applying them. Local metadata stores
the issuer, account, display label, group, algorithm, digits, period, and
timestamps. The corresponding secret is stored only through the operating
system protected credential route used by the application.

Current and next codes are computed only in the main process and are exposed to
the renderer through a narrow code-snapshot IPC call. The copy action is
user-initiated and copies only the code currently visible in the list.

### QR boundary

QR pairing, QR-image import, clipboard QR import, and camera scanning are
explicitly unavailable in this foundation. The application does not draw a
placeholder QR code or pretend that a camera/clipboard parser exists. Those
paths require a bundled in-process QR renderer and decoder with their own
resource, privacy, and pairing-confirmation implementation before they can be
enabled.

### Clock boundary

TOTP codes use the local computer clock. The current foundation says this
plainly but cannot independently measure the clock skew against an external
authority. If another service rejects a correct-looking code, check the device
clock before changing the authenticator entry.

## Toy locks

Toy locks are opt-in, per-target local user-experience speed bumps. They are
not encryption, access control, or protection from another person with the
computer. Each configured record has its own credential and one of two methods:

- a password verified through an independently salted `scrypt` verifier stored
  in the protected credential vault; or
- a manually supplied TOTP secret held only in the protected credential vault.

Metadata records the exact target type, target identifier, user-visible label,
method, duration, and timestamps. It never stores a password, verifier, TOTP
secret, or code in the metadata file. A session unlock lasts until the app
closes; a selected minute duration expires in memory. All locks return to their
locked state after restart.

### Registered desktop targets

New desktop locks can be created only for the fixed application-owned target
catalog returned by the main process. The renderer does not accept a free-form
target identifier or label: the service rejects an unknown target and rejects a
label that does not exactly match the selected catalog record. The current
catalog contains 20 targets:

- 16 tabs: the authenticator destination and the General, World, Gameplay,
  Network, Runtime, Paper JAR CLI, BuildTools, Backups and updates, Live
  management, Command Center, Local status, History and exports, Advanced,
  Plugins, and Console server-settings tabs;
- three appearance targets: the app shell, settings-tab strip, and primary
  actions; and
- the authenticator-entry form.

The authenticator header, the authenticator-entry form's own configuration
action, each registered server-tab route, and the selected appearance-target
controls can route a person to the registered-target picker. The list itself
keeps plain-text search as the default and offers a bounded local
regular-expression mode over non-secret lock metadata only. Per-record controls
expose unlock, relock, and removal. Removal uses the existing two-control/full-
slider confirmation before removing the local lock metadata; the service then
attempts protected credential-vault cleanup without exposing a credential.

The locked routes in this bounded catalog are the authenticator destination,
registered server-tab selection, selected appearance preview/save/reset, and
authenticator-entry submission. A lock on the entry form defers the submitted
entry data only until its independent credential unlocks the form; it does not
write a secret into lock metadata or the lock list. Existing legacy lock records
remain listable and unlockable, but a new lock cannot be created for a target
outside the catalog.

This is registered-target coverage, not universal element coverage. The build
does not claim a lock wizard for every rendered element, broad context-menu
coverage, or a universal keyboard route. Those capabilities remain separate
work rather than an implication of the catalog.

If a user loses a toy-lock credential, the self-service recovery route is to
delete the application-data folder shown in the toy-lock UI. Nothing is sent to
a support desk, no network request is made, and the application never deletes
that folder on the user's behalf.

## Failure behavior and security boundaries

- If protected credential storage is unavailable, the application leaves
  existing metadata intact and refuses new authenticator secrets or toy-lock
  credentials.
- If metadata is malformed or unsupported, the affected service reports that it
  is unavailable and does not overwrite the existing file.
- A failed metadata write attempts to remove the newly created protected
  credential. If the credential vault cannot complete that cleanup, it may keep
  an unreachable protected record rather than exposing plaintext material.
- A request for an unregistered target or a mismatched catalog label is refused
  before a credential is created. Legacy metadata remains available for listing
  and unlocking rather than being silently rewritten to a new target.
- Removing a lock writes the retained metadata first and then makes a best-effort
  protected-vault deletion. A vault-cleanup failure can retain an unreachable
  protected record, which is safer than restoring a removed lock or exposing a
  secret.
- Secret-shaped values are not emitted through status events, notification
  payloads, renderer snapshots, ordinary exports, local history, or logs.
- The current UI has no ordinary secret export, deletion workflow, QR workflow,
  camera workflow, account sync, or external network path.

## Verification state

This registered-target expansion was added in a fast delivery pass. No focused
tests, linting, independent review, runtime interaction, package build,
installed-app exercise, or screen capture was run for this feature. The local
completeness inventory records source paths and the documentation article while
keeping localization, test, capture, packaged interaction, and broader evidence
fields pending. Source registration does not establish every-element lock
coverage, a successful vault operation, a completed unlock, or a rendered
desktop interaction.

## Public landing-page browser-local companion

The public landing page now independently ships a browser-local authenticator
and toy-lock foundation in `site/authenticator-locks.js`. It is not a proxy for
the desktop implementation and does not call the desktop application, a
backend, a server, or a remote service.

The companion site accepts bounded manual Base32 registration and bounded
`otpauth://totp/` registration, computes RFC 4226/HOTP and RFC 6238/TOTP using
browser Web Crypto, and supports SHA-1, SHA-256, SHA-512, six through eight
digits, and the visible 15/30/45/60/90-second periods. It stores that bounded
site state only in origin-scoped browser storage because a static page has no
operating-system credential vault. This is a local browser-storage convenience
boundary, not a security boundary, and it is never presented as equivalent to
the desktop credential vault.

Current and next codes plus a readable countdown render locally. A per-list
plain-text search has its own adjacent regular-expression builder. An explicit
pairing reveal renders a standard TOTP QR code entirely in the browser and
shows the grouped manual Base32 secret for 60 seconds before clearing it from
the DOM. The visitor types a current code from the paired authenticator back
into the browser-local confirmation field before that pairing is marked
confirmed. It does not fetch an image, use a QR service, upload a QR, scan a
camera, parse a QR image or clipboard image, or retain a QR payload in exports
or history.

The landing page's toy locks are independently credentialed per registered
target: the authenticator tab, entry list, and pairing reveal. A password lock
uses an independently salted local PBKDF2 verifier; a TOTP lock uses a separate
local SHA-1/30-second Base32 secret. Every configured lock returns to locked
after a page reload. These are self-imposed for-fun locks, not encryption or
protection from anyone who can access the browser profile. Broader every-element
context-menu wiring remains incomplete and is not claimed.

The companion Support Tickets destination is entirely local. It creates a
ticket number, category, and local status; discards optional free-text notes;
and states that nothing is sent, no ticket exists outside the browser, no
network request is made, no data is collected, and nobody is reading it. Its
recovery route is clearing this site's storage. A two-key/full-slider action
can erase only the module's browser-local record; it does not delete desktop
data, server data, browser downloads, or another site's storage.

No companion-site authenticator secret, toy-lock password, verifier, TOTP
secret, current code, URI, QR payload, or manual reveal is sent over a network,
placed in the ordinary page export/history/status model, logged, or committed as
user data. QR image/camera/clipboard import and decoding, synchronization,
secret export, all-element lock coverage, complete localization, automated
tests, built-site interaction, and capture evidence remain incomplete.

## Suggested articles

- [Presentation settings and shared School mode](experience-settings.md)
- [Local status and completeness](local-status-and-completeness.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
