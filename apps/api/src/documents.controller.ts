import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Body, Controller, Post } from "@nestjs/common";
import type { RequestPrincipal } from "@reviewguard/contracts";
import { DomainError } from "@reviewguard/core";
import { z } from "zod";
import { Principal, Roles } from "./auth.js";
import { MemoryStore } from "./store.js";

export async function extractDocument(filename: string, base64: string): Promise<string> {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!extension || !["pdf", "docx", "txt", "md"].includes(extension))
    throw new DomainError(
      "Formati ammessi: PDF, DOCX, TXT e Markdown",
      "unsupported_document",
      400,
    );
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 4_000_000 || !buffer.length)
    throw new DomainError("Il documento deve essere inferiore a 4 MB", "document_size", 400);
  let text: string;
  if (extension === "txt" || extension === "md") text = buffer.toString("utf8");
  else {
    if (
      extension === "pdf"
        ? !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
        : buffer[0] !== 0x50 || buffer[1] !== 0x4b
    )
      throw new DomainError("Il contenuto non corrisponde al formato", "invalid_document", 400);
    text = await new Promise<string>((resolve, reject) => {
      const path = import.meta.url.endsWith(".ts")
        ? "./document-worker.ts"
        : "./document-worker.js";
      const worker = spawn(
        process.execPath,
        ["--max-old-space-size=128", fileURLToPath(new URL(path, import.meta.url))],
        {
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          windowsHide: true,
          env: {
            NODE_ENV: process.env.NODE_ENV,
            SystemRoot: process.env.SystemRoot,
            PATH: process.env.PATH,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
          },
        },
      );
      let settled = false;
      const timeout = setTimeout(() => {
        finish();
        reject(
          new DomainError(
            "Estrazione scaduta. Usa un documento più semplice o incolla il testo.",
            "document_timeout",
            400,
          ),
        );
      }, 15_000);
      const finish = () => {
        settled = true;
        clearTimeout(timeout);
        worker.kill();
      };
      worker.once("message", (value: { text?: string; error?: boolean }) => {
        finish();
        if (value.error || !value.text)
          reject(
            new DomainError(
              "Documento non leggibile. Sono richiesti PDF testuali e DOCX validi.",
              "document_parse_failed",
              400,
            ),
          );
        else resolve(value.text);
      });
      worker.once("error", () => {
        finish();
        reject(new DomainError("Estrazione non riuscita", "document_parse_failed", 400));
      });
      worker.once("exit", () => {
        if (!settled) {
          finish();
          reject(new DomainError("Documento troppo complesso", "document_parse_failed", 400));
        }
      });
      worker.send({ extension, base64 });
    });
  }
  text = text.replaceAll("\u0000", "").trim();
  if (!text || text.length > 250_000)
    throw new DomainError(
      "Il testo deve contenere da 1 a 250.000 caratteri. Per scansioni usa prima OCR.",
      "document_text_size",
      400,
    );
  return text;
}
@Controller("knowledge/documents")
export class DocumentsController {
  constructor(private readonly store: MemoryStore) {}
  @Post()
  @Roles("owner", "admin", "editor")
  async upload(@Principal() principal: RequestPrincipal, @Body() body: unknown) {
    const input = z
      .object({
        filename: z.string().min(3).max(200),
        base64: z.string().max(5_400_000),
        language: z.string().min(2).max(16).default("it"),
        locationId: z.string().nullable().default(null),
      })
      .parse(body);
    const content = await extractDocument(input.filename, input.base64);
    return this.store.createKnowledge(principal, {
      title: input.filename,
      content,
      language: input.language,
      locationId: input.locationId,
      kind: "document",
      validFrom: null,
      validUntil: null,
    });
  }
}
