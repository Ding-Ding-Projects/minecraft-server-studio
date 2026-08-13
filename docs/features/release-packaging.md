# Windows release packaging metadata

## Behavior

The Windows packaging workflow serializes release publication so side-effecting release runs do not inspect the same historical release inventory at the same time. It continues to build unsigned Squirrel.Windows assets, validates the generated `Setup.exe` by its exact filename, and publishes only the validated installer, `RELEASES`, and Squirrel package assets.

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

## Security and release boundary

The metadata lookup uses the workflow's existing GitHub token path and does not place a token in release notes, artifacts, logs, or the repository. The image is not processed by the runner. The Windows installer and Squirrel update packages remain intentionally unsigned; code-name metadata does not alter application identity, update feed, package identity, or signing behavior.

## Verification

This source lane inspected the existing product release history and found no release body or title using `Classic Har Gow`, `hk-dish-0001`, or the public photo filename. It did not run tests, linting, a build, package, release, or runtime interaction. The next workflow run must provide the actual release-note and asset evidence before the behavior can be treated as delivery proof.

## Suggested articles

- [Unsigned automatic updates](unsigned-automatic-updates.md)
- [Local status and completeness](local-status-and-completeness.md)
