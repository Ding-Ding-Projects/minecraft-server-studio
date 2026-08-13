# Desktop notifications and destructive confirmation

This article records the desktop source contract for a bounded notification history and one reusable destructive-action confirmation surface. It covers application-owned presentation only. It does not turn an in-app message into server-side evidence, a durable audit record, a backup, a credential prompt, or proof that an operation completed.

## Delivery and evidence boundary

Minecraft Server Studio already has a renderer-local `toast()` helper and an `openDestructiveConfirmation()` helper in `src/renderer/renderer.js`. The former shows short-lived feedback, while the latter currently protects selected consequential command actions with two independent checkboxes and a full-range slider. The backup and Paper-replacement routes also validate confirmation state and a current reviewed-plan digest in `src/main/server-backup-manager.cjs`.

This feature record defines the next shared desktop behavior: a notification center must retain a bounded safe history of presentation events, and a destructive-action caller must use one reusable decision surface rather than inventing a one-off authorization shortcut. A source-level record is not proof that a notification was rendered, persisted, dismissed, announced to assistive technology, or that a confirmation prevented a real write in a packaged application.

Tests, linting, review, packaging, runtime interaction, and captures were not run in this fast-delivery lane.

## Notification center behavior

Notifications communicate information, progress, success, warning, and non-decision error states without blocking the current task. The active transient surface is anchored in the lower-right corner and exposes a polite live region. The shared notification center is responsible for presenting the same safe event content in a reviewable local list instead of treating a disappearing toast as the only record a user can inspect.

The notification contract is deliberately narrow:

- Every item carries a bounded kind, title or message, creation time, optional safe action label, and an explicit state such as active, dismissed, or unavailable.
- Informational, success, and progress items may auto-dismiss from the transient stack. Warnings and errors remain reviewable and must not be represented as resolved merely because their transient presentation ended.
- A user can dismiss an individual item without changing the underlying server, app, backup, configuration, or history record. Clearing a notification list is a presentation action, not a proof that the triggering condition recovered.
- A notification describes the application result it actually received. It must not claim that a remote server, RCON endpoint, management protocol, filesystem replacement, editor handoff, or update succeeded unless that route returned that result.
- The center is local to the app. It does not send telemetry, analytics, notification contents, credentials, or server data to a network service.

The existing renderer-only toast timeout is a fallback presentation detail, not a durable-notification guarantee. In particular, the current helper removes ordinary items after five seconds and errors after nine seconds; that source behavior is not evidence of a persisted or fully accessible notification-history result.

## Reusable destructive confirmation behavior

A destructive or irreversible operation must name the exact action and affected resource before it can execute. The shared confirmation surface requires all of the following in order:

1. Review the displayed action, target, and impact.
2. Operate two separate confirmation controls.
3. Move the authorization slider across its complete range.
4. Activate the now-enabled final authorization action.

The slider stays disabled until both independent controls are selected, and the final action stays disabled until the slider reaches its full value. A caller must not treat a keyboard submit, a synthetic click, a retained DOM value, or a visible dialog as authorization. The action callback is invoked only after the complete local confirmation state is present.

For operations backed by a reviewed plan, the main-process boundary must additionally bind the confirmation to the current plan digest. `src/main/server-backup-manager.cjs` already rejects missing confirmation controls, an incomplete slider, and a stale digest for snapshot restore and Paper JAR replacement/rollback. A stale or changed plan must be refreshed and confirmed again; displaying an old plan does not authorize a write.

The decision surface provides an Emergency exit/cancel route. Cancelling, closing, or pressing Escape leaves the action unperformed and returns focus to the originating control where the renderer can do so safely. The confirmation UI is a user-experience safety boundary, not a substitute for operating-system permissions, a backup, credential management, server-side authorization, or a validation check in the main process.

## Configuration and bounded data

This feature does not create a remote notification account, a cloud inbox, a setting that treats errors as hidden, or a credential store. The intended state is limited to safe presentation fields required to render and review local app notifications. It must omit:

- passwords, RCON secrets, management tokens, authentication material, one-time codes, QR payloads, and credential-vault values;
- local personal-vocabulary JSON payloads, mappings, source metadata, or replacement evidence;
- raw server-console output, unbounded command results, private paths, document contents, backups, JAR bytes, and external response bodies; and
- arbitrary HTML, executable markup, arbitrary callbacks, or a target object that the renderer can reinterpret as a filesystem or network instruction.

Any optional notification action must be explicitly allowlisted by the owning renderer feature and must use the same validation path as the original control. It must not turn a notification into an arbitrary command runner, shell, file opener, or external request.

## Failure and recovery states

| State | Required result |
| --- | --- |
| Notification center is unavailable | Preserve the underlying operation result separately, show an honest local fallback, and do not claim a history item was recorded. |
| Notification payload is malformed or exceeds a bound | Reject the payload or replace it with a bounded generic error without rendering raw untrusted content. |
| User dismisses or clears a notification | Update only the local presentation state; do not retry, undo, delete, or mark the underlying operation successful. |
| Confirmation is cancelled or Escape is used | Leave the destructive action unperformed and return focus to the initiating control where possible. |
| One confirmation control or slider value is missing | Keep authorization unavailable and do not invoke the action. |
| Reviewed plan changed or expired | Reject the stale confirmation, ask for a refreshed preview, and require a new complete confirmation. |
| Main-process operation fails after authorization | Surface the exact bounded failure through a notification; authorization is not a success result. |

An unavailable or rejected notification/confirmation path never authorizes a cloud fallback, an arbitrary shell, a network upload, secret logging, or a background destructive operation.

## Accessibility and presentation requirements

The notification stack and center require clear labels, keyboard-reachable dismiss and action controls, an announced status change, visible focus, sufficient contrast, and a bounded narrow-window layout. Error and warning text must state the actual outcome and recovery route even when decorative emoji, language presentation, or funny-level settings change surrounding voice.

The reusable confirmation must keep the affected resource and irreversible effect readable at every supported display scale. It needs keyboard operation for both controls, the range input, final action, and Emergency exit; it must not rely on color, animation, or pointer-only input to communicate readiness. Reduced-motion behavior, full localization, history browsing, a command-palette route, and real packaged interaction remain pending evidence until separately recorded.

## Verification boundary

Before this feature can be marked verified, the project still needs focused evidence for:

- bounded notification creation, stack timeout behavior, dismissal, center listing/clear behavior, and explicit unavailable/malformed states;
- no secret, raw server-output, arbitrary callback, or network leakage through notification state or exports;
- the two-control and full-slider sequence, cancellation, Escape, focus return, stale-plan rejection, and main-process refusal of incomplete confirmation;
- screen-reader announcements, keyboard-only operation, reduced motion, contrast, localization, and narrow/high-scale layouts; and
- real packaged-app interaction and captures of info, progress, warning/error, notification center, incomplete confirmation, cancelled confirmation, and completed destructive-operation failure states.

Until that evidence is available, this article documents a source contract and the existing seams only. It does not establish a release-quality notification center, a complete destructive-action inventory, or a successful server mutation.

## Suggested related articles

- [Local history and safe exports](local-history-and-safe-exports.md)
- [Bounded backups and Paper updates](backups-and-paper-updates.md)
- [RCON response safety](rcon-response-safety.md)
- [Offline documentation browser](offline-documentation-browser.md)
