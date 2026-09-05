/**
 * @kf/contracts — the single source of API truth (KF-S0-CONTRACT-001).
 *
 * Nothing here serves a request. This package holds the specification and the
 * vocabulary the implementation is measured against: the OpenAPI document, the
 * authorization codes, the error catalog, the domain enums, and the zod schemas
 * that web forms and API DTO validators both mirror (DISC-011).
 *
 * `openapi.yaml` is authored by hand; `src/generated/api-types.ts` is produced
 * from it by `pnpm --filter @kf/contracts generate` and checked in CI. Never
 * edit the generated file — the spec is the source, the types are the output.
 */
export * from './permissions.js';
export * from './errors.js';
export * from './enums.js';
export * from './client.js';
export * from './schemas/index.js';
export * from './events/index.js';

export * from './generated/operations.js';

export type { paths, components, operations } from './generated/api-types.js';
