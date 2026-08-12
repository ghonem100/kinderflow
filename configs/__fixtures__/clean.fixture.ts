// FIXTURE — MUST PASS lint with zero errors.
// Proves the custom rules are not over-broad: logical properties, token
// references, and typed signatures must never be flagged.

export const goodClasses = 'flex items-center gap-2 ps-4 pe-6 ms-2 me-2 rounded-lg';
export const goodVariant = 'md:ps-8 hover:bg-surface';
export const goodColor = 'var(--kf-primary-600)';
export const goodSpacing = 'var(--kf-space-4)';
export const goodRadius = 'var(--kf-radius-md)';
export const goodTemplate = `sticky top-0 ms-1`;

export function typed(input: string): string {
  return input.trim();
}

export type Strict = Record<string, string>;
