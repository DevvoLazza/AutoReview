import { parentPort, workerData } from "node:worker_threads";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

async function extract() {
  const data = Buffer.from(workerData.base64, "base64");
  if (workerData.extension === "docx")
    return (await mammoth.extractRawText({ buffer: data })).value;
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const info = await parser.getInfo();
    if (info.total > 100) throw new Error("Too many pages");
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
extract()
  .then((text) => parentPort?.postMessage({ text }))
  .catch(() => parentPort?.postMessage({ error: true }));
