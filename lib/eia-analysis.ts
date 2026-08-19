import type { DetectedSection } from "./types";
import { SECTION_DEFS, buildExcerptBundle, classifyStatus } from "./sections";
import { callLlmJson } from "./llm";

// Output budget for the combined structured response (checklist + red
// flags + regulatory checks + public summary in one call). Sized for the
// worst case: 11 checklist notes, 8 red flags, 5 regulatory findings, and
// a ~260-word summary comfortably fit well under this with room to spare.
const MAX_OUTPUT_TOKENS = 4000;

export interface LlmAnalysis {
  projectName: string;
  projectCategory: string;
  documentScope: "full_report" | "executive_summary" | "partial_volume" | "unclear";
  scopeNote: string;
  completenessScore: number;
  checklist: { id: string; status: "present" | "thin" | "missing"; note: string }[];
  redFlags: { section: string; excerpt: string; reason: string }[];
  regulatoryFlags: {
    check: "baseline_recency" | "greenbelt_norm" | "zld_consistency" | "cems_status" | "consultant_accreditation";
    status: "pass" | "concern" | "not_determinable";
    finding: string;
  }[];
  publicSummary: string;
}

// These five checks are not generic "look for problems" prompting. They are
// specific, named patterns pulled from reading actual recent EAC/SEIAA
// meeting minutes (see README benchmark notes). Real committee reviewers
// flag these same five things over and over, so the model is told the
// actual regulatory criteria rather than asked to guess at what "looks
// off". Each one must be answered "not_determinable" rather than guessed
// if the excerpts don't state it.
const REGULATORY_CHECKS = `
- "baseline_recency": MoEFCC's 2022 directive requires baseline environmental data (air/water/noise monitoring) to be no older than 3 years at submission. Look for stated monitoring dates/seasons. concern if data is dated and appears older than 3 years, or if no monitoring date is stated at all despite baseline figures being presented as current; pass if a monitoring period within 3 years is explicitly stated; not_determinable if baseline data isn't discussed in the excerpts.
- "greenbelt_norm": Projects must generally commit to greenbelt/green cover of around 33% of plot area (higher, often 40%, inside Critically Polluted Areas). Regulators only count plantation on "mother earth" (ground-level soil): potted plants, rooftop/podium greenery and grass pavers do NOT count. concern if a stated greenbelt % falls short of a plausible norm for the project type, or if the report doesn't clarify whether the claimed green area is ground-level; pass if a ground-level percentage meeting a reasonable norm is explicitly stated; not_determinable if greenbelt isn't discussed.
- "zld_consistency": "Zero Liquid Discharge" (ZLD) specifically means treated effluent is recycled/reused back into the process or utilities, not merely "no effluent leaves the premises". concern if the report claims ZLD but describes effluent being disposed of within the premises without describing it being recycled into process/utility use, or the described treatment train (ETP/RO/MEE) doesn't obviously close the loop; pass if the report explicitly describes treated water being recycled into process/scrubber/utility use; not_determinable if ZLD or effluent handling isn't discussed.
- "cems_status": Continuous Emission Monitoring Systems (CEMS) are commonly required for Category A industrial/process stacks. concern if CEMS is mentioned as "proposed" or "to be installed" rather than confirmed installed/commissioned, for a project type where continuous stack monitoring would be expected; pass if CEMS is explicitly stated as installed and connected to CPCB/SPCB servers; not_determinable if the project type doesn't clearly need CEMS or it isn't discussed.
- "consultant_accreditation": The EIA consultant's NABET accreditation category (A vs B1/B2) must match the project's own EC category. A Category A project needs Category A accredited Functional Area Experts. concern if the disclosure chapter doesn't state the consultant's accreditation category, or if a mismatch is evident; pass if the accreditation category is stated and appears to match the project category; not_determinable if the disclosure chapter isn't present in the excerpts.`;

function buildPrompt(sections: DetectedSection[], fileName: string) {
  const heuristicTable = sections
    .map((s) => `- [${s.id}] ${s.label}: heuristic_status=${classifyStatus(s)}, chars_found=${s.charCount}`)
    .join("\n");

  const excerptBundle = buildExcerptBundle(sections, SECTION_DEFS);

  const system = `You are a senior environmental impact assessment (EIA) auditor working to India's EIA Notification 2006 framework. You review draft EIA reports the way an appraisal committee reviewer would: checking structural completeness, flagging vague/unsubstantiated impact claims, and separately running a fixed set of specific regulatory checks that real EAC/SEIAA committees repeatedly flag in practice (baseline data age, greenbelt norms, ZLD claims, CEMS status, consultant accreditation). You also write plain-language summaries for members of the public who are entitled to read the report before a public hearing but are not technical experts. You are careful to say "not determinable from this excerpt" rather than guess when the text doesn't state something. You always respond with strict JSON only, no markdown fences, no commentary outside the JSON object.`;

  const user = `Source file: ${fileName}

A rule-based pre-scan already located candidate chapters in this EIA report and estimated their status. Your job is to VALIDATE or CORRECT that pre-scan using the actual excerpts below, then produce four outputs.

HEURISTIC PRE-SCAN (id: heuristic_status, characters captured):
${heuristicTable}

EXCERPTS CAPTURED FROM THE REPORT (grouped by detected chapter; may be incomplete if a chapter genuinely has thin or no content):
${excerptBundle || "(No chapter excerpts could be located. The extracted text may be too short, scanned as an image, or structured unusually.)"}

Note: publicly available EIA reports are often NOT the full report. Companies and portals frequently publish only an Executive Summary, or a single volume (e.g. "Volume I: Main Report" without the annexures volume). Missing chapters in a genuinely partial document is expected and correct, not a report quality problem. Judge documentScope from the title page, any "Executive Summary" / "Volume" labelling, and overall length/depth of the excerpts, and say so plainly rather than letting a low completenessScore imply the underlying report itself is deficient.

REGULATORY PATTERN CHECKS: run exactly these five, using these specific criteria (not general impressions):
${REGULATORY_CHECKS}

Return a single JSON object with exactly this shape:
{
  "projectName": "<best guess at the project name/title from the excerpts, or 'Not stated in extracted text'>",
  "projectCategory": "<project sector/type if inferable, e.g. 'Thermal Power Plant', else 'Not stated'>",
  "documentScope": "full_report" | "executive_summary" | "partial_volume" | "unclear",
  "scopeNote": "<one sentence explaining the documentScope call, e.g. 'Title page labels this Volume I; annexure volume not included.'>",
  "completenessScore": <integer 0-100, weighted toward chapters that materially affect environmental clearance decisions: baseline, impacts & mitigation, EMP, risk/public consultation. If documentScope is not full_report, score completeness of what IS present relative to what this document type should contain, not against the full 11-chapter structure.>,
  "checklist": [
    { "id": "<one of: ${SECTION_DEFS.map((d) => d.id).join(", ")}>", "status": "present"|"thin"|"missing", "note": "<one crisp sentence on what's actually there or missing, referencing specifics from the excerpt where possible>" }
  ],
  "redFlags": [
    { "section": "<chapter id or label>", "excerpt": "<the vague/unsubstantiated sentence or phrase, max ~25 words, taken from the excerpts above>", "reason": "<one sentence on why this is vague, unquantified, or boilerplate, and what evidence would fix it>" }
  ],
  "regulatoryFlags": [
    { "check": "baseline_recency"|"greenbelt_norm"|"zld_consistency"|"cems_status"|"consultant_accreditation", "status": "pass"|"concern"|"not_determinable", "finding": "<one sentence citing the specific figure/date/claim from the excerpts that led to this status, or stating nothing relevant was found>" }
  ],
  "publicSummary": "<a 180-260 word plain-language summary written for an affected resident with no technical background: what the project is, the top 3-4 environmental impacts in everyday terms, what mitigation is promised, and one sentence on how to take part in the public hearing process. No jargon, no acronyms without expansion.>"
}

Rules:
- checklist must contain exactly one entry per id listed above, in that order.
- regulatoryFlags must contain exactly one entry per check listed above, in that order. Always all five, even if not_determinable.
- redFlags: return 3-8 of the most significant instances. If the excerpts genuinely contain none, return an empty array. Do not invent flags.
- Every excerpt you quote in redFlags must be text that actually appears in the EXCERPTS section above, not paraphrased.
- Do not wrap the JSON in markdown code fences.
- Never use an em dash anywhere in your output text (notes, reasons, findings, publicSummary). Use a comma, period, colon, or parentheses instead.`;

  return { system, user };
}

export async function runEiaAnalysis(
  sections: DetectedSection[],
  fileName: string
): Promise<LlmAnalysis> {
  const { system, user } = buildPrompt(sections, fileName);
  const parsed = await callLlmJson(system, user, MAX_OUTPUT_TOKENS);
  return normalize(parsed);
}

const CHECK_LABELS: Record<string, string> = {
  baseline_recency: "Baseline data recency (<3 yrs)",
  greenbelt_norm: "Greenbelt / green cover norm",
  zld_consistency: "ZLD claim consistency",
  cems_status: "CEMS installation status",
  consultant_accreditation: "Consultant NABET accreditation",
};
const CHECK_ORDER = ["baseline_recency", "greenbelt_norm", "zld_consistency", "cems_status", "consultant_accreditation"];

function normalize(parsed: any): LlmAnalysis {
  const validIds = new Set(SECTION_DEFS.map((d) => d.id));
  const checklist = Array.isArray(parsed.checklist)
    ? parsed.checklist
        .filter((c: any) => validIds.has(c.id))
        .map((c: any) => ({
          id: c.id,
          status: ["present", "thin", "missing"].includes(c.status) ? c.status : "missing",
          note: typeof c.note === "string" ? c.note : "",
        }))
    : [];

  const redFlags = Array.isArray(parsed.redFlags)
    ? parsed.redFlags
        .filter((r: any) => r && typeof r.excerpt === "string" && r.excerpt.trim().length > 0)
        .slice(0, 8)
        .map((r: any) => ({
          section: typeof r.section === "string" ? r.section : "",
          excerpt: r.excerpt,
          reason: typeof r.reason === "string" ? r.reason : "",
        }))
    : [];

  const rawFlags = new Map(
    (Array.isArray(parsed.regulatoryFlags) ? parsed.regulatoryFlags : [])
      .filter((f: any) => f && CHECK_ORDER.includes(f.check))
      .map((f: any) => [f.check, f])
  );
  const regulatoryFlags = CHECK_ORDER.map((check) => {
    const f: any = rawFlags.get(check);
    return {
      check: check as any,
      status: (f && ["pass", "concern", "not_determinable"].includes(f.status) ? f.status : "not_determinable") as any,
      finding: f && typeof f.finding === "string" ? f.finding : "Not discussed in the captured excerpts.",
    };
  });

  const validScopes = ["full_report", "executive_summary", "partial_volume", "unclear"];

  return {
    projectName: typeof parsed.projectName === "string" ? parsed.projectName : "Not stated in extracted text",
    projectCategory: typeof parsed.projectCategory === "string" ? parsed.projectCategory : "Not stated",
    documentScope: validScopes.includes(parsed.documentScope) ? parsed.documentScope : "unclear",
    scopeNote: typeof parsed.scopeNote === "string" ? parsed.scopeNote : "",
    completenessScore:
      typeof parsed.completenessScore === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.completenessScore)))
        : 0,
    checklist,
    redFlags,
    regulatoryFlags,
    publicSummary: typeof parsed.publicSummary === "string" ? parsed.publicSummary : "",
  };
}

export { CHECK_LABELS };
