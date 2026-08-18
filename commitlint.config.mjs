/**
 * Conventional Commits enforcement — Blueprint §12, Sprint 0 Guide §8.
 *
 * Sprint 0 Guide §8 defines the scope list as "module/package names (enforced
 * list)". A commit scope answers one question: **where in the codebase did this
 * change land?** The enum is therefore a single code-location taxonomy, built
 * from three families that map onto real directories.
 *
 * The Master Backlog §1 epic codes were deliberately REMOVED (decision
 * D-11-revised). They are a *planning* taxonomy, not a code-location one, and
 * carrying both produced synonym pairs — `bill` and `billing`, `att` and
 * `attendance`, `comm` and `communication` — for the same directory. Two names
 * for one place makes `git log --grep` and changelog grouping unreliable. Task
 * IDs still belong in the commit body or subject text; they are just not scopes.
 */

/**
 * Nest modules — SAD §3.1 (12 bounded contexts), plus Analytics and Audit from
 * Domain Model Part 2.12 and 2.13. Directory: `apps/api/src/modules/`.
 *
 * SAD names are mapped to their directory names: IdentityAccess to `iam`,
 * ChildrenFamilies to `children`, AIServices to `ai`, PlatformAdmin to
 * `platform`, SharedKernel to `shared-kernel`.
 *
 * `notifications` is intentionally absent: notification dispatch lives inside
 * Communication (SAD §3.1). It exists separately only as a BullMQ queue and a
 * backlog epic code, and adding it would re-introduce the synonym problem this
 * list exists to remove. Use `communication`.
 */
const MODULE_SCOPES = [
  'shared-kernel',
  'iam',
  'tenancy',
  'children',
  'attendance',
  'activities',
  'billing',
  'communication',
  'staff',
  'ai',
  'media',
  'platform',
  'analytics',
  'audit',
];

/**
 * Workspace packages — Blueprint §1, without the `@kf/` prefix.
 *
 * NOTE: `shared` and `shared-kernel` are two different places and both are
 * valid (decision D-16). `shared` is `packages/shared` — the isomorphic,
 * zero-dependency utility package. `shared-kernel` is
 * `apps/api/src/shared-kernel` — the backend kernel from SAD §3.1. Do not
 * "deduplicate" them; they are not synonyms.
 */
const PACKAGE_SCOPES = [
  'api',
  'web',
  'contracts',
  'tokens',
  'ui',
  'i18n',
  'shared',
  'configs',
  'tooling',
];

/** Repository-level areas that are not a module or a package. */
const STRUCTURAL_SCOPES = ['repo', 'execution', 'deps', 'docs', 'ci'];

/** Families may legitimately overlap; dedupe rather than rename. */
const SCOPES = [...new Set([...MODULE_SCOPES, ...PACKAGE_SCOPES, ...STRUCTURAL_SCOPES])].sort();

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'chore',
        'refactor',
        'test',
        'build',
        'ci',
        'perf',
        'style',
        'revert',
      ],
    ],
    'scope-enum': [2, 'always', SCOPES],
    // A scope is expected for domain work by convention, but not mechanically
    // required — the baseline import commit legitimately has none.
    'scope-empty': [0, 'never'],
  },
};
