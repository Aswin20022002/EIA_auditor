import type { RegulatoryFlag, RegulatoryCheckStatus } from "@/lib/types";

const STATUS_META: Record<RegulatoryCheckStatus, { label: string; text: string; bg: string }> = {
  pass: { label: "Pass", text: "text-teal", bg: "bg-teal/10" },
  concern: { label: "Concern", text: "text-brick", bg: "bg-brick/10" },
  not_determinable: { label: "Not determinable", text: "text-muted", bg: "bg-hairline/40" },
};

const CHECK_LABELS: Record<string, string> = {
  baseline_recency: "Baseline data recency",
  greenbelt_norm: "Greenbelt and green cover norm",
  zld_consistency: "Zero Liquid Discharge claim consistency",
  cems_status: "Continuous emission monitoring status",
  consultant_accreditation: "Consultant NABET accreditation",
};

export default function RegulatoryChecksPanel({ flags }: { flags: RegulatoryFlag[] }) {
  return (
    <div className="bg-panel border border-hairline rounded-lg">
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-display text-lg font-semibold text-ink">Regulatory pattern checks</h3>
        <span className="text-sm text-muted font-medium">The five things committees flag most often</span>
      </div>
      <ul>
        {flags.map((f, i) => {
          const meta = STATUS_META[f.status];
          return (
            <li key={f.check} className={`px-5 py-4 flex gap-4 ${i !== flags.length - 1 ? "border-b border-hairline" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-base text-ink">{CHECK_LABELS[f.check] ?? f.check}</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold ${meta.text} ${meta.bg}`}>
                    {meta.label}
                  </span>
                  {f.page && (
                    <span className="text-sm text-muted font-medium bg-white border border-hairline rounded px-2 py-0.5">
                      Page {f.page}
                    </span>
                  )}
                </div>
                {f.finding && <p className="text-base text-muted mt-1.5">{f.finding}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
