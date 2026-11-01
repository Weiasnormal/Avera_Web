import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { examinationRepository } from "@/services/examinations";
import type { Examination, ExaminationImage, ExaminationMarker, NormalizedRect } from "@/types/examination";

import { currentAiResult } from "./ai-basis";
import { syncSpecificFindings } from "./findings";
import { chartFrameFor, toView, viewRect } from "./markers";
import { signatureImageId } from "./model";

// Builds the examination report in the browser, following the layout of a paper
// report: comparison chart under the letterhead, findings tables on landscape
// pages, then each signature with its numbered arrows.

const PORTRAIT: [number, number] = [612, 792];
const LANDSCAPE: [number, number] = [792, 612];
const MARGIN = 54;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.25, 0.25, 0.25);
const MARKER = { css: "#d61f45", pdf: rgb(0.84, 0.12, 0.27) };

const CELL_PADDING = 4;
const BODY_SIZE = 9.5;
const CHART_CELL_PIXELS = 600;
const EXHIBIT_PIXELS = 1600;

export interface ExaminationReport {
  blob: Blob;
  /** Characters the PDF font can't print, replaced with "?". */
  unsupportedCharacters: string[];
}

async function canvasPng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser couldn't prepare the report images.");
  return new Uint8Array(await blob.arrayBuffer());
}

function regionCanvas(bitmap: ImageBitmap, region: NormalizedRect, maxSide: number) {
  const sourceWidth = region.width * bitmap.width;
  const sourceHeight = region.height * bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn't prepare the report images.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, region.x * bitmap.width, region.y * bitmap.height, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

/** The cropped signature with the same arrows the examiner placed on screen. */
function markedCanvas(image: ExaminationImage, bitmap: ImageBitmap, markers: ExaminationMarker[]) {
  const { canvas, context } = regionCanvas(bitmap, viewRect(image), EXHIBIT_PIXELS);
  const unit = Math.max(canvas.width, canvas.height) / 500;
  const radius = 9 * unit;
  context.lineWidth = 1.5 * unit;
  context.strokeStyle = MARKER.css;
  context.fillStyle = MARKER.css;

  for (const marker of markers) {
    const placement = marker.placements[image.id];
    if (!placement) continue;
    const target = toView(image, placement.target);
    const tail = toView(image, placement.tail);
    if (target.x < 0 || target.x > 1 || target.y < 0 || target.y > 1) continue;
    const [tx, ty, nx, ny] = [target.x * canvas.width, target.y * canvas.height, tail.x * canvas.width, tail.y * canvas.height];
    const angle = Math.atan2(ty - ny, tx - nx);
    const head = 8 * unit;

    context.beginPath();
    context.moveTo(nx, ny);
    context.lineTo(tx, ty);
    context.stroke();
    context.beginPath();
    context.moveTo(tx, ty);
    context.lineTo(tx - head * Math.cos(angle - 0.4), ty - head * Math.sin(angle - 0.4));
    context.lineTo(tx - head * Math.cos(angle + 0.4), ty - head * Math.sin(angle + 0.4));
    context.closePath();
    context.fill();

    context.beginPath();
    context.arc(nx, ny, radius, 0, Math.PI * 2);
    context.fillStyle = "#fff";
    context.fill();
    context.stroke();
    context.fillStyle = MARKER.css;
    context.font = `bold ${radius * 1.2}px Helvetica, Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(marker.number), nx, ny + unit * 0.5);
  }
  return canvas;
}

class ReportWriter {
  page!: PDFPage;
  y = 0;
  width = 0;
  readonly unsupported = new Set<string>();

  constructor(
    readonly pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly serifBold: PDFFont,
  ) {}

  addPage(size: [number, number]) {
    this.page = this.pdf.addPage(size);
    this.y = size[1] - MARGIN;
    this.width = size[0] - MARGIN * 2;
  }

  get bottom() {
    return MARGIN;
  }

  /** The standard fonts cover Western characters only; others are flagged to the examiner. */
  clean(font: PDFFont, text: string) {
    let result = "";
    for (const character of text.replace(/\t/g, " ")) {
      try {
        font.encodeText(character);
        result += character;
      } catch {
        if (character !== "\n" && character !== "\r") this.unsupported.add(character);
        result += character === "\n" || character === "\r" ? " " : "?";
      }
    }
    return result;
  }

  wrap(text: string, font: PDFFont, size: number, width: number) {
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = "";
      for (const rawWord of this.clean(font, paragraph).split(" ")) {
        let word = rawWord;
        // A very long unbroken word is cut to fit its column.
        while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
          let fit = word.length - 1;
          while (fit > 1 && font.widthOfTextAtSize(word.slice(0, fit), size) > width) fit -= 1;
          if (line) lines.push(line);
          line = "";
          lines.push(word.slice(0, fit));
          word = word.slice(fit);
        }
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > width && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, x: number, y: number, font: PDFFont, size: number, color = INK) {
    this.page.drawText(this.clean(font, text), { x, y, font, size, color });
  }

  centered(text: string, font: PDFFont, size: number) {
    const clean = this.clean(font, text);
    const x = MARGIN + (this.width - font.widthOfTextAtSize(clean, size)) / 2;
    this.page.drawText(clean, { x, y: this.y - size, font, size, color: INK });
    this.y -= size + 4;
  }

  paragraph(text: string, font: PDFFont, size: number, width = this.width) {
    for (const line of this.wrap(text, font, size, width)) {
      if (this.y - size < this.bottom) this.addPage([this.page.getWidth(), this.page.getHeight()]);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, font, size, color: INK });
      this.y -= size + 4;
    }
  }

  rect(x: number, top: number, width: number, height: number) {
    this.page.drawRectangle({ x, y: top - height, width, height, borderColor: LINE, borderWidth: 0.6 });
  }

  fitImage(image: PDFImage, x: number, top: number, width: number, height: number) {
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    this.page.drawImage(image, { x: x + (width - drawWidth) / 2, y: top - height + (height - drawHeight) / 2, width: drawWidth, height: drawHeight });
  }

  /** Bordered table. Rows too tall for a page continue on the next one; headings repeat. */
  table({ banner, widths, header, rows }: { banner: string[]; widths: number[]; header: string[]; rows: string[][] }) {
    const lineHeight = BODY_SIZE + 3.5;
    const pageSize: [number, number] = [this.page.getWidth(), this.page.getHeight()];
    const drawBanner = () => {
      const height = banner.length * 16 + 8;
      this.rect(MARGIN, this.y, this.width, height);
      banner.forEach((line, index) => {
        const clean = this.clean(this.bold, line);
        const size = 11;
        this.page.drawText(clean, { x: MARGIN + (this.width - this.bold.widthOfTextAtSize(clean, size)) / 2, y: this.y - 16 * (index + 1), font: this.bold, size, color: INK });
      });
      this.y -= height;
    };
    const drawCells = (cells: string[][], font: PDFFont) => {
      const height = Math.max(...cells.map((lines) => lines.length)) * lineHeight + CELL_PADDING * 2;
      let x = MARGIN;
      cells.forEach((lines, column) => {
        this.rect(x, this.y, widths[column], height);
        lines.forEach((line, index) => {
          this.page.drawText(line, { x: x + CELL_PADDING, y: this.y - CELL_PADDING - lineHeight * (index + 1) + 3, font, size: BODY_SIZE, color: INK });
        });
        x += widths[column];
      });
      this.y -= height;
    };
    const wrapRow = (cells: string[], font: PDFFont) => cells.map((cell, column) => this.wrap(cell, font, BODY_SIZE, widths[column] - CELL_PADDING * 2));
    const headerLines = wrapRow(header, this.bold);
    const headerHeight = Math.max(...headerLines.map((lines) => lines.length)) * lineHeight + CELL_PADDING * 2;
    const start = () => {
      drawBanner();
      drawCells(headerLines, this.bold);
    };

    if (this.y - (banner.length * 16 + 8) - headerHeight - lineHeight * 3 < this.bottom) this.addPage(pageSize);
    start();
    for (const row of rows) {
      let remaining = wrapRow(row, this.regular);
      while (remaining.some((lines) => lines.length)) {
        const available = Math.floor((this.y - this.bottom - CELL_PADDING * 2) / lineHeight);
        const tallest = Math.max(...remaining.map((lines) => lines.length));
        // Keep short rows whole; split only what can't fit on a full page.
        if (available < Math.min(tallest, 4)) {
          this.addPage(pageSize);
          start();
          continue;
        }
        if (tallest > available && tallest <= 12) {
          this.addPage(pageSize);
          start();
          continue;
        }
        drawCells(remaining.map((lines) => lines.slice(0, available)), this.regular);
        remaining = remaining.map((lines) => lines.slice(available));
      }
    }
  }
}

function linesOf(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function comparisonLabel(images: ExaminationImage[]) {
  const standards = images.filter((image) => image.role === "standard");
  return `Between SS 1 to SS ${standards.length} and Q1`;
}

async function pngFromBlob(pdf: PDFDocument, blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const { canvas } = regionCanvas(bitmap, { x: 0, y: 0, width: 1, height: 1 }, 800);
    return await pdf.embedPng(await canvasPng(canvas));
  } finally {
    bitmap.close();
  }
}

export async function buildExaminationReport(examination: Examination, userId: string): Promise<ExaminationReport> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Examination ${examination.caseNumber || examination.caseName || ""}`.trim());
  pdf.setProducer("Avera");
  pdf.setCreator("Avera");
  const writer = new ReportWriter(
    pdf,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
    await pdf.embedFont(StandardFonts.TimesRomanBold),
  );
  const { regular, bold, serifBold } = writer;
  const { images, markers, letterhead, signOff } = examination;

  const bitmaps = new Map<string, ImageBitmap>();
  try {
    for (const image of images) {
      const blob = await examinationRepository.getImage(userId, image.id);
      if (!blob) throw new Error(`${image.label} couldn't be read from this device.`);
      bitmaps.set(image.id, await createImageBitmap(blob));
    }

    const signatureBlob = signOff.useSignatureImage ? await examinationRepository.getImage(userId, signatureImageId(userId)) : null;
    const signature = signatureBlob ? await pngFromBlob(pdf, signatureBlob) : null;
    const logoBlob = letterhead.logoImageId ? await examinationRepository.getImage(userId, letterhead.logoImageId) : null;
    const logo = logoBlob ? await pngFromBlob(pdf, logoBlob) : null;

    const signedName = [signOff.name.trim(), signOff.credentials.trim()].filter(Boolean).join(", ");

    /** "Examined by" with the signature over the examiner's name, as on paper. */
    const drawSignOff = () => {
      const needed = 110 + linesOf(signOff.title).length * 13;
      if (writer.y - needed < writer.bottom) writer.addPage([writer.page.getWidth(), writer.page.getHeight()]);
      writer.y -= 22;
      writer.text("Examined by:", MARGIN, writer.y - 10, regular, 10.5);
      writer.y -= 18;
      if (signature) writer.fitImage(signature, MARGIN, writer.y, 170, 46);
      writer.y -= 46;
      if (!signature) writer.page.drawLine({ start: { x: MARGIN, y: writer.y + 2 }, end: { x: MARGIN + 220, y: writer.y + 2 }, thickness: 0.7, color: INK });
      if (signedName) writer.paragraph(signedName, bold, 10.5);
      for (const line of linesOf(signOff.title)) writer.paragraph(line, regular, 10);
    };

    // Comparison chart, under the letterhead.
    writer.addPage(PORTRAIT);
    if (logo) {
      const height = 48;
      const width = (logo.width / logo.height) * height;
      writer.page.drawImage(logo, { x: (PORTRAIT[0] - width) / 2, y: writer.y - height, width, height });
      writer.y -= height + 6;
    }
    linesOf(letterhead.lines.join("\n")).forEach((line, index) => writer.centered(line, serifBold, index === 0 ? 13 : 11.5));
    writer.y -= 14;

    const labelled = (label: string, value: string, x: number) => {
      writer.text(label, x, writer.y - 11, bold, 10.5);
      writer.text(value, x + bold.widthOfTextAtSize(label, 10.5) + 4, writer.y - 11, regular, 10.5);
    };
    labelled("Name of the Case:", examination.caseName.trim().slice(0, 74), MARGIN);
    writer.y -= 20;
    labelled("Case No:", examination.caseNumber.trim().slice(0, 28), MARGIN);
    labelled("Document Examiner:", signOff.name.trim().slice(0, 34), MARGIN + 220);
    writer.y -= 28;

    const placed = markers.filter((marker) => Object.keys(marker.placements).length > 0);
    const numberWidth = 24;
    const cellWidth = (writer.width - numberWidth) / images.length;
    const cellHeight = Math.min(cellWidth * 0.85, 88);
    const headerHeight = 42;
    const drawChartHeader = () => {
      writer.rect(MARGIN, writer.y, numberWidth, headerHeight);
      images.forEach((image, column) => {
        const x = MARGIN + numberWidth + column * cellWidth;
        writer.rect(x, writer.y, cellWidth, headerHeight);
        const title = image.role === "questioned" ? "Questioned Signature 1" : `Standard signature ${image.label.slice(1)}`;
        const size = images.length > 7 ? 7.5 : 9;
        writer.wrap(title, regular, size, cellWidth - 6).slice(0, 3).forEach((line, index) => {
          writer.page.drawText(line, { x: x + (cellWidth - regular.widthOfTextAtSize(line, size)) / 2, y: writer.y - 14 - index * (size + 2), font: regular, size, color: INK });
        });
      });
      writer.y -= headerHeight;
    };
    drawChartHeader();
    for (const marker of placed) {
      if (writer.y - cellHeight < writer.bottom + 60) {
        writer.addPage(PORTRAIT);
        drawChartHeader();
      }
      writer.rect(MARGIN, writer.y, numberWidth, cellHeight);
      const label = String(marker.number);
      writer.page.drawText(label, { x: MARGIN + (numberWidth - bold.widthOfTextAtSize(label, 10)) / 2, y: writer.y - cellHeight / 2 - 4, font: bold, size: 10, color: MARKER.pdf });
      for (const [column, image] of images.entries()) {
        const x = MARGIN + numberWidth + column * cellWidth;
        writer.rect(x, writer.y, cellWidth, cellHeight);
        const frame = chartFrameFor(image, marker);
        if (!frame) continue;
        const { canvas } = regionCanvas(bitmaps.get(image.id)!, frame, CHART_CELL_PIXELS);
        const png = await pdf.embedPng(await canvasPng(canvas));
        writer.fitImage(png, x + 3, writer.y - 3, cellWidth - 6, cellHeight - 6);
      }
      writer.y -= cellHeight;
    }

    // "Noted by" and "Examined by" close the chart page.
    if (writer.y - 70 < writer.bottom) writer.addPage(PORTRAIT);
    const signY = writer.y - 40;
    writer.text("Noted by:", MARGIN, signY, bold, 10.5);
    const notedX = MARGIN + 56;
    writer.page.drawLine({ start: { x: notedX, y: signY - 2 }, end: { x: notedX + 130, y: signY - 2 }, thickness: 0.7, color: INK });
    if (signOff.notedBy?.trim()) writer.text(signOff.notedBy.trim().slice(0, 30), notedX + 2, signY + 2, regular, 10);
    const examinedX = MARGIN + 262;
    writer.text("Examined by:", examinedX, signY, bold, 10.5);
    const lineX = examinedX + 70;
    // The line goes on top, so a signature's white background doesn't break it.
    if (signature) writer.fitImage(signature, lineX, signY + 26, MARGIN + writer.width - lineX, 34);
    writer.page.drawLine({ start: { x: lineX, y: signY - 2 }, end: { x: MARGIN + writer.width, y: signY - 2 }, thickness: 0.7, color: INK });

    // General findings.
    writer.addPage(LANDSCAPE);
    writer.centered("GENERAL FINDINGS ON SIGNATURE EXAMINATION AND VERIFICATION", bold, 11);
    writer.y -= 12;
    const general = examination.generalFindings;
    if (general.columns.length) {
      const firstWidth = Math.min(150, writer.width * 0.22);
      const otherWidth = (writer.width - firstWidth) / general.columns.length;
      writer.table({
        banner: ["GENERAL DESCRIPTION", comparisonLabel(images)],
        widths: [firstWidth, ...general.columns.map(() => otherWidth)],
        header: [general.rowHeader ?? "Description", ...general.columns.map((column) => column.title)],
        rows: general.rows.map((row) => [row.title, ...general.columns.map((column) => row.cells[column.id] ?? "")]),
      });
    }
    drawSignOff();

    // Specific findings, conclusion and sign-off.
    writer.addPage(LANDSCAPE);
    const specific = syncSpecificFindings(examination);
    if (specific.columns.length) {
      const firstWidth = 54;
      const otherWidth = (writer.width - firstWidth) / specific.columns.length;
      writer.table({
        banner: ["SPECIFIC DESCRIPTION", comparisonLabel(images)],
        widths: [firstWidth, ...specific.columns.map(() => otherWidth)],
        header: [specific.rowHeader ?? "Point", ...specific.columns.map((column) => column.title)],
        rows: specific.rows.map((row) => [row.title, ...specific.columns.map((column) => row.cells[column.id] ?? "")]),
      });
    }

    writer.y -= 18;
    if (writer.y - 60 < writer.bottom) writer.addPage(LANDSCAPE);
    writer.paragraph("Conclusion:", bold, 11);
    writer.paragraph(examination.conclusion.trim() || " ", regular, 10.5);

    const aiResult = examination.includeAiResult ? currentAiResult(examination) : null;
    if (aiResult) {
      writer.y -= 14;
      const column = writer.width / 4;
      writer.table({
        banner: ["AVERA AI COMPARISON (SUPPORTING INFORMATION)"],
        widths: [column, column, column, column],
        header: ["Model result", "Confidence score", "Distance", "Threshold"],
        rows: [
          [
            aiResult.verdict,
            aiResult.confidence === null ? "-" : `${aiResult.confidence.toFixed(1)}%`,
            aiResult.distance.toFixed(4),
            aiResult.threshold.toFixed(4),
          ],
        ],
      });
      writer.y -= 6;
      writer.paragraph("The score isn't a statistical probability. The model supports and doesn't replace the examiner's opinion.", regular, 9.5);
    }
    drawSignOff();

    // The signatures with their arrows: questioned alone, then standards in pairs.
    const exhibit = async (image: ExaminationImage, top: number, height: number) => {
      const questioned = image.role === "questioned";
      writer.text(questioned ? "QUESTIONED" : `S-${image.label.slice(1)}`, MARGIN, top - 12, regular, 11, MUTED);
      const png = await pdf.embedPng(await canvasPng(markedCanvas(image, bitmaps.get(image.id)!, markers)));
      const scale = Math.min(writer.width / png.width, (height - 24) / png.height);
      writer.page.drawImage(png, { x: MARGIN, y: top - 22 - png.height * scale, width: png.width * scale, height: png.height * scale });
    };
    const questioned = images.find((image) => image.role === "questioned");
    if (questioned) {
      writer.addPage(PORTRAIT);
      await exhibit(questioned, writer.y, 400);
    }
    const standards = images.filter((image) => image.role === "standard");
    for (let index = 0; index < standards.length; index += 2) {
      writer.addPage(PORTRAIT);
      const top = writer.y;
      const half = (top - writer.bottom) / 2;
      await exhibit(standards[index], top, half - 12);
      if (standards[index + 1]) await exhibit(standards[index + 1], top - half, half - 12);
    }

    // Footer, added last so it knows the page count.
    const pages = pdf.getPages();
    pages.forEach((page, index) => {
      const footer = `Prepared with Avera${examination.caseNumber.trim() ? `  |  Case ${writer.clean(regular, examination.caseNumber.trim())}` : ""}`;
      page.drawText(footer, { x: MARGIN, y: 28, font: regular, size: 8, color: MUTED });
      if (examination.isPractice) {
        const notice = "PRACTICE ONLY - NOT A REAL EXAMINATION";
        page.drawText(notice, { x: (page.getWidth() - bold.widthOfTextAtSize(notice, 11)) / 2, y: page.getHeight() - 32, font: bold, size: 11, color: MARKER.pdf });
      }
      const number = `Page ${index + 1} of ${pages.length}`;
      page.drawText(number, { x: page.getWidth() - MARGIN - regular.widthOfTextAtSize(number, 8), y: 28, font: regular, size: 8, color: MUTED });
    });
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }

  const bytes = await pdf.save();
  return {
    blob: new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
    unsupportedCharacters: [...writer.unsupported],
  };
}
