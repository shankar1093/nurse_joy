import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "fs/promises";

async function testPDF() {
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);

    console.log("✅ Trying to embed font...");

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica); // Switch to Helvetica

    page.drawText("Hello, world!", { x: 50, y: 750, size: 24, font });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile("test-output.pdf", pdfBytes);

    console.log("✅ PDF successfully generated: test-output.pdf");
  } catch (error) {
    console.error("❌ Error generating PDF:", error);
  }
}

testPDF();