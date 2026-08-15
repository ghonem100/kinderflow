// PLACEHOLDER — replaced by KF-S0-FE-001 (Next.js bootstrap with route groups).
// Exists only so `composite: true` has an input; an empty project fails TS18003.
// The import is deliberate: it makes the apps/web -> @kf/tokens edge real, so the
// build order and cache invalidation in KF-S0-INFRA-004 are genuinely exercised.
import { TOKENS_PACKAGE } from '@kf/tokens';

export const WEB_APP = `@kf/web built on ${TOKENS_PACKAGE}`;
