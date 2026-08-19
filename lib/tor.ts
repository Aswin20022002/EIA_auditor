import type { DetectedSection, TorClause, TorClauseStatus } from "./types";
import { buildBroadExcerptBundle } from "./sections";
import { callLlmJson } from "./llm";

const TOR_TEXT_CAP = 40_000; // covers even an unusually long 30-40 page ToR letter
const MAX_CLAUSES = 45;
// 45 clauses, each with a requirement, evidence excerpt, and note, is a lot
// of structured output. Groq's older cap here (3200) was almost certainly
// truncating the clause list on longer ToRs before it ever reached parsing;
// this is generous headroom against that.
const MAX_OUTPUT_TOKENS = 9000;

export interface TorLlmResult {
  projectName: string;
  clauses: {
    number: string;
    requirement: string;
    status: TorClauseStatus;
    matchedSection: string;
    evidence: string;
    note: string;
  }[];
}

function buildTorPrompt(torText: string, sections: DetectedSection[]) {
  const excerptBundle = buildBroadExcerptBundle(sections);
  const torClipped = torText.slice(0, TOR_TEXT_CAP);

  const system = `You are a senior member of an Expert Appraisal Committee (EAC/SEAC) reviewing whether a submitted EIA report actually addresses every point raised in its Terms of Reference (ToR). ToR letters are numbered lists of requirements: some standard or generic, some project-specific. Your job is to go down that list point by point and check the report against each one, the way a committee reviewer literally does before a clearance meeting. You always respond with strict JSON only, no markdown fences, no commentary outside the JSON object.`;

  const user = `TERMS OF REFERENCE: full text as extracted:
${torClipped}${torText.length > TOR_TEXT_CAP ? "\n[...ToR text truncated...]" : ""}

EIA REPORT EXCERPTS (grouped by detected chapter; a ToR point can be addressed in any chapter, not necessarily the one you'd expect):
${excerptBundle || "(No chapter excerpts could be located in the report.)"}

Task:
1. Read the ToR text and identify each individual numbered/lettered requirement as its own clause. Keep the ToR's own numbering (e.g. "1", "4", "12", "12(a)"). Do not merge distinct points and do not invent points that aren't there. Skip pure boilerplate (e.g. a cover-letter salutation); only include actual requirements. Cap at ${MAX_CLAUSES} clauses; if there are more, keep the ${MAX_CLAUSES} most substantive.
2. For each clause, decide against the EIA excerpts:
   - "addressed": the report clearly contains what was asked for.
   - "partial": the topic is touched on but missing specifics the clause asked for (e.g. asked for seasonal data, only one season shown).
   - "not_addressed": no evidence in the excerpts that this was covered at all.
3. Cite matchedSection (the chapter label/id from the excerpts where you found evidence, or "" if not_addressed) and a short evidence excerpt or paraphrase (max ~20 words) taken from the excerpts. Never invent an excerpt that doesn't appear there.
4. note: one crisp sentence. For partial/not_addressed, say specifically what's missing; for addressed, this can be brief or empty.

Return a single JSON object with exactly this shape:
{
  "projectName": "<best guess at project name from either document, or 'Not stated'>",
  "clauses": [
    { "number": "<ToR's own numbering>", "requirement": "<the requirement, paraphrased to one sentence if the original ran long>", "status": "addressed"|"partial"|"not_addressed", "matchedSection": "<chapter label or ''>", "evidence": "<short excerpt/paraphrase or ''>", "note": "<one sentence>" }
  ]
}

Do not wrap the JSON in markdown code fences.
Never use an em dash anywhere in your output text. Use a comma, period, colon, or parentheses instead.`;

  return { system, user };
}

function normalize(parsed: any): TorLlmResult {
  const validStatuses: TorClauseStatus[] = ["addressed", "partial", "not_addressed"];
  const clauses: TorClause[] = Array.isArray(parsed?.clauses)
    ? parsed.clauses
        .filter((c: any) => c && typeof c.requirement === "string" && c.requirement.trim().length > 0)
        .slice(0, MAX_CLAUSES)
        .map((c: any) => ({
          number: typeof c.number === "string" ? c.number : "",
          requirement: c.requirement,
          status: validStatuses.includes(c.status) ? c.status : "not_addressed",
          matchedSection: typeof c.matchedSection === "string" ? c.matchedSection : "",
          evidence: typeof c.evidence === "string" ? c.evidence : "",
          note: typeof c.note === "string" ? c.note : "",
        }))
    : [];

  return {
    projectName: typeof parsed?.projectName === "string" ? parsed.projectName : "Not stated",
    clauses,
  };
}

export async function runTorMatch(torText: string, sections: DetectedSection[]): Promise<TorLlmResult> {
  const { system, user } = buildTorPrompt(torText, sections);
  const parsed = await callLlmJson(system, user, MAX_OUTPUT_TOKENS);
  return normalize(parsed);
}

export function computeCoverageScore(clauses: TorClause[]): number {
  if (clauses.length === 0) return 0;
  const weight: Record<TorClauseStatus, number> = { addressed: 1, partial: 0.5, not_addressed: 0 };
  const total = clauses.reduce((sum, c) => sum + weight[c.status], 0);
  return Math.round((total / clauses.length) * 100);
}
