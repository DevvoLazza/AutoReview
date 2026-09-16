import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Production encryption key is supplied through Secret Manager, never through the database. */
export class TokenVault {
  private readonly key: Buffer;
  constructor(key?: string) {
    this.key = key ? Buffer.from(key, "base64") : randomBytes(32);
    if (this.key.length !== 32)
      throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  }
  seal(value: unknown, tenantId: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(tenantId));
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  open<T>(value: string, tenantId: string): T {
    const buffer = Buffer.from(value, "base64");
    const cipher = createDecipheriv("aes-256-gcm", this.key, buffer.subarray(0, 12));
    cipher.setAAD(Buffer.from(tenantId));
    cipher.setAuthTag(buffer.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString(),
    ) as T;
  }
}
