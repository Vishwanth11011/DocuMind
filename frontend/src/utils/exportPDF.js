import { jsPDF } from "jspdf";

const VIOLET = [83, 74, 183];      // #534AB7
const GRAY_TEXT = [136, 135, 128]; // #888780
const DARK = [44, 44, 42];         // #2C2C2A
const LIGHT_BG = [241, 239, 232];  // #F1EFE8

const MARGIN = 20;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Wraps long text and returns array of lines
function splitText(doc, text, maxWidth, fontSize) {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text, maxWidth);
}

// Draws page footer "DocuMind | Page X of Y"
function drawFooter(doc, pageNum, totalPages) {
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(
    `DocuMind  |  Page ${pageNum} of ${totalPages}`,
    PAGE_WIDTH / 2,
    pageHeight - 10,
    { align: "center" }
  );
}

// Auto-adds new page if content exceeds page height; returns updated y
function checkPageBreak(doc, y, neededHeight = 20) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + neededHeight > pageHeight - 20) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

export function exportSessionPDF({ messages, sources, documents }) {
  // messages: array of {role: "user"|"assistant", content: string}
  // sources:  map of assistantMessageIndex → [{filename, chunkIndex, score, preview}]
  // documents: array of filenames used in this session

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const now = new Date().toLocaleString("en-IN", {
    dateStyle: "long", timeStyle: "short"
  });

  // ── COVER PAGE ──────────────────────────────────────────
  let y = MARGIN + 10;

  // Logo placeholder
  doc.setFillColor(...VIOLET);
  doc.roundedRect(MARGIN, y, 12, 12, 2, 2, "F");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("D", MARGIN + 4.2, y + 7.8);

  // Title
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("DocuMind", MARGIN + 16, y + 9);

  y += 20;
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY_TEXT);
  doc.text("Document Q&A Session Report", MARGIN, y);

  y += 8;
  doc.setFontSize(10);
  doc.text(`Generated on: ${now}`, MARGIN, y);

  y += 14;
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Documents in this session:", MARGIN, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_TEXT);
  documents.forEach((name) => {
    y = checkPageBreak(doc, y, 7);
    doc.text(`• ${name}`, MARGIN + 4, y);
    y += 6;
  });

  y += 6;
  doc.setDrawColor(...VIOLET);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);

  // ── Q&A PAGES ─────────────────────────────────────────
  doc.addPage();
  y = MARGIN;

  const pairs = [];

  // Group messages into [question, answer] pairs
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role === "user" && messages[i + 1].role === "assistant") {
      pairs.push({ question: messages[i].content, answer: messages[i + 1].content, answerIndex: i + 1 });
      i++;
    }
  }

  pairs.forEach(({ question, answer, answerIndex }, idx) => {
    // Question block
    y = checkPageBreak(doc, y, 24);
    doc.setFillColor(...LIGHT_BG);
    const qLines = splitText(doc, question, CONTENT_WIDTH - 12, 11);
    const qBlockHeight = qLines.length * 5.5 + 8;
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, qBlockHeight, 2, 2, "F");
    doc.setFillColor(...VIOLET);
    doc.rect(MARGIN, y, 1.5, qBlockHeight, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...VIOLET);
    doc.text(`Q${idx + 1}`, MARGIN + 4, y + 6);

    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(qLines, MARGIN + 14, y + 6);
    y += qBlockHeight + 5;

    // Answer text
    y = checkPageBreak(doc, y, 16);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const answerLines = splitText(doc, answer, CONTENT_WIDTH, 10);
    answerLines.forEach((line) => {
      y = checkPageBreak(doc, y, 6);
      doc.text(line, MARGIN, y);
      y += 5.5;
    });

    y += 4;

    // Sources
    const msgSources = sources[answerIndex];
    if (msgSources && msgSources.length > 0) {
      y = checkPageBreak(doc, y, 10);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GRAY_TEXT);
      doc.text("Sources used:", MARGIN, y);
      y += 5;

      msgSources.forEach((src) => {
        y = checkPageBreak(doc, y, 14);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK);
        doc.setFontSize(9);
        const scoreStr = src.score ? `  (cosine: ${src.score.toFixed(2)})` : "";
        doc.text(`• ${src.filename} — chunk ${src.chunkIndex}${scoreStr}`, MARGIN + 3, y);
        y += 4.5;

        if (src.preview) {
          doc.setTextColor(...GRAY_TEXT);
          doc.setFont("helvetica", "italic");
          const previewLines = splitText(doc, `"${src.preview.slice(0, 120)}..."`, CONTENT_WIDTH - 8, 9);
          previewLines.forEach((line) => {
            y = checkPageBreak(doc, y, 5);
            doc.text(line, MARGIN + 6, y);
            y += 4.5;
          });
          doc.setFont("helvetica", "normal");
        }
        y += 2;
      });
    }

    // Divider between exchanges (skip after last)
    if (idx < pairs.length - 1) {
      y += 4;
      y = checkPageBreak(doc, y, 8);
      doc.setDrawColor(...LIGHT_BG);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
      y += 8;
    }
  });

  // Add footers to all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages);
  }

  // Save
  const filename = `documind-session-${Date.now()}.pdf`;
  doc.save(filename);
}
