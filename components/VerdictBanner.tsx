import type { Verdict, RiskLevel } from "@/lib/types";

const RISK_META: Record<RiskLevel, { label: string; text: string; bg: string; border: string; dot: string }> = {
  low: { label: "Low risk", text: "text-teal", bg: "bg-teal/5", border: "border-teal/40", dot: "bg-teal" },
  moderate: { label: "Moderate risk", text: "text-ochre", bg: "bg-ochre-light/20", border: "border-ochre/50", dot: "bg-ochre" },
  high: { label: "High risk", text: "text-brick", bg: "bg-brick-light/40", border: "border-brick/50", dot: "bg-brick" },
};

/**
 * The single most useful thing on either dashboard: a plain-language verdict
 * and, if there's anything to fix, a short ordered list of what to fix
 * first. Everything here is computed in lib/verdict.ts from fields already
 * shown elsewhere on the page (checklist statuses, regulatory flags, red
 * flags, or ToR clause statuses), never asserted fresh by the LLM, so it
 * can't say something the rest of the dashboard doesn't back up.
 */
export default function VerdictBanner({ verdict, title = "Verdict" }: { verdict: Verdict; title?: string }) {
  const meta = RISK_META[verdict.riskLevel];

  return (
    <div className={`mb-5 rounded-lg border ${meta.border} ${meta.bg} px-5 py-4`}>
      <div className="flex items-start gap-3 flex-wrap">
        <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} aria-hidden="true" />
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-muted uppercase tracking-wide">{title}</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold ${meta.text} bg-white border ${meta.border}`}>
              {meta.label}
            </span>
          </div>
          <p className="font-display text-lg font-bold text-ink">{verdict.headline}</p>
          <ul className="mt-2 space-y-1">
            {verdict.reasons.map((r, i) => (
              <li key={i} className="text-base text-muted leading-snug">
                {r}
              </li>
            ))}
          </ul>

          {verdict.priorityActions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-hairline/70">
              <p className="text-sm font-semibold text-ink mb-1.5">Fix these first</p>
              <ol className="space-y-1 list-decimal list-inside">
                {verdict.priorityActions.map((a, i) => (
                  <li key={i} className="text-base text-ink leading-snug">
                    {a}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
