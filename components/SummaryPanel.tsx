"use client";

import { useState } from "react";

export default function SummaryPanel({ summary, projectName }: { summary: string; projectName: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable. Silently ignore; the copy button just will not confirm.
    }
  }

  return (
    <div className="bg-ochre-light/20 border border-ochre/40 rounded-lg">
      <div className="px-5 py-4 border-b border-ochre/40 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-display text-lg font-semibold text-ink">Public hearing handout</h3>
        <button
          onClick={handleCopy}
          className="focus-ring text-sm font-semibold text-ink border border-ochre/50 rounded-md px-3 py-1.5 hover:bg-ochre/10 transition-colors bg-white"
        >
          {copied ? "Copied" : "Copy text"}
        </button>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm font-medium text-muted mb-3">Plain-language summary for {projectName}</p>
        <p className="text-base leading-relaxed whitespace-pre-line">{summary || "No summary was generated."}</p>
      </div>
    </div>
  );
}
