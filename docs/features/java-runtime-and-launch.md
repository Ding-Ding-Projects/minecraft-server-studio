# Version-aware Java runtime and launch profiles

Minecraft Server Studio selects Java by the selected server flavor and Minecraft revision rather than assuming one fixed Java release. A runtime is discovered only from the configured/browsed executable, `JAVA_HOME`, `PATH`, or an app-managed runtime installed during the active session. It does not sweep arbitrary folders for executables. The app keeps the selected path separate from server arguments and launches Java directly without a shell.

## Compatibility policy

Paper compatibility is version-aware: Minecraft 1.7.10–1.11 uses Java 8, 1.12–1.16.4 uses Java 11, 1.16.5 uses Java 16, 1.17–1.19 uses Java 17, 1.20–1.21.11 uses Java 21, and Paper 26.1+ uses Java 25. The explicit gaps, including Paper 1.7–1.7.9, 1.21.12 through 26.0, and unrecognized numeric releases, remain unknown rather than inheriting a neighboring rule. Spigot BuildTools uses its own documented policy: versions below 1.17 use Java 8, 1.17/1.17.1 uses Java 16, later versions through 1.20.5 use Java 17, and 1.20.6 through 1.21.11 use Java 21. Newer or non-1.x Spigot revisions remain unknown.

The Runtime tab calls Java with direct argument vectors, first `--version` and then `-version` only when needed, and parses the returned feature version. An unrecognized version is not silently treated as compatible. The inventory returns the exact requirement, candidate source, feature, launchability, and an honest incompatibility or unknown-policy state.

## Launch boundary

The intended launch shape is a token array:

```text
<verified-java> <generated JVM options> -jar <verified-server-jar> <server arguments>
```

JVM options appear before `-jar`; server options appear after it. The launch preflight verifies the server JAR, selected Java feature, requirement, absolute paths, memory bound, diagnostics path, and token classes before it returns a launchable profile. The launcher uses a direct child process with separate standard-output and standard-error drains, a local working directory, and no operating-system shell. Ordinary profiles reject shell control syntax, agents, native-library and class-path options, argument files, Java management properties, and `OnError`/`OnOutOfMemoryError` hooks. The rich Runtime controls are the normal path; expert tokens remain bounded and subject to capability checks.

## Automatic installation and recovery

When no compatible Java runtime is detected, the app exposes a visible missing state, installation action, retry state, and post-install recheck. The automatic plan uses the user-invoked Windows package-manager route first. A portable fallback is available only when a canonical HTTPS source and checksum have been explicitly configured for that feature version. If no such source exists, the Runtime tab states the exact `missing-source` condition instead of inventing a download URL. Compatibility data guides the selected version, while the eventual selected JAR and runtime preflight remain authoritative.

## Current verification boundary

This document records the source-level behavior. Tests, runtime interaction, and captures were not run in the speed-delivery pass, so no packaged-runtime result is claimed.
