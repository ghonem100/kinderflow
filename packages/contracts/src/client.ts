/**
 * Typed fetch client (KF-S0-CONTRACT-001, Implementation Requirement 6).
 *
 * Thin on purpose. It is a typed envelope over `fetch`, not an SDK: no
 * retries, no caching, no token refresh, no state. Those are product decisions
 * that differ per surface — the web app (KF-S0-FE-005) and the Postman suite
 * consume this and add their own — and a client that made them here would have
 * to be fought rather than used.
 *
 * What it does provide is the part that must not be re-derived per surface:
 * the request path, method, body and response body all come from the generated
 * OpenAPI types, so a call that does not match the spec fails to compile.
 *
 * Errors are NOT thrown. Every response comes back as a discriminated result,
 * because an API whose error catalog is a first-class contract (§4) should not
 * express its failures as exceptions that callers forget to catch. A 403 with
 * `PERMISSION_DENIED` is an outcome, not an exception.
 */
import type { paths } from './generated/api-types.js';
import type { ProblemDetails } from './errors.js';

/** HTTP methods the spec uses. */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Paths in the spec that define the given method. */
export type PathsFor<M extends HttpMethod> = {
  [P in keyof paths]: paths[P] extends Record<M, infer O>
    ? O extends undefined
      ? never
      : P
    : never;
}[keyof paths];

type Operation<P extends keyof paths, M extends HttpMethod> =
  paths[P] extends Record<M, infer O> ? O : never;

type JsonBody<T> = T extends { content: { 'application/json': infer B } } ? B : never;

/** The request body the spec declares for an operation, if it declares one. */
export type RequestBodyOf<P extends keyof paths, M extends HttpMethod> =
  Operation<P, M> extends { requestBody?: infer R }
    ? R extends undefined
      ? never
      : JsonBody<NonNullable<R>>
    : never;

/** The 2xx JSON body the spec declares, collapsed across success statuses. */
export type ResponseBodyOf<P extends keyof paths, M extends HttpMethod> =
  Operation<P, M> extends { responses: infer R }
    ? R extends Record<string, unknown>
      ? JsonBody<R[keyof R & (200 | 201 | 202)]>
      : never
    : never;

/** A call that reached the API and was accepted. */
export interface ApiSuccess<T> {
  readonly ok: true;
  readonly status: number;
  readonly data: T;
}

/** A call the API refused, carrying the §4 problem document. */
export interface ApiFailure {
  readonly ok: false;
  readonly status: number;
  readonly problem: ProblemDetails;
}

/**
 * A call that never produced a problem document — the network failed, or the
 * response was not JSON. Kept distinct from `ApiFailure` because "the server
 * said no" and "there was no server" want different handling, and collapsing
 * them is how a transport outage gets reported to a user as a validation
 * error.
 */
export interface ApiTransportFailure {
  readonly ok: false;
  readonly status: number | null;
  readonly problem: null;
  readonly cause: unknown;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure | ApiTransportFailure;

export interface ClientOptions {
  /** Base URL including the `/api/v1` prefix, no trailing slash. */
  readonly baseUrl: string;
  /** Returns the current access token, or null when signed out. */
  readonly getAccessToken?: () => string | null | Promise<string | null>;
  /** `ar` or `en`; sets `Accept-Language`. */
  readonly language?: 'ar' | 'en';
  /** Injected for tests and for runtimes without a global fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  /** Path parameters, substituted into `{placeholders}`. */
  readonly params?: Readonly<Record<string, string | number>>;
  /** Query parameters. Null and undefined values are omitted. */
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  /** UUID for the `Idempotency-Key` header (§1). */
  readonly idempotencyKey?: string;
  /** Aggregate version for the `If-Match` header (§1). */
  readonly ifMatch?: string;
  readonly signal?: AbortSignal;
}

const isProblem = (value: unknown): value is ProblemDetails =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { code?: unknown }).code === 'string' &&
  typeof (value as { trace_id?: unknown }).trace_id === 'string';

function buildUrl(baseUrl: string, template: string, options: RequestOptions | undefined): string {
  const withParams = template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = options?.params?.[name];
    if (value === undefined) {
      throw new Error(`contracts: missing path parameter "${name}" for ${template}`);
    }
    return encodeURIComponent(String(value));
  });

  const url = new URL(baseUrl.replace(/\/$/, '') + withParams);
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Creates a client bound to one base URL and one token source.
 *
 * `request` is deliberately the only method. Per-operation helpers would be a
 * second hand-maintained surface that drifts from the spec — exactly what the
 * drift check exists to prevent elsewhere in this package.
 */
export function createClient(options: ClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch;

  async function request<M extends HttpMethod, P extends PathsFor<M>>(
    method: M,
    path: P,
    init?: RequestOptions &
      ([RequestBodyOf<P, M>] extends [never] ? { body?: never } : { body: RequestBodyOf<P, M> }),
  ): Promise<ApiResult<ResponseBodyOf<P, M>>> {
    const headers = new Headers({ Accept: 'application/json' });

    const token = await options.getAccessToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.language) headers.set('Accept-Language', options.language);
    if (init?.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey);
    if (init?.ifMatch) headers.set('If-Match', init.ifMatch);

    const body = (init as { body?: unknown } | undefined)?.body;
    if (body !== undefined) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await doFetch(buildUrl(options.baseUrl, path as string, init), {
        method: method.toUpperCase(),
        headers,
        credentials: 'include',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(init?.signal ? { signal: init.signal } : {}),
      });
    } catch (cause) {
      return { ok: false, status: null, problem: null, cause };
    }

    if (response.status === 204) {
      return { ok: true, status: 204, data: undefined as ResponseBodyOf<P, M> };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      return { ok: false, status: response.status, problem: null, cause };
    }

    if (response.ok) {
      return { ok: true, status: response.status, data: payload as ResponseBodyOf<P, M> };
    }
    if (isProblem(payload)) {
      return { ok: false, status: response.status, problem: payload };
    }
    return {
      ok: false,
      status: response.status,
      problem: null,
      cause: new Error('response was not an RFC 7807 problem document'),
    };
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createClient>;
