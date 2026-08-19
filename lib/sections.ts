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

function findHeadingHits(text: string, defs: SectionDef[]) {
  const lines = text.split(/\n/);
  const hits: { id: string; lineIndex: number; charIndex: number }[] = [];
  let charIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isTableOfContentsLine(line) && !isChapterPreviewLine(lines, i)) {
      for (const def of defs) {
        if (def.headingPatterns.some((re) => re.test(line))) {
          hits.push({ id: def.id, lineIndex: i, charIndex });
          break;
        }
      }
    }
    charIndex += line.length + 1;
  }
  return hits;
}

/**
 * Same-length copy of `text` with ToC and "Structure of the Report"
 * preview-list lines blanked out (their content replaced with spaces,
 * newlines kept), so every other character offset in the document is
 * unaffected. findHeadingHits() already skips these lines for pattern
 * matching; this does the same for the plain keyword-density FALLBACK scan
 * below, which used to run against the raw, unfiltered text. Without this,
 * a preview-list clause like "...key Chapter of the report describing
 * mitigation measures" can satisfy another chapter's fallback keyword
 * (e.g. Impacts' "mitigation measure") purely because that phrase happens
 * to appear in the one-line chapter preview, not because that chapter's
 * actual content was found anywhere.
 */
function blankNonContentLines(text: string): string {
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    if (isTableOfContentsLine(lines[i]) || isChapterPreviewLine(lines, i)) {
      lines[i] = " ".repeat(lines[i].length);
    }
  }
  return lines.join("\n");
}

/** Converts a character offset into a 1-indexed page number, given the
 * pageOffsets array produced during client-side extraction. Binary search
 * would be overkill here since reports rarely exceed a few thousand pages. */
export function charIndexToPage(pageOffsets: number[] | undefined, charIndex: number): number | undefined {
  if (!pageOffsets || pageOffsets.length === 0) return undefined;
  let page = 1;
  for (let i = 0; i < pageOffsets.length; i++) {
    if (pageOffsets[i] <= charIndex) page = i + 1;
    else break;
  }
  return page;
}

/** Locates a short excerpt (as returned by the LLM) within the original
 * text and resolves it to a page number. This is deliberately done in code
 * against the real source text, not trusted from the model's own output.
 * An LLM citing its own page number is exactly the kind of ungrounded
 * claim this whole app exists to catch in other people's documents. */
export function findExcerptPage(fullText: string, excerpt: string, pageOffsets: number[] | undefined): number | undefined {
  if (!excerpt || !pageOffsets) return undefined;
  // Try the excerpt as-is, then a shortened prefix (the model sometimes
  // trims trailing punctuation/whitespace differently than the source).
  const candidates = [excerpt, excerpt.slice(0, Math.max(20, Math.floor(excerpt.length * 0.7)))];
  for (const c of candidates) {
    const idx = fullText.toLowerCase().indexOf(c.toLowerCase().trim());
    if (idx >= 0) return charIndexToPage(pageOffsets, idx);
  }
  return undefined;
}

export function detectSections(fullText: string, pageOffsets?: number[]): DetectedSection[] {
  const hits = findHeadingHits(fullText, SECTION_DEFS);
  const results: DetectedSection[] = [];
  // Computed once, reused by the fallback keyword scan below for every
  // section id that has no dedicated heading hit.
  const cleanedForKeywords = blankNonContentLines(fullText).toLowerCase();

  const sortedHits = [...hits].sort((a, b) => a.charIndex - b.charIndex);

  for (const def of SECTION_DEFS) {
    const candidates = sortedHits.filter((h) => h.id === def.id);

    let best: { hit: (typeof candidates)[0]; block: string } | null = null;
    for (const hit of candidates) {
      // Block runs until the next heading hit of any section (by char index).
      const nextHit = sortedHits.find((h) => h.charIndex > hit.charIndex);
      const end = nextHit ? nextHit.charIndex : Math.min(fullText.length, hit.charIndex + LAST_SECTION_FALLBACK_CHARS);
      const block = fullText.slice(hit.charIndex, end).trim();
      if (def.preferEarliest) {
        // Earliest hit wins outright, regardless of block length. For
        // chapters whose generic name gets reused as a sub-heading deep
        // inside other chapters, the largest-block comparison below
        // reliably picks the wrong (later, longer) occurrence instead of
        // the real chapter opening, which is short by comparison.
        if (!best) best = { hit, block };
      } else if (!best || block.length > best.block.length) {
        best = { hit, block };
      }
    }

    if (best) {
      results.push({
        id: def.id,
        label: def.label,
        found: best.block.length >= MIN_CHARS_THIN,
        excerpt: best.block.slice(0, EXCERPT_CHARS),
        charCount: best.block.length,
        page: charIndexToPage(pageOffsets, best.hit.charIndex),
      });
      continue;
    }

    // Fallback: no dedicated heading found. Check keyword density anywhere,
    // against the cleaned copy so a ToC/preview-list line can't satisfy
    // another chapter's keyword purely by mentioning its name in passing.
    const lower = cleanedForKeywords;
    let keywordHits = 0;
    let firstIdx = -1;
    for (const kw of def.keywords) {
      const re = new RegExp(kw, "i");
      const m = lower.match(re);
      if (m && m.index !== undefined) {
        keywordHits++;
        if (firstIdx === -1) firstIdx = m.index;
      }
    }

    if (keywordHits > 0 && firstIdx >= 0) {
      const excerpt = fullText.slice(firstIdx, firstIdx + EXCERPT_CHARS).trim();
      results.push({
        id: def.id,
        label: def.label,
        found: false, // no dedicated chapter, scattered mentions only
        excerpt,
        charCount: excerpt.length,
        page: charIndexToPage(pageOffsets, firstIdx),
      });
    } else {
      results.push({ id: def.id, label: def.label, found: false, excerpt: "", charCount: 0 });
    }
  }

  return results;
}

export function classifyStatus(section: DetectedSection): "present" | "thin" | "missing" {
  if (section.charCount >= MIN_CHARS_PRESENT && section.found) return "present";
  if (section.charCount >= MIN_CHARS_THIN) return "thin";
  return "missing";
}

/** Build the excerpt bundle sent to the LLM, capped to a token-friendly budget. */
/**
 * Broad-coverage variant used for ToR matching: a ToR clause can point at
 * almost any chapter (green belt details might be in Project Description
 * or the EMP; rainwater harvesting might be either), so this favours
 * touching every detected chapter with a shorter excerpt over going deep
 * on a priority few.
 */
export function buildBroadExcerptBundle(sections: DetectedSection[]) {
  // Widened now that Gemini's free tier gives a ~1M-token context window
  // (versus the ~8k-token/minute ceiling the previous Groq free model
  // imposed). This budget was the direct cause of most "not_addressed"
  // false negatives in ToR matching: a clause genuinely covered in the
  // report scored as unaddressed simply because the chapter that covered
  // it had been cut down to ~650 characters before the model ever saw it.
  const CHAR_BUDGET = 30_000;
  const CAP_PER_SECTION = 2800;
  let used = 0;
  const parts: string[] = [];

  for (const s of sections) {
    if (!s.excerpt) continue;
    const chunk = s.excerpt.slice(0, CAP_PER_SECTION);
    if (used + chunk.length > CHAR_BUDGET) continue;
    used += chunk.length;
    parts.push(`### [${s.id}] ${s.label}\n${chunk}`);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------
// Regulatory-check evidence: found independently of the chapter-excerpt
// budget above.
//
// The five regulatory pattern checks (greenbelt %, ZLD, CEMS, baseline
// recency, consultant accreditation) were coming back "not determinable"
// even when the report stated the fact plainly and repeatedly, because the
// chapter that happened to contain it (usually Project Description, a
// ~150-250 page chapter in a real report) got truncated to a ~2,200
// character excerpt before the LLM ever saw it. That's a token-budget
// artifact, not a fact the report is actually silent on.
//
// Rather than raising every chapter's budget (expensive, and still capped
// eventually), this runs a cheap targeted keyword scan across the FULL
// document text for each of the five checks specifically, independent of
// which chapter the fact lands in or whether that chapter's excerpt cap
// was reached, and hands the LLM the located sentences + page numbers as
// dedicated evidence just for those five checks. "Can we find the fact"
// is decoupled from "did it survive the chapter-length excerpt cap."
// ---------------------------------------------------------------------

export interface RegulatoryEvidenceHit {
  page?: number;
  text: string;
}

interface RegulatoryEvidenceSpec {
  check: "baseline_recency" | "greenbelt_norm" | "zld_consistency" | "cems_status" | "consultant_accreditation";
  pattern: RegExp;
  // Optional: only keep a hit if this ALSO appears within contextRadius
  // chars of it, to keep evidence on-topic rather than pulling in every
  // loose mention of a broad word (e.g. "NABET" alone shows up on the
  // cover page and letterhead of most reports; "NABET" near "category"
  // is the actual accreditation-category claim we want).
  contextPattern?: RegExp;
  contextRadius?: number;
  windowBefore?: number;
  windowAfter?: number;
  maxHits?: number;
  // Minimum char distance between two captured hits, so 6 repeats of the
  // same sentence elsewhere in the document don't crowd out variety.
  minGap?: number;
}

const REGULATORY_EVIDENCE_SPECS: RegulatoryEvidenceSpec[] = [
  {
    check: "greenbelt_norm",
    pattern: /green\s*belt|green\s*cover/i,
    windowBefore: 80,
    windowAfter: 220,
    maxHits: 3,
    minGap: 400,
  },
  {
    check: "zld_consistency",
    pattern: /zero\s*liquid\s*discharge|\bzld\b/i,
    windowBefore: 80,
    windowAfter: 220,
    maxHits: 3,
    minGap: 400,
  },
  {
    check: "cems_status",
    pattern: /continuous\s+(?:emission|effluent|stack)\s+monitoring|\bcems\b/i,
    windowBefore: 80,
    windowAfter: 220,
    maxHits: 3,
    minGap: 400,
  },
  {
    check: "baseline_recency",
    // A month (or month range) immediately followed by a year, the way
    // monitoring periods are almost always stated ("August - October 2019").
    pattern:
      /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:[-–]|to)?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\.?\s*,?\s*20\d{2}/i,
    contextPattern: /monitor|baseline|season/i,
    contextRadius: 150,
    windowBefore: 100,
    windowAfter: 200,
    maxHits: 3,
    minGap: 400,
  },
  {
    check: "consultant_accreditation",
    pattern: /nabet/i,
    contextPattern: /categor/i,
    contextRadius: 150,
    windowBefore: 80,
    windowAfter: 220,
    maxHits: 3,
    minGap: 400,
  },
];

export function findRegulatoryEvidence(
  fullText: string,
  pageOffsets?: number[]
): Record<RegulatoryEvidenceSpec["check"], RegulatoryEvidenceHit[]> {
  const results = {} as Record<RegulatoryEvidenceSpec["check"], RegulatoryEvidenceHit[]>;
  for (const spec of REGULATORY_EVIDENCE_SPECS) {
    const hits: RegulatoryEvidenceHit[] = [];
    const flags = spec.pattern.flags.includes("g") ? spec.pattern.flags : spec.pattern.flags + "g";
    const re = new RegExp(spec.pattern.source, flags);
    let match: RegExpExecArray | null;
    let lastCaptured = -Infinity;
    // Guard against pathological zero-width matches looping forever.
    let iterations = 0;
    while ((match = re.exec(fullText)) && hits.length < (spec.maxHits ?? 3) && iterations < 5000) {
      iterations++;
      const idx = match.index;
      if (match[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (idx - lastCaptured < (spec.minGap ?? 400)) continue;
      if (spec.contextPattern) {
        const ctxStart = Math.max(0, idx - (spec.contextRadius ?? 150));
        const ctxEnd = Math.min(fullText.length, idx + match[0].length + (spec.contextRadius ?? 150));
        if (!spec.contextPattern.test(fullText.slice(ctxStart, ctxEnd))) continue;
      }
      const start = Math.max(0, idx - (spec.windowBefore ?? 80));
      const end = Math.min(fullText.length, idx + match[0].length + (spec.windowAfter ?? 200));
      const text = fullText.slice(start, end).replace(/\s+/g, " ").trim();
      hits.push({ text, page: charIndexToPage(pageOffsets, idx) });
      lastCaptured = idx;
    }
    results[spec.check] = hits;
  }
  return results;
}

const REGULATORY_CHECK_ORDER: RegulatoryEvidenceSpec["check"][] = [
  "baseline_recency",
  "greenbelt_norm",
  "zld_consistency",
  "cems_status",
  "consultant_accreditation",
];

/** Renders findRegulatoryEvidence()'s output into the block injected into
 * the LLM prompt, in a fixed check order so the model can match it
 * one-to-one against the five checks it's asked to run. */
export function formatRegulatoryEvidence(evidence: Record<RegulatoryEvidenceSpec["check"], RegulatoryEvidenceHit[]>): string {
  const parts: string[] = [];
  for (const check of REGULATORY_CHECK_ORDER) {
    const hits = evidence[check] || [];
    if (hits.length === 0) {
      parts.push(`[${check}]: no keyword match found anywhere in the full document text.`);
    } else {
      const lines = hits.map((h) => `  - page ${h.page ?? "?"}: "...${h.text}..."`).join("\n");
      parts.push(`[${check}]:\n${lines}`);
    }
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------
// Citation-confidence sanity check: flags a chapter's resolved page number
// as low-confidence if it's wildly out of order relative to its
// document-order neighbours (e.g. EMP, normally near the end, resolving to
// page 51 while Baseline, normally near the start, resolves to page 367,
// is a clear monotonicity violation). This is a cheap structural sanity
// check, not a fix for the underlying detection bug: it's meant to stop a
// wrong citation from sitting at full visual confidence in the dashboard
// while the detection-level fixes above (which should prevent most of
// these from happening in the first place) get validated against more
// documents.
// ---------------------------------------------------------------------
export function flagCitationOutliers(checklist: { id: string; page?: number }[], defs = SECTION_DEFS): Set<string> {
  const order = defs.map((d) => d.id);
  const byId = new Map(checklist.map((c) => [c.id, c]));
  const withPages = order.map((id) => byId.get(id)).filter((c): c is { id: string; page?: number } => !!c && typeof c.page === "number");

  const outliers = new Set<string>();
  for (let i = 0; i < withPages.length; i++) {
    const prev = withPages[i - 1];
    const cur = withPages[i];
    const next = withPages[i + 1];
    // Flag when a chapter's page is well behind the previous chapter's AND
    // well ahead of (or comparable to) the next chapter's own page, i.e.
    // it doesn't fit anywhere in the surrounding order. A single generous
    // margin (200 pages) avoids flagging ordinary, legitimate short
    // chapters or annexure cross-references.
    const behindPrev = prev && cur.page! < prev.page! - 200;
    const aheadOfNext = next && cur.page! > next.page! + 200;
    if (behindPrev || aheadOfNext) outliers.add(cur.id);
  }
  return outliers;
}

export function buildExcerptBundle(sections: DetectedSection[], defs = SECTION_DEFS) {
  // Widened alongside buildBroadExcerptBundle above, same reasoning: the
  // old ~11k-character budget (~3.5-4k tokens) was sized for Groq's free
  // rate limit, not for actually giving the model enough of each chapter
  // to judge it accurately. ~45k characters is still a small fraction of
  // Gemini 2.5 Flash's context window.
  const CHAR_BUDGET = 45_000;
  let used = 0;
  const parts: string[] = [];

  const ordered = [...sections].sort((a, b) => {
    const da = defs.find((d) => d.id === a.id)?.priority ? 0 : 1;
    const db = defs.find((d) => d.id === b.id)?.priority ? 0 : 1;
    return da - db;
  });

  for (const s of ordered) {
    if (!s.excerpt) continue;
    const def = defs.find((d) => d.id === s.id);
    const cap = def?.priority ? 6000 : 2200;
    const chunk = s.excerpt.slice(0, cap);
    if (used + chunk.length > CHAR_BUDGET) continue;
    used += chunk.length;
    parts.push(`### [${s.id}] ${s.label}\n${chunk}`);
  }
  return parts.join("\n\n");
}
