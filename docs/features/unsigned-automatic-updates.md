# Unsigned automatic updates

Minecraft Server Studio has a Windows-only application-update controller for
Squirrel.Windows releases. It updates the installed desktop application; it
does not update a Minecraft server, a world, Paper, Spigot, BuildTools, or a
plugin. Those operations retain their own explicit workflows and safety
boundaries.

## Approved public release feed

The controller derives exactly one approved public Squirrel.Windows feed:

```text
https://github.com/Ding-Ding-Projects/minecraft-server-studio/releases/latest/download/
```

It uses that path only when the application is running as a packaged Windows
Squirrel.Windows installation. The product does not accept a user-entered feed
URL, infer a repository URL, silently use a development feed, or substitute a
different release origin.

The state is **unconfigured** when the application is not an installed Windows
Squirrel.Windows package or the approved feed cannot be derived. In that state
the controller makes no update network request, reports why checking is
unavailable, and keeps the application usable. The recovery route is to run a
supported installed Windows package, not to enter a different feed URL.

Automatic checking itself is a local user setting: it can be enabled or
disabled, but that setting never changes the approved feed. No credentials,
user feed URL, token, password, or authentication header are accepted or
stored for application updates. A feed failure must not expose sensitive URL
fragments or response bodies in the desktop UI, logs, exports, or status
records.

## Release-time application version

The workflow does not rewrite the checked-in source `package.json` or its
lockfile for a release. Its current source baseline remains `0.1.0`. Instead,
after dependencies are restored and before packaging, every GitHub Actions run
derives one stable three-part application version:

```text
0.<GITHUB_RUN_NUMBER>.<GITHUB_RUN_ATTEMPT>
```

Both GitHub-provided values must be positive decimal integers, and the computed
value is rejected unless it is strict stable semantic versioning with exactly
three numeric parts. A new workflow run increments the middle component; a
rerun increments the final component. For example, run 94 attempt 1 packages
application version `0.94.1`, while its rerun packages `0.94.2`. Those values
sort above the prior `0.1.0` source-baseline package and above earlier values
from this release train.

The workflow passes that value to Electron Builder as
`-c.extraMetadata.version=<computed-version>`. Electron Builder injects the
metadata into the packaged application only, so Electron's `app.getVersion()`,
the Squirrel NuGet package, the `RELEASES` row, and the configured Setup
filename all use the same application version without changing the source
package identity, app identifier, executable identity, update-feed address, or
application-data identity.

The GitHub Release tag remains a separate provenance record in the existing
`v<source-version>-build.<run>.<attempt>` format. It is deliberately not used
as the Squirrel package version. The workflow rejects a pre-existing tag rather
than replacing its assets, and it validates exactly one version-matched Setup
executable, one full package, and one `RELEASES` row before publication.

Build metadata such as `0.1.0+build.94` is not used because the Windows
installer conversion removes the `+` portion. Prerelease forms such as
`0.1.0-build.94` are not used because they rank below the equal stable release
and the converter normalizes dots in their suffixes. Local `build.bat` and
`build-installer.bat` retain their source-baseline package behavior: they do
not mint a release version, tag, upload, or publish. The installer script
derives the configured dotted Setup filename from the local source version
instead of retaining a stale hard-coded version string.

## State model

The updater publishes one current state rather than treating a spinner as a
result:

| State | Meaning | Available recovery |
| --- | --- | --- |
| Unconfigured | The process is not an installed Windows Squirrel.Windows package, or the fixed approved public feed cannot be derived. No update request is made. | Use a supported installed Windows package. |
| Disabled | Automatic checks are disabled in local settings. No background or manual update request is made until checks are re-enabled. | Re-enable automatic update checks. |
| Idle | Automatic checks are enabled and a bounded startup, scheduled, or newly enabled check is pending. | Wait for the scheduled check or choose a manual check. |
| Checking | A bounded approved-feed metadata request is in progress. Duplicate checks are ignored until it resolves. | Wait for the state to resolve. |
| Current | The approved feed reports no newer applicable package after `RELEASES` validation. | Check again later. |
| Available | Electron's `update-available` event accepted a candidate from the validated `RELEASES` index and began its package transfer. | Let the background transfer continue. |
| Downloading | A selected package is being transferred or prepared. | Wait for the terminal state, or check again after a failure. |
| Ready | A newer Squirrel package was staged successfully. The user-facing label is **Ready to restart**. | Choose **Restart to install update** or **Later**. |
| Offline | The approved public feed could not be reached during the current check. The installed application remains active. | Reconnect and check again. |
| Failed | Feed metadata, a package transfer, or package validation did not complete. The installed application remains active. | Review the exact non-sensitive reason and check again. |

The controller prevents duplicate checks while a check or transfer is active. It
must never report that an update was installed merely because a check,
download, or release lookup started.

## Squirrel.Windows integrity and unsigned boundary

Before it calls Electron's `autoUpdater`, the controller retrieves and validates
the Squirrel `RELEASES` index from the fixed approved feed. The bounded index
must contain valid package rows with the Squirrel hash and byte length, resolve
only to the approved HTTPS delivery origin, and include an expected full
Minecraft Server Studio package. Redirects are bounded and must remain within
the approved HTTPS delivery origin. A missing, malformed, mismatched, or
unsupported index/package pair is a failed update, not an installable
candidate.

For a workflow-derived application version such as `0.94.1`, the matching
release assets are `Minecraft.Server.Studio-0.94.1-x64-Setup.exe`,
`minecraft-server-studio-0.94.1-full.nupkg`, and the `RELEASES` row naming that
full package. The full package is the essential update payload. Delta packages
remain optional because the current packaging configuration does not set a
remote Squirrel release source for delta generation.

After that validation, Electron's Squirrel updater selects and transfers the
candidate package. The `available` and `downloading` states are driven by its
update events; `ready` is emitted only after its staged-download event. The
`RELEASES` hash and size are integrity metadata for Squirrel update delivery,
not a replacement for a signature.

The release artifacts are intentionally unsigned. `RELEASES`, HTTPS transport,
and package hashes do not create a code-signing claim. Windows can show an
unknown-publisher or SmartScreen warning for the installer or restart step; the
application presents that fact plainly rather than claiming signer validation.
No signing certificate, private key, timestamp credential, or extension key is
requested, generated, stored, or used by this feature.

## Restart and unsaved work

Downloading or staging an update never restarts the application by itself. The
ready state stays visible as a non-blocking notice with the exact version and
release information available from the feed. The operator chooses either
**Restart to install update** or **Later**.

Before a user-selected restart, the desktop asks the renderer whether unsaved
work exists. A missing, malformed, timed-out, or failed response is treated as
unsaved work and blocks the restart. The staged `ready` state remains visible
with an explicit save-or-discard recovery action; it is never misreported as
installed. A failure after the restart request is also reported without claiming
installation.

## Failure and offline recovery

Network loss, an invalid HTTPS response, invalid or absent Squirrel metadata,
a corrupt package, and an updater-process error all leave the current
application installed and usable. The UI preserves the exact non-sensitive
failure class, offers a manual recheck or retry at the point of failure, and
never turns an error into a silent fallback download.

An offline approved feed is distinct from an unconfigured runtime: offline
means the installed supported application could not reach the fixed public
path; unconfigured means this process is not a supported installed
Squirrel.Windows application or cannot derive that exact path. Neither state
authorizes a guessed URL, a user-supplied URL, an unbounded retry loop, a forced
restart, or a network request from renderer code.

## Scope and verification boundary

This feature records application-update behavior only. Backup-first Minecraft
server update, server rollback, plugin update, and world restore controls are
separate incomplete surfaces. The desktop completeness inventory therefore
remains incomplete until those surfaces have their own implementation and
evidence.

This documentation is source-level behavior. The active delivery pass did not
run tests, linting, builds, packaged-runtime interaction, captures, or an
installer update cycle for this feature; none is claimed here.

## Suggested related articles

- [Server orchestration](server-orchestration.md)
- [Automatic dependency bootstrap](dependency-bootstrap.md)
- [Local status and completeness](local-status-and-completeness.md)
