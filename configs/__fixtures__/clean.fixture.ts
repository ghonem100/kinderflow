// FIXTURE — MUST PASS lint with zero errors.
// Proves the custom rules are not over-broad: logical properties, token
// references, and typed signatures must never be flagged.

// --- KF-S0-INFRA-003 ---
export const goodClasses = 'flex items-center gap-2 ps-4 pe-6 ms-2 me-2 rounded-lg';
export const goodVariant = 'md:ps-8 hover:bg-surface';
export const goodColor = 'var(--kf-primary-600)';
export const goodSpacing = 'var(--kf-space-4)';
export const goodRadius = 'var(--kf-radius-md)';
export const goodTemplate = `sticky top-0 ms-1`;

// --- KF-S0-INFRA-003a: logical equivalents of every newly banned family ---
export const goodBorderSide = 'border-s-2 border-e-4';
export const goodRoundedSide = 'rounded-s-lg rounded-e-md';
export const goodRoundedCorner = 'rounded-ss-lg rounded-se-sm rounded-es-xl rounded-ee-2xl';
export const goodTextAlign = 'text-start text-end';
export const goodFloat = 'float-start float-end';
export const goodClear = 'clear-start clear-end';
export const goodScrollMargin = 'scroll-ms-4 scroll-me-8';
export const goodScrollPadding = 'scroll-ps-2 scroll-pe-6';
export const goodNewVariant = 'md:border-s-2';
export const goodNewTemplate = `card shadow-sm rounded-ee-lg`;

// --- Boundary pins: NOT banned, because no Tailwind logical equivalent exists ---
export const neutralInset = 'inset-x-4 inset-y-2';
export const transformOrigin = 'origin-left origin-right';
export const backgroundPosition = 'bg-left bg-right';
// Block-axis utilities do not mirror in RTL — top/bottom are not start/end.
export const blockAxis = 'rounded-t-lg rounded-b-lg border-t-2 border-b-2';

// --- Near misses: must NOT trip ---
// `rounded-lg` / `rounded-full` share a prefix with the banned `rounded-l-*`.
export const nearMissRadius = 'rounded-lg rounded-full';
// A token name containing both `border` and `left`.
export const nearMissToken = 'var(--kf-border-left-legacy)';
// Ordinary English prose — the reason `left-`/`right-` are value-guarded.
export const nearMissProse = 'the left-hand column stays fixed';
export const nearMissProseTwo = 'right-click to open the context menu';

export function typed(input: string): string {
  return input.trim();
}

export type Strict = Record<string, string>;
