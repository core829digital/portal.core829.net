import { describe, expect, it } from "vitest";
import { fileTypeLabel, previewKind } from "./previewKind";

describe("previewKind", () => {
  it("riconosce immagini e PDF; il resto non ha anteprima", () => {
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("IMAGE/JPEG")).toBe("image");
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx")).toBe("other");
    expect(previewKind("image/svg+xml", "a.svg")).toBe("other"); // SVG puo' contenere script: mai come immagine
    expect(previewKind("text/html", "a.html")).toBe("other");
  });
  it("con tipo generico guarda l'estensione", () => {
    expect(previewKind("application/octet-stream", "foto.JPG")).toBe("image");
    expect(previewKind("", "contratto.pdf")).toBe("pdf");
    expect(previewKind("application/octet-stream", "x.exe")).toBe("other");
  });
  it("etichette", () => {
    expect(fileTypeLabel("application/x", "listino.xlsx")).toBe("XLSX");
    expect(fileTypeLabel("application/zip", "senza-estensione")).toBe("ZIP");
  });
});
