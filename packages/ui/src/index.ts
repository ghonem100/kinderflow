// PLACEHOLDER — replaced by KF-S0-FE-003 (@kf/ui initialization and first components).
// Exists only so `composite: true` has an input; an empty project fails TS18003.
// The import is deliberate: it makes the @kf/ui -> @kf/tokens edge real, so the
// build order and cache invalidation in KF-S0-INFRA-004 are genuinely exercised.
import { TOKENS_PACKAGE } from '@kf/tokens';

export const UI_PACKAGE = `@kf/ui built on ${TOKENS_PACKAGE}`;
