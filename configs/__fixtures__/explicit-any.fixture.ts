// FIXTURE — MUST FAIL lint (rule c: no `any`, repository-wide).
// Blueprint §12: "TS strict everywhere; no `any` (lint error)".

export function unsafe(input: any): any {
  return input;
}

export const alsoBad: any[] = [];

export type Loose = Record<string, any>;
