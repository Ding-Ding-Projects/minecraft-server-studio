# Spigot BuildTools adapter

The BuildTools adapter provides data models and validation for the desktop app's
Spigot setup flow. It does not launch Java, install anything, download a JAR,
extract an archive, convert an image, or write to a server. The application
runner performs those effects only after it receives an explicitly confirmed
execution request from a preflight model.

## Live versions and Java

The adapter fetches live metadata only when the UI explicitly calls
\`fetchOfficialLiveVersionMetadata()\`. That call is fixed to the official
\`https://hub.spigotmc.org/versions/latest.json\` endpoint, refuses redirects,
uses a timeout, bounds the response body, and validates JSON before exposing it
to the revision picker.

The required JDK is selected from the requested Minecraft revision:

| Minecraft revision | Required JDK |
| --- | --- |
| Before 1.17 | 8 |
| 1.17 and 1.17.1 | 16 |
| After 1.17.1 through 1.20.5 | 17 |
| After 1.20.5 | 21 |

Every preflight includes app-managed automatic-install requirements for that
JDK and for Git for Windows. The UI should show their detected, installing,
installed, and failed/retry states through real controls rather than asking the
operator to install them manually.

## Workspace and authority

BuildTools always receives a dedicated workspace separate from the server home.
The adapter rejects filesystem roots, user homes or their parents, repository
locations, known cloud-sync paths, temporary folders, dependency folders, and
any workspace that intersects the server home. Its asynchronous inspection also
rejects Git markers and symbolic-link/reparse-point components.

The preflight supplies separate download, build, output, staging-output, and
rollback-record directories. It records the exact JDK, dependency plan,
BuildTools source, structured arguments, shell-free command data, and a
stage/swap/rollback plan. Its digest must match the explicit confirmation
before an executor can receive an authorized request.

The separate [BuildTools plan-only orchestration](buildtools-orchestration.md)
surface intentionally does not use this execution path. It provides only typed
arguments, controlled workspace/output planning, and Java/Git readiness, with
its execution state explicitly unavailable.

Generated JARs are first validated in the isolated workspace, copied to a
server-local stage, validated again, moved into a rollback location if a live
JAR exists, and then atomically renamed into place. A failed promotion restores
the previous JAR only from that operation's rollback path.

## Rich configuration inputs

Revision, target, output directory, artifact selection, reuse behavior, update
policy, upstream pull-request number, and risk overrides are represented as
structured fields. The permitted advanced raw fallback is bounded, tokenized,
and limited to a small boolean-flag allowlist; shell characters, control bytes,
quoting, redirection, and protected fields such as \`--rev\` and
\`--output-dir\` are refused.

The safe generated-configuration parser keeps unknown key/value rows, comments,
blank lines, and unparseable rows intact. Updates may change only recognized
keys supplied by the calling GUI; unknown keys are never silently overwritten.

## Plugin, icon, and RCON helpers

Plugin inspection reads only the ZIP central directory, local header, and
bounded \`plugin.yml\` entry. It refuses ZIP64, encrypted entries, unsafe paths,
oversized data, dangerous compression ratios, invalid checksums, and unsupported
YAML constructs. It never extracts a full JAR or decompiles code.

Server-icon validation reads PNG bytes and headers, validates bounded chunk
layout and checksums, requires a complete 64×64 non-animated PNG, and creates a
conversion *request* when the image is unsuitable. It never generates,
converts, or writes image bytes.

RCON cards accept only an operating-system credential-vault reference. Password,
secret, token, and credential payload fields are refused; the adapter never
returns, logs, or stores a password.

## Verification boundary

This adapter was added during the active speed-delivery workflow. No tests,
build, package, runtime interaction, capture, deployment, commit, or release
claim is made by this documentation.
