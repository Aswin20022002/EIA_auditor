export type SectionStatus = "present" | "thin" | "missing";

export interface ChecklistItem {
  id: string;
  label: string;
  clause: string; // reference to EIA Notification 2006 structure
  status: SectionStatus;
  note: string;
  page?: number; // where this chapter's heading was located, if found
}

export interface RedFlag {
  section: string;
  excerpt: string;
  reason: string;
  page?: number; // located by searching for the excerpt text in the source
}

export type RegulatoryCheckStatus = "pass" | "concern" | "not_determinable";

/**
 * Five specific, named checks, not generic vagueness detection, sourced
 * from reading real recent EAC/SEIAA meeting minutes (see README benchmark
 * notes). These are the things committee reviewers actually flag on repeat.
 */
export interface RegulatoryFlag {
  check: "baseline_recency" | "greenbelt_norm" | "zld_consistency" | "cems_status" | "consultant_accreditation";
  status: RegulatoryCheckStatus;
  finding: string;
  page?: number;
}

export type DocumentScope = "full_report" | "executive_summary" | "partial_volume" | "unclear";

export type RiskLevel = "low" | "moderate" | "high";

/**
 * The "so what" verdict, computed deterministically in code (lib/verdict.ts)
 * from the already-computed checklist/regulatoryFlags/redFlags, never by
 * the LLM. Same reasoning as coverageScore in TorMatchResult: a score or
 * risk rating you can recompute by hand from the fields next to it is
 * something you can trust; one the model just asserted is not.
 */
export interface Verdict {
  riskLevel: RiskLevel;
  headline: string;
  reasons: string[];
  priorityActions: string[];
}

export interface AnalysisResult {
  projectName: string;
  projectCategory: string;
  documentScope: DocumentScope;
  scopeNote: string;
  completenessScore: number; // 0-100
  checklist: ChecklistItem[];
  redFlags: RedFlag[];
  regulatoryFlags: RegulatoryFlag[];
  publicSummary: string;
  verdict: Verdict;
  meta: {
    fileName: string;
    totalPages: number;
    charsExtracted: number;
    charsAnalyzed: number;
    sectionsDetected: number;
    truncated: boolean;
    analyzedAt: string;
  };
}

export interface DetectedSection {
  id: string;
  label: string;
  found: boolean;
  excerpt: string;
  charCount: number;
  page?: number;
}

export type TorClauseStatus = "addressed" | "partial" | "not_addressed";

export interface TorClause {
  number: string; // as it appears in the ToR, e.g. "1", "4", "12a"
  requirement: string; // the clause, paraphrased short if the original ran long
  status: TorClauseStatus;
  matchedSection: string; // EIA chapter label that addresses it, or ""
  evidence: string; // short excerpt/paraphrase from the report supporting the status
  note: string; // reasoning, especially for partial/not_addressed
  page?: number; // located by searching for the evidence text in the source report
}

export interface TorMatchResult {
  projectName: string;
  torClauseCount: number;
  clauses: TorClause[];
  coverageScore: number; // 0-100, computed in code from clause statuses
  verdict: Verdict;
  meta: {
    torFileName: string;
    reportFileName: string;
    reportTotalPages: number;
    reportCharsAnalyzed: number;
    reportTruncated: boolean;
    analyzedAt: string;
  };
}
