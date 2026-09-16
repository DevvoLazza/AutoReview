import { describe, expect, it } from "vitest";
import { extractDocument } from "../src/documents.controller.js";

function pdf(text: string) {
  const stream = `BT /F1 12 Tf 40 200 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let result = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(result);
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const start = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result).toString("base64");
}

// Minimal, uncompressed OOXML archive generated in memory: no files or personal data.
function docx(text: string) {
  const files = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  };
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [filename, value] of Object.entries(files)) {
    const name = Buffer.from(filename);
    const data = Buffer.from(value);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const checksum = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(header, name, data);
    central.push(directory, name);
    offset += header.length + name.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(3, 8);
  end.writeUInt16LE(3, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]).toString("base64");
}

describe("Isolated document extraction", () => {
  it("extracts textual PDF with the real parser", async () => {
    expect(await extractDocument("services.pdf", pdf("Approved business information"))).toContain(
      "Approved business information",
    );
  });
  it("extracts valid DOCX with the real parser", async () => {
    expect(await extractDocument("services.docx", docx("Opening hours are verified"))).toContain(
      "Opening hours are verified",
    );
  });
  it("reads UTF-8 Markdown and removes null characters", async () => {
    expect(
      await extractDocument(
        "faq.md",
        Buffer.from("# Orari\nInformazioni verificate\u0000").toString("base64"),
      ),
    ).toBe("# Orari\nInformazioni verificate");
  });
  it("rejects mismatched file signatures", async () => {
    await expect(
      extractDocument("fake.pdf", Buffer.from("not a PDF").toString("base64")),
    ).rejects.toMatchObject({ code: "invalid_document" });
  });
  it("rejects unsupported file types", async () => {
    await expect(extractDocument("script.html", "eA==")).rejects.toMatchObject({
      code: "unsupported_document",
    });
  });
});
