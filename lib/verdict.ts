import type { ChecklistItem, RedFlag, RegulatoryFlag, DocumentScope, TorClause, Verdict, RiskLevel } from "./types";
import { SECTION_DEFS } from "./sections";

/**
 * The one-line "so what" for the whole report, computed here in plain
 * code from fields that are themselves already grounded (the checklist
 * status, the regulatory pass/concern calls, the red-flag count), not by
 * asking the LLM to also rate its own findings. That's the same principle
 * page numbers and coverageScore already follow elsewhere in this app:
 * anything that can be computed deterministically from grounded fields
 * should be, so a reviewer can recompute it by hand and it can't drift
 * from the details sitting right next to it.
 *
 * Weights are a judgment call, not a regulatory formula, and are
 * deliberately conservative: a regulatory "concern" (the five checks
 * pulled from real EAC/SEIAA meeting minutes) counts for more than a thin
 * chapter, which counts for more than a single vague sentence, because
 * that's roughly the order a real committee reviewer would weigh them in.
 */

const SCOPE_LABELS: Record<DocumentScope, string> = {
  full_report: "full report",
  executive_summary: "executive summary",
  partial_volume: "partial volume",
  unclear: "document",
};

function thresholds(score: number): RiskLevel {
  if (score >= 7) return "high";
  if (score >= 3) return "moderate";
  return "low";
}

function truncateWords(text: string, maxWords = 22): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ") + "...";
}

export function computeVerdict(input: {
  checklist: ChecklistItem[];
  regulatoryFlags: RegulatoryFlag[];
  redFlags: RedFlag[];
  documentScope: DocumentScope;
}): Verdict {
  const { checklist, regulatoryFlags, redFlags, documentScope } = input;
  const priorityIds = new Set(SECTION_DEFS.filter((d) => d.priority).map((d) => d.id));
  const isPartial = documentScope !== "full_report";

  const concerns = regulatoryFlags.filter((f) => f.status === "concern");
  const missingPriority = checklist.filter((c) => priorityIds.has(c.id) && c.status === "missing");
  const thinPriority = checklist.filter((c) => priorityIds.has(c.id) && c.status === "thin");
  const missingOther = checklist.filter((c) => !priorityIds.has(c.id) && c.status === "missing");

  // A document that's genuinely just an executive summary or one volume of
  // several is expected to be missing chapters; that's not the same signal
  // as a full report that's actually incomplete, so halve the chapter-gap
  // weight (but not the regulatory-concern weight, which is about what the
  // report says, not how much of it exists) when scope isn't full_report.
  const scopeFactor = isPartial ? 0.5 : 1;

  const score =
    concerns.length * 3 +
    missingPriority.length * 2.5 * scopeFactor +
    thinPriority.length * 1 * scopeFactor +
    missingOther.length * 1 * scopeFactor +
    Math.min(redFlags.length, 6) * 0.4;

  const riskLevel = thresholds(score);

  const reasons: string[] = [];
  if (concerns.length > 0) {
    reasons.push(
      `${concerns.length} of the 5 regulatory pattern checks flagged a concern, the kind of thing a committee reviewer would raise directly.`
    );
  }
  if (missingPriority.length > 0) {
    reasons.push(`Missing entirely: ${missingPriority.map((c) => c.label).join(", ")}.`);
  }
  if (thinPriority.length > 0) {
    reasons.push(`Present but thin: ${thinPriority.map((c) => c.label).join(", ")}.`);
  }
  if (redFlags.length > 0) {
    reasons.push(`${redFlags.length} vague or unsupported impact claim${redFlags.length === 1 ? "" : "s"} flagged.`);
  }
  if (isPartial) {
    reasons.push(`This appears to be an ${SCOPE_LABELS[documentScope]}, so some missing chapters may be expected rather than a defect.`);
  }
  if (reasons.length === 0) {
    reasons.push("No regulatory concerns, priority-chapter gaps, or flagged claims in the captured excerpts.");
  }

  const priorityActions: string[] = [];
  for (const f of concerns) {
    if (priorityActions.length >= 4) break;
    priorityActions.push(`Resolve the regulatory concern on ${f.check.replace(/_/g, " ")}: ${truncateWords(f.finding)}`);
  }
  for (const c of missingPriority) {
    if (priorityActions.length >= 4) break;
    priorityActions.push(`Add the missing ${c.label} chapter (${c.clause}).`);
  }
  for (const c of thinPriority) {
    if (priorityActions.length >= 4) break;
    priorityActions.push(`Expand ${c.label}${c.note ? `: ${truncateWords(c.note)}` : " with substantive content, not just the heading."}`);
  }
  for (const f of redFlags) {
    if (priorityActions.length >= 4) break;
    priorityActions.push(`Replace the vague claim in ${f.section || "the report"}: ${truncateWords(f.reason)}`);
  }

  const headline =
    riskLevel === "high"
      ? "Likely to draw committee objections in its current form"
      : riskLevel === "moderate"
      ? "Broadly usable, but has gaps worth closing before submission"
      : "No major structural or regulatory gaps found";

  return { riskLevel, headline, reasons, priorityActions };
}

export function computeTorVerdict(input: { clauses: TorClause[]; coverageScore: number }): Verdict {
  const { clauses, coverageScore } = input;
  const notAddressed = clauses.filter((c) => c.status === "not_addressed");
  const partial = clauses.filter((c) => c.status === "partial");
  const addressed = clauses.filter((c) => c.status === "addressed");

  const riskLevel: RiskLevel = coverageScore >= 75 ? "low" : coverageScore >= 45 ? "moderate" : "high";

  const reasons: string[] = [];
  if (clauses.length === 0) {
    reasons.push("No ToR clauses could be identified in the uploaded document.");
  } else {
    reasons.push(
      `${addressed.length} of ${clauses.length} ToR clauses addressed, ${partial.length} partial, ${notAddressed.length} not addressed.`
    );
  }

  const priorityActions: string[] = [];
  for (const c of notAddressed) {
    if (priorityActions.length >= 4) break;
    priorityActions.push(`Address ToR clause #${c.number || "?"}: ${truncateWords(c.requirement)}`);
  }
  for (const c of partial) {
    if (priorityActions.length >= 4) break;
    priorityActions.push(`Complete ToR clause #${c.number || "?"}: ${truncateWords(c.note || c.requirement)}`);
  }

  const headline =
    riskLevel === "high"
      ? "Report does not yet trace back to most ToR requirements"
      : riskLevel === "moderate"
      ? "Partially traceable to the ToR; several points still need coverage"
      : "Report traces back to nearly every ToR requirement";

  return { riskLevel, headline, reasons, priorityActions };
}
