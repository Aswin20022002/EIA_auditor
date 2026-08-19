import { NextRequest, NextResponse } from "next/server";
import { detectSections, classifyStatus, findExcerptPage, flagCitationOutliers, SECTION_DEFS } from "@/lib/sections";
import { runEiaAnalysis } from "@/lib/eia-analysis";
import { computeVerdict } from "@/lib/verdict";
import type { AnalysisResult, ChecklistItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // requires Vercel Hobby function config to allow up to 60s

// Defensive server-side cap, independent of the client's own cap (see
// lib/extract-client.ts, which is the one that actually matters since this
// route only ever receives already-extracted text, not raw PDFs). Kept in
// sync with that cap so a direct API call can't sneak past it.
const MAX_CHARS = 1_200_000;

interface AnalyzeBody {
  fileName?: string;
  text?: string;
  totalPages?: number;
  truncated?: boolean;
  charsExtracted?: number;
  pageOffsets?: number[];
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeBody = await req.json().catch(() => ({}));
    const { fileName = "uploaded-report.pdf", text, totalPages = 0, truncated = false, charsExtracted, pageOffsets } = body;

    if (!text || typeof text !== "string" || text.trim().length < 300) {
      return NextResponse.json(
        { error: "No usable text was received for this report. Try re-uploading the PDF." },
        { status: 422 }
      );
    }

    const textForScan = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
    const detected = detectSections(textForScan, pageOffsets);
    // fullText/pageOffsets passed through so the regulatory-check evidence
    // pre-scan can search the whole document, not just the per-chapter
    // excerpt bundle (see findRegulatoryEvidence in lib/sections.ts).
    const llm = await runEiaAnalysis(detected, fileName, textForScan, pageOffsets, totalPages);

    // Merge heuristic + LLM checklist so every section always has an entry,
    // even if the model dropped one. Page numbers come from where the
    // heuristic scan actually located the heading, computed in code
    // against the real text, not trusted from the model's own output.
    const checklist: ChecklistItem[] = SECTION_DEFS.map((def) => {
      const fromLlm = llm.checklist.find((c) => c.id === def.id);
      const fallback = detected.find((d) => d.id === def.id);
      return {
        id: def.id,
        label: def.label,
        clause: def.clause,
        status: fromLlm?.status ?? (fallback ? classifyStatus(fallback) : "missing"),
        note: fromLlm?.note ?? "Not independently verified by the model.",
        page: fallback?.page,
      };
    });

    // Cheap structural sanity check, not a substitute for the detection
    // fixes above: flags a resolved page number that's wildly out of order
    // relative to its neighbouring chapters (e.g. EMP resolving to page 51
    // while Baseline resolves to page 367), so a wrong citation doesn't sit
    // at full visual confidence in the dashboard while those fixes get
    // validated against more real reports.
    const lowConfidenceIds = flagCitationOutliers(checklist);
    for (const item of checklist) {
      if (lowConfidenceIds.has(item.id)) item.citationLowConfidence = true;
    }

    const redFlags = llm.redFlags.map((f) => ({
      ...f,
      page: findExcerptPage(textForScan, f.excerpt, pageOffsets),
    }));

    const verdict = computeVerdict({
      checklist,
      regulatoryFlags: llm.regulatoryFlags,
      redFlags,
      documentScope: llm.documentScope,
    });

    const result: AnalysisResult = {
      projectName: llm.projectName,
      projectCategory: llm.projectCategory,
      documentScope: llm.documentScope,
      scopeNote: llm.scopeNote,
      completenessScore: llm.completenessScore,
      checklist,
      redFlags,
      regulatoryFlags: llm.regulatoryFlags,
      publicSummary: llm.publicSummary,
      verdict,
      meta: {
        fileName,
        totalPages,
        charsExtracted: charsExtracted ?? text.length,
        // Always textForScan.length, the text this route actually built the
        // excerpt bundle from, rather than trusting a client-reported
        // number. That guarantees the "based on the first N characters"
        // banner can never quote a bigger number than what was truly read.
        charsAnalyzed: textForScan.length,
        sectionsDetected: detected.filter((d) => d.found).length,
        truncated: truncated || text.length > MAX_CHARS,
        analyzedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(result);
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
