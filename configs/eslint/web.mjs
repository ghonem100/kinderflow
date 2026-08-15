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

/**
 * Directional utilities banned by KF-S0-INFRA-003a, each with the logical
 * replacement named in its own error message.
 *
 * Governing rule (planner, R-6): ban a utility **only if a logical replacement
 * exists**. A rule that cannot name a replacement is a rule engineers disable.
 * Deliberately absent — see configs/README.md for the full rationale:
 *   inset-x, inset-y                 direction-neutral
 *   rounded-t, rounded-b, border-t, border-b   block axis, no RTL mirroring
 *   origin-left, bg-left             no Tailwind logical counterpart
 *
 * kind:
 *   'prefix'   utility always takes a value → `pl-4`, `scroll-ml-2`
 *   'sided'    valued or bare → `border-l-2` and `border-l`, `rounded-tl-lg`
 *              and `rounded-tl` (Tailwind allows both; both break RTL)
 *   'position' valued, but value-guarded (see VALUE) → `left-0`
 *   'complete' whole utility, never valued → `text-left`
 */
const DIRECTIONAL = [
  // padding / margin (KF-S0-INFRA-003)
  ['pl-', 'ps-', 'prefix'],
  ['pr-', 'pe-', 'prefix'],
  ['ml-', 'ms-', 'prefix'],
  ['mr-', 'me-', 'prefix'],
  // inset (KF-S0-INFRA-003)
  ['left-', 'start-', 'position'],
  ['right-', 'end-', 'position'],
  // border width/color per side (KF-S0-INFRA-003a)
  ['border-l', 'border-s', 'sided'],
  ['border-r', 'border-e', 'sided'],
  // border radius per side (KF-S0-INFRA-003a)
  ['rounded-l', 'rounded-s', 'sided'],
  ['rounded-r', 'rounded-e', 'sided'],
  // border radius per corner (KF-S0-INFRA-003a)
  ['rounded-tl', 'rounded-ss', 'sided'],
  ['rounded-tr', 'rounded-se', 'sided'],
  ['rounded-bl', 'rounded-es', 'sided'],
  ['rounded-br', 'rounded-ee', 'sided'],
  // scroll margin / padding (KF-S0-INFRA-003a)
  ['scroll-ml-', 'scroll-ms-', 'prefix'],
  ['scroll-mr-', 'scroll-me-', 'prefix'],
  ['scroll-pl-', 'scroll-ps-', 'prefix'],
  ['scroll-pr-', 'scroll-pe-', 'prefix'],
  // valueless utilities (KF-S0-INFRA-003a)
  ['text-left', 'text-start', 'complete'],
  ['text-right', 'text-end', 'complete'],
  ['float-left', 'float-start', 'complete'],
  ['float-right', 'float-end', 'complete'],
  ['clear-left', 'clear-start', 'complete'],
  ['clear-right', 'clear-end', 'complete'],
];

/** Start of a class token: string start, whitespace, or a Tailwind variant colon (`md:`). */
const BOUNDARY = '(^|[\\s:])';

/**
 * Shapes a Tailwind value can start with: `left-0`, `left-1/2`, `left-px`,
 * `left-auto`, `left-full`, `left-[10px]`.
 *
 * Applied to `left-`/`right-` only, because those are the two banned prefixes
 * that collide with ordinary English — "the left-hand column", "right-click to
 * open". Without this guard the rule fires on prose and reviewers learn to
 * ignore it. Real utilities are unaffected: `left-0` and `right-4` still fail.
 */
const VALUE = '(\\[|\\d|px|auto|full)';

const patternFor = (physical, kind) => {
  if (kind === 'complete') return `${BOUNDARY}${physical}(\\s|$)`;
  if (kind === 'position') return `${BOUNDARY}-?${physical}${VALUE}`;
  // 'sided' must match `border-l-2` and bare `border-l`, but never `rounded-lg`.
  if (kind === 'sided') return `${BOUNDARY}-?${physical}(-|\\s|$)`;
  return `${BOUNDARY}-?${physical}`;
};

/** `pl-` and `border-l` both read as `pl-*` / `border-l-*`; `text-left` is already whole. */
const label = (utility, kind) => {
  if (kind === 'complete') return utility;
  if (kind === 'sided') return `${utility}-*`;
  return `${utility}*`;
};

const messageFor = (physical, logical, kind) =>
  `Physical-direction utility \`${label(physical, kind)}\`. KinderFlow is RTL-first ` +
  `(Design System §2.6): use \`${label(logical, kind)}\` instead.`;

/** `#0D7377`, `#fff`, `#0D7377AA`. */
const RAW_HEX = '#[0-9a-fA-F]{3,8}';

/** `16px`, `1.5px`. */
const RAW_PX = '[0-9]+(\\.[0-9]+)?px';

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

const directionalRestrictions = DIRECTIONAL.flatMap(([physical, logical, kind]) =>
  restrict(patternFor(physical, kind), messageFor(physical, logical, kind)),
);

/** The banned set, exported so documentation and tests read from one source. */
export const DIRECTIONAL_UTILITIES = DIRECTIONAL.map(([physical, logical, kind]) => ({
  physical: label(physical, kind),
  logical: label(logical, kind),
}));

/**
 * The rules themselves, unscoped — for a package-local flat config that is
 * already rooted inside `apps/web` or `packages/ui`.
 */
export const webRules = {
  'no-restricted-syntax': [
    'error',
    ...directionalRestrictions,
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
