import { PDFDocument, StandardFonts } from "pdf-lib";

/** PDF di prova (2 pagine) per i test nel browser dell'editor PDF. Esiste solo con E2E_FIXTURES=1. */
export async function GET() {
  if (process.env.E2E_FIXTURES !== "1") return new Response(null, { status: 404 });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`Preventivo di prova - pagina ${i}`, { x: 60, y: 760, size: 22, font });
    page.drawText("Firma del cliente: ______________________", { x: 60, y: 120, size: 12, font });
  }
  return new Response(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}
