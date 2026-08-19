import type { DetectedSection } from "./types";

/**
 * Generic structure of an EIA document as prescribed under India's
 * EIA Notification 2006 (MoEFCC EIA Manual, Appendix III / generic ToR
 * structure). Each entry carries a set of heading patterns (how the
 * chapter is usually titled in real reports) and fallback keywords used
 * if no dedicated heading can be located by the text scan.
 *
 * `priority: true` sections get a larger excerpt budget when we build
 * the LLM prompt, because they're where vague/unsubstantiated claims
 * (the "red flags") are most likely to hide.
 */
export interface SectionDef {
  id: string;
  label: string;
  clause: string;
  headingPatterns: RegExp[];
  keywords: string[];
  priority?: boolean;
  // When true, detectSections picks the EARLIEST heading hit for this id
  // rather than the hit that produces the largest block. Chapters whose
  // generic name ("Introduction", "Description of Environment", etc.) gets
  // reused verbatim as a sub-heading inside other chapters (e.g. every
  // chapter's own "10.1 Introduction") are exactly the ones where the
  // largest-block heuristic tends to lock onto a later, longer subsection
  // instead of the real, earlier chapter opening. See lib/sections.ts gap
  // analysis notes for the case this was found against.
  preferEarliest?: boolean;
}

// Real reports number chapters inconsistently: arabic, roman numerals, or
// not at all ("CHAPTER-III", "3.0", "III.", or just the bare title in caps).
// This builds a heading regex that accepts any of those prefixes (or none)
// ahead of the actual phrase, rather than pinning to a specific chapter
// number, since numbering position also varies between consultants.
function headingRegex(phrase: string): RegExp {
  return new RegExp(
    `^\\s*(?:chapter\\s*[-–—:]?\\s*)?(?:\\d{1,2}(?:\\.\\d{1,2})?|[ivxIVX]{1,6})?\\s*[.\\-–—:)]*\\s*(?:${phrase})`,
    "i"
  );
}

// Same as headingRegex, but the numeric prefix is restricted to a bare
// top-level chapter number ("1", "10", "IV") with no ".N" subsection part.
// Use this for chapter ids whose generic name is routinely reused as a
// sub-heading inside OTHER chapters ("10.1 Introduction" inside the EMP
// chapter, "2.1 Description of the Project" repeated inside itself, etc.):
// a bare-number-only prefix can't match "10.1", so it stops that specific
// collision at the pattern level rather than relying on block-length
// comparison to sort it out after the fact.
function topLevelHeadingRegex(phrase: string): RegExp {
  return new RegExp(
    `^\\s*(?:chapter\\s*[-–—:]?\\s*)?(?:\\d{1,2}|[ivxIVX]{1,6})?\\s*[.\\-–—:)]*\\s*(?:${phrase})`,
    "i"
  );
}

export const SECTION_DEFS: SectionDef[] = [
  {
    id: "intro",
    label: "Introduction & Project Background",
    clause: "Ch. 1",
    headingPatterns: [
      // Top-level-only: "10.1 Introduction" inside a later chapter (a
      // near-universal sub-heading in Indian EIA reports) must not match
      // here, or it wins the largest-block comparison against the real,
      // much shorter Chapter 1 opening.
      topLevelHeadingRegex("introduction"),
      headingRegex("purpose of (?:the )?(?:eia|report|study)"),
      headingRegex("identification of (?:the )?project"),
    ],
    keywords: ["purpose of the eia", "background of the project", "identification of project", "project proponent"],
    preferEarliest: true,
  },
  {
    id: "project_desc",
    label: "Project Description",
    clause: "Ch. 2",
    headingPatterns: [headingRegex("project description"), headingRegex("description of (?:the )?project")],
    keywords: ["project cost", "land requirement", "raw material", "manufacturing process", "installed capacity", "plant capacity"],
    preferEarliest: true,
  },
  {
    id: "baseline",
    label: "Baseline Environmental Setting",
    clause: "Ch. 3",
    headingPatterns: [
      headingRegex("description of (?:the )?environment"),
      headingRegex("baseline environmental (?:status|setting|study|data)"),
      headingRegex("baseline environment\\b"),
      headingRegex("existing environmental scenario"),
      headingRegex("baseline data generation"),
    ],
    keywords: ["ambient air quality", "ground water quality", "noise level monitoring", "soil characteristics", "flora and fauna", "study area"],
    priority: true,
    preferEarliest: true,
  },
  {
    id: "impacts",
    label: "Anticipated Impacts & Mitigation Measures",
    clause: "Ch. 4",
    headingPatterns: [
      headingRegex("anticipated environmental impacts?"),
      headingRegex("environmental impact(?:s)? and mitigation"),
      headingRegex("impact assessment and mitigation"),
      headingRegex("assessment of (?:anticipated )?impacts?"),
    ],
    keywords: ["mitigation measure", "impact on air quality", "impact on water", "adverse impact", "no significant impact", "insignificant impact"],
    priority: true,
  },
  {
    id: "alternatives",
    label: "Analysis of Alternatives",
    clause: "Ch. 5",
    headingPatterns: [headingRegex("analysis of alternatives"), headingRegex("alternate sites? (?:considered|studied)")],
    keywords: ["alternative site", "alternative technology", "no project alternative", "site selection criteria"],
  },
  {
    id: "monitoring",
    label: "Environmental Monitoring Programme",
    clause: "Ch. 6",
    headingPatterns: [headingRegex("environmental monitoring (?:programm?e?|plan)"), headingRegex("post[- ]project monitoring")],
    keywords: ["monitoring frequency", "monitoring stations", "parameters to be monitored", "monitoring schedule"],
  },
  {
    id: "additional_studies",
    label: "Risk Assessment & Public Consultation",
    clause: "Ch. 7",
    headingPatterns: [
      headingRegex("additional studies"),
      headingRegex("risk assessment(?:\\s*(?:and|&)\\s*disaster management)?"),
      headingRegex("disaster management plan"),
      headingRegex("public (?:hearing|consultation)"),
      headingRegex("rehabilitation and resettlement"),
    ],
    keywords: ["disaster management plan", "public hearing", "hazard identification", "resettlement and rehabilitation", "occupational health"],
    priority: true,
  },
  {
    id: "benefits",
    label: "Project Benefits",
    clause: "Ch. 8",
    headingPatterns: [headingRegex("project benefits?")],
    keywords: ["employment generation", "socio-economic benefit", "infrastructure development", "corporate social responsibility"],
  },
  {
    // Previously missing from SECTION_DEFS entirely: the generic EIA
    // Notification 2006 structure has 12 chapters, this file only tracked
    // 11, and this was the untracked one. It wasn't reported missing or
    // thin, it simply never appeared anywhere in the dashboard output.
    id: "cost_benefit",
    label: "Environmental Cost Benefit Analysis",
    clause: "Ch. 9",
    headingPatterns: [
      headingRegex("environmental (?:cost[- ]benefit|cost benefit) analysis"),
      headingRegex("cost benefit analysis"),
    ],
    keywords: ["cost benefit analysis", "environmental cost", "economic valuation of environmental", "shadow price"],
  },
  {
    id: "emp",
    label: "Environmental Management Plan (EMP)",
    clause: "Ch. 10",
    headingPatterns: [headingRegex("environmental management plan"), headingRegex("emp\\b.{0,25}(?:budget|cost|implementation|cell)")],
    keywords: ["emp budget", "environmental management cell", "implementation schedule", "capital cost"],
    priority: true,
  },
  {
    id: "summary",
    label: "Summary & Conclusion",
    clause: "Ch. 11",
    headingPatterns: [
      headingRegex("summary (?:and|&) conclusion"),
      headingRegex("summary of (?:the )?(?:eia|findings|project)"),
      headingRegex("conclusions? (?:and|&) recommendations?"),
    ],
    keywords: ["in conclusion", "overall the project", "summary of findings"],
  },
  {
    id: "disclosure",
    label: "Disclosure of Consultants",
    clause: "Ch. 12",
    headingPatterns: [
      headingRegex("disclosure of consultants?"),
      headingRegex("accredited consultant"),
      headingRegex("nabet[- ]?accredited"),
      headingRegex("details of (?:the )?(?:accredited )?(?:eia )?consultants?"),
    ],
    keywords: ["qci nabet", "nabet accredited", "consultant organisation", "eia coordinator"],
  },
];

const MIN_CHARS_PRESENT = 900;
const MIN_CHARS_THIN = 150;
const EXCERPT_CHARS = 6000;
// When a detected heading is the last hit in the document (no later heading
// to bound it), the block runs until this many characters past the hit
// instead. Needs to comfortably exceed EXCERPT_CHARS or the last chapter in
// a report gets shortchanged relative to every other chapter.
const LAST_SECTION_FALLBACK_CHARS = 20_000;

/**
 * True for a Table of Contents entry rather than an actual chapter heading,
 * e.g. "7 ADDITIONAL STUDIES .................... 516" or the same with a
 * tab or run of spaces instead of dot leaders (extraction quirks vary by
 * PDF exporter). Bug this exists to fix: a heading regex matches the ToC
 * line just as happily as the real heading later in the document, and
 * since detection takes the *first* match, it was locking onto the ToC
 * entry, an isolated line with a page number, instead of the real chapter,
 * making that chapter look empty no matter how much content it actually
 * has. Filtering ToC lines out of heading detection for the same reason: a
 * *first* remaining match is then the real heading.
 *
 * Deliberately conservative: real chapter headings essentially never end in
 * a bare 1-4 digit number preceded by 2+ separator characters, so this
 * shouldn't false-positive on genuine headings that happen to contain a
 * number (a year, a clause number) as long as other text follows it.
 */
function isTableOfContentsLine(line: string): boolean {
  const trimmed = line.trim();
  const m = trimmed.match(/^(.{2,80}?)([ \t.\u2024\u2026]{1,})(\d{1,4})$/);
  if (!m) return false;
  const leader = m[2];
  const dotCount = (leader.match(/[.\u2024\u2026]/g) || []).length;
  const tabCount = (leader.match(/\t/g) || []).length;
  const spaceCount = leader.length - dotCount - tabCount;
  return dotCount >= 2 || tabCount >= 1 || spaceCount >= 3;
}

/**
 * True for a "Structure of the Report" preview-list line, e.g.:
 *   "Chapter 10- Environmental Management Plan: This is the key Chapter..."
 *   "Chapter 12 – Disclosure of Consultants engaged: Names of consultants..."
 * A one-paragraph section near the start of nearly every Indian
 * consultant-authored EIA report previews every later chapter title in one
 * clause each, introduced by a colon. Unlike a dotted ToC line (already
 * filtered above), this doesn't end in a bare page number, it's a full
 * sentence, so it needs its own filter. Without it, a chapter's own heading
 * pattern matches this preview clause just as well as the real heading
 * hundreds of pages later, and since the preview sentence sits inside a
 * long descriptive paragraph, it can end up producing a longer captured
 * block than the real, terser chapter heading, winning the block-length
 * comparison in detectSections() outright.
 *
 * Deliberately requires BOTH the "Chapter N -" prefix AND a colon-introduced
 * gloss after the title, since a real standalone chapter heading is a short
 * line ending at (or near) the title, not a title immediately followed by
 * ": <explanatory sentence>" on the same line.
 */
function isChapterPreviewLine(lines: string[], i: number): boolean {
  const line = lines[i].trim();
  if (!/^chapter\s*\d{1,2}\s*[-–—]\s*\S/i.test(line)) return false;
  // The colon-introduced gloss that marks this as a preview-list entry
  // rather than a real heading may itself wrap onto the next line or two
  // depending on how the PDF extractor broke the paragraph, so check a
  // short lookahead window rather than only the current line.
  const window = [line, lines[i + 1] || "", lines[i + 2] || ""].join(" ").trim();
  return /^chapter\s*\d{1,2}\s*[-–—]\s*[^:]{3,120}:\s*\S/i.test(window);
}

fu
