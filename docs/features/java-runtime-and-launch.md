# Version-aware Java runtime and launch profiles

Minecraft Server Studio selects Java by the selected server flavor and Minecraft revision rather than assuming one fixed Java release. A runtime is discovered only from the configured/browsed executable, `JAVA_HOME`, `PATH`, bounded known Windows package-manager locations for Eclipse Adoptium and Java under Program Files or LocalAppData, or a persistent app-managed runtime record. It does not sweep arbitrary folders for executables. App-managed records live in the application's private data area, are created only after a verified installation, and are revalidated when the inventory is loaded; a stale, missing, or incompatible record is not silently selected. The app keeps the selected path separate from server arguments and launches Java directly without a shell.

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

When no compatible Java runtime is detected, the app exposes a visible missing state, installation action, retry state, and post-install recheck. The automatic plan offers the user-invoked Windows package-manager route first. It never treats a package-manager command as proof that Java is usable: the resulting executable must still pass the normal direct version probe and compatibility check.

### Official portable fallback

For a supported Java feature, the portable fallback obtains release metadata from the official [Adoptium API](https://api.adoptium.net/) rather than keeping a guessed or hard-coded binary URL. The request is limited to the required feature and HotSpot release stream, then selects a Windows package for the detected supported architecture with `image_type=jdk`. A response is usable only when its release and binary metadata agree with that request and it supplies all of the following:

- an HTTPS package URL;
- a Windows, architecture-matched JDK record for the requested Java feature;
- the provider's SHA-256 checksum; and
- a finite, positive provider-reported package size.

The selection is deliberately feature-aware. A Java 21 requirement, for example, cannot be satisfied by an otherwise valid Java 17 package merely because it is already cached. The app does not use an arbitrary PATH executable as a portable fallback, and it does not scrape a vendor download page.

### Validation, staging, and persistence

The selected package is downloaded into an application-private staging location with bounded transfer and extraction resources. Before it can become a runtime, the downloader verifies that the received byte count equals the provider-reported size and that its SHA-256 equals the provider checksum. Staging validates every ZIP entry path and the bounded entry count before extraction, then rejects links and special filesystem entries after extraction, before any runtime target is promoted. The archive is extracted through a direct argument-vector invocation only; no command shell, interpolated command string, or script text is used. The extraction target is an app-managed runtime directory, not a server directory or a user-selected arbitrary folder.

After extraction, the manager finds the expected Java executable, probes it with the same `--version` followed by `-version` fallback used for other runtimes, and verifies the required feature. Only then does it atomically store a persistent app-managed inventory record and make the runtime eligible for selection. The stored record is a local runtime reference and validation metadata, not a package-manager credential, server secret, or shell command. A later startup rechecks the record and removes it from eligible choices when its executable or feature no longer verifies.

### Exact recovery behavior

The Runtime tab keeps the recovery boundary explicit rather than replacing an unknown state with a plausible-looking download:

| Condition | Result |
| --- | --- |
| The selected server version has no known Java requirement, or the feature is outside the bundled installer policy. | Automatic installation is unavailable; the user sees the requirement boundary and no arbitrary installer is started. |
| Official metadata cannot be reached, is malformed, has no matching Windows/architecture/JDK result, or omits a valid HTTPS URL, SHA-256, or positive size. | The portable choice is reported as `missing-source`; no download URL is invented and no partial runtime record is saved. |
| The download has the wrong byte count or checksum, or staging/extraction cannot yield a verified executable. | The install reports the exact integrity or extraction failure, removes its staged output, retains any previously verified runtime, and does not select or persist the failed candidate. |
| A ZIP entry path is unsafe, the archive exceeds the bounded entry count, or extraction contains a link/special filesystem entry. | The install rejects the archive before promotion, removes staged output, retains any previously verified runtime, and does not select or persist the rejected candidate. |
| The extracted executable probes to the wrong feature or cannot be launched directly. | The candidate is rejected as incompatible or unavailable and no managed inventory entry is created. |
| A retry is requested. | Metadata is selected again and the complete validation path runs again; retry never trusts a prior failed archive. |

Compatibility data guides the selected version, while the eventual selected JAR and runtime preflight remain authoritative. Every recovery route uses direct process arguments and remains local to the app-managed runtime area; it never opens a shell or requires the user to assemble a command line.

## Current verification boundary

This document records the source-level behavior. Tests, runtime interaction, and captures were not run in the speed-delivery pass, so no packaged-runtime result is claimed.
