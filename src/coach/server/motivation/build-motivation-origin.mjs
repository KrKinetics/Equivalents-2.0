/**
 * Allowlisted origin for /motivation.html?token=… links.
 * Reuses the intake origin allowlist. Never trusts body.origin.
 * URL construction lives in motivation-invite-link.mjs (single constructor).
 */

import {
  resolveIntakeOrigin,
  PRODUCTION_INTAKE_ORIGIN,
  LOCAL_INTAKE_ORIGIN,
} from '../intake/build-intake-origin.mjs';
import { buildMotivationInviteUrl } from './motivation-invite-link.mjs';

export {
  resolveIntakeOrigin,
  PRODUCTION_INTAKE_ORIGIN,
  LOCAL_INTAKE_ORIGIN,
  buildMotivationInviteUrl,
};
