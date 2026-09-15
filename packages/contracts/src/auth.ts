import { z } from "zod";
import { roleSchema } from "./enums.js";

export const requestPrincipalSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: roleSchema,
  mfaVerified: z.boolean(),
});
export type RequestPrincipal = z.infer<typeof requestPrincipalSchema>;

export const deviceRegistrationSchema = z.object({
  token: z.string().min(10).max(4_096),
  platform: z.enum(["ios", "android"]),
  provider: z.enum(["expo", "apns", "fcm"]),
});
