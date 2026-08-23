/**
 * Spike-only client construction (KF-S0-RLS-001).
 *
 * Prisma 7 removed `url` from the datasource block: a driver adapter is now
 * required and the connection pool is the JS `pg` pool, not the Rust engine's.
 * That matters for this spike — pool checkout semantics are half the question —
 * so the pool is configured explicitly rather than left implicit.
 *
 * This file is spike scaffolding. KF-S0-API-001 owns the real client lifecycle.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';

export interface SpikeDbOptions {
  /** Connection string. Defaults to the kf_api role — no BYPASSRLS. */
  url?: string;
  /** Small on purpose: pool reuse is what the leak probe needs to exercise. */
  max?: number;
  /** Emit query events so probes can assert on SQL actually issued. */
  logQueries?: boolean;
}

export function makeSpikeClient(options: SpikeDbOptions = {}) {
  const connectionString =
    options.url ??
    process.env.KF_DATABASE_URL ??
    'postgresql://kf_api:dev_only_api@localhost:5432/kf_dev';

  const adapter = new PrismaPg({ connectionString, max: options.max ?? 5 });

  return new PrismaClient({
    adapter,
    log: options.logQueries ? [{ emit: 'event', level: 'query' }] : [],
  });
}
