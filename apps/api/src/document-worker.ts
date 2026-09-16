import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

async function extract(input: { base64: string; extension: string }) {
  const data = Buffer.from(input.base64, "base64");
  if (input.extension === "docx") return (await mammoth.extractRawText({ buffer: data })).value;
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const info = await parser.getInfo();
    if (info.total > 100) throw new Error("Too many pages");
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
process.once("message", (input: { base64: string; extension: string }) => {
  extract(input)
    .then((text) => process.send?.({ text }))
    .catch(() => process.send?.({ error: true }));
});
