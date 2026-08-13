# BuildTools plan-only orchestration

The desktop BuildTools tab contains a plan-only orchestration boundary for a
selected local Spigot server. It creates an inspectable description of a future
BuildTools invocation without creating a directory, downloading BuildTools,
installing a dependency, starting Java, running Git, building a server JAR,
moving a JAR into a server folder, or acquiring a plugin.

The plan is produced by `src/main/buildtools-orchestration.cjs` and reaches the
renderer through a narrow Electron IPC method. It may consult the existing
desktop Java and Git discovery APIs so readiness is shown beside the plan. It
does not replace those APIs or invoke their installation operations.

## Typed input contract

The planner accepts only these typed fields. It accepts no arbitrary argument,
shell-command, extra-flag, or executable field.

| UI control | Direct BuildTools argument | Constraint |
| --- | --- | --- |
| Released numeric revision | `--rev <revision>` | `1.<minor>` or `1.<minor>.<patch>` only |
| Compile selection | `--compile Spigot[,CraftBukkit]` | Spigot, CraftBukkit, or both |
| Output directory name | `--output-dir <workspace child>` | A safe single name derived under the chosen workspace |
| Final artifact name | `--final-name <name>` | A safe filename-like token, never a path |
| Compile-if-changed switch | `--compile-if-changed` | Optional boolean |
| Do-not-update switch | `--dont-update` | Optional boolean; preview calls out possible staleness |
| Remapped switch | `--remapped` | Optional boolean |
| Generate source switch | `--generate-source` | Optional boolean |
| Generate documentation switch | `--generate-docs` | Optional boolean |
| Experimental switch | `--experimental` | Optional boolean |
| Development-build switch | `--dev` | Optional boolean |
| Pull-request number | `--pull-request <positive integer>` | Optional integer from 1 through 100000000 |

The preview renders the executable, working directory, `shell: false`, and one
argument per row. It deliberately does not render a copy-paste shell command,
because quoting and shell interpretation would no longer describe the direct
argument boundary.

`--disable-certificate-check` and `--disable-java-check` are refused. This
surface has no implemented consequence or recovery path that could safely
justify bypassing HTTPS or Java validation. A future executor would need a
separate documented design, explicit user-facing consequences, and independent
verification before either option could be reconsidered.

## Java and Git readiness

The planner surfaces this conservative Spigot BuildTools matrix from the shared
Java-runtime policy:

| Minecraft revision | Required Java feature |
| --- | --- |
| Before 1.17 | 8 |
| 1.17 and 1.17.1 | 16 |
| 1.17.2 through 1.20.5 | 17 |
| 1.20.6 through 1.21.11 | 21 |
| Newer or non-1.x revision | Unknown; no Java runtime is guessed |

Git is required for each future BuildTools run. When Java is missing,
incompatible, or unknown, or Git is missing, the plan remains visible but marks
the readiness state as blocked. The existing dependency controls remain the
only route that can detect or install those tools; the planner never performs
that work itself.

## Workspace and output boundaries

The user chooses one absolute BuildTools workspace through the native folder
picker. The planner rejects a filesystem root, the user home folder, the
selected server home, the application repository, a dependency directory,
temporary locations, and common synced locations. The output directory is not a
second arbitrary path: it is derived from the safe workspace plus a validated
single directory name. No workspace or output directory is created by planning.

The preview lists the official BuildTools artifact URL as future source context,
but it does not fetch it. Generated Spigot or CraftBukkit JARs are never added
to this repository, attached to this feature record, or distributed by this
surface. Plugin acquisition is explicitly unsupported; the separate plugin
workflow accepts only a user-selected local JAR.

## Execution boundary and recovery

The returned `execution` state is always `unavailable` in this implementation.
There is no downloader, process runner, JAR validator, promotion/rollback
handler, or executable button registered through the plan-only IPC route. A
successfully prepared plan is not a BuildTools run, does not prove that a Java
runtime or Git will work at execution time, and does not create a server JAR.

If a typed input is invalid, the planner reports the exact rejected field. If a
workspace is unsafe, choose a dedicated local directory outside the server,
source checkout, home folder, temporary directories, and synced folders. If
Java or Git is unavailable, use the existing dependency controls and prepare a
fresh plan afterward. A future execution capability must bind only to the
reviewed direct argv data and must not add a shell fallback.

## Verification boundary

This source was added in the active speed-delivery pass. No tests, linting,
build, package, runtime interaction, capture, deployment, server setup,
BuildTools download, process execution, JAR production, or release verification
was run for this feature. The completeness inventory intentionally retains
pending proof records until those independent artifacts exist.

## Suggested related articles

- [Spigot BuildTools adapter](spigot-buildtools.md)
- [Automatic dependency bootstrap](dependency-bootstrap.md)
- [Version-aware Java runtime and launch profiles](java-runtime-and-launch.md)
- [Server orchestration](server-orchestration.md)
- [Local status and completeness](local-status-and-completeness.md)
