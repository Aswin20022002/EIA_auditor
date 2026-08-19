"use client";

import { findRepeatedLines, filterNoisyLines } from "./textClean";

export interface ClientExtraction {
  text: string;
  totalPages: number;
  truncated: boolean;
  /** Total characters actually pulled out of the PDF, before any cap is
   * applied. Use this to tell the person how long their document is. */
  charsExtracted: number;
  /** Characters actually handed to the section-detection scan and the LLM
   * (== charsExtracted unless truncated is true, in which case this is the
   * MAX_CHARS cap). Use this, not charsExtracted, for any "analysis is
   * based on the first N characters" message: the two used to be conflated
   * and the truncation banner quoted charsExtracted (the full, uncapped
   * total) while describing what was actually analyzed (the capped
   * amount), which understated how much of a long report never got read. */
  charsAnalyzed: number;
  /** pageOffsets[i] = character index in `text` where page i+1 begins.
   * Lets every downstream excerpt (checklist item, red flag, ToR clause)
   * cite a real page number instead of just a chapter name. This is the
   * single biggest trust feature in this category; see the README benchmark
   * notes for why. */
  pageOffsets: number[];
}

// Section detection and page-citation lookups run as plain JS regex/string
// scans over this whole text, not through the LLM, so raising this cap
// doesn't touch LLM cost or rate limits, only the browser's own memory and
// scan time. ~1.2M characters covers a genuinely enormous report (call it
// 800-900 pages of dense text) before truncation ever kicks in; the actual
// LLM prompt is always built from the much smaller, curated excerpt bundle
// in lib/sections.ts, never from this raw text directly.
const MAX_CHARS = 1_200_000;
export const MAX_FILE_BYTES = 300 * 1024 * 1024;

export class ExtractionError extends Error {}

export async function extractPdfInBrowser(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ClientExtraction> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ExtractionError(
      `That file is ${(file.size / 1024 / 1024).toFixed(0)}MB, too large to parse in-browser reliably. If it's a bundled PDF with scanned annexures or drawings, try uploading just the main report volume.`
    );
  }

  onProgress?.("Loading PDF engine...");
  const { extractText, getDocumentProxy } = await import("unpdf");

  const buffer = new Uint8Array(await file.arrayBuffer());

  let pdf;
  try {
    onProgress?.("Opening document...");
    pdf = await getDocumentProxy(buffer);
  } catch {
    throw new ExtractionError("Could not open this PDF. It may be corrupted, password-protected, or not a valid PDF file.");
  }

  const totalPages = pdf.numPages;
  onProgress?.(`Extracting text from ${totalPages} pages...`);

  let pages: string[];
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    pages = Array.isArray(text) ? text : [text];
  } catch {
    throw new ExtractionError("Text extraction failed partway through this PDF. Try re-exporting it and uploading again.");
  }

  const rawPages = pages.map((p) => p.replace(/\u0000/g, ""));
  // Detect repeated headers/footers globally (need to see all pages to know
  // a line recurs), then filter page by page so offsets stay accurate.
  const noisyKeys = findRepeatedLines(rawPages.join("\n"));

  onProgress?.("Cleaning up extracted text...");
  const pageOffsets: number[] = [];
  const parts: string[] = [];
  let cursor = 0;

  for (const raw of rawPages) {
    const cleanedPage = filterNoisyLines(raw, noisyKeys).trim();
    pageOffsets.push(cursor);
    parts.push(cleanedPage);
    cursor += cleanedPage.length + 1; // +1 for the newline join below
  }

  const fullText = parts.join("\n").trim();

  if (fullText.length < 300) {
    throw new ExtractionError(
      "This PDF has almost no extractable text. It is likely a scanned document (images of pages) rather than a text-based export. Re-export it from the source, or run it through OCR first, then try again."
    );
  }

  const truncated = fullText.length > MAX_CHARS;
  const finalText = truncated ? fullText.slice(0, MAX_CHARS) : fullText;
  const finalOffsets = truncated ? pageOffsets.filter((o) => o < MAX_CHARS) : pageOffsets;

  return {
    text: finalText,
    totalPages,
    truncated,
    charsExtracted: fullText.length,
    charsAnalyzed: finalText.length,
    pageOffsets: finalOffsets,
  };
}
