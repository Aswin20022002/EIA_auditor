"use client";

import { useState } from "react";
import Link from "next/link";
import UploadZone from "@/components/UploadZone";
import Gauge from "@/components/Gauge";
import TorMatrixPanel from "@/components/TorMatrixPanel";
import VerdictBanner from "@/components/VerdictBanner";
import { extractPdfInBrowser, ExtractionError } from "@/lib/extract-client";
import type { TorMatchResult } from "@/lib/types";

type Status = "idle" | "reading" | "analyzing" | "done" | "error";

const ANALYZING_LINES = [
  "Splitting the ToR into individual clauses...",
  "Checking each clause against the report...",
  "Building the traceability matrix...",
];

export default function TorCheckPage() {
  const [torFile, setTorFile] = useState<File | null>(null);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [loadingLine, setLoadingLine] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TorMatchResult | null>(null);

  const canRun = !!torFile && !!reportFile && status === "idle";

  async function runCheck() {
    if (!torFile || !reportFile) return;
    setError(null);
    setStatus("reading");

    try {
      setProgressMsg(`Reading ${torFile.name}...`);
      const torExtraction = await extractPdfInBrowser(torFile, (m) => setProgressMsg(`ToR letter: ${m}`));

      setProgressMsg(`Reading ${reportFile.name}...`);
      const reportExtraction = await extractPdfInBrowser(reportFile, (m) => setProgressMsg(`EIA report: ${m}`));

      setStatus("analyzing");
      const interval = setInterval(() => setLoadingLine((i) => (i + 1) % ANALYZING_LINES.length), 2200);

      try {
        const res = await fetch("/api/tor-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            torFileName: torFile.name,
            torText: torExtraction.text,
            reportFileName: reportFile.name,
            reportText: reportExtraction.text,
            reportTotalPages: reportExtraction.totalPages,
            reportTruncated: reportExtraction.truncated,
            reportPageOffsets: reportExtraction.pageOffsets,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data?.error ?? "Something went wrong while matching the ToR against the report.");
          setStatus("error");
          return;
        }

        setResult(data as TorMatchResult);
        setStatus("done");
      } finally {
        clearInterval(interval);
      }
    } catch (e) {
      const message = e instanceof ExtractionError ? e.message : "Could not read one of these PDFs. Try again.";
      setError(message);
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setResult(null);
    setError(null);
    setTorFile(null);
    setReportFile(null);
  }

  const addressed = result?.clauses.filter((c) => c.status === "addressed").length ?? 0;
  const partial = result?.clauses.filter((c) => c.status === "partial").length ?? 0;
  const notAddressed = result?.clauses.filter((c) => c.status === "not_addressed").length ?? 0;

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-white no-print">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <span className="font-display font-bold text-xl text-ink">EIA Auditor</span>
          <Link
            href="/"
            className="focus-ring text-sm font-semibold text-teal border border-teal/40 rounded-md px-4 py-2 hover:bg-teal hover:text-white transition-colors"
          >
            Single-Report Audit
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
        {status !== "done" && (
          <div className="mb-10 max-w-2xl">
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-ink leading-tight">
              Did the report actually answer its own Terms of Reference?
            </h1>
            <p className="text-muted mt-5 text-lg leading-relaxed">
              Upload the ToR letter issued by the appraisal committee alongside the EIA report. Each ToR
              point gets checked individually against the report and matched to the chapter that addresses it,
              the way an EAC or SEAC reviewer works down the list before a clearance meeting.
            </p>
          </div>
        )}

        {status === "idle" && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <UploadZone
                onFile={setTorFile}
                compact
                heading="Terms of Reference"
                label="Upload the ToR letter"
                helpText="The Terms of Reference document issued by the EAC or SEAC. Usually a few pages."
                selectedFileName={torFile?.name ?? null}
              />
              <UploadZone
                onFile={setReportFile}
                compact
                heading="EIA Report"
                label="Upload the EIA report"
                helpText="The full draft or final EIA report to check against the ToR."
                selectedFileName={reportFile?.name ?? null}
              />
            </div>

            <button
              onClick={runCheck}
              disabled={!canRun}
              className="focus-ring mt-6 w-full sm:w-auto text-base font-semibold bg-teal text-white rounded-md px-6 py-3 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-teal-dark transition-colors"
            >
              Run traceability check
            </button>
          </>
        )}

        {(status === "reading" || status === "analyzing") && (
          <div className="border border-hairline bg-white rounded-lg px-8 py-16 flex flex-col items-center text-center">
            <div className="w-10 h-10 border-2 border-hairline border-t-teal rounded-full animate-spin mb-6" />
            <p className="text-muted text-base transition-opacity">
              {status === "reading" ? progressMsg : ANALYZING_LINES[loadingLine]}
            </p>
            {status === "reading" && (
              <p className="text-sm text-muted mt-3">Parsed locally in your browser. Nothing is uploaded yet.</p>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="border border-brick/40 bg-brick-light/40 rounded-lg px-6 py-8">
            <p className="text-base font-semibold text-brick mb-2">Check failed</p>
            <p className="text-base text-ink">{error}</p>
            <button
              onClick={reset}
              className="focus-ring mt-5 text-sm font-semibold border border-hairline rounded-md px-4 py-2 hover:border-teal hover:text-teal transition-colors bg-white"
            >
              Try again
            </button>
          </div>
        )}

        {status === "done" && result && (
          <div className="w-full print-area">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 pb-6 border-b border-hairline">
              <div>
                <div className="text-sm font-semibold text-teal mb-1.5">
                  {result.meta.torFileName} and {result.meta.reportFileName}
                </div>
                <h2 className="font-display text-3xl font-bold text-ink">{result.projectName}</h2>
              </div>
              <div className="flex gap-2 no-print">
                <button
                  onClick={() => window.print()}
                  className="focus-ring self-start text-sm font-semibold border border-hairline rounded-md px-4 py-2 hover:border-teal hover:text-teal transition-colors"
                >
                  Export summary
                </button>
                <button
                  onClick={reset}
                  className="focus-ring self-start text-sm font-semibold border border-hairline rounded-md px-4 py-2 hover:border-teal hover:text-teal transition-colors"
                >
                  Check another pair
                </button>
              </div>
            </div>

            {result.meta.reportTruncated && (
              <div className="mb-6 text-sm text-ochre bg-ochre-light/15 border border-ochre/40 rounded-lg px-4 py-3">
                The report is unusually long. Matching is based on the first{" "}
                {result.meta.reportCharsAnalyzed.toLocaleString()} characters of extracted text, not the full document.
              </div>
            )}

            <VerdictBanner verdict={result.verdict} />

            <div className="grid md:grid-cols-[280px_1fr] gap-5">
              <div className="bg-panel border border-hairline rounded-lg p-5 flex flex-col items-center justify-center">
                <Gauge score={result.coverageScore} label="Coverage score" />
                <div className="grid grid-cols-3 gap-3 w-full mt-5 text-center">
                  <div>
                    <div className="font-display text-xl font-bold text-teal">{addressed}</div>
                    <div className="text-sm font-medium text-muted">Addressed</div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-bold text-ochre">{partial}</div>
                    <div className="text-sm font-medium text-muted">Partial</div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-bold text-brick">{notAddressed}</div>
                    <div className="text-sm font-medium text-muted">Not addressed</div>
                  </div>
                </div>
              </div>
              <TorMatrixPanel clauses={result.clauses} />
            </div>
          </div>
        )}
      </div>

      <footer className="max-w-5xl mx-auto px-6 py-8 text-sm text-muted no-print">
        Analysis is generated by an LLM reading extracted excerpts. Verify findings against the source documents before relying on them.
      </footer>
    </main>
  );
}
