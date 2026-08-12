/**
 * KinderFlow presentation-layer rules.
 *
 * Scope per KF-S0-INFRA-003: `apps/web` and `packages/ui` only. These are the
 * two places where Tailwind classes and design values are authored.
 *
 * Sources of truth:
 *   - Design System §2.6  — logical properties only, no left/right anywhere
 *   - Design System §02   — colors/spacing/radius come from tokens, never literals
 *   - Blueprint §12       — "no raw hex/px in app code (lint-enforced)"
 *   - Sprint 0 Guide §8   — rule names: no-physical-direction-classes, no-raw-token-values
 *
 * Mechanism: `no-restricted-syntax` with esquery regex selectors over string
 * literals and template chunks. Tailwind classes, inline styles, and CSS-in-JS
 * all reach the AST as one of those two node types.
 */

/** `pl-4`, `-ml-2`, `md:pr-8`, `left-0`. Boundary = start, whitespace, or a Tailwind variant colon. */
const PHYSICAL_DIRECTION = '(^|[\\s:])-?(pl|pr|ml|mr|left|right)-';

/** `#0D7377`, `#fff`, `#0D7377AA`. */
const RAW_HEX = '#[0-9a-fA-F]{3,8}';

/** `16px`, `1.5px`. */
const RAW_PX = '[0-9]+(\\.[0-9]+)?px';

const MSG_PHYSICAL_DIRECTION =
  'Physical-direction utility class. KinderFlow is RTL-first (Design System §2.6): use logical properties — ' +
  'ps-* instead of pl-*, pe-* instead of pr-*, ms-* instead of ml-*, me-* instead of mr-*, ' +
  'start-* instead of left-*, end-* instead of right-*.';

const MSG_RAW_HEX =
  'Raw hex color literal. Colors come from design tokens only — use the --kf-* custom properties ' +
  'exposed by @kf/tokens (Design System §02). Example: #0D7377 is --kf-primary-600.';

const MSG_RAW_PX =
  'Raw px value. Spacing, radius, and type sizes come from design tokens — use the scales exposed ' +
  'by @kf/tokens (Design System §2.3–§2.5).';

/** Applies one pattern to both plain string literals and template-literal chunks. */
const restrict = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
];

/**
 * The rules themselves, unscoped — for a package-local flat config that is
 * already rooted inside `apps/web` or `packages/ui`.
 */
export const webRules = {
  'no-restricted-syntax': [
    'error',
    ...restrict(PHYSICAL_DIRECTION, MSG_PHYSICAL_DIRECTION),
    ...restrict(RAW_HEX, MSG_RAW_HEX),
    ...restrict(RAW_PX, MSG_RAW_PX),
  ],
};

/** Repo-relative globs the overlay applies to. */
export const WEB_SCOPE = [
  'apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'packages/ui/**/*.{ts,tsx,js,jsx,mjs,cjs}',
];

/** Path-scoped overlay — for a repository-root flat config. */
export const web = [
  {
    name: 'kf/web',
    files: WEB_SCOPE,
    rules: webRules,
  },
];

export default web;
