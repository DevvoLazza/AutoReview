import { z } from "zod";
import { auditActionSchema } from "./enums.js";

export const pubSubEnvelopeSchema = z.object({
  message: z.object({
    data: z.string(),
    messageId: z.string(),
    publishTime: z.iso.datetime().optional(),
    attributes: z.record(z.string(), z.string()).optional(),
  }),
  subscription: z.string().optional(),
});

export const googleReviewNotificationSchema = z.object({
  notificationType: z.enum(["NEW_REVIEW", "UPDATED_REVIEW"]),
  reviewName: z.string().min(1),
  locationName: z.string().min(1),
  accountName: z.string().min(1).optional(),
});
export type GoogleReviewNotification = z.infer<typeof googleReviewNotificationSchema>;

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  action: auditActionSchema,
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(200),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
