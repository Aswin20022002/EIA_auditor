import type { TorClause, TorClauseStatus } from "@/lib/types";

const STATUS_META: Record<TorClauseStatus, { label: string; text: string; bg: string }> = {
  addressed: { label: "Addressed", text: "text-teal", bg: "bg-teal/10" },
  partial: { label: "Partial", text: "text-ochre", bg: "bg-ochre/15" },
  not_addressed: { label: "Not addressed", text: "text-brick", bg: "bg-brick/10" },
};

export default function TorMatrixPanel({ clauses }: { clauses: TorClause[] }) {
  return (
    <div className="bg-panel border border-hairline rounded-lg">
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-display text-lg font-semibold text-ink">ToR traceability matrix</h3>
        <span className="text-sm text-muted font-medium">{clauses.length} clauses checked</span>
      </div>

      {clauses.length === 0 ? (
        <div className="px-5 py-8 text-center text-base text-muted">No ToR clauses could be identified in the uploaded document.</div>
      ) : (
        <ul>
          {clauses.map((c, i) => {
            const meta = STATUS_META[c.status];
            return (
              <li key={i} className={`px-5 py-4 ${i !== clauses.length - 1 ? "border-b border-hairline" : ""}`}>
                <div className="flex items-start gap-4">
                  <div className="text-sm text-muted font-semibold pt-0.5 w-9 shrink-0">#{c.number || i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold ${meta.text} ${meta.bg}`}>
                        {meta.label}
                      </span>
                      {c.matchedSection && (
                        <span className="text-sm font-medium text-muted bg-white border border-hairline rounded px-2 py-0.5">
                          {c.matchedSection}
                          {c.page ? `, page ${c.page}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-base text-ink">{c.requirement}</p>
                    {c.evidence && (
                      <blockquote className="text-base italic text-muted border-l-2 border-hairline pl-3 mt-2">
                        &ldquo;{c.evidence}&rdquo;
                      </blockquote>
                    )}
                    {c.note && <p className="text-base text-muted mt-2">{c.note}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
