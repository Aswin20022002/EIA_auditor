"use client";

import { useState } from "react";
import UploadZone from "@/components/UploadZone";
import Dashboard from "@/components/Dashboard";
import Link from "next/link";
import { extractPdfInBrowser, ExtractionError } from "@/lib/extract-client";
import type { AnalysisResult } from "@/lib/types";

type Status = "idle" | "reading" | "analyzing" | "done" | "error";

const ANALYZING_LINES = [
  "Locating chapters against EIA Notification 2006...",
  "Scanning for unsubstantiated impact claims...",
  "Drafting the public-hearing summary...",
];

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [loadingLine, setLoadingLine] = useState(0);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setStatus("reading");
    setProgressMsg("Reading file...");

    try {
      // Extraction happens entirely in the browser. The raw PDF, which for
      // real published EIA reports (scanned annexures, drawings) commonly
      // runs 50-300MB, never leaves the device. Only the extracted text
      // (a few hundred KB at most) is sent to the server, which sidesteps
      // Vercel's non-configurable 4.5MB request body limit.
      const extraction = await extractPdfInBrowser(file, setProgressMsg);

      setStatus("analyzing");
      const interval = setInterval(() => {
        setLoadingLine((i) => (i + 1) % ANALYZING_LINES.length);
      }, 2200);

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            text: extraction.text,
            totalPages: extraction.totalPages,
            truncated: extraction.truncated,
            charsExtracted: extraction.charsExtracted,
            pageOffsets: extraction.pageOffsets,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data?.error ?? "Something went wrong while analyzing this report.");
          setStatus("error");
          return;
        }

        setResult(data as AnalysisResult);
        setStatus("done");
      } finally {
        clearInterval(interval);
      }
    } catch (e) {
      const message = e instanceof ExtractionError ? e.message : "Could not read this PDF. Try again, or try a different export of the file.";
      setError(message);
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setResult(null);
    setError(null);
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-white no-print">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <span className="font-display font-bold text-xl text-ink">EIA Auditor</span>
          <Link
            href="/tor-check"
            className="focus-ring text-sm font-semibold text-teal border border-teal/40 rounded-md px-4 py-2 hover:bg-teal hover:text-white transition-colors"
          >
            ToR Traceability Check
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
        {status !== "done" && (
          <div className="mb-10 max-w-2xl">
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-ink leading-tight">
              Read an EIA report the way a committee, and the public, both need to.
            </h1>
            <p className="text-muted mt-5 text-lg leading-relaxed">
              Upload a draft Environmental Impact Assessment report. This checks it against the
              structure required under India&rsquo;s EIA Notification 2006, flags impact claims that
              are vague or unquantified, and drafts a plain-language summary for the public hearing.
            </p>
          </div>
        )}

        {status === "idle" && (
          <>
            <UploadZone onFile={handleFile} />
            <div className="grid sm:grid-cols-3 gap-8 mt-12 pt-10 border-t border-hairline">
              <div>
                <div className="text-base font-semibold text-teal mb-1.5">Completeness check</div>
                <p className="text-base text-muted">Every chapter checked against the mandatory structure: present, thin, or missing.</p>
              </div>
              <div>
                <div className="text-base font-semibold text-brick mb-1.5">Red-flag scan</div>
                <p className="text-base text-muted">Boilerplate lines like &ldquo;no significant impact anticipated&rdquo; get quoted and questioned.</p>
              </div>
              <div>
                <div className="text-base font-semibold text-ochre mb-1.5">Public handout</div>
                <p className="text-base text-muted">A jargon-free summary residents can actually read before the hearing.</p>
              </div>
            </div>
          </>
        )}

        {(status === "reading" || status === "analyzing") && (
          <div className="border border-hairline bg-white rounded-lg px-8 py-16 flex flex-col items-center text-center">
            <div className="w-10 h-10 border-2 border-hairline border-t-teal rounded-full animate-spin mb-6" />
            <p className="font-semibold text-base text-ink mb-1">{fileName}</p>
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
            <p className="text-base font-semibold text-brick mb-2">Analysis failed</p>
            <p className="text-base text-ink">{error}</p>
            <button
              onClick={reset}
              className="focus-ring mt-5 text-sm font-semibold border border-hairline rounded-md px-4 py-2 hover:border-teal hover:text-teal transition-colors bg-white"
            >
              Try again
            </button>
          </div>
        )}

        {status === "done" && result && <Dashboard result={result} onReset={reset} />}
      </div>

      <footer className="max-w-5xl mx-auto px-6 py-8 text-sm text-muted no-print">
        Analysis is generated by an LLM reading extracted excerpts. Verify findings against the source report before relying on them.
      </footer>
    </main>
  );
}
