# Version-aware Java runtime and launch profiles

Minecraft Server Studio selects Java by the selected server flavor and Minecraft revision rather than assuming one fixed Java release. A runtime is discovered from the configured executable, standard local locations, or the app-managed toolchain. The app keeps the selected path separate from server arguments and launches Java directly without a shell.

## Compatibility policy

Paper compatibility is version-aware: Minecraft 1.7.10–1.11 uses Java 8, 1.12–1.16.4 uses Java 11, 1.16.5 uses Java 16, 1.17–1.19 uses Java 17, 1.20–1.21.11 uses Java 21, and Paper 26.1+ uses Java 25. Spigot BuildTools uses its own policy and preflight: versions below 1.17 use Java 8, 1.17/1.17.1 uses Java 16, later versions use Java 17, and versions after 1.20.5 use Java 21.

An unrecognized version is not silently treated as compatible. The Runtime tab explains the requirement and directs the user to the in-app installer or runtime chooser.

## Launch boundary

The intended launch shape is a token array:

```text
<verified-java> <generated JVM options> -jar <verified-server-jar> <server arguments>
```

JVM options appear before `-jar`; server options appear after it. The launcher uses a direct child process with separate standard-output and standard-error drains, a local working directory, and no operating-system shell. Ordinary profiles reject agent, native-library, class-path, argument-file, and operating-system-command flags. The rich Runtime controls are the normal path; expert tokens remain bounded and subject to capability checks.

## Automatic installation and recovery

When no compatible Java runtime is detected, the app exposes a visible missing state, installation action, retry state, and post-install recheck. It does not require a manual prerequisite setup step. Compatibility data guides the selected version, while the eventual selected JAR and runtime preflight remain authoritative.

## Current verification boundary

This document records the source-level behavior. Tests, runtime interaction, and captures were not run in the speed-delivery pass, so no packaged-runtime result is claimed.
