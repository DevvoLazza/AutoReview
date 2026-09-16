import { lt } from "drizzle-orm";
import type { ReviewGuardDatabase } from "./client.js";
import { reviewCases } from "./schema.js";

export async function purgeExpiredGoogleContent(
  db: ReviewGuardDatabase,
  now = new Date(),
): Promise<number> {
  const expired = await db
    .delete(reviewCases)
    .where(lt(reviewCases.contentExpiresAt, now))
    .returning({ id: reviewCases.id });
  return expired.length;
}
