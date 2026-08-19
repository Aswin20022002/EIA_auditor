import type { ChecklistItem } from "@/lib/types";

const STATUS_META: Record<ChecklistItem["status"], { label: string; text: string; bg: string }> = {
  present: { label: "Present", text: "text-teal", bg: "bg-teal/10" },
  thin: { label: "Thin", text: "text-ochre", bg: "bg-ochre/15" },
  missing: { label: "Missing", text: "text-brick", bg: "bg-brick/10" },
};

export default function ChecklistPanel({ checklist }: { checklist: ChecklistItem[] }) {
  return (
    <div className="bg-panel border border-hairline rounded-lg">
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-display text-lg font-semibold text-ink">Structural completeness</h3>
        <span className="text-sm text-muted font-medium">EIA Notification 2006</span>
      </div>
      <ul>
        {checklist.map((item, i) => {
          const meta = STATUS_META[item.status];
          return (
            <li
              key={item.id}
              className={`px-5 py-4 flex gap-4 ${i !== checklist.length - 1 ? "border-b border-hairline" : ""}`}
            >
              <div className="text-sm text-muted font-medium pt-0.5 w-11 shrink-0">{item.clause}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-base text-ink">{item.label}</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold ${meta.text} ${meta.bg}`}>
                    {meta.label}
                  </span>
                  {item.page && (
                    <span className="text-sm text-muted font-medium bg-white border border-hairline rounded px-2 py-0.5">
                      Page {item.page}
                    </span>
                  )}
                </div>
                {item.note && <p className="text-base text-muted mt-1.5">{item.note}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
