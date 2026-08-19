import { NextRequest, NextResponse } from "next/server";
import { detectSections, findExcerptPage } from "@/lib/sections";
import { runTorMatch, computeCoverageScore } from "@/lib/tor";
import { computeTorVerdict } from "@/lib/verdict";
import type { TorMatchResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Kept in sync with lib/extract-client.ts's own cap; see that file for why
// it's this size. This route only receives already-extracted text.
const MAX_REPORT_CHARS = 1_200_000;
const MAX_TOR_CHARS = 100_000; // defensive ceiling; lib/tor.ts's own TOR_TEXT_CAP does the real clipping

interface TorMatchBody {
  torFileName?: string;
  torText?: string;
  reportFileName?: string;
  reportText?: string;
  reportTotalPages?: number;
  reportTruncated?: boolean;
  reportPageOffsets?: number[];
}

export async function POST(req: NextRequest) {
  try {
    const body: TorMatchBody = await req.json().catch(() => ({}));
    const {
      torFileName = "tor-letter.pdf",
      torText,
      reportFileName = "eia-report.pdf",
      reportText,
      reportTotalPages = 0,
      reportTruncated = false,
      reportPageOffsets,
    } = body;

    if (!torText || torText.trim().length < 100) {
      return NextResponse.json(
        { error: "No usable text was received for the ToR document. Try re-uploading it." },
        { status: 422 }
      );
    }
    if (!reportText || reportText.trim().length < 300) {
      return NextResponse.json(
        { error: "No usable text was received for the EIA report. Try re-uploading it." },
        { status: 422 }
      );
    }

    const torForPrompt = torText.length > MAX_TOR_CHARS ? torText.slice(0, MAX_TOR_CHARS) : torText;
    const reportForScan = reportText.length > MAX_REPORT_CHARS ? reportText.slice(0, MAX_REPORT_CHARS) : reportText;

    const sections = detectSections(reportForScan, reportPageOffsets);
    const llm = await runTorMatch(torForPrompt, sections);
    const coverageScore = computeCoverageScore(llm.clauses);

    // Page numbers computed in code by locating each clause's evidence text
    // in the actual report, not trusted from the model.
    const clauses = llm.clauses.map((c) => ({
      ...c,
      page: findExcerptPage(reportForScan, c.evidence, reportPageOffsets),
    }));

    const verdict = computeTorVerdict({ clauses, coverageScore });

    const result: TorMatchResult = {
      projectName: llm.projectName,
      torClauseCount: clauses.length,
      clauses,
      coverageScore,
      verdict,
      meta: {
        torFileName,
        reportFileName,
        reportTotalPages,
        reportCharsAnalyzed: reportForScan.length,
        reportTruncated: reportTruncated || reportText.length > MAX_REPORT_CHARS,
        analyzedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(result);
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
