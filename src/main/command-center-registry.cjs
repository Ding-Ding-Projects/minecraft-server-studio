'use strict';

/**
 * Command Center is deliberately a schema and discovery layer, not a second
 * command implementation. Minecraft, Paper, Spigot, and plugins evolve
 * independently, so this module keeps its broad action families stable while
 * making command availability evidence-driven at runtime.
 *
 * No function here starts a process, calls a network endpoint, or writes a
 * server file. Callers bring in discovery evidence collected through their
 * own privileged, bounded routes and use the result to render rich controls.
 */

const COMMAND_CENTER_SCHEMA_VERSION = 1;
const MAX_RAW_COMMAND_LENGTH = 4096;
const MAX_RAW_TOKENS = 64;
const MAX_TOKEN_LENGTH = 512;
const MAX_RICH_TEXT_LENGTH = 1024;
const MAX_DISCOVERED_ACTIONS = 512;
const MAX_DISCOVERED_PERMISSIONS = 2048;
const MAX_DISCOVERY_EVIDENCE = 48;
const MAX_DISCOVERY_EVIDENCE_TEXT = 64 * 1024;

const ROUTES = Object.freeze({
  LOCAL_CONSOLE: 'local-console',
  RCON: 'rcon',
  PROTOCOL: 'runtime-protocol',
  HOST_LIFECYCLE: 'host-lifecycle'
});

const PROTOCOL_REQUIREMENT_STATES = Object.freeze({
  ADVERTISED: {
    id: 'advertised-runtime-method',
    executable: true,
    explanation: 'The runtime explicitly advertised this protocol method.'
  },
  NOT_ADVERTISED: {
    id: 'not-advertised',
    executable: false,
    explanation: 'Do not call a protocol method that was not advertised by the running runtime.'
  },
  NOT_APPLICABLE: {
    id: 'not-applicable',
    executable: false,
    explanation: 'This action is a console, RCON, or host-lifecycle operation rather than a protocol call.'
  }
});

const RISK_CATEGORIES = Object.freeze({
  LOW: 'low',
  OPERATIONAL: 'operational',
  PLAYER_IMPACT: 'player-impact',
  PRIVILEGE: 'privilege',
  WORLD_MUTATION: 'world-mutation',
  CONTENT_MUTATION: 'content-mutation',
  DESTRUCTIVE: 'destructive'
});

const BACKUP_REQUIREMENTS = Object.freeze({
  NONE: 'none',
  RECOMMENDED: 'recommended',
  REQUIRED: 'required'
});

const CONFIRMATION_REQUIREMENTS = Object.freeze({
  NONE: 'none',
  REVIEW: 'review',
  EXPLICIT: 'explicit',
  SUPER_CONFIRMATION: 'super-confirmation'
});

const RAW_FALLBACK_POLICY = Object.freeze({
  mode: 'tokenized-only',
  maxTokens: MAX_RAW_TOKENS,
  maxTokenLength: MAX_TOKEN_LENGTH,
  maxCommandLength: MAX_RAW_COMMAND_LENGTH,
  noControlCharacters: true,
  noShellInterpolation: true,
  routes: [ROUTES.LOCAL_CONSOLE, ROUTES.RCON],
  explanation: 'Raw fallback is a bounded token list. It is never a shell command, never accepts line breaks, and is routed only to the selected Minecraft console or RCON transport.'
});

const CAPABILITY_BADGE_RULES = Object.freeze({
  RUNTIME_COMMAND: {
    id: 'runtime-command',
    source: 'runtime',
    label: 'Runtime command evidence',
    whenMissing: 'unknown'
  },
  PAPER_USAGE: {
    id: 'paper-usage',
    source: 'paper-usage',
    label: 'Paper /paper usage evidence',
    whenMissing: 'unknown'
  },
  SPIGOT_JAR_HELP: {
    id: 'spigot-jar-help',
    source: 'spigot-jar-help',
    label: 'Spigot JAR --help evidence',
    whenMissing: 'unknown'
  },
  LOCAL_JAR_PROBE: {
    id: 'local-jar-probe',
    source: 'local-jar-probe',
    label: 'Selected JAR evidence',
    whenMissing: 'unknown'
  },
  LIVE_RUNTIME: {
    id: 'live-runtime-command',
    source: 'live-runtime',
    label: 'Live runtime command evidence',
    whenMissing: 'unknown'
  },
  PLUGIN_YAML: {
    id: 'plugin-yaml',
    source: 'plugin.yml',
    label: 'Plugin descriptor evidence',
    whenMissing: 'unknown'
  },
  VERSION_METADATA: {
    id: 'version-metadata',
    source: 'version',
    label: 'Runtime version metadata',
    whenMissing: 'unknown'
  }
});

function control(id, label, type, options = {}) {
  return Object.freeze({
    id,
    label,
    control: type,
    required: Boolean(options.required),
    help: options.help || '',
    validation: options.validation || {},
    options: options.options || [],
    default: options.default,
    advanced: Boolean(options.advanced),
    repeatable: Boolean(options.repeatable),
    source: options.source || 'static',
    fallback: options.fallback || null,
    accessibility: options.accessibility || {
      label,
      describedBy: options.help || ''
    }
  });
}

const FIELDS = Object.freeze({
  PLAYER: control('player', 'Player', 'player-picker', {
    required: true,
    source: 'runtime-player-list',
    fallback: 'validated-player-name',
    validation: { kind: 'player', maxLength: 16 },
    help: 'Choose an online player when available, or enter a validated Minecraft player name.'
  }),
  TARGET: control('target', 'Target', 'target-selector-builder', {
    required: true,
    source: 'runtime-entity-list',
    fallback: 'validated-selector-or-player',
    validation: { kind: 'target', maxLength: 256 },
    help: 'Use the selector builder for a player, entity selector, or direct player name.'
  }),
  OPTIONAL_TARGET: control('target', 'Target', 'target-selector-builder', {
    source: 'runtime-entity-list',
    fallback: 'validated-selector-or-player',
    validation: { kind: 'target', maxLength: 256 },
    help: 'Leave empty only when the server command supports an implicit target.'
  }),
  ITEM: control('item', 'Item', 'resource-location-picker', {
    required: true,
    source: 'runtime-registry',
    fallback: 'validated-resource-location',
    validation: { kind: 'resource-location', maxLength: 256 },
    help: 'Pick a runtime-known item or use a namespaced resource location.'
  }),
  BLOCK: control('block', 'Block', 'resource-location-picker', {
    required: true,
    source: 'runtime-registry',
    fallback: 'validated-resource-location',
    validation: { kind: 'resource-location', maxLength: 256 }
  }),
  ENTITY: control('entity', 'Entity type', 'resource-location-picker', {
    required: true,
    source: 'runtime-registry',
    fallback: 'validated-resource-location',
    validation: { kind: 'resource-location', maxLength: 256 }
  }),
  RESOURCE: control('resource', 'Resource location', 'resource-location-picker', {
    required: true,
    source: 'runtime-registry',
    fallback: 'validated-resource-location',
    validation: { kind: 'resource-location', maxLength: 256 }
  }),
  COUNT: control('count', 'Count', 'number-stepper', {
    validation: { kind: 'integer', min: 1, max: 2147483647 },
    default: 1
  }),
  AMOUNT: control('amount', 'Amount', 'number-stepper', {
    required: true,
    validation: { kind: 'integer', min: 0, max: 2147483647 }
  }),
  LEVELS: control('levels', 'Levels', 'number-stepper', {
    required: true,
    validation: { kind: 'integer', min: -2147483648, max: 2147483647 }
  }),
  DURATION_SECONDS: control('duration', 'Duration (seconds)', 'number-stepper', {
    required: true,
    validation: { kind: 'integer', min: 0, max: 1000000 }
  }),
  COORDINATE: control('position', 'Position', 'coordinate-triple', {
    required: true,
    validation: { kind: 'coordinate-triple' },
    help: 'Use absolute, relative (~), or local (^) coordinates. The component validates each axis separately.'
  }),
  OPTIONAL_COORDINATE: control('position', 'Position', 'coordinate-triple', {
    validation: { kind: 'coordinate-triple' }
  }),
  ROTATION: control('rotation', 'Rotation', 'rotation-control', {
    required: true,
    validation: { kind: 'rotation-pair' }
  }),
  MESSAGE: control('message', 'Message', 'rich-text-message-editor', {
    required: true,
    validation: { kind: 'rich-text', maxLength: MAX_RICH_TEXT_LENGTH },
    help: 'The editor produces one safely quoted Minecraft argument; it does not accept line breaks.'
  }),
  JSON_COMPONENT: control('component', 'Text component', 'json-component-builder', {
    required: true,
    validation: { kind: 'json-component', maxLength: MAX_RICH_TEXT_LENGTH },
    help: 'Build a text component with structured fields or provide valid bounded JSON.'
  }),
  BOOLEAN: control('enabled', 'Enabled', 'switch', {
    required: true,
    validation: { kind: 'boolean' }
  }),
  GAMEMODE: control('gamemode', 'Game mode', 'segmented-select', {
    required: true,
    options: ['survival', 'creative', 'adventure', 'spectator'],
    validation: { kind: 'enum', values: ['survival', 'creative', 'adventure', 'spectator'] }
  }),
  DIFFICULTY: control('difficulty', 'Difficulty', 'segmented-select', {
    required: true,
    options: ['peaceful', 'easy', 'normal', 'hard'],
    validation: { kind: 'enum', values: ['peaceful', 'easy', 'normal', 'hard'] }
  }),
  WEATHER: control('weather', 'Weather', 'segmented-select', {
    required: true,
    options: ['clear', 'rain', 'thunder'],
    validation: { kind: 'enum', values: ['clear', 'rain', 'thunder'] }
  }),
  TIME: control('time', 'Time', 'time-preset-or-stepper', {
    required: true,
    options: ['day', 'noon', 'night', 'midnight'],
    validation: { kind: 'time' }
  }),
  RULE: control('rule', 'Game rule', 'gamerule-picker', {
    required: true,
    source: 'runtime-gamerules',
    fallback: 'validated-game-rule',
    validation: { kind: 'identifier', maxLength: 128 }
  }),
  RULE_VALUE: control('value', 'Game rule value', 'gamerule-value-editor', {
    required: true,
    source: 'selected-gamerule-type',
    fallback: 'validated-token',
    validation: { kind: 'safe-token', maxLength: 128 }
  }),
  RADIUS: control('radius', 'Radius', 'number-stepper', {
    required: true,
    validation: { kind: 'number', min: 0, max: 59999968 }
  }),
  DISTANCE: control('distance', 'Distance', 'number-stepper', {
    required: true,
    validation: { kind: 'number', min: 0, max: 59999968 }
  }),
  TEAM: control('team', 'Team', 'team-picker', {
    required: true,
    source: 'runtime-scoreboard',
    fallback: 'validated-identifier',
    validation: { kind: 'identifier', maxLength: 64 }
  }),
  OBJECTIVE: control('objective', 'Objective', 'scoreboard-objective-picker', {
    required: true,
    source: 'runtime-scoreboard',
    fallback: 'validated-identifier',
    validation: { kind: 'identifier', maxLength: 64 }
  }),
  TAG: control('tag', 'Tag', 'tag-picker', {
    required: true,
    validation: { kind: 'identifier', maxLength: 1024 }
  }),
  FUNCTION: control('function', 'Function', 'function-picker', {
    required: true,
    source: 'runtime-functions',
    fallback: 'validated-resource-location',
    validation: { kind: 'resource-location', maxLength: 256 }
  }),
  SCHEDULE_TIME: control('time', 'Delay', 'duration-picker', {
    required: true,
    validation: { kind: 'duration-token', maxLength: 32 }
  }),
  SOUND: control('sound', 'Sound', 'resource-location-picker', {
    required: true,
    source: 'runtime-registry',
    fallback: 'validated-resource-location',
    validation: { kind: 'resource-location', maxLength: 256 }
  }),
  PARTICLE: control('particle', 'Particle', 'resource-location-picker', {
    required: true,
    source: 'runtime-registry',
    fallback: 'validated-resource-location',
    validation: { kind: 'resource-location', maxLength: 256 }
  }),
  PERMISSION: control('permission', 'Permission', 'permission-picker', {
    required: true,
    source: 'plugin-yml-permissions',
    fallback: 'validated-permission-node',
    validation: { kind: 'permission', maxLength: 256 }
  }),
  RAW_ARGUMENTS: control('arguments', 'Arguments', 'token-list-editor', {
    source: 'none',
    validation: { kind: 'token-list', maxTokens: MAX_RAW_TOKENS, maxTokenLength: MAX_TOKEN_LENGTH },
    help: 'Add arguments as separate tokens. The editor rejects line breaks and control characters.'
  })
});

function optionalControl(field, overrides = {}) {
  return {
    ...field,
    required: false,
    ...overrides
  };
}

function sourceRule(id, label, source, options = {}) {
  return {
    id,
    label,
    source,
    required: Boolean(options.required),
    flavor: options.flavor || null,
    minVersion: options.minVersion || null,
    capability: options.capability || null,
    stateWhenMissing: options.stateWhenMissing || 'unknown',
    note: options.note || ''
  };
}

function rawFallback(options = {}) {
  return {
    ...RAW_FALLBACK_POLICY,
    enabled: options.enabled !== false,
    preferredRoute: options.preferredRoute || ROUTES.LOCAL_CONSOLE,
    reason: options.reason || 'Use the token editor only when the structured form cannot represent a verified runtime command.'
  };
}

function commandAction(spec) {
  const command = spec.command || spec.id.split('.').pop();
  return {
    id: spec.id,
    title: spec.title,
    summary: spec.summary || '',
    command,
    fields: spec.fields || [],
    forms: spec.forms || [{ id: 'default', label: command, prefix: [command], badges: [] }],
    sourceRules: spec.sourceRules || [
      sourceRule('runtime-command', 'Runtime command evidence', 'runtime', {
        capability: 'command:' + command,
        note: 'Availability is confirmed only by the connected runtime or its version metadata.'
      }),
      sourceRule('version', 'Minecraft version metadata', 'version', {
        minVersion: spec.minVersion || null,
        note: 'Version metadata is advisory when a server has not advertised a command list.'
      })
    ],
    capabilityBadgeRules: spec.capabilityBadgeRules || [
      { ...CAPABILITY_BADGE_RULES.RUNTIME_COMMAND, capability: 'command:' + command },
      { ...CAPABILITY_BADGE_RULES.VERSION_METADATA, minVersion: spec.minVersion || null }
    ],
    risk: spec.risk || RISK_CATEGORIES.LOW,
    backupRequirement: spec.backupRequirement || BACKUP_REQUIREMENTS.NONE,
    confirmationRequirement: spec.confirmationRequirement || CONFIRMATION_REQUIREMENTS.NONE,
    deprecated: Boolean(spec.deprecated),
    warning: spec.warning || '',
    origin: spec.origin || { source: 'schema', label: 'Built-in command schema' },
    runtimeEvidenceRequired: spec.runtimeEvidenceRequired || null,
    rawFallback: rawFallback(spec.rawFallback),
    transport: {
      localConsole: spec.localConsole !== false,
      rcon: spec.rcon !== false,
      hostLifecycle: Boolean(spec.hostLifecycle),
      protocolMethods: spec.protocolMethods || ['minecraft.command.execute', 'server.command.execute', 'command.execute']
    },
    template: spec.template || [],
    family: spec.family || null,
    dynamic: Boolean(spec.dynamic)
  };
}

function runtimeSemanticAction(spec) {
  return commandAction({
    ...spec,
    command: spec.command || 'paper',
    dynamic: true,
    forms: [
      {
        id: 'paper-runtime-current',
        label: 'Runtime-discovered Paper command',
        dynamicPrefix: 'paper.semantic:' + spec.semantic,
        badges: [
          {
            ...CAPABILITY_BADGE_RULES.PAPER_USAGE,
            capability: 'paper.semantic:' + spec.semantic,
            label: 'Paper runtime command'
          }
        ]
      },
      {
        id: 'legacy-manual',
        label: 'Legacy/manual fallback',
        prefix: spec.legacyPrefix || [],
        deprecated: true,
        badges: [{
          id: 'legacy',
          source: 'manual',
          label: 'Legacy command: capability required',
          stateWhenMissing: 'unknown'
        }]
      }
    ],
    sourceRules: [
      sourceRule('paper-runtime', 'Paper /paper usage evidence', 'paper-usage', {
        required: true,
        flavor: 'paper',
        capability: 'paper.semantic:' + spec.semantic,
        note: 'Paper command spelling is selected only from current runtime usage evidence.'
      }),
      sourceRule('legacy-manual', 'Legacy Paper command', 'manual', {
        flavor: 'paper',
        stateWhenMissing: 'unknown',
        note: 'Legacy forms are shown as compatibility options, never assumed to exist.'
      })
    ],
    capabilityBadgeRules: [
      { ...CAPABILITY_BADGE_RULES.PAPER_USAGE, capability: 'paper.semantic:' + spec.semantic },
      { ...CAPABILITY_BADGE_RULES.VERSION_METADATA, minVersion: null }
    ],
    warning: spec.warning || 'Paper command names can differ between current and legacy releases. Use the capability badge before executing.'
  });
}

const COMMAND_FAMILIES = Object.freeze([
  {
    id: 'lifecycle',
    title: 'Lifecycle and diagnostics',
    description: 'Save, stop, restart, and runtime-specific diagnostic operations.',
    sourceRules: [
      sourceRule('runtime-console', 'Local server console', 'local-console', { required: true }),
      sourceRule('paper-runtime', 'Paper /paper usage', 'paper-usage', {
        flavor: 'paper',
        note: 'Paper diagnostics are discovered from the running Paper command surface.'
      })
    ],
    capabilityBadgeRules: [
      CAPABILITY_BADGE_RULES.RUNTIME_COMMAND,
      CAPABILITY_BADGE_RULES.PAPER_USAGE,
      CAPABILITY_BADGE_RULES.VERSION_METADATA
    ],
    risk: RISK_CATEGORIES.OPERATIONAL,
    backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW,
    rawFallback: rawFallback({ reason: 'Use a bounded tokenized console command if a runtime-specific lifecycle command is not represented yet.' }),
    actions: [
      commandAction({
        id: 'lifecycle.save-all',
        title: 'Save all',
        command: 'save-all',
        summary: 'Flush world state to disk before a backup, restart, or maintenance window.',
        fields: [control('flush', 'Flush immediately', 'switch', { validation: { kind: 'boolean' }, default: false })],
        template: [{ optionalField: 'flush', whenValue: true, literal: 'flush' }],
        risk: RISK_CATEGORIES.OPERATIONAL,
        backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW
      }),
      commandAction({
        id: 'lifecycle.save-on',
        title: 'Enable automatic saves',
        command: 'save-on',
        summary: 'Re-enable normal world saving after a controlled maintenance period.',
        risk: RISK_CATEGORIES.OPERATIONAL
      }),
      commandAction({
        id: 'lifecycle.save-off',
        title: 'Disable automatic saves',
        command: 'save-off',
        summary: 'Pauses automatic saves. The console keeps an explicit active warning until saving is restored.',
        risk: RISK_CATEGORIES.WORLD_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'lifecycle.stop',
        title: 'Stop server',
        command: 'stop',
        summary: 'Requests a graceful Minecraft shutdown.',
        risk: RISK_CATEGORIES.OPERATIONAL,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'lifecycle.restart',
        title: 'Restart server',
        command: 'restart',
        summary: 'Host-managed restart: saves first, sends stop, then starts only through the configured local launcher.',
        fields: [control('saveFirst', 'Save before restart', 'switch', { validation: { kind: 'boolean' }, default: true })],
        hostLifecycle: true,
        localConsole: false,
        rcon: false,
        template: [],
        forms: [{ id: 'host-managed', label: 'Host-managed restart', prefix: [], badges: [{ id: 'host', source: 'local', label: 'Local launcher configuration required' }] }],
        risk: RISK_CATEGORIES.OPERATIONAL,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION,
        rawFallback: { enabled: false }
      }),
      commandAction({
        id: 'lifecycle.reload',
        title: 'Reload server data',
        command: 'reload',
        summary: 'Requests a server reload.',
        deprecated: true,
        warning: 'Reload can destabilize plugins and datapacks. Prefer a controlled restart unless the runtime documentation explicitly recommends reload.',
        risk: RISK_CATEGORIES.CONTENT_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      runtimeSemanticAction({
        id: 'lifecycle.paper-profiling',
        title: 'Paper profiling',
        semantic: 'profiling',
        summary: 'Opens a runtime-discovered Paper profiling action only after Paper advertises it.',
        fields: [control('operation', 'Profiling action', 'runtime-command-picker', {
          required: true,
          source: 'paper-usage',
          validation: { kind: 'safe-token', maxLength: 64 }
        })],
        template: [{ field: 'operation' }],
        legacyPrefix: ['timings'],
        risk: RISK_CATEGORIES.OPERATIONAL,
        backupRequirement: BACKUP_REQUIREMENTS.NONE,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW
      }),
      runtimeSemanticAction({
        id: 'lifecycle.paper-jfr',
        title: 'Paper JFR diagnostics',
        semantic: 'jfr',
        summary: 'Uses only a JFR-capable Paper command discovered from the active runtime.',
        fields: [control('operation', 'JFR action', 'runtime-command-picker', {
          required: true,
          source: 'paper-usage',
          validation: { kind: 'safe-token', maxLength: 64 }
        })],
        template: [{ field: 'operation' }],
        legacyPrefix: ['jfr'],
        risk: RISK_CATEGORIES.OPERATIONAL,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW
      }),
      runtimeSemanticAction({
        id: 'lifecycle.paper-tick',
        title: 'Paper tick diagnostics',
        semantic: 'tick',
        summary: 'Uses a Paper tick diagnostic only when current Paper usage reports a matching capability.',
        fields: [control('operation', 'Tick action', 'runtime-command-picker', {
          required: true,
          source: 'paper-usage',
          validation: { kind: 'safe-token', maxLength: 64 }
        })],
        template: [{ field: 'operation' }],
        legacyPrefix: ['tick'],
        risk: RISK_CATEGORIES.OPERATIONAL,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW
      })
    ]
  },
  {
    id: 'moderation',
    title: 'Moderation and access',
    description: 'Privilege, allowlist, ban, pardon, kick, and player-list controls.',
    sourceRules: [sourceRule('runtime-command', 'Runtime command evidence', 'runtime', { required: true })],
    capabilityBadgeRules: [CAPABILITY_BADGE_RULES.RUNTIME_COMMAND, CAPABILITY_BADGE_RULES.VERSION_METADATA],
    risk: RISK_CATEGORIES.PRIVILEGE,
    backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT,
    rawFallback: rawFallback(),
    actions: [
      commandAction({
        id: 'moderation.op',
        title: 'Grant operator',
        command: 'op',
        fields: [FIELDS.PLAYER],
        template: [{ field: 'player' }],
        risk: RISK_CATEGORIES.PRIVILEGE,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'moderation.deop',
        title: 'Remove operator',
        command: 'deop',
        fields: [FIELDS.PLAYER],
        template: [{ field: 'player' }],
        risk: RISK_CATEGORIES.PRIVILEGE,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'moderation.allowlist',
        title: 'Manage allowlist',
        command: 'allowlist',
        fields: [
          control('operation', 'Allowlist action', 'segmented-select', {
            required: true,
            options: ['on', 'off', 'list', 'add', 'remove', 'reload'],
            validation: { kind: 'enum', values: ['on', 'off', 'list', 'add', 'remove', 'reload'] }
          }),
          FIELDS.PLAYER
        ],
        forms: [
          {
            id: 'allowlist-current',
            label: 'Runtime-selected allowlist command',
            prefix: ['allowlist'],
            badges: [{ id: 'current-or-legacy', source: 'runtime', label: 'Current command capability', stateWhenMissing: 'unknown' }]
          },
          {
            id: 'whitelist-legacy',
            label: 'Legacy whitelist command',
            prefix: ['whitelist'],
            deprecated: true,
            badges: [{ id: 'legacy', source: 'manual', label: 'Legacy command: capability required', stateWhenMissing: 'unknown' }]
          }
        ],
        template: [{ field: 'operation' }, { optionalField: 'player', onlyWhen: { operation: ['add', 'remove'] } }],
        warning: 'The current command spelling can differ by version. The renderer must show the selected form badge before execution.',
        risk: RISK_CATEGORIES.PRIVILEGE,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      }),
      commandAction({
        id: 'moderation.ban',
        title: 'Ban player',
        command: 'ban',
        fields: [FIELDS.PLAYER, control('reason', 'Reason', 'rich-text-message-editor', { validation: { kind: 'rich-text', maxLength: 512 } })],
        template: [{ field: 'player' }, { optionalField: 'reason' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'moderation.pardon',
        title: 'Pardon player',
        command: 'pardon',
        fields: [FIELDS.PLAYER],
        template: [{ field: 'player' }],
        risk: RISK_CATEGORIES.PRIVILEGE,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      }),
      commandAction({
        id: 'moderation.kick',
        title: 'Kick player',
        command: 'kick',
        fields: [FIELDS.PLAYER, FIELDS.MESSAGE],
        template: [{ field: 'player' }, { field: 'message' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      }),
      commandAction({
        id: 'moderation.list',
        title: 'List players',
        command: 'list',
        summary: 'Lists current players and configured capacity.',
        risk: RISK_CATEGORIES.LOW
      })
    ]
  },
  {
    id: 'settings',
    title: 'Settings and game rules',
    description: 'Runtime settings exposed as typed controls rather than free-form console text.',
    sourceRules: [sourceRule('runtime-registry', 'Runtime game-rule registry', 'runtime', { required: true })],
    capabilityBadgeRules: [CAPABILITY_BADGE_RULES.RUNTIME_COMMAND, CAPABILITY_BADGE_RULES.VERSION_METADATA],
    risk: RISK_CATEGORIES.WORLD_MUTATION,
    backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW,
    rawFallback: rawFallback(),
    actions: [
      commandAction({
        id: 'settings.gamerule',
        title: 'Set game rule',
        command: 'gamerule',
        fields: [FIELDS.RULE, FIELDS.RULE_VALUE],
        template: [{ field: 'rule' }, { field: 'value' }],
        risk: RISK_CATEGORIES.WORLD_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      })
    ]
  },
  {
    id: 'world-gameplay',
    title: 'World and gameplay',
    description: 'World state, spawn, weather, time, game mode, and border operations.',
    sourceRules: [sourceRule('runtime-command', 'Runtime command evidence', 'runtime', { required: true })],
    capabilityBadgeRules: [CAPABILITY_BADGE_RULES.RUNTIME_COMMAND, CAPABILITY_BADGE_RULES.VERSION_METADATA],
    risk: RISK_CATEGORIES.WORLD_MUTATION,
    backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT,
    rawFallback: rawFallback(),
    actions: [
      commandAction({
        id: 'world.difficulty',
        title: 'Set difficulty',
        command: 'difficulty',
        fields: [FIELDS.DIFFICULTY],
        template: [{ field: 'difficulty' }],
        risk: RISK_CATEGORIES.WORLD_MUTATION
      }),
      commandAction({
        id: 'world.defaultgamemode',
        title: 'Set default game mode',
        command: 'defaultgamemode',
        fields: [FIELDS.GAMEMODE],
        template: [{ field: 'gamemode' }],
        risk: RISK_CATEGORIES.WORLD_MUTATION
      }),
      commandAction({
        id: 'world.gamemode',
        title: 'Set player game mode',
        command: 'gamemode',
        fields: [FIELDS.GAMEMODE, FIELDS.OPTIONAL_TARGET],
        template: [{ field: 'gamemode' }, { optionalField: 'target' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'world.time',
        title: 'Set or add time',
        command: 'time',
        fields: [
          control('operation', 'Time action', 'segmented-select', {
            required: true,
            options: ['set', 'add', 'query'],
            validation: { kind: 'enum', values: ['set', 'add', 'query'] }
          }),
          FIELDS.TIME
        ],
        template: [{ field: 'operation' }, { field: 'time', onlyWhen: { operation: ['set', 'add'] } }],
        risk: RISK_CATEGORIES.WORLD_MUTATION
      }),
      commandAction({
        id: 'world.weather',
        title: 'Set weather',
        command: 'weather',
        fields: [FIELDS.WEATHER, control('duration', 'Duration (seconds)', 'number-stepper', { validation: { kind: 'integer', min: 1, max: 1000000 } })],
        template: [{ field: 'weather' }, { optionalField: 'duration' }],
        risk: RISK_CATEGORIES.WORLD_MUTATION
      }),
      commandAction({
        id: 'world.worldborder',
        title: 'Manage world border',
        command: 'worldborder',
        fields: [
          control('operation', 'Border action', 'segmented-select', {
            required: true,
            options: ['set', 'add', 'center', 'damage', 'warning', 'get'],
            validation: { kind: 'enum', values: ['set', 'add', 'center', 'damage', 'warning', 'get'] }
          }),
          control('arguments', 'Border parameters', 'worldborder-parameter-builder', {
            required: true,
            validation: { kind: 'token-list', maxTokens: 8, maxTokenLength: 128 },
            help: 'The builder presents the valid parameter shape for the selected border action.'
          })
        ],
        template: [{ field: 'operation' }, { field: 'arguments', tokenList: true, onlyWhen: { operation: ['set', 'add', 'center', 'damage', 'warning'] } }],
        risk: RISK_CATEGORIES.WORLD_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'world.forceload',
        title: 'Manage force-loaded chunks',
        command: 'forceload',
        fields: [
          control('operation', 'Force-load action', 'segmented-select', {
            required: true,
            options: ['add', 'remove', 'query', 'all'],
            validation: { kind: 'enum', values: ['add', 'remove', 'query', 'all'] }
          }),
          FIELDS.COORDINATE
        ],
        template: [{ field: 'operation' }, { field: 'position', onlyWhen: { operation: ['add', 'remove', 'query'] } }],
        risk: RISK_CATEGORIES.WORLD_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'world.setworldspawn',
        title: 'Set world spawn',
        command: 'setworldspawn',
        fields: [FIELDS.OPTIONAL_COORDINATE, control('angle', 'Spawn angle', 'number-stepper', { validation: { kind: 'number', min: -360, max: 360 } })],
        template: [{ optionalField: 'position' }, { optionalField: 'angle' }],
        risk: RISK_CATEGORIES.WORLD_MUTATION,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      }),
      commandAction({
        id: 'world.spawnpoint',
        title: 'Set player spawn point',
        command: 'spawnpoint',
        fields: [FIELDS.OPTIONAL_TARGET, FIELDS.OPTIONAL_COORDINATE, control('angle', 'Spawn angle', 'number-stepper', { validation: { kind: 'number', min: -360, max: 360 } })],
        template: [{ optionalField: 'target' }, { optionalField: 'position' }, { optionalField: 'angle' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      })
    ]
  },
  {
    id: 'entity-player',
    title: 'Entity and player',
    description: 'Inventory, effects, attributes, movement, and entity interaction actions.',
    sourceRules: [sourceRule('runtime-command', 'Runtime command evidence', 'runtime', { required: true })],
    capabilityBadgeRules: [CAPABILITY_BADGE_RULES.RUNTIME_COMMAND, CAPABILITY_BADGE_RULES.VERSION_METADATA],
    risk: RISK_CATEGORIES.PLAYER_IMPACT,
    backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW,
    rawFallback: rawFallback(),
    actions: [
      commandAction({
        id: 'entity.give',
        title: 'Give item',
        command: 'give',
        fields: [FIELDS.TARGET, FIELDS.ITEM, FIELDS.COUNT],
        template: [{ field: 'target' }, { field: 'item' }, { optionalField: 'count' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.clear',
        title: 'Clear inventory',
        command: 'clear',
        fields: [FIELDS.OPTIONAL_TARGET, optionalControl(FIELDS.ITEM), optionalControl(FIELDS.COUNT)],
        template: [{ optionalField: 'target' }, { optionalField: 'item' }, { optionalField: 'count' }],
        risk: RISK_CATEGORIES.DESTRUCTIVE,
        backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'entity.item',
        title: 'Modify item slot',
        command: 'item',
        fields: [
          FIELDS.TARGET,
          control('slot', 'Slot', 'inventory-slot-picker', { required: true, validation: { kind: 'safe-token', maxLength: 128 } }),
          FIELDS.ITEM
        ],
        template: [{ literal: 'replace' }, { literal: 'entity' }, { field: 'target' }, { field: 'slot' }, { literal: 'with' }, { field: 'item' }],
        minVersion: '1.17',
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.loot',
        title: 'Grant or replace loot',
        command: 'loot',
        fields: [
          control('destination', 'Destination', 'loot-destination-picker', { required: true, validation: { kind: 'safe-token', maxLength: 128 } }),
          FIELDS.TARGET,
          control('source', 'Loot source', 'loot-source-picker', { required: true, validation: { kind: 'safe-token', maxLength: 128 } })
        ],
        template: [{ field: 'destination' }, { field: 'target' }, { field: 'source' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.attribute',
        title: 'Manage attribute',
        command: 'attribute',
        fields: [FIELDS.TARGET, control('attribute', 'Attribute', 'resource-location-picker', { required: true, source: 'runtime-registry', validation: { kind: 'resource-location', maxLength: 256 } }), control('operation', 'Attribute action', 'attribute-action-picker', { required: true, validation: { kind: 'safe-token', maxLength: 128 } })],
        template: [{ field: 'target' }, { field: 'attribute' }, { field: 'operation' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.effect',
        title: 'Manage status effect',
        command: 'effect',
        fields: [
          control('operation', 'Effect action', 'segmented-select', { required: true, options: ['give', 'clear'], validation: { kind: 'enum', values: ['give', 'clear'] } }),
          FIELDS.TARGET,
          control('effect', 'Effect', 'resource-location-picker', { required: true, source: 'runtime-registry', validation: { kind: 'resource-location', maxLength: 256 } }),
          optionalControl(FIELDS.DURATION_SECONDS),
          control('amplifier', 'Amplifier', 'number-stepper', { validation: { kind: 'integer', min: 0, max: 255 } })
        ],
        template: [{ field: 'operation' }, { field: 'target' }, { field: 'effect', onlyWhen: { operation: ['give'] } }, { optionalField: 'duration', onlyWhen: { operation: ['give'] } }, { optionalField: 'amplifier', onlyWhen: { operation: ['give'] } }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.experience',
        title: 'Change experience',
        command: 'experience',
        fields: [
          control('operation', 'Experience action', 'segmented-select', { required: true, options: ['add', 'set', 'query'], validation: { kind: 'enum', values: ['add', 'set', 'query'] } }),
          FIELDS.TARGET,
          FIELDS.LEVELS,
          control('unit', 'Unit', 'segmented-select', { options: ['points', 'levels'], validation: { kind: 'enum', values: ['points', 'levels'] }, default: 'points' })
        ],
        template: [{ field: 'operation' }, { field: 'target' }, { field: 'levels', onlyWhen: { operation: ['add', 'set'] } }, { field: 'unit' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.enchant',
        title: 'Enchant item',
        command: 'enchant',
        fields: [FIELDS.TARGET, control('enchantment', 'Enchantment', 'resource-location-picker', { required: true, source: 'runtime-registry', validation: { kind: 'resource-location', maxLength: 256 } }), control('level', 'Level', 'number-stepper', { validation: { kind: 'integer', min: 1, max: 255 }, default: 1 })],
        template: [{ field: 'target' }, { field: 'enchantment' }, { optionalField: 'level' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.teleport',
        title: 'Teleport',
        command: 'teleport',
        fields: [FIELDS.TARGET, FIELDS.COORDINATE, optionalControl(FIELDS.ROTATION)],
        template: [{ field: 'target' }, { field: 'position' }, { optionalField: 'rotation' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      }),
      commandAction({
        id: 'entity.kill',
        title: 'Kill entities',
        command: 'kill',
        fields: [FIELDS.OPTIONAL_TARGET],
        template: [{ optionalField: 'target' }],
        risk: RISK_CATEGORIES.DESTRUCTIVE,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'entity.summon',
        title: 'Summon entity',
        command: 'summon',
        fields: [FIELDS.ENTITY, FIELDS.OPTIONAL_COORDINATE],
        template: [{ field: 'entity' }, { optionalField: 'position' }],
        risk: RISK_CATEGORIES.WORLD_MUTATION
      }),
      commandAction({
        id: 'entity.damage',
        title: 'Damage target',
        command: 'damage',
        fields: [FIELDS.TARGET, FIELDS.AMOUNT, control('damageType', 'Damage type', 'resource-location-picker', { source: 'runtime-registry', validation: { kind: 'resource-location', maxLength: 256 } })],
        template: [{ field: 'target' }, { field: 'amount' }, { optionalField: 'damageType' }],
        minVersion: '1.19.4',
        risk: RISK_CATEGORIES.PLAYER_IMPACT,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      }),
      commandAction({
        id: 'entity.spectate',
        title: 'Spectate target',
        command: 'spectate',
        fields: [FIELDS.OPTIONAL_TARGET],
        template: [{ optionalField: 'target' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.ride',
        title: 'Manage riding',
        command: 'ride',
        fields: [
          control('rider', 'Rider', 'target-selector-builder', {
            required: true,
            source: 'runtime-entity-list',
            validation: { kind: 'target', maxLength: 256 }
          }),
          control('operation', 'Ride action', 'segmented-select', { required: true, options: ['mount', 'dismount'], validation: { kind: 'enum', values: ['mount', 'dismount'] } }),
          control('vehicle', 'Vehicle', 'target-selector-builder', {
            required: true,
            source: 'runtime-entity-list',
            validation: { kind: 'target', maxLength: 256 }
          })
        ],
        template: [{ field: 'rider' }, { field: 'operation' }, { field: 'vehicle', onlyWhen: { operation: ['mount'] } }],
        minVersion: '1.19.4',
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'entity.rotate',
        title: 'Rotate target',
        command: 'rotate',
        fields: [FIELDS.TARGET, FIELDS.ROTATION],
        template: [{ field: 'target' }, { field: 'rotation' }],
        minVersion: '1.19.4',
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      })
    ]
  },
  {
    id: 'terrain-data',
    title: 'Terrain, data, and automation',
    description: 'Block editing, data access, functions, scheduling, scoreboards, teams, tags, and command execution.',
    sourceRules: [sourceRule('runtime-command', 'Runtime command evidence', 'runtime', { required: true })],
    capabilityBadgeRules: [CAPABILITY_BADGE_RULES.RUNTIME_COMMAND, CAPABILITY_BADGE_RULES.VERSION_METADATA],
    risk: RISK_CATEGORIES.WORLD_MUTATION,
    backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT,
    rawFallback: rawFallback(),
    actions: [
      commandAction({
        id: 'terrain.setblock',
        title: 'Set block',
        command: 'setblock',
        fields: [FIELDS.COORDINATE, FIELDS.BLOCK, control('mode', 'Placement mode', 'segmented-select', { options: ['replace', 'destroy', 'keep'], validation: { kind: 'enum', values: ['replace', 'destroy', 'keep'] }, default: 'replace' })],
        template: [{ field: 'position' }, { field: 'block' }, { optionalField: 'mode' }],
        risk: RISK_CATEGORIES.WORLD_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED
      }),
      commandAction({
        id: 'terrain.fill',
        title: 'Fill region',
        command: 'fill',
        fields: [
          control('from', 'From corner', 'coordinate-triple', { required: true, validation: { kind: 'coordinate-triple' } }),
          control('to', 'To corner', 'coordinate-triple', { required: true, validation: { kind: 'coordinate-triple' } }),
          FIELDS.BLOCK,
          control('mode', 'Fill mode', 'fill-mode-picker', { validation: { kind: 'safe-token', maxLength: 128 } })
        ],
        template: [{ field: 'from' }, { field: 'to' }, { field: 'block' }, { optionalField: 'mode' }],
        risk: RISK_CATEGORIES.DESTRUCTIVE,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'terrain.fillbiome',
        title: 'Fill biome',
        command: 'fillbiome',
        fields: [
          control('from', 'From corner', 'coordinate-triple', { required: true, validation: { kind: 'coordinate-triple' } }),
          control('to', 'To corner', 'coordinate-triple', { required: true, validation: { kind: 'coordinate-triple' } }),
          control('biome', 'Biome', 'resource-location-picker', { required: true, source: 'runtime-registry', validation: { kind: 'resource-location', maxLength: 256 } })
        ],
        template: [{ field: 'from' }, { field: 'to' }, { field: 'biome' }],
        minVersion: '1.19.3',
        risk: RISK_CATEGORIES.WORLD_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED
      }),
      commandAction({
        id: 'terrain.clone',
        title: 'Clone region',
        command: 'clone',
        fields: [
          control('begin', 'Begin corner', 'coordinate-triple', { required: true, validation: { kind: 'coordinate-triple' } }),
          control('end', 'End corner', 'coordinate-triple', { required: true, validation: { kind: 'coordinate-triple' } }),
          control('destination', 'Destination', 'coordinate-triple', { required: true, validation: { kind: 'coordinate-triple' } }),
          control('mode', 'Clone mode', 'clone-mode-picker', { validation: { kind: 'safe-token', maxLength: 128 } })
        ],
        template: [{ field: 'begin' }, { field: 'end' }, { field: 'destination' }, { optionalField: 'mode' }],
        risk: RISK_CATEGORIES.DESTRUCTIVE,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'terrain.place',
        title: 'Place template or feature',
        command: 'place',
        fields: [
          control('kind', 'Place kind', 'segmented-select', { required: true, options: ['feature', 'jigsaw', 'structure', 'template'], validation: { kind: 'enum', values: ['feature', 'jigsaw', 'structure', 'template'] } }),
          FIELDS.RESOURCE,
          FIELDS.OPTIONAL_COORDINATE
        ],
        template: [{ field: 'kind' }, { field: 'resource' }, { optionalField: 'position' }],
        minVersion: '1.19',
        risk: RISK_CATEGORIES.WORLD_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED
      }),
      commandAction({
        id: 'terrain.locate',
        title: 'Locate content',
        command: 'locate',
        fields: [
          control('kind', 'Locate kind', 'segmented-select', { required: true, options: ['biome', 'poi', 'structure'], validation: { kind: 'enum', values: ['biome', 'poi', 'structure'] } }),
          FIELDS.RESOURCE
        ],
        template: [{ field: 'kind' }, { field: 'resource' }],
        risk: RISK_CATEGORIES.LOW
      }),
      commandAction({
        id: 'terrain.spreadplayers',
        title: 'Spread players',
        command: 'spreadplayers',
        fields: [
          FIELDS.COORDINATE,
          control('spreadDistance', 'Spread distance', 'number-stepper', { required: true, validation: { kind: 'number', min: 0, max: 59999968 } }),
          control('maxRange', 'Maximum range', 'number-stepper', { required: true, validation: { kind: 'number', min: 1, max: 59999968 } }),
          FIELDS.TARGET
        ],
        template: [{ field: 'position' }, { field: 'spreadDistance' }, { field: 'maxRange' }, { field: 'target' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      }),
      commandAction({
        id: 'terrain.data',
        title: 'Read or modify data',
        command: 'data',
        fields: [
          control('operation', 'Data action', 'segmented-select', { required: true, options: ['get', 'merge', 'modify', 'remove'], validation: { kind: 'enum', values: ['get', 'merge', 'modify', 'remove'] } }),
          control('targetKind', 'Data target', 'segmented-select', { required: true, options: ['block', 'entity', 'storage'], validation: { kind: 'enum', values: ['block', 'entity', 'storage'] } }),
          control('path', 'Data path', 'nbt-path-builder', { validation: { kind: 'safe-token', maxLength: 512 } })
        ],
        template: [{ field: 'operation' }, { field: 'targetKind' }, { optionalField: 'path' }],
        risk: RISK_CATEGORIES.CONTENT_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'terrain.execute',
        title: 'Execute as context',
        command: 'execute',
        fields: [
          control('context', 'Execution context', 'execute-context-builder', { required: true, validation: { kind: 'token-list', maxTokens: 24, maxTokenLength: 256 } }),
          FIELDS.RAW_ARGUMENTS
        ],
        template: [{ field: 'context', tokenList: true }, { literal: 'run' }, { field: 'arguments', tokenList: true }],
        risk: RISK_CATEGORIES.CONTENT_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'terrain.function',
        title: 'Run function',
        command: 'function',
        fields: [FIELDS.FUNCTION],
        template: [{ field: 'function' }],
        risk: RISK_CATEGORIES.CONTENT_MUTATION,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT
      }),
      commandAction({
        id: 'terrain.schedule',
        title: 'Schedule function',
        command: 'schedule',
        fields: [
          control('operation', 'Schedule action', 'segmented-select', { required: true, options: ['function', 'clear'], validation: { kind: 'enum', values: ['function', 'clear'] } }),
          FIELDS.FUNCTION,
          FIELDS.SCHEDULE_TIME,
          control('mode', 'Replacement mode', 'segmented-select', { options: ['append', 'replace'], validation: { kind: 'enum', values: ['append', 'replace'] }, default: 'replace' })
        ],
        template: [{ field: 'operation' }, { field: 'function' }, { field: 'time', onlyWhen: { operation: ['function'] } }, { optionalField: 'mode', onlyWhen: { operation: ['function'] } }],
        risk: RISK_CATEGORIES.CONTENT_MUTATION
      }),
      commandAction({
        id: 'terrain.random',
        title: 'Use random command',
        command: 'random',
        fields: [
          control('operation', 'Random action', 'segmented-select', { required: true, options: ['value', 'roll', 'reset'], validation: { kind: 'enum', values: ['value', 'roll', 'reset'] } }),
          control('range', 'Range', 'range-picker', { validation: { kind: 'safe-token', maxLength: 128 } }),
          control('sequence', 'Sequence', 'resource-location-picker', { validation: { kind: 'resource-location', maxLength: 256 } })
        ],
        template: [{ field: 'operation' }, { optionalField: 'range' }, { optionalField: 'sequence' }],
        minVersion: '1.20.2',
        risk: RISK_CATEGORIES.CONTENT_MUTATION
      }),
      commandAction({
        id: 'terrain.scoreboard',
        title: 'Manage scoreboard',
        command: 'scoreboard',
        fields: [
          control('scope', 'Scoreboard scope', 'segmented-select', { required: true, options: ['objectives', 'players'], validation: { kind: 'enum', values: ['objectives', 'players'] } }),
          control('operation', 'Scoreboard action', 'scoreboard-action-picker', { required: true, validation: { kind: 'safe-token', maxLength: 128 } }),
          optionalControl(FIELDS.OBJECTIVE)
        ],
        template: [{ field: 'scope' }, { field: 'operation' }, { optionalField: 'objective' }],
        risk: RISK_CATEGORIES.CONTENT_MUTATION
      }),
      commandAction({
        id: 'terrain.team',
        title: 'Manage team',
        command: 'team',
        fields: [
          control('operation', 'Team action', 'team-action-picker', { required: true, validation: { kind: 'safe-token', maxLength: 128 } }),
          optionalControl(FIELDS.TEAM),
          FIELDS.OPTIONAL_TARGET
        ],
        template: [{ field: 'operation' }, { optionalField: 'team' }, { optionalField: 'target' }],
        risk: RISK_CATEGORIES.CONTENT_MUTATION
      }),
      commandAction({
        id: 'terrain.tag',
        title: 'Manage tag',
        command: 'tag',
        fields: [
          FIELDS.TARGET,
          control('operation', 'Tag action', 'segmented-select', { required: true, options: ['add', 'remove', 'list'], validation: { kind: 'enum', values: ['add', 'remove', 'list'] } }),
          FIELDS.TAG
        ],
        template: [{ field: 'target' }, { field: 'operation' }, { field: 'tag', onlyWhen: { operation: ['add', 'remove'] } }],
        risk: RISK_CATEGORIES.CONTENT_MUTATION
      })
    ]
  },
  {
    id: 'communication',
    title: 'Communication and effects',
    description: 'Server messages, text components, sounds, particles, and sound cancellation.',
    sourceRules: [sourceRule('runtime-command', 'Runtime command evidence', 'runtime', { required: true })],
    capabilityBadgeRules: [CAPABILITY_BADGE_RULES.RUNTIME_COMMAND, CAPABILITY_BADGE_RULES.VERSION_METADATA],
    risk: RISK_CATEGORIES.PLAYER_IMPACT,
    backupRequirement: BACKUP_REQUIREMENTS.NONE,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW,
    rawFallback: rawFallback(),
    actions: [
      commandAction({
        id: 'communication.say',
        title: 'Server say',
        command: 'say',
        fields: [FIELDS.MESSAGE],
        template: [{ field: 'message' }],
        risk: RISK_CATEGORIES.LOW
      }),
      commandAction({
        id: 'communication.me',
        title: 'Server emote',
        command: 'me',
        fields: [FIELDS.MESSAGE],
        template: [{ field: 'message' }],
        risk: RISK_CATEGORIES.LOW
      }),
      commandAction({
        id: 'communication.msg',
        title: 'Direct message',
        command: 'msg',
        fields: [FIELDS.TARGET, FIELDS.MESSAGE],
        template: [{ field: 'target' }, { field: 'message' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'communication.tellraw',
        title: 'Send rich text',
        command: 'tellraw',
        fields: [FIELDS.TARGET, FIELDS.JSON_COMPONENT],
        template: [{ field: 'target' }, { field: 'component' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'communication.title',
        title: 'Show title',
        command: 'title',
        fields: [
          FIELDS.TARGET,
          control('slot', 'Title slot', 'segmented-select', { required: true, options: ['title', 'subtitle', 'actionbar', 'times', 'clear', 'reset'], validation: { kind: 'enum', values: ['title', 'subtitle', 'actionbar', 'times', 'clear', 'reset'] } }),
          FIELDS.JSON_COMPONENT
        ],
        template: [{ field: 'target' }, { field: 'slot' }, { field: 'component', onlyWhen: { slot: ['title', 'subtitle', 'actionbar'] } }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'communication.playsound',
        title: 'Play sound',
        command: 'playsound',
        fields: [
          FIELDS.SOUND,
          control('source', 'Sound source', 'sound-source-picker', { required: true, validation: { kind: 'safe-token', maxLength: 64 } }),
          FIELDS.TARGET,
          FIELDS.OPTIONAL_COORDINATE,
          control('volume', 'Volume', 'number-stepper', { validation: { kind: 'number', min: 0, max: 10 }, default: 1 }),
          control('pitch', 'Pitch', 'number-stepper', { validation: { kind: 'number', min: 0, max: 2 }, default: 1 })
        ],
        template: [{ field: 'sound' }, { field: 'source' }, { field: 'target' }, { optionalField: 'position' }, { optionalField: 'volume' }, { optionalField: 'pitch' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'communication.particle',
        title: 'Show particles',
        command: 'particle',
        fields: [FIELDS.PARTICLE, FIELDS.OPTIONAL_COORDINATE, control('count', 'Particle count', 'number-stepper', { validation: { kind: 'integer', min: 1, max: 1000000 }, default: 1 }), FIELDS.OPTIONAL_TARGET],
        template: [{ field: 'particle' }, { optionalField: 'position' }, { optionalField: 'count' }, { optionalField: 'target' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      }),
      commandAction({
        id: 'communication.stopsound',
        title: 'Stop sound',
        command: 'stopsound',
        fields: [FIELDS.TARGET, control('source', 'Sound source', 'sound-source-picker', { validation: { kind: 'safe-token', maxLength: 64 } }), optionalControl(FIELDS.SOUND)],
        template: [{ field: 'target' }, { optionalField: 'source' }, { optionalField: 'sound' }],
        risk: RISK_CATEGORIES.PLAYER_IMPACT
      })
    ]
  },
  {
    id: 'datapack-content',
    title: 'Datapacks, plugins, and content',
    description: 'Datapack lifecycle and dynamically discovered plugin commands and permissions.',
    sourceRules: [
      sourceRule('runtime-command', 'Runtime command evidence', 'runtime', { required: true }),
      sourceRule('plugin-yaml', 'Plugin descriptor evidence', 'plugin.yml', {
        note: 'Plugin commands and permissions are read from plugin.yml supplied by the server scanner.'
      })
    ],
    capabilityBadgeRules: [CAPABILITY_BADGE_RULES.RUNTIME_COMMAND, CAPABILITY_BADGE_RULES.PLUGIN_YAML, CAPABILITY_BADGE_RULES.VERSION_METADATA],
    risk: RISK_CATEGORIES.CONTENT_MUTATION,
    backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.EXPLICIT,
    rawFallback: rawFallback(),
    actions: [
      commandAction({
        id: 'content.datapack',
        title: 'Manage datapacks',
        command: 'datapack',
        fields: [
          control('operation', 'Datapack action', 'segmented-select', { required: true, options: ['list', 'enable', 'disable'], validation: { kind: 'enum', values: ['list', 'enable', 'disable'] } }),
          FIELDS.RESOURCE,
          control('position', 'Load order', 'segmented-select', { options: ['first', 'last', 'before', 'after'], validation: { kind: 'enum', values: ['first', 'last', 'before', 'after'] } })
        ],
        template: [{ field: 'operation' }, { field: 'resource', onlyWhen: { operation: ['enable', 'disable'] } }, { optionalField: 'position', onlyWhen: { operation: ['enable'] } }],
        risk: RISK_CATEGORIES.CONTENT_MUTATION,
        backupRequirement: BACKUP_REQUIREMENTS.REQUIRED,
        confirmationRequirement: CONFIRMATION_REQUIREMENTS.SUPER_CONFIRMATION
      }),
      commandAction({
        id: 'content.plugin-permission-check',
        title: 'Inspect plugin permission',
        command: 'permission',
        fields: [FIELDS.PERMISSION],
        forms: [{ id: 'descriptor-only', label: 'Descriptor lookup', prefix: [], badges: [{ id: 'plugin-yml', source: 'plugin.yml', label: 'Plugin descriptor evidence' }] }],
        template: [{ field: 'permission' }],
        localConsole: false,
        rcon: false,
        summary: 'Displays plugin.yml permission metadata. It does not invent a server-side permission command.',
        risk: RISK_CATEGORIES.LOW,
        rawFallback: { enabled: false }
      })
    ]
  }
]);

function plainClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedString(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value).trim();
}

function isControlFree(value) {
  return !/[\u0000-\u001f\u007f]/.test(value);
}

function safeIdentifier(value, maxLength = 128) {
  const text = normalizedString(value);
  return text.length > 0
    && text.length <= maxLength
    && /^[A-Za-z0-9_.:+/-]+$/.test(text)
    && isControlFree(text);
}

function normalizeFlavor(value) {
  const candidate = normalizedString(value).toLowerCase();
  return ['paper', 'spigot', 'vanilla', 'unknown'].includes(candidate) ? candidate : 'unknown';
}

function normalizeMinecraftVersion(value) {
  const candidate = normalizedString(value);
  return /^\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/.test(candidate) ? candidate : null;
}

function compareMinecraftVersions(left, right) {
  const a = normalizeMinecraftVersion(left);
  const b = normalizeMinecraftVersion(right);
  if (!a || !b) return null;
  const parts = (value) => value.split('-')[0].split('.').map((part) => Number(part));
  const aParts = parts(a);
  const bParts = parts(b);
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const difference = (aParts[index] || 0) - (bParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function emptyRuntime() {
  return {
    flavor: 'unknown',
    minecraftVersion: null,
    implementationVersion: null,
    build: null,
    capabilities: [],
    capabilitySources: {},
    dynamicForms: {},
    protocolMethods: [],
    consoleAvailable: false,
    rconAvailable: false,
    hostLifecycleAvailable: false,
    discoveredPlugins: [],
    discoveredPermissions: [],
    discoveryLog: []
  };
}

function emptyRegistry() {
  return {
    schema: COMMAND_CENTER_SCHEMA_VERSION,
    runtime: emptyRuntime(),
    families: plainClone(COMMAND_FAMILIES),
    discovered: {
      pluginCommands: [],
      permissions: [],
      jarProbes: [],
      liveResponses: [],
      sources: []
    }
  };
}

function appendUnique(array, value, max = Infinity) {
  if (!value || array.includes(value) || array.length >= max) return;
  array.push(value);
}

function addCapability(registry, capability, source, metadata = {}) {
  if (!safeIdentifier(capability, 256)) return;
  appendUnique(registry.runtime.capabilities, capability);
  if (!registry.runtime.capabilitySources[capability]) registry.runtime.capabilitySources[capability] = [];
  const entry = {
    source: source || 'unknown',
    ...metadata
  };
  const serial = JSON.stringify(entry);
  if (!registry.runtime.capabilitySources[capability].some((candidate) => JSON.stringify(candidate) === serial)) {
    registry.runtime.capabilitySources[capability].push(entry);
  }
}

function findFamily(registry, familyId) {
  return registry.families.find((family) => family.id === familyId) || null;
}

function allActions(registry) {
  return registry.families.flatMap((family) => family.actions.map((action) => ({ ...action, family: family.id })));
}

function getAction(registry, actionId) {
  return allActions(registry).find((action) => action.id === actionId) || null;
}

function hasCapability(registry, capability) {
  return registry.runtime.capabilities.includes(capability);
}

function sourceState(registry, rule) {
  if (rule.flavor && registry.runtime.flavor !== 'unknown' && registry.runtime.flavor !== rule.flavor) {
    return { state: 'unsupported-flavor', source: rule.source, ruleId: rule.id };
  }
  if (rule.capability && hasCapability(registry, rule.capability)) {
    return { state: 'available', source: rule.source, ruleId: rule.id };
  }
  if (rule.minVersion && registry.runtime.minecraftVersion) {
    const comparison = compareMinecraftVersions(registry.runtime.minecraftVersion, rule.minVersion);
    if (comparison !== null && comparison < 0) {
      return { state: 'below-minimum-version', source: rule.source, ruleId: rule.id };
    }
    return { state: 'version-compatible', source: rule.source, ruleId: rule.id };
  }
  return { state: rule.stateWhenMissing || 'unknown', source: rule.source, ruleId: rule.id };
}

function badgeState(registry, rule) {
  const capability = rule.capability;
  if (capability && hasCapability(registry, capability)) {
    return {
      id: rule.id,
      label: rule.label,
      state: 'verified',
      source: rule.source,
      capability,
      evidence: registry.runtime.capabilitySources[capability] || []
    };
  }
  if (rule.minVersion && registry.runtime.minecraftVersion) {
    const comparison = compareMinecraftVersions(registry.runtime.minecraftVersion, rule.minVersion);
    return {
      id: rule.id,
      label: rule.label,
      state: comparison !== null && comparison >= 0 ? 'version-compatible' : 'below-minimum-version',
      source: rule.source,
      minimumVersion: rule.minVersion,
      runtimeVersion: registry.runtime.minecraftVersion
    };
  }
  return {
    id: rule.id,
    label: rule.label,
    state: rule.stateWhenMissing || 'unknown',
    source: rule.source,
    capability: capability || null
  };
}

function resolveForm(registry, action, requestedFormId) {
  const form = action.forms.find((candidate) => candidate.id === requestedFormId)
    || action.forms.find((candidate) => !candidate.deprecated)
    || action.forms[0];
  if (!form) throw new Error('This action has no command form.');
  let prefix = Array.isArray(form.prefix) ? form.prefix.slice() : [];
  let dynamicState = null;
  if (form.dynamicPrefix) {
    const discovered = registry.runtime.dynamicForms[form.dynamicPrefix];
    if (Array.isArray(discovered) && discovered.length) {
      prefix = discovered.slice();
      dynamicState = 'verified';
    } else {
      dynamicState = 'not-discovered';
    }
  }
  return {
    form,
    prefix,
    dynamicState
  };
}

function protocolMethodForAction(registry, action) {
  for (const method of action.transport.protocolMethods || []) {
    if (registry.runtime.protocolMethods.includes(method)) return method;
  }
  return null;
}

function resolveActionExecution(registry, actionId, preferences = {}) {
  const action = typeof actionId === 'string' ? getAction(registry, actionId) : actionId;
  if (!action) throw new Error('The requested Command Center action does not exist.');
  const requestedRoute = preferences.route || 'auto';
  const requiredEvidence = action.runtimeEvidenceRequired;
  const missingRuntimeEvidence = requiredEvidence?.capability && !hasCapability(registry, requiredEvidence.capability);
  const evidenceFallback = missingRuntimeEvidence
    ? (requiredEvidence.explanation || 'This command is declared by metadata but has not been confirmed by a live runtime response.')
    : null;
  const protocolMethod = protocolMethodForAction(registry, action);
  const protocol = protocolMethod
    ? {
      state: missingRuntimeEvidence ? 'runtime-evidence-required' : PROTOCOL_REQUIREMENT_STATES.ADVERTISED.id,
      executable: !missingRuntimeEvidence,
      method: protocolMethod,
      route: ROUTES.PROTOCOL
    }
    : {
      state: action.transport.protocolMethods?.length
        ? PROTOCOL_REQUIREMENT_STATES.NOT_ADVERTISED.id
        : PROTOCOL_REQUIREMENT_STATES.NOT_APPLICABLE.id,
      executable: false,
      method: null,
      route: ROUTES.PROTOCOL
    };
  const localConsole = {
    route: ROUTES.LOCAL_CONSOLE,
    executable: Boolean(action.transport.localConsole && registry.runtime.consoleAvailable && !missingRuntimeEvidence),
    state: action.transport.localConsole
      ? (missingRuntimeEvidence ? 'runtime-evidence-required' : (registry.runtime.consoleAvailable ? 'available' : 'not-connected'))
      : 'not-applicable'
  };
  const rcon = {
    route: ROUTES.RCON,
    executable: Boolean(action.transport.rcon && registry.runtime.rconAvailable && !missingRuntimeEvidence),
    state: action.transport.rcon
      ? (missingRuntimeEvidence ? 'runtime-evidence-required' : (registry.runtime.rconAvailable ? 'available' : 'not-connected'))
      : 'not-applicable'
  };
  const hostLifecycle = {
    route: ROUTES.HOST_LIFECYCLE,
    executable: Boolean(action.transport.hostLifecycle && registry.runtime.hostLifecycleAvailable),
    state: action.transport.hostLifecycle
      ? (registry.runtime.hostLifecycleAvailable ? 'available' : 'not-configured')
      : 'not-applicable'
  };
  const routes = [protocol, localConsole, rcon, hostLifecycle];
  const requested = requestedRoute === 'auto'
    ? routes.find((candidate) => candidate.executable) || null
    : routes.find((candidate) => candidate.route === requestedRoute) || null;
  return {
    actionId: action.id,
    requestedRoute,
    selected: requested,
    protocol,
    localConsole,
    rcon,
    hostLifecycle,
    canExecute: Boolean(requested?.executable),
    fallback: requested?.executable
      ? null
      : (evidenceFallback || 'Use an explicitly available local console or RCON route. Do not invoke an unadvertised runtime protocol method.')
  };
}

function normalizedCommandName(value) {
  const command = normalizedString(value).replace(/^\//, '').toLowerCase();
  return safeIdentifier(command, 128) ? command : null;
}

function actionView(registry, family, action) {
  const sourceRules = [...(family.sourceRules || []), ...(action.sourceRules || [])];
  const badges = [...(family.capabilityBadgeRules || []), ...(action.capabilityBadgeRules || [])]
    .map((rule) => badgeState(registry, rule));
  const sourceStates = sourceRules.map((rule) => sourceState(registry, rule));
  const execution = resolveActionExecution(registry, action);
  return {
    ...plainClone(action),
    family: family.id,
    sourceStates,
    badges,
    execution
  };
}

function presentRegistry(registry) {
  const result = plainClone(registry);
  result.families = registry.families.map((family) => ({
    ...plainClone(family),
    actions: family.actions.map((action) => actionView(registry, family, action))
  }));
  return result;
}

function normalizeVersionMetadata(registry, metadata = {}) {
  const source = metadata.result || metadata;
  const flavor = normalizeFlavor(source.flavor || source.software || source.implementation || registry.runtime.flavor);
  registry.runtime.flavor = flavor;
  registry.runtime.minecraftVersion = normalizeMinecraftVersion(
    source.minecraftVersion || source.minecraft_version || source.gameVersion || registry.runtime.minecraftVersion
  );
  registry.runtime.implementationVersion = normalizedString(
    source.implementationVersion || source.serverVersion || source.version || registry.runtime.implementationVersion
  ) || null;
  registry.runtime.build = normalizedString(source.build || source.buildNumber || registry.runtime.build) || null;
  const consoleAvailable = source.consoleAvailable ?? source.localConsoleAvailable ?? source.console;
  const rconAvailable = source.rconAvailable ?? source.rcon;
  const hostLifecycleAvailable = source.hostLifecycleAvailable ?? source.launcherAvailable;
  if (typeof consoleAvailable === 'boolean') registry.runtime.consoleAvailable = consoleAvailable;
  if (typeof rconAvailable === 'boolean') registry.runtime.rconAvailable = rconAvailable;
  if (typeof hostLifecycleAvailable === 'boolean') registry.runtime.hostLifecycleAvailable = hostLifecycleAvailable;
  registry.runtime.discoveryLog.push({
    source: 'version-metadata',
    flavor: registry.runtime.flavor,
    minecraftVersion: registry.runtime.minecraftVersion
  });
}

function normalizedMethodNames(value) {
  const candidate = value?.result || value || {};
  const rawMethods = Array.isArray(candidate)
    ? candidate
    : candidate.methods || candidate.protocolMethods || candidate.capabilities || [];
  const names = [];
  for (const entry of rawMethods) {
    const name = typeof entry === 'string'
      ? entry
      : entry?.name || entry?.method || entry?.id;
    const normalized = normalizedString(name);
    if (safeIdentifier(normalized, 256)) appendUnique(names, normalized, MAX_DISCOVERED_ACTIONS);
  }
  return names;
}

function mergeRpcDiscover(registry, discover = {}) {
  const methods = normalizedMethodNames(discover);
  for (const method of methods) {
    appendUnique(registry.runtime.protocolMethods, method, MAX_DISCOVERED_ACTIONS);
    addCapability(registry, 'protocol:' + method, 'rpc.discover', { method });
  }
  const candidate = discover.result || discover;
  const commands = candidate?.commands || candidate?.commandNames || [];
  for (const command of asStringList(commands, MAX_DISCOVERED_ACTIONS)) {
    const normalized = normalizedCommandName(command);
    if (!normalized) continue;
    addCapability(registry, 'command:' + normalized, 'rpc.discover', { command });
    addCapability(registry, 'runtime.command:' + normalized, 'rpc.discover', { command });
  }
  if (candidate?.consoleAvailable === true) registry.runtime.consoleAvailable = true;
  if (candidate?.rconAvailable === true) registry.runtime.rconAvailable = true;
  registry.runtime.discoveryLog.push({ source: 'rpc.discover', methods: methods.length });
  return registry;
}

function paperSemantic(command) {
  const value = normalizedString(command).toLowerCase();
  if (/(?:profile|profiler|timings)/.test(value)) return 'profiling';
  if (/\bjfr\b/.test(value)) return 'jfr';
  if (/\btick\b/.test(value)) return 'tick';
  return null;
}

function paperTokens(entry) {
  if (Array.isArray(entry?.tokens)) return normalizeTokenArray(entry.tokens, { allowEmpty: false, maxTokens: 12, maxTokenLength: 128 }).tokens;
  const source = typeof entry === 'string' ? entry : entry?.command || entry?.usage || entry?.name || '';
  const tokenized = tokenizeRawCommand(source.replace(/^\//, ''), { maxTokens: 12, maxTokenLength: 128 });
  return tokenized.tokens;
}

function mergePaperUsageDiscovery(registry, usage = {}) {
  const candidate = usage.result || usage;
  const entries = Array.isArray(candidate) ? candidate : candidate.commands || candidate.usage || candidate.subcommands || [];
  const parsedEntries = Array.isArray(entries) ? entries : [entries];
  let matched = 0;
  for (const entry of parsedEntries) {
    let tokens;
    try {
      tokens = paperTokens(entry);
    } catch {
      continue;
    }
    if (!tokens.length) continue;
    const joined = tokens.join(' ').toLowerCase();
    const semantic = normalizedString(entry?.semantic).toLowerCase() || paperSemantic(joined);
    addCapability(registry, 'paper.command:' + joined.replace(/^paper\s+/, ''), 'paper-usage', {
      command: joined,
      source: 'Paper /paper usage'
    });
    if (semantic) {
      addCapability(registry, 'paper.semantic:' + semantic, 'paper-usage', {
        command: joined,
        source: 'Paper /paper usage'
      });
      registry.runtime.dynamicForms['paper.semantic:' + semantic] = tokens;
      matched += 1;
    }
  }
  if (parsedEntries.length) registry.runtime.flavor = registry.runtime.flavor === 'unknown' ? 'paper' : registry.runtime.flavor;
  registry.runtime.discoveryLog.push({ source: 'paper-usage', semanticCommands: matched });
  return registry;
}

function mergeSpigotJarHelpDiscovery(registry, help = {}) {
  const candidate = help.result || help;
  const text = normalizedString(typeof candidate === 'string' ? candidate : candidate?.text || candidate?.stdout || candidate?.help || '');
  const flags = typeof candidate === 'object' && candidate
    ? asStringList(candidate.flags || candidate.options || [], 128)
    : [];
  for (const match of text.matchAll(/--[A-Za-z0-9][A-Za-z0-9-]*/g)) appendUnique(flags, match[0], 128);
  for (const flag of flags) addCapability(registry, 'spigot.jar-flag:' + flag.slice(2), 'spigot-jar-help', { flag });
  const commands = typeof candidate === 'object' && candidate
    ? asStringList(candidate.commands || candidate.commandNames || [], MAX_DISCOVERED_ACTIONS)
    : [];
  for (const command of commands) addCapability(registry, 'command:' + command.replace(/^\//, ''), 'spigot-jar-help', { command });
  if (flags.length || commands.length) registry.runtime.flavor = registry.runtime.flavor === 'unknown' ? 'spigot' : registry.runtime.flavor;
  registry.runtime.discoveryLog.push({ source: 'spigot-jar-help', flags: flags.length, commands: commands.length });
  return registry;
}

function boundedDiscoveryText(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return {
    text: text.slice(0, MAX_DISCOVERY_EVIDENCE_TEXT),
    truncated: text.length > MAX_DISCOVERY_EVIDENCE_TEXT
  };
}

function normalizedDiscoveryEvidence(entry, kind) {
  const output = boundedDiscoveryText(entry?.text ?? entry?.response ?? entry?.output ?? '');
  const requestSource = typeof entry?.request === 'string' ? entry.request : entry?.probe;
  return {
    kind,
    source: normalizedString(entry?.source || entry?.provenance?.source || 'local-runtime') || 'local-runtime',
    route: normalizedString(entry?.route || entry?.provenance?.route || '') || null,
    request: normalizedString(requestSource || '') || null,
    capturedAt: normalizedString(entry?.capturedAt || entry?.finishedAt || entry?.at || '') || null,
    state: normalizedString(entry?.state || '') || 'captured',
    exitCode: Number.isInteger(entry?.exitCode) ? entry.exitCode : null,
    timedOut: Boolean(entry?.timedOut),
    truncated: Boolean(entry?.truncated || output.truncated),
    text: output.text,
    flags: asStringList(entry?.flags || [], 128),
    provenance: (entry?.provenance || entry?.metadata?.provenance) && typeof (entry?.provenance || entry?.metadata?.provenance) === 'object'
      ? plainClone(entry.provenance || entry.metadata.provenance)
      : null
  };
}

function appendDiscoveryEvidence(collection, evidence) {
  if (!Array.isArray(collection) || collection.length >= MAX_DISCOVERY_EVIDENCE) return;
  const serialized = JSON.stringify(evidence);
  if (!collection.some((candidate) => JSON.stringify(candidate) === serialized)) collection.push(evidence);
}

function liveHelpCommandNames(text) {
  const commands = [];
  for (const line of String(text || '').split(/\r?\n/).slice(0, 2048)) {
    for (const match of line.matchAll(/(?:^|[\s,;:])\/([A-Za-z][A-Za-z0-9_.:-]{0,127})(?=$|[\s,;:[(<])/g)) {
      const command = normalizedCommandName(match[1]);
      if (command) appendUnique(commands, command, MAX_DISCOVERED_ACTIONS);
    }
  }
  return commands;
}

function paperUsageEntriesFromResponse(text) {
  const entries = [];
  for (const line of String(text || '').split(/\r?\n/).slice(0, 2048)) {
    const matches = line.match(/\/?paper(?:\s+[A-Za-z][A-Za-z0-9_-]{0,127}){1,4}/gi) || [];
    for (const match of matches) {
      try {
        const tokens = tokenizeRawCommand(match.replace(/^\//, ''), { maxTokens: 5, maxTokenLength: 128 }).tokens;
        if (tokens[0]?.toLowerCase() === 'paper' && tokens.length > 1) appendUnique(entries, { tokens }, 64);
      } catch {
        // Only a bounded, tokenizable usage fragment can become evidence.
      }
    }
  }
  return entries;
}

function loadedPluginNamesFromResponse(text) {
  const names = [];
  for (const line of String(text || '').split(/\r?\n/).slice(0, 2048)) {
    const match = line.match(/^\s*(?:plugins?|paper plugins?)\s*(?:\(\d+\))?\s*:\s*(.+)$/i);
    if (!match) continue;
    for (const rawName of match[1].split(',')) {
      const name = normalizedString(rawName.replace(/§[0-9A-FK-OR]/gi, ''));
      if (name && name.length <= 256 && isControlFree(name)) appendUnique(names, name, MAX_DISCOVERED_ACTIONS);
    }
  }
  return names;
}

function runtimeCommandAction(command, evidence) {
  const commandId = command.replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 96);
  const capability = 'runtime.command:' + command;
  return commandAction({
    id: 'runtime.' + commandId,
    title: '/' + command,
    command,
    summary: 'Command name observed in an explicitly requested live server help response. Arguments remain tokenized and require the selected runtime route.',
    fields: [FIELDS.RAW_ARGUMENTS],
    template: [{ field: 'arguments', tokenList: true }],
    dynamic: true,
    origin: {
      source: evidence.source,
      route: evidence.route,
      request: evidence.request,
      capturedAt: evidence.capturedAt
    },
    runtimeEvidenceRequired: {
      capability,
      explanation: 'This command may be composed only while its live runtime evidence is present.'
    },
    sourceRules: [
      sourceRule('live-runtime-command', 'Live runtime command', 'live-runtime', {
        required: true,
        capability,
        note: 'The command name was observed in a real local console or RCON help response that the user explicitly requested.'
      })
    ],
    capabilityBadgeRules: [{
      ...CAPABILITY_BADGE_RULES.LIVE_RUNTIME,
      capability,
      label: 'Live runtime command'
    }],
    risk: RISK_CATEGORIES.OPERATIONAL,
    backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW
  });
}

function runtimeDiscoveryFamily(registry) {
  let family = findFamily(registry, 'runtime-discovered');
  if (family) return family;
  family = {
    id: 'runtime-discovered',
    title: 'Runtime-discovered commands',
    description: 'Commands observed in explicit local console or RCON help responses. They are not scraped or guessed.',
    sourceRules: [sourceRule('live-runtime', 'Live runtime evidence', 'live-runtime', { required: true })],
    capabilityBadgeRules: [CAPABILITY_BADGE_RULES.LIVE_RUNTIME],
    risk: RISK_CATEGORIES.OPERATIONAL,
    backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW,
    rawFallback: rawFallback({ reason: 'Use tokenized Minecraft arguments only; this catalog never runs an operating-system shell.' }),
    actions: []
  };
  registry.families.push(family);
  return family;
}

function jarProbeMetadataHints(metadata) {
  const hints = metadata?.hints || {};
  const flavor = Array.isArray(hints.flavorHints) && hints.flavorHints.length === 1
    ? normalizeFlavor(hints.flavorHints[0])
    : 'unknown';
  const minecraftVersion = Array.isArray(hints.minecraftVersionHints) && hints.minecraftVersionHints.length === 1
    ? normalizeMinecraftVersion(hints.minecraftVersionHints[0])
    : null;
  return { flavor, minecraftVersion };
}

function mergeLocalJarProbeDiscovery(registry, probes = []) {
  const entries = Array.isArray(probes) ? probes : [probes];
  let merged = 0;
  for (const rawProbe of entries.slice(0, MAX_DISCOVERY_EVIDENCE)) {
    if (!rawProbe || typeof rawProbe !== 'object') continue;
    const evidence = normalizedDiscoveryEvidence(rawProbe, 'selected-jar');
    appendDiscoveryEvidence(registry.discovered.jarProbes, evidence);
    const hints = jarProbeMetadataHints(rawProbe.metadata);
    if (registry.runtime.flavor === 'unknown' && hints.flavor !== 'unknown') registry.runtime.flavor = hints.flavor;
    if (!registry.runtime.minecraftVersion && hints.minecraftVersion) registry.runtime.minecraftVersion = hints.minecraftVersion;
    const probe = normalizedString(rawProbe.probe || (typeof rawProbe.request === 'string' ? rawProbe.request : '')).toLowerCase();
    if (evidence.state === 'captured' && (probe === '--help' || probe === 'help')) {
      addCapability(registry, 'jar.help', 'local-jar-probe', {
        capturedAt: evidence.capturedAt,
        state: evidence.state,
        truncated: evidence.truncated
      });
      if (registry.runtime.flavor === 'spigot') {
        mergeSpigotJarHelpDiscovery(registry, {
          text: evidence.text,
          flags: rawProbe.flags || []
        });
      }
    }
    if (evidence.state === 'captured' && (probe === '--version' || probe === 'version')) {
      addCapability(registry, 'jar.version', 'local-jar-probe', {
        capturedAt: evidence.capturedAt,
        state: evidence.state,
        truncated: evidence.truncated
      });
    }
    merged += 1;
  }
  if (merged) registry.runtime.discoveryLog.push({ source: 'local-jar-probe', probes: merged });
  return registry;
}

function mergeLiveRuntimeDiscovery(registry, responses = []) {
  const entries = Array.isArray(responses) ? responses : [responses];
  let family = findFamily(registry, 'runtime-discovered');
  let merged = 0;
  for (const rawResponse of entries.slice(0, MAX_DISCOVERY_EVIDENCE)) {
    if (!rawResponse || typeof rawResponse !== 'object') continue;
    const evidence = normalizedDiscoveryEvidence(rawResponse, 'live-runtime');
    const request = normalizedCommandName(evidence.request);
    if (!['help', 'plugins', 'paper'].includes(request)) continue;
    appendDiscoveryEvidence(registry.discovered.liveResponses, evidence);
    if (rawResponse.metadata && typeof rawResponse.metadata === 'object') normalizeVersionMetadata(registry, rawResponse.metadata);
    if (evidence.state !== 'captured' || !evidence.text) {
      merged += 1;
      continue;
    }
    if (request === 'plugins') {
      for (const plugin of loadedPluginNamesFromResponse(evidence.text)) appendUnique(registry.runtime.discoveredPlugins, plugin, MAX_DISCOVERED_ACTIONS);
    }
    if (request === 'paper') {
      const usage = paperUsageEntriesFromResponse(evidence.text);
      if (usage.length) mergePaperUsageDiscovery(registry, { commands: usage });
    }
    if (request === 'help' || request === 'paper') {
      for (const command of liveHelpCommandNames(evidence.text)) {
        addCapability(registry, 'command:' + command, 'live-runtime', {
          route: evidence.route,
          request,
          capturedAt: evidence.capturedAt
        });
        addCapability(registry, 'runtime.command:' + command, 'live-runtime', {
          route: evidence.route,
          request,
          capturedAt: evidence.capturedAt
        });
        const existing = allActions(registry).some((candidate) => normalizedCommandName(candidate.command) === command);
        if (!existing) {
          family = family || runtimeDiscoveryFamily(registry);
          if (family.actions.length < MAX_DISCOVERED_ACTIONS) family.actions.push(runtimeCommandAction(command, evidence));
        }
      }
    }
    merged += 1;
  }
  if (merged) registry.runtime.discoveryLog.push({ source: 'live-runtime', responses: merged });
  return registry;
}

function asStringList(value, max = MAX_DISCOVERED_ACTIONS) {
  const input = Array.isArray(value) ? value : value ? [value] : [];
  const result = [];
  for (const entry of input) {
    const text = normalizedString(entry);
    if (text && isControlFree(text) && text.length <= MAX_TOKEN_LENGTH) appendUnique(result, text, max);
  }
  return result;
}

function pluginDescriptorEntries(value) {
  let raw;
  if (Array.isArray(value)) raw = value;
  else if (Array.isArray(value?.plugins)) raw = value.plugins;
  else if (Array.isArray(value?.pluginYamls)) raw = value.pluginYamls;
  else raw = value ? [value] : [];
  return raw.slice(0, MAX_DISCOVERED_ACTIONS).filter((entry) => entry && typeof entry === 'object');
}

function pluginCommandAction(plugin, commandName, descriptor) {
  const pluginId = normalizedString(plugin.name || plugin.plugin || plugin.id || 'plugin').replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 96);
  const commandId = normalizedString(commandName).replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 96);
  const runtimeCommand = normalizedCommandName(commandName) || commandName;
  return commandAction({
    id: 'plugin.' + pluginId + '.' + commandId,
    title: '/' + commandName,
    command: commandName,
    summary: normalizedString(descriptor?.description || descriptor?.usage || 'Runtime-discovered plugin command.'),
    fields: [FIELDS.RAW_ARGUMENTS],
    template: [{ field: 'arguments', tokenList: true }],
    dynamic: true,
    origin: {
      source: 'plugin.yml',
      plugin: normalizedString(plugin.name || plugin.plugin || plugin.id || 'plugin'),
      command: commandName,
      permission: normalizedString(descriptor?.permission) || null
    },
    runtimeEvidenceRequired: {
      capability: 'runtime.command:' + runtimeCommand,
      explanation: 'plugin.yml declares this command, but the current runtime has not confirmed it through an advertised method or explicit live help response.'
    },
    sourceRules: [
      sourceRule('plugin-yml-command', 'Plugin descriptor command', 'plugin.yml', {
        required: true,
        capability: 'plugin.command:' + pluginId + ':' + commandId,
        note: 'This command was read from plugin.yml and must still be authorized by the server at execution.'
      }),
      sourceRule('live-runtime-command', 'Live runtime command confirmation', 'live-runtime', {
        required: true,
        capability: 'runtime.command:' + runtimeCommand,
        note: 'A plugin descriptor alone does not make a command executable. The selected runtime must advertise or return it through an explicitly requested live help response.'
      })
    ],
    capabilityBadgeRules: [{
      ...CAPABILITY_BADGE_RULES.PLUGIN_YAML,
      capability: 'plugin.command:' + pluginId + ':' + commandId,
      label: 'plugin.yml command'
    }, {
      ...CAPABILITY_BADGE_RULES.LIVE_RUNTIME,
      capability: 'runtime.command:' + runtimeCommand,
      label: 'Live runtime confirmation'
    }],
    risk: RISK_CATEGORIES.OPERATIONAL,
    backupRequirement: BACKUP_REQUIREMENTS.RECOMMENDED,
    confirmationRequirement: CONFIRMATION_REQUIREMENTS.REVIEW
  });
}

function mergePluginYamlDiscovery(registry, descriptors = {}) {
  const targetFamily = findFamily(registry, 'datapack-content');
  if (!targetFamily) return registry;
  let pluginCount = 0;
  for (const rawPlugin of pluginDescriptorEntries(descriptors)) {
    const plugin = rawPlugin.pluginYaml || rawPlugin.descriptor || rawPlugin;
    const name = normalizedString(rawPlugin.name || plugin.name || rawPlugin.plugin || plugin.plugin);
    if (!name || !isControlFree(name)) continue;
    const pluginId = name.replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 96) || 'plugin';
    appendUnique(registry.runtime.discoveredPlugins, name, MAX_DISCOVERED_ACTIONS);
    const commandMap = plugin.commands || rawPlugin.commands || {};
    if (commandMap && typeof commandMap === 'object' && !Array.isArray(commandMap)) {
      for (const [commandName, commandDescriptor] of Object.entries(commandMap)) {
        if (!safeIdentifier(commandName, 128)) continue;
        const commandId = commandName.replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 96);
        const capability = 'plugin.command:' + pluginId + ':' + commandId;
        addCapability(registry, capability, 'plugin.yml', {
          plugin: name,
          command: commandName,
          aliases: asStringList(commandDescriptor?.aliases || [], 32)
        });
        const action = pluginCommandAction({ ...rawPlugin, name }, commandName, commandDescriptor);
        if (!targetFamily.actions.some((candidate) => candidate.id === action.id)
          && targetFamily.actions.length < MAX_DISCOVERED_ACTIONS) {
          targetFamily.actions.push(action);
          registry.discovered.pluginCommands.push({
            id: action.id,
            plugin: name,
            command: commandName,
            aliases: asStringList(commandDescriptor?.aliases || [], 32),
            permission: normalizedString(commandDescriptor?.permission) || null
          });
        }
      }
    }
    const permissions = plugin.permissions || rawPlugin.permissions || {};
    if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
      for (const [permission, metadata] of Object.entries(permissions)) {
        if (!/^[A-Za-z0-9*_.-]{1,256}$/.test(permission)) continue;
        if (registry.discovered.permissions.length >= MAX_DISCOVERED_PERMISSIONS) break;
        const item = {
          plugin: name,
          permission,
          description: normalizedString(metadata?.description || metadata || ''),
          default: normalizedString(metadata?.default || '') || null,
          children: asStringList(Object.keys(metadata?.children || {}), 256)
        };
        if (!registry.discovered.permissions.some((candidate) => candidate.plugin === item.plugin && candidate.permission === item.permission)) {
          registry.discovered.permissions.push(item);
          appendUnique(registry.runtime.discoveredPermissions, permission, MAX_DISCOVERED_PERMISSIONS);
          addCapability(registry, 'plugin.permission:' + permission, 'plugin.yml', { plugin: name, permission });
        }
      }
    }
    pluginCount += 1;
  }
  registry.runtime.discoveryLog.push({ source: 'plugin.yml', plugins: pluginCount });
  return registry;
}

function mergeDiscovery(registry, discovery = {}) {
  const working = registry ? plainClone(registry) : emptyRegistry();
  if (!working.runtime) working.runtime = emptyRuntime();
  if (!working.discovered) working.discovered = { pluginCommands: [], permissions: [], sources: [] };
  if (!Array.isArray(working.discovered.jarProbes)) working.discovered.jarProbes = [];
  if (!Array.isArray(working.discovered.liveResponses)) working.discovered.liveResponses = [];
  if (discovery.version || discovery.versionMetadata || discovery.runtime) {
    normalizeVersionMetadata(working, discovery.version || discovery.versionMetadata || discovery.runtime);
  }
  if (discovery.rpc?.discover || discovery.rpcDiscover || discovery.discover) {
    mergeRpcDiscover(working, discovery.rpc?.discover || discovery.rpcDiscover || discovery.discover);
  }
  if (discovery.paper?.usage || discovery.paperUsage || discovery.paperCommands) {
    mergePaperUsageDiscovery(working, discovery.paper?.usage || discovery.paperUsage || discovery.paperCommands);
  }
  if (discovery.spigot?.jarHelp || discovery.spigotJarHelp || discovery.jarHelp) {
    mergeSpigotJarHelpDiscovery(working, discovery.spigot?.jarHelp || discovery.spigotJarHelp || discovery.jarHelp);
  }
  if (discovery.jarProbes || discovery.jarProbe || discovery.selectedJar) {
    mergeLocalJarProbeDiscovery(working, discovery.jarProbes || discovery.jarProbe || discovery.selectedJar);
  }
  if (discovery.liveResponses || discovery.liveRuntime || discovery.consoleResponses) {
    mergeLiveRuntimeDiscovery(working, discovery.liveResponses || discovery.liveRuntime || discovery.consoleResponses);
  }
  if (discovery.plugins || discovery.pluginYamls || discovery.pluginYaml) {
    mergePluginYamlDiscovery(working, discovery.plugins || discovery.pluginYamls || discovery.pluginYaml);
  }
  working.discovered.sources = working.runtime.discoveryLog.slice();
  return working;
}

function createCommandCenterRegistry(discovery = {}) {
  return mergeDiscovery(emptyRegistry(), discovery);
}

function shouldIncludeTemplatePart(part, values) {
  if (part.onlyWhen) {
    return Object.entries(part.onlyWhen).every(([field, expected]) => {
      const allowed = Array.isArray(expected) ? expected : [expected];
      return allowed.includes(values[field]);
    });
  }
  if (part.whenValue !== undefined) return values[part.optionalField] === part.whenValue;
  return true;
}

function primitiveToken(value, validation = {}) {
  const kind = validation.kind || 'safe-token';
  if (kind === 'boolean') {
    if (value === true || value === 'true') return 'true';
    if (value === false || value === 'false') return 'false';
    throw new Error('Expected a true or false value.');
  }
  if (kind === 'integer') {
    const number = Number(value);
    if (!Number.isInteger(number) || number < validation.min || number > validation.max) {
      throw new Error('Expected an integer between ' + validation.min + ' and ' + validation.max + '.');
    }
    return String(number);
  }
  if (kind === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number) || number < validation.min || number > validation.max) {
      throw new Error('Expected a number between ' + validation.min + ' and ' + validation.max + '.');
    }
    return String(number);
  }
  if (kind === 'enum') {
    const text = normalizedString(value);
    if (!validation.values?.includes(text)) throw new Error('Choose one of the supported values.');
    return text;
  }
  if (kind === 'resource-location') {
    const text = normalizedString(value);
    if (!/^[a-z0-9_.-]+(?::[a-z0-9_./-]+)?$/.test(text) || text.length > (validation.maxLength || 256)) {
      throw new Error('Use a bounded lower-case resource location.');
    }
    return text;
  }
  if (kind === 'permission') {
    const text = normalizedString(value);
    if (!/^[A-Za-z0-9*_.-]{1,256}$/.test(text)) throw new Error('Use a valid permission node.');
    return text;
  }
  if (kind === 'player') {
    const text = normalizedString(value);
    if (!/^[A-Za-z0-9_]{1,16}$/.test(text)) throw new Error('Use a valid Minecraft player name.');
    return text;
  }
  if (kind === 'target') {
    const text = normalizedString(value);
    const isPlayer = /^[A-Za-z0-9_]{1,16}$/.test(text);
    const isSelector = /^@[aeprs](?:\[[A-Za-z0-9_.,=!:+\-{}]*\])?$/.test(text);
    if ((!isPlayer && !isSelector) || text.length > (validation.maxLength || 256)) {
      throw new Error('Use a player name or a bounded selector from the selector builder.');
    }
    return text;
  }
  if (kind === 'identifier') {
    const text = normalizedString(value);
    if (!safeIdentifier(text, validation.maxLength || 128)) throw new Error('Use a valid identifier.');
    return text;
  }
  if (kind === 'duration-token') {
    const text = normalizedString(value);
    if (!/^\d{1,9}[dst]$/.test(text)) throw new Error('Use a duration such as 20t, 10s, or 1d.');
    return text;
  }
  if (kind === 'time') {
    const text = normalizedString(value);
    if (/^(day|noon|night|midnight)$/.test(text)) return text;
    const numeric = Number(text);
    if (!Number.isInteger(numeric) || numeric < -2147483648 || numeric > 2147483647) {
      throw new Error('Use a time preset or a bounded integer time.');
    }
    return String(numeric);
  }
  if (kind === 'coordinate-triple') {
    if (Array.isArray(value)) {
      if (value.length !== 3) throw new Error('A position needs exactly three axes.');
      return value.map((axis) => coordinateAxis(axis));
    }
    const parts = normalizedString(value).split(/\s+/).filter(Boolean);
    if (parts.length !== 3) throw new Error('A position needs exactly three axes.');
    return parts.map((axis) => coordinateAxis(axis));
  }
  if (kind === 'rotation-pair') {
    const parts = Array.isArray(value) ? value : normalizedString(value).split(/\s+/).filter(Boolean);
    if (parts.length !== 2) throw new Error('Rotation needs yaw and pitch.');
    return parts.map((part) => boundedNumberToken(part, -360, 360));
  }
  if (kind === 'rich-text') {
    const text = normalizedString(value);
    if (!text || text.length > (validation.maxLength || MAX_RICH_TEXT_LENGTH) || !isControlFree(text)) {
      throw new Error('Message text must be bounded and cannot contain control characters.');
    }
    return text;
  }
  if (kind === 'json-component') {
    const text = normalizedString(typeof value === 'string' ? value : JSON.stringify(value));
    if (!text || text.length > (validation.maxLength || MAX_RICH_TEXT_LENGTH) || !isControlFree(text)) {
      throw new Error('The text component is missing, too long, or contains control characters.');
    }
    try {
      JSON.parse(text);
    } catch {
      throw new Error('Provide a valid JSON text component.');
    }
    return { rawMinecraftSyntax: text };
  }
  if (kind === 'token-list') {
    const parsed = Array.isArray(value)
      ? normalizeTokenArray(value, validation)
      : tokenizeRawCommand(normalizedString(value), validation);
    return parsed.tokens;
  }
  const text = normalizedString(value);
  if (!text || text.length > (validation.maxLength || MAX_TOKEN_LENGTH) || !isControlFree(text) || /\s/.test(text)) {
    throw new Error('Use one bounded token without whitespace or control characters.');
  }
  return text;
}

function coordinateAxis(value) {
  const text = normalizedString(value);
  if (!text || !/^(?:[~^])?(?:-?(?:\d+(?:\.\d+)?|\.\d+))?$/.test(text) || text.length > 32 || !isControlFree(text)) {
    throw new Error('Each coordinate axis must be an absolute, relative (~), or local (^) coordinate.');
  }
  return text;
}

function boundedNumberToken(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error('Number is outside the allowed range.');
  return String(number);
}

function quoteMinecraftToken(value) {
  const text = normalizedString(value);
  if (!isControlFree(text)) throw new Error('Control characters are not allowed in a command token.');
  if (/^[^\s"\\]+$/.test(text)) return text;
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function normalizeTokenArray(tokens, options = {}) {
  if (!Array.isArray(tokens)) throw new Error('Expected a token array.');
  const maxTokens = options.maxTokens || MAX_RAW_TOKENS;
  const maxTokenLength = options.maxTokenLength || MAX_TOKEN_LENGTH;
  if (tokens.length > maxTokens) throw new Error('Too many command tokens.');
  const normalized = tokens.map((token) => {
    if (typeof token !== 'string') throw new Error('Command tokens must be strings.');
    const value = token.trim();
    if ((!value && !options.allowEmpty) || value.length > maxTokenLength || !isControlFree(value)) {
      throw new Error('Each command token must be bounded, non-empty, and free of control characters.');
    }
    return value;
  });
  const serializedLength = normalized.reduce((sum, token) => sum + token.length + 1, 0);
  if (serializedLength > (options.maxCommandLength || MAX_RAW_COMMAND_LENGTH)) {
    throw new Error('The tokenized command exceeds the maximum length.');
  }
  return { tokens: normalized };
}

function tokenizeRawCommand(input, options = {}) {
  const text = String(input ?? '');
  const maxTokens = options.maxTokens || MAX_RAW_TOKENS;
  const maxTokenLength = options.maxTokenLength || MAX_TOKEN_LENGTH;
  const maxCommandLength = options.maxCommandLength || MAX_RAW_COMMAND_LENGTH;
  if (!text.trim() || text.length > maxCommandLength || !isControlFree(text)) {
    throw new Error('Raw commands must be bounded, non-empty, and free of control characters.');
  }
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;
  const push = () => {
    if (!current.length) return;
    if (current.length > maxTokenLength) throw new Error('A raw command token is too long.');
    tokens.push(current);
    current = '';
  };
  for (const character of text) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === '\'') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      push();
      continue;
    }
    current += character;
  }
  if (escaped || quote) throw new Error('Raw command quotes and escapes must be complete.');
  push();
  return normalizeTokenArray(tokens, { maxTokens, maxTokenLength, maxCommandLength });
}

function serializeTokenizedCommand(tokens, options = {}, rawTokenIndexes = new Set()) {
  const normalized = normalizeTokenArray(tokens, options);
  const withoutSlash = normalized.tokens.map((token, index) => index === 0 ? token.replace(/^\//, '') : token);
  if (!withoutSlash[0]) throw new Error('A command name is required.');
  return {
    tokens: withoutSlash,
    command: withoutSlash.map((token, index) => rawTokenIndexes.has(index) ? token : quoteMinecraftToken(token)).join(' '),
    routePolicy: rawFallback(options)
  };
}

function composeRawTokenizedCommand(tokens, options = {}) {
  const normalized = Array.isArray(tokens)
    ? normalizeTokenArray(tokens, options)
    : tokenizeRawCommand(tokens, options);
  return serializeTokenizedCommand(normalized.tokens, options);
}

function fieldById(action, id) {
  return action.fields.find((field) => field.id === id) || null;
}

function composeCommand(registry, actionId, values = {}, options = {}) {
  const action = getAction(registry, actionId);
  if (!action) throw new Error('The requested Command Center action does not exist.');
  const execution = resolveActionExecution(registry, action, { route: options.route || 'auto' });
  if (options.route === ROUTES.PROTOCOL && !execution.protocol.executable) {
    throw new Error('The requested protocol route is not advertised by the running runtime. Use a local console or RCON route instead.');
  }
  const formState = resolveForm(registry, action, options.formId);
  if (formState.dynamicState === 'not-discovered') {
    throw new Error('This Paper action requires current /paper usage discovery before its command tokens can be composed.');
  }
  const tokens = formState.prefix.slice();
  const rawTokenIndexes = new Set();
  const appendToken = (token, rawMinecraftSyntax = false) => {
    tokens.push(token);
    if (rawMinecraftSyntax) rawTokenIndexes.add(tokens.length - 1);
  };
  for (const part of action.template || []) {
    if (!shouldIncludeTemplatePart(part, values)) continue;
    if (part.literal !== undefined) {
      appendToken(String(part.literal));
      continue;
    }
    const fieldId = part.field || part.optionalField;
    if (!fieldId) continue;
    const field = fieldById(action, fieldId);
    const suppliedValue = values[fieldId];
    const rawValue = suppliedValue === undefined || suppliedValue === null || suppliedValue === ''
      ? field?.default
      : suppliedValue;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (part.optionalField || !field?.required) continue;
      throw new Error(field?.label + ' is required.');
    }
    const token = primitiveToken(rawValue, field?.validation || {});
    if (token && typeof token === 'object' && !Array.isArray(token) && token.rawMinecraftSyntax) {
      appendToken(token.rawMinecraftSyntax, true);
      continue;
    }
    if (Array.isArray(token)) {
      const multiTokenField = ['coordinate-triple', 'rotation-pair', 'token-list'].includes(field?.validation?.kind);
      if (!part.tokenList && !multiTokenField) throw new Error(field?.label + ' must resolve to one token.');
      for (const value of token) appendToken(value);
    } else if (part.tokenList) {
      for (const value of tokenizeRawCommand(token).tokens) appendToken(value);
    } else {
      appendToken(token);
    }
  }
  const composed = serializeTokenizedCommand(tokens, action.rawFallback, rawTokenIndexes);
  return {
    actionId: action.id,
    title: action.title,
    form: formState.form.id,
    formBadges: formState.form.badges || [],
    deprecated: Boolean(formState.form.deprecated || action.deprecated),
    warning: action.warning || '',
    risk: action.risk,
    backupRequirement: action.backupRequirement,
    confirmationRequirement: action.confirmationRequirement,
    execution,
    ...composed
  };
}

module.exports = {
  BACKUP_REQUIREMENTS,
  CAPABILITY_BADGE_RULES,
  COMMAND_CENTER_SCHEMA_VERSION,
  COMMAND_FAMILIES,
  CONFIRMATION_REQUIREMENTS,
  FIELDS,
  MAX_RAW_COMMAND_LENGTH,
  MAX_DISCOVERY_EVIDENCE,
  MAX_DISCOVERY_EVIDENCE_TEXT,
  MAX_RAW_TOKENS,
  MAX_TOKEN_LENGTH,
  PROTOCOL_REQUIREMENT_STATES,
  RAW_FALLBACK_POLICY,
  RISK_CATEGORIES,
  ROUTES,
  allActions,
  compareMinecraftVersions,
  composeCommand,
  composeRawTokenizedCommand,
  createCommandCenterRegistry,
  getAction,
  mergeDiscovery,
  mergeLiveRuntimeDiscovery,
  mergeLocalJarProbeDiscovery,
  mergePaperUsageDiscovery,
  mergePluginYamlDiscovery,
  mergeRpcDiscover,
  mergeSpigotJarHelpDiscovery,
  normalizeMinecraftVersion,
  normalizeTokenArray,
  normalizeVersionMetadata,
  presentRegistry,
  resolveActionExecution,
  tokenizeRawCommand
};
