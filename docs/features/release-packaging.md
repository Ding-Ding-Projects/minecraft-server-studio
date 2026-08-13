# Windows release packaging metadata

## Behavior

The Windows packaging workflow serializes release publication so side-effecting release runs do not inspect the same historical release inventory at the same time. It continues to build unsigned Squirrel.Windows assets, derives one workflow-local application version, validates the exact generated Setup executable and Squirrel package names, and publishes only the validated installer, `RELEASES`, and Squirrel package assets.

## Release-time application version

Before packaging, the workflow derives `0.<run>.<attempt>` from
`GITHUB_RUN_NUMBER` and `GITHUB_RUN_ATTEMPT`. Both source values must be
positive decimal integers, and the resulting value must be strict stable
three-part semantic versioning. It passes the computed value through Electron
Builder's `-c.extraMetadata.version` configuration route. The source
`package.json` and lockfile are not rewritten.

For example, run 94 / attempt 1 produces application version `0.94.1`. The
workflow requires these exact associated artifacts before publication:

```text
Minecraft.Server.Studio-0.94.1-x64-Setup.exe
minecraft-server-studio-0.94.1-full.nupkg
RELEASES (exactly one row naming minecraft-server-studio-0.94.1-full.nupkg)
```

The installer package version is not the GitHub Release tag. The tag remains
the existing provenance form `v<source-version>-build.<run>.<attempt>` and is
also required to be new. A pre-existing tag stops the workflow rather than
allowing an asset replacement. This preserves immutable, distinct Squirrel
package names and `RELEASES` references even when a workflow is rerun.

The packaged updater reads Electron's runtime `app.getVersion()` value, not the
checked-in source baseline or the release tag. It requires that value and the
validated Squirrel full-package filename to be stable three-part numeric
versions, selects the greatest full package independent of `RELEASES` row
order, and refuses an older package as a rollback candidate. A provenance tag
can identify release notes, but it is never converted into an updater version.
The controller validates `releases/latest/download/RELEASES` first, then passes
only its approved redirect-derived release directory to the native updater so
a later latest-release change cannot swap the package selected by that check.

The workflow does not use SemVer build metadata (`+...`) because the Windows
installer converter removes it from the NuGet package version. It does not use
a prerelease suffix because that sorts below the corresponding stable version.
The strictly numeric workflow version is therefore the updater-facing value;
the source version remains a development baseline only.

Before it finalizes a release note, the workflow reads the complete product release history through the GitHub CLI. It excludes the current rerun-unique tag so a rerun can retain its own already-selected metadata. The next eligible release receives the following one-time catalog reference only when no earlier release name or body already records the same code name, catalog record, or public photo URL:

- Code name: **Classic Har Gow · 蝦餃**
- Catalog record: `hk-dish-0001`
- Public photo: <https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png>

The public photo stays in the `Ding-Ding-Projects/dim-sum-photos` release. The consumer workflow only records a hyperlink: it does not download, copy, bundle, or attach the image to a Minecraft Server Studio release.

## Configuration and failure modes

The catalog record, code name, and public release-asset URL are fixed workflow metadata. A code name is assigned only after the complete paginated release history is available and proves that the record is unused.

| Situation | Workflow behavior |
| --- | --- |
| No earlier assignment is found | Adds the code name and a public photo hyperlink to the release notes. |
| An earlier release already names the code name, record, or URL | Omits the code name and names the existing release tag in the release notes. |
| The release history cannot be read or parsed | Omits the code name with an explicit history-unavailable reason; packaging and publication still use their existing path. |
| The public image is unavailable later | The release still contains only a hyperlink; it never pretends an image asset was attached. |
| A computed application version is invalid | Stops before packaging; no asset or release is created. |
| A Setup filename, full package name, or `RELEASES` row differs from the computed version | Stops before publication; no mismatched asset is released. |
| The provenance tag already exists | Stops rather than replacing prior release assets. |

## Security and release boundary

The metadata lookup uses the workflow's existing GitHub token path and does not place a token in release notes, artifacts, logs, or the repository. The image is not processed by the runner. The Windows installer and Squirrel update packages remain intentionally unsigned; code-name metadata does not alter application identity, update feed, package identity, or signing behavior. The release-time version changes packaged version metadata and artifact names only; it does not change the app name, application identifier, executable identity, data-directory identity, or update-feed origin.

## Verification

This source lane inspected the existing product release history and found no release body or title using `Classic Har Gow`, `hk-dish-0001`, or the public photo filename. It did not run tests, linting, a build, package, release, or runtime interaction. The next workflow run must provide the actual version-matched Setup/package/`RELEASES` evidence, release-note, and asset evidence before the behavior can be treated as delivery proof.

## Suggested articles

- [Unsigned automatic updates](unsigned-automatic-updates.md)
- [Local status and completeness](local-status-and-completeness.md)
