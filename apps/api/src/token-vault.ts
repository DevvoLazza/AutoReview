import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { KeyManagementServiceClient } from "@google-cloud/kms";

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

/** Cloud KMS binds ciphertext to both the configured key and the tenant's authenticated context. */
export class KmsTokenVault {
  constructor(
    private readonly keyName: string,
    private readonly client = new KeyManagementServiceClient(),
  ) {}
  async seal(value: unknown, tenantId: string): Promise<string> {
    const [result] = await this.client.encrypt({
      name: this.keyName,
      plaintext: Buffer.from(JSON.stringify(value)),
      additionalAuthenticatedData: Buffer.from(tenantId),
    });
    if (!result.ciphertext) throw new Error("KMS encryption did not return ciphertext");
    return `kms:${typeof result.ciphertext === "string" ? result.ciphertext : Buffer.from(result.ciphertext).toString("base64")}`;
  }
  async open<T>(value: string, tenantId: string): Promise<T> {
    if (!value.startsWith("kms:"))
      throw new Error("Token encryption mode differs; reconnect Google");
    const [result] = await this.client.decrypt({
      name: this.keyName,
      ciphertext: Buffer.from(value.slice(4), "base64"),
      additionalAuthenticatedData: Buffer.from(tenantId),
    });
    if (!result.plaintext) throw new Error("KMS decryption did not return plaintext");
    return JSON.parse(
      typeof result.plaintext === "string"
        ? Buffer.from(result.plaintext, "base64").toString("utf8")
        : Buffer.from(result.plaintext).toString("utf8"),
    ) as T;
  }
}
