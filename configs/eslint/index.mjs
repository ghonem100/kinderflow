/**
 * @kf/config-eslint — shared ESLint 9 flat configuration.
 *
 * Consumers (wired up by later tasks, not by KF-S0-INFRA-003):
 *
 *   // repository root
 *   import { base, web } from '@kf/config-eslint';
 *   export default [...base, ...web];
 *
 *   // inside apps/web or packages/ui
 *   import { base, webRules } from '@kf/config-eslint';
 *   export default [...base, { rules: webRules }];
 */
export { base, ignores } from './base.mjs';
export { web, webRules, WEB_SCOPE } from './web.mjs';

export { base as default } from './base.mjs';
