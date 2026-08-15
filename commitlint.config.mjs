/**
 * Conventional Commits enforcement — Blueprint §12, Sprint 0 Guide §8.
 *
 * Sprint 0 Guide §8 defines the scope list as "module/package names (enforced
 * list)", and Blueprint §12 gives `feat(billing): …` as the worked example.
 * KF-S0-INFRA-005 decision D-11 additionally requires the Master Backlog epic
 * codes and the structural scopes this repository already uses.
 *
 * Those are four different naming systems for the same codebase, so the enum is
 * their union. Narrowing it to any one family would reject either the approved
 * example (`billing` is a module name, `bill` is the epic code) or this
 * repository's own history (`repo`, `configs`, `execution`).
 *
 * An empty scope is permitted: the baseline commit
 * `docs: import approved phase 0-9 documentation` carries none.
 */

/** Epic codes — Master Backlog §1, lowercased (decision D-11a). */
const EPIC_SCOPES = [
  'infra',
  'ci',
  'ops',
  'rls',
  'contract',
  'auth',
  'tenant',
  'iam',
  'child',
  'att',
  'sync',
  'act',
  'rpt',
  'ai',
  'media',
  'bill',
  'pay',
  'comm',
  'notif',
  'anly',
  'plat',
  'audit',
  'fe',
  'qa',
  'doc',
];

/** Nest module names — Blueprint §3 bounded contexts. Source of `feat(billing)`. */
const MODULE_SCOPES = [
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
];

/** Workspace package names — Blueprint §1, without the `@kf/` prefix. */
const PACKAGE_SCOPES = ['api', 'web', 'contracts', 'tokens', 'ui', 'i18n', 'shared'];

/** Repository-level scopes already in use in this history (decision D-11b). */
const STRUCTURAL_SCOPES = ['repo', 'configs', 'execution', 'deps'];

const SCOPES = [
  ...new Set([...EPIC_SCOPES, ...MODULE_SCOPES, ...PACKAGE_SCOPES, ...STRUCTURAL_SCOPES]),
].sort();

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
