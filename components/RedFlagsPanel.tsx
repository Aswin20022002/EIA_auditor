import type { RedFlag } from "@/lib/types";

export default function RedFlagsPanel({ redFlags }: { redFlags: RedFlag[] }) {
  return (
    <div className="bg-panel border border-hairline rounded-lg">
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-display text-lg font-semibold text-ink">Vague and unsupported claims</h3>
        <span className="text-sm text-muted font-medium">{redFlags.length} flagged</span>
      </div>

      {redFlags.length === 0 ? (
        <div className="px-5 py-8 text-center text-base text-muted">
          No vague or unsubstantiated impact statements were flagged in the captured excerpts.
        </div>
      ) : (
        <ul>
          {redFlags.map((flag, i) => (
            <li key={i} className={`px-5 py-4 ${i !== redFlags.length - 1 ? "border-b border-hairline" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="text-sm font-semibold text-brick pt-1 shrink-0 w-6">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <blockquote className="text-base italic text-ink border-l-2 border-brick/50 pl-3">
                    &ldquo;{flag.excerpt}&rdquo;
                  </blockquote>
                  <p className="text-base text-muted mt-2">{flag.reason}</p>
                  {flag.section && (
                    <span className="inline-block mt-2 text-sm font-medium text-muted bg-white border border-hairline rounded px-2 py-0.5">
                      {flag.section}
                      {flag.page ? `, page ${flag.page}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
