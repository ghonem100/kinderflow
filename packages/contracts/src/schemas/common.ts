/**
 * Shared zod schemas — the runtime half of the shared OpenAPI components.
 *
 * These live in `@kf/contracts`, never in `@kf/shared` (DISC-011, founder
 * decision): DTO schemas are contract artifacts and must version with the
 * OpenAPI spec they mirror, and the spec-diff gate cannot catch drift in a
 * package it does not govern. `@kf/shared` keeps framework-free pure utils.
 *
 * They are hand-written rather than generated, and that is a deliberate
 * duplication with `openapi.yaml`. The spec is the contract; these are the
 * runtime validators web forms and API DTO validators both mirror. The
 * contracts test asserts the two agree where they overlap, so the duplication
 * is checked rather than trusted.
 */
import { z } from 'zod';

/** UUIDv7 string. No sequential ids are ever exposed (API Contract §1). */
export const uuidSchema = z.uuid();

/**
 * API Contract §1 money — integer minor units, never a float. A decimal here
 * is how rounding errors reach an invoice total.
 */
export const moneySchema = z.object({
  amount_minor: z.int(),
  currency: z.string().length(3),
});
export type MoneyInput = z.infer<typeof moneySchema>;

/** §1 localization — both languages always present, never one. */
export const localizedTextSchema = z.object({
  ar: z.string(),
  en: z.string(),
});
export type LocalizedTextInput = z.infer<typeof localizedTextSchema>;

/** §1 cursor pagination. `next_cursor` is null on the last page. */
export const paginatedMetaSchema = z.object({
  limit: z.int().min(1).max(100),
  next_cursor: z.string().nullable(),
});
export type PaginatedMetaInput = z.infer<typeof paginatedMetaSchema>;

/** §4 problem-document item — a JSON Pointer to the offending field. */
export const problemDetailItemSchema = z.object({
  pointer: z.string(),
  code: z.string(),
  message: z.string(),
});

/** §4 RFC 7807 envelope. */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(problemDetailItemSchema).optional(),
  trace_id: z.string(),
});
export type ProblemDetailsInput = z.infer<typeof problemDetailsSchema>;

/**
 * §1 pagination query. Shared by every list endpoint; offset pagination exists
 * nowhere in this API, so there is deliberately no `page` or `offset` here.
 */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
