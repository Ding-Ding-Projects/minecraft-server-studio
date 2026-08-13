# Automatic dependency bootstrap

Minecraft Server Studio selects Java by the selected Paper or Spigot/BuildTools revision. It does not assume Java 21 for every server. Spigot setup additionally needs Git because BuildTools uses Git while assembling the selected server revision.

The current compatibility policy includes Java 8, 11, 16, 17, 21, and 25. Paper 26.1+ requires Java 25; older Paper ranges use the documented version-specific Java feature. BuildTools keeps its own version-aware preflight and is the final authority for its build operation.

## In-app flow

The **Required tools** card uses three explicit states for each dependency:

1. **Detected** — the executable is available from `PATH`, a standard installed location, or the app-private toolchain.
2. **Missing** — the app presents the **Install missing tools** action.
3. **Install failed; retry available** — the app keeps the missing state visible and allows a direct retry instead of asking the operator to troubleshoot prerequisites outside the product.

Installation tries Winget first and Chocolatey second. If neither package manager is available or a current process cannot discover the installed executable, the app downloads an official portable archive into its own application-data toolchain, expands it with the Windows PowerShell archive facility, detects the contained executable, and uses that path directly.

Java comes from the Eclipse Adoptium API with the package SHA-256 metadata when supplied. Git comes from the current Git for Windows release metadata and uses its MinGit portable archive. The app does not ask the operator to preinstall Java, Git, a package manager, or a development toolchain before continuing.

## Recovery behavior

An installer result is not treated as success until the executable is found again. A failed package-manager attempt falls through to the portable path. A failed portable download or extraction remains visibly retryable. Server setup describes the missing dependency and directs the operator to the in-app tool card rather than implying that a manual installation is the only route.

## Boundaries

Portable runtimes remain under the app's private application-data directory and are not copied into server folders. The app never installs a code-signing certificate, browser extension, or unrelated developer tool. Windows package managers may display their own consent or elevation interface; Minecraft Server Studio does not attempt to bypass platform consent.

## Verification boundary

The implementation was produced under the active speed-delivery workflow. Tests, captures, and live installer verification have not been run or claimed.
