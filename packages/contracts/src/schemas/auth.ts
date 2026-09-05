/**
 * §2.1 Authentication request schemas.
 *
 * Bounds only — the password POLICY (composition, breach checks, lockout) is
 * SAD §5.1 and is enforced by the API, not by a schema a client also runs. A
 * client-side validator that claimed to know the policy would either leak it
 * or disagree with it.
 */
import { z } from 'zod';

/** Length cap is the RFC 5321 practical maximum for an address. */
const emailSchema = z.email().max(320);

/** SAD §5.1 sets the policy; the contract states length bounds only. */
const passwordSchema = z.string().min(12).max(256);

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type LoginRequestInput = z.infer<typeof loginRequestSchema>;

export const passwordForgotRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordForgotRequestInput = z.infer<typeof passwordForgotRequestSchema>;

export const passwordResetRequestSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const invitationAcceptRequestSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
  display_name: z.string().max(120).optional(),
});
export type InvitationAcceptRequestInput = z.infer<typeof invitationAcceptRequestSchema>;

/** TOTP codes are exactly six digits. */
export const mfaVerifyRequestSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/),
});
export type MfaVerifyRequestInput = z.infer<typeof mfaVerifyRequestSchema>;
