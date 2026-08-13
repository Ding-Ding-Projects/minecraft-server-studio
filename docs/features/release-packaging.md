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

## Release-publication timing semantics

The release note records a workflow clock value immediately after the
non-draft `gh release create` command succeeds. Its timing section is therefore
explicitly labeled **Release-publication timing** and records the workflow
start, the release-publication command completion time, and elapsed time through
that event.

It does not label that value as a terminal workflow-completion timestamp. The
final release-note edit, published-asset availability polling, evidence
collection, and evidence upload occur later in the workflow. Recording only the
event that is known at release-note construction avoids a circular attempt to
rewrite a published release note after the final workflow step.

## Public dim-sum code-name metadata

Before finalizing the release note, the workflow calls the committed
`scripts/resolve-dim-sum-release-metadata.ps1` resolver. It reads metadata only
through the GitHub CLI and resolves these current public sources:

1. the `Ding-Ding-Projects/dim-sum-photos` `catalog/index.json` document at the
   current resolved catalog commit;
2. every published, non-draft, non-prerelease `catalog-v1*` release asset
   inventory from that repository; and
3. the complete paginated Minecraft Server Studio release history.

The resolver accepts only schema `1.0.0` catalog entries whose bounded dish
metadata maps by exact image filename to exactly one published `catalog-v1*`
asset. The asset must be a non-empty `image/png` on the public GitHub HTTPS
download route. It never treats the catalog's image path alone, an unpublished
record, an extra release asset without a current catalog record, or an
ambiguous asset name as eligible.

It keeps catalog order stable and marks every `hk-dish-####` reference found in
an earlier release name or body as reserved. The first remaining eligible
record becomes the current release's code name, catalog record, immutable
catalog-revision link, source release tag, and public asset hyperlink. This
avoids the former single-record exhaustion: once `hk-dish-0001` is recorded,
the next verified unused catalog-backed record can be selected rather than
silently treating the entire catalog as spent.

The resolver is deliberately metadata-only. It never downloads, decodes,
copies, bundles, vendors, or attaches a photo. The release note explicitly
states that its photo is a public link rather than an attached asset.

## Configuration and failure modes

The code name is release decoration, not a publication gate. If the catalog,
published asset inventory, or product release history is unavailable, malformed,
or yields no unused eligible record, the resolver writes an honest omission and
the existing packaging/publication path continues. It never invents a dish
name, guesses an asset URL, or reuses a catalog record merely to fill the
release-note section.

| Situation | Workflow behavior |
| --- | --- |
| A verified unused catalog-backed record is available | Adds its bilingual code name, record identifier, immutable catalog revision, source release tag, and public image hyperlink to the release notes. |
| An older release mentions a record identifier | Treats that record as reserved and advances to the next eligible catalog record. |
| The catalog is malformed, incomplete, unreadable, or has no eligible unused record | Omits the code name with an explicit resolver-unavailable message; packaging and publication still use their existing path. |
| A public asset is ambiguous, unpublished, empty, non-PNG, or outside the expected GitHub HTTPS route | Excludes that record from selection; it does not guess or construct a replacement URL. |
| A public image later becomes unavailable | The product release still contains only its source hyperlink; it never claims that an image asset was attached. |
| A computed application version is invalid | Stops before packaging; no asset or release is created. |
| A Setup filename, full package name, or `RELEASES` row differs from the computed version | Stops before publication; no mismatched asset is released. |
| The provenance tag already exists | Stops rather than replacing prior release assets. |

## Security and release boundary

The metadata lookup uses the workflow's existing GitHub token path and does not place a token in release notes, artifacts, logs, or the repository. The image is not processed by the runner. The Windows installer and Squirrel update packages remain intentionally unsigned; code-name metadata does not alter application identity, update feed, package identity, or signing behavior. The release-time version changes packaged version metadata and artifact names only; it does not change the app name, application identifier, executable identity, data-directory identity, or update-feed origin.

The generic release-photo-attachment rule conflicts with the narrower consumer
photo policy: this consumer repository must not download, copy, bundle, or
attach a `dim-sum-photos` image. This implementation follows the narrower
no-copy policy and records the conflict honestly. It does **not** claim that a
Minecraft Server Studio release has attached a dim-sum photo. A policy decision
would be required before that attachment condition could be asserted.

## Verification

Read-only catalog research at revision
`f77ea1169db0bfc17365414c44ff495a823c6823` found 2,866 current schema-1.0.0
dish records and 2,866 catalog-record-to-published-asset intersections across
the three current `catalog-v1*` releases. It found 92 product releases and one
prior catalog assignment: `hk-dish-0001` / `Classic Har Gow · 蝦餃` in
`v0.1.0-build.81.1`. The next observed eligible record was `hk-dish-0002` /
`Scallop Har Gow · 帶子蝦餃`; the resolver selects it only if the same public
evidence is still available at workflow time.

This lane did not run tests, linting, a build, package, release, or runtime
interaction. The next workflow run must provide the actual version-matched
Setup/package/`RELEASES` evidence, release-publication timing record, and asset
evidence before the behavior can be treated as delivery proof.

## Suggested articles

- [Unsigned automatic updates](unsigned-automatic-updates.md)
- [Local status and completeness](local-status-and-completeness.md)
