// FIXTURE — MUST FAIL lint (rule a: no-physical-direction-classes).
// Design System §2.6: logical properties only. Asserted by `pnpm lint:rules`.
// Excluded from normal lint runs via the `**/__fixtures__/**` ignore in @kf/config-eslint.

// --- KF-S0-INFRA-003: the original six utilities ---
export const badPadding = 'flex items-center pl-4 pr-2';
export const badMargin = 'ml-2 mr-6';
export const badPosition = 'absolute left-0 right-4';
export const badVariant = 'md:pl-8';
export const badNegative = '-ml-2';
export const badTemplate = `sticky top-0 ml-1`;

// --- KF-S0-INFRA-003a: one case per newly banned family ---
export const badBorderSide = 'border-l-2 border-r-4';
export const badRoundedSide = 'rounded-l-lg rounded-r-md';
export const badRoundedCorner = 'rounded-tl-lg rounded-tr-sm rounded-bl-xl rounded-br-2xl';
export const badTextAlignStart = 'text-left';
export const badTextAlignEnd = 'text-right';
export const badFloat = 'float-left float-right';
export const badClear = 'clear-left clear-right';
export const badScrollMargin = 'scroll-ml-4 scroll-mr-8';
export const badScrollPadding = 'scroll-pl-2 scroll-pr-6';

// Bare forms — Tailwind allows `border-l` / `rounded-tl` without a value,
// and they break RTL identically to their valued forms.
export const badBareSide = 'border-l rounded-r';
export const badBareCorner = 'rounded-tl';

// --- KF-S0-INFRA-003a: the three edge cases, exercised on NEW families ---
export const badNewVariant = 'md:border-l-2';
export const badNewNegative = '-scroll-ml-2';
export const badNewTemplate = `card shadow-sm rounded-br-lg`;
