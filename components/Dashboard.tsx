import type { AnalysisResult } from "@/lib/types";
import Gauge from "./Gauge";
import ChecklistPanel from "./ChecklistPanel";
import RedFlagsPanel from "./RedFlagsPanel";
import RegulatoryChecksPanel from "./RegulatoryChecksPanel";
import SummaryPanel from "./SummaryPanel";
import VerdictBanner from "./VerdictBanner";

const SCOPE_LABELS: Record<string, string> = {
  executive_summary: "Executive summary",
  partial_volume: "Partial volume",
  unclear: "Scope unclear",
};

export default function Dashboard({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  const present = result.checklist.filter((c) => c.status === "present").length;
  const thin = result.checklist.filter((c) => c.status === "thin").length;
  const missing = result.checklist.filter((c) => c.status === "missing").length;
  const concerns = result.regulatoryFlags.filter((f) => f.status === "concern").length;

  return (
    <div className="w-full print-area">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 pb-6 border-b border-hairline">
        <div>
          <div className="text-sm font-semibold text-teal mb-1.5">{result.meta.fileName}</div>
          <h2 className="font-display text-3xl font-bold text-ink">{result.projectName}</h2>
          <p className="text-muted text-base mt-1">{result.projectCategory}</p>
        </div>
        <div className="flex gap-2 no-print">
          <button
            onClick={() => window.print()}
            className="focus-ring self-start text-sm font-semibold border border-hairline rounded-md px-4 py-2 hover:border-teal hover:text-teal transition-colors"
          >
            Export summary
          </button>
          <button
            onClick={onReset}
            className="focus-ring self-start text-sm font-semibold border border-hairline rounded-md px-4 py-2 hover:border-teal hover:text-teal transition-colors"
          >
            Analyze another report
          </button>
        </div>
      </div>

      {result.documentScope !== "full_report" && (
        <div className="mb-4 text-sm text-teal bg-teal/5 border border-teal/30 rounded-lg px-4 py-3">
          <span className="font-semibold">{SCOPE_LABELS[result.documentScope] ?? "Partial document"}.</span>{" "}
          {result.scopeNote ? `${result.scopeNote} ` : ""}
          Missing chapters below may simply be outside this document, not a defect in the underlying report.
        </div>
      )}

      {result.meta.truncated && (
        <div className="mb-6 text-sm text-ochre bg-ochre-light/15 border border-ochre/40 rounded-lg px-4 py-3">
          This report is unusually long ({result.meta.charsExtracted.toLocaleString()} characters extracted across{" "}
          {result.meta.totalPages.toLocaleString()} pages). The analysis is based on the first{" "}
          {result.meta.charsAnalyzed.toLocaleString()} characters, not the full document.
        </div>
      )}

      <VerdictBanner verdict={result.verdict} />

      <div className="grid md:grid-cols-[280px_1fr] gap-5 mb-5">
        <div className="bg-panel border border-hairline rounded-lg p-5 flex flex-col items-center justify-center">
          <Gauge score={result.completenessScore} />
          <div className="grid grid-cols-3 gap-3 w-full mt-5 text-center">
            <div>
              <div className="font-display text-xl font-bold text-teal">{present}</div>
              <div className="text-sm font-medium text-muted">Present</div>
            </div>
            <div>
              <div className="font-display text-xl font-bold text-ochre">{thin}</div>
              <div className="text-sm font-medium text-muted">Thin</div>
            </div>
            <div>
              <div className="font-display text-xl font-bold text-brick">{missing}</div>
              <div className="text-sm font-medium text-muted">Missing</div>
            </div>
          </div>
          {concerns > 0 && (
            <div className="mt-4 pt-4 border-t border-hairline w-full text-center">
              <div className="font-display text-xl font-bold text-brick">{concerns}</div>
              <div className="text-sm font-medium text-muted">Regulatory concern{concerns !== 1 ? "s" : ""}</div>
            </div>
          )}
        </div>
        <ChecklistPanel checklist={result.checklist} />
      </div>

      <div className="mb-5">
        <RegulatoryChecksPanel flags={result.regulatoryFlags} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <RedFlagsPanel redFlags={result.redFlags} />
        <SummaryPanel summary={result.publicSummary} projectName={result.projectName} />
      </div>

      <p className="text-sm text-muted mt-6">
        {result.meta.totalPages} pages scanned. {result.meta.sectionsDetected} of {result.checklist.length} chapters located by heading.
        Analyzed {new Date(result.meta.analyzedAt).toLocaleString()}.
      </p>
    </div>
  );
}
