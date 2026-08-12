// FIXTURE — MUST FAIL lint (rule a: no-physical-direction-classes).
// Design System §2.6: logical properties only. Asserted by `pnpm lint:rules`.
// Excluded from normal lint runs via the `**/__fixtures__/**` ignore in @kf/config-eslint.

export const badPadding = 'flex items-center pl-4 pr-2';
export const badMargin = 'ml-2 mr-6';
export const badPosition = 'absolute left-0 right-4';
export const badVariant = 'md:pl-8';
export const badNegative = '-ml-2';
export const badTemplate = `sticky top-0 ml-1`;
