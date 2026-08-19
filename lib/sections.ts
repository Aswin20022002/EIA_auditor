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
}

// Real reports number chapters inconsistently: arabic, roman numerals, or
// not at all ("CHAPTER-III", "3.0", "III.", or just the bare title in caps).
// This builds a heading regex that accepts any of those prefixes (or none)
// ahead of the actual phrase, rather than pinning to a specific chapter
// number, since numbering position also varies between consultants.
function headingRegex(phrase: string): RegExp {
  return new RegExp(
    `^\\s*(?:chapter\\s*[-\u2013\u2014:]?\\s*)?(?:\\d{1,2}(?:\\.\\d{1,2})?|[ivxIVX]{1,6})?\\s*[.\\-\u2013\u2014:)]*\\s*(?:${phrase})`,
    "i"
  );
}

export const SECTION_DEFS: SectionDef[] = [
  {
    id: "intro",
    label: "Introduction & Project Background",
    clause: "Ch. 1",
    headingPatterns: [
      headingRegex("introduction"),
      headingRegex("purpose of (?:the )?(?:eia|report|study)"),
      headingRegex("identification of (?:the )?project"),
    ],
    keywords: ["purpose of the eia", "background of the project", "identification of project", "project proponent"],
  },
  {
    id: "project_desc",
    label: "Project Description",
    clause: "Ch. 2",
    headingPatterns: [headingRegex("project description"), headingRegex("description of (?:the )?project")],
    keywords: ["project cost", "land requirement", "raw material", "manufacturing process", "installed capacity", "plant capacity"],
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
    id: "emp",
    label: "Environmental Management Plan (EMP)",
    clause: "Ch. 9",
    headingPatterns: [headingRegex("environmental management plan"), headingRegex("emp\\b.{0,25}(?:budget|cost|implementation|cell)")],
    keywords: ["emp budget", "environmental management cell", "implementation schedule", "capital cost"],
    priority: true,
  },
  {
    id: "summary",
    label: "Summary & Conclusion",
    clause: "Ch. 10",
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
    clause: "Ch. 11",
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
 * has. Filtering ToC lines out of the candidate hits, rather than trying to
 * special-case the block-building step, fixes this at the source: the
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

function findHeadingHits(text: string, defs: SectionDef[]) {
  const lines = text.split(/\n/);
  const hits: { id: string; lineIndex: number; charIndex: number }[] = [];
  let charIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isTableOfContentsLine(line)) {
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

  const sortedHits = [...hits].sort((a, b) => a.charIndex - b.charIndex);

  for (const def of SECTION_DEFS) {
    const candidates = sortedHits.filter((h) => h.id === def.id);

    let best: { hit: (typeof candidates)[0]; block: string } | null = null;
    for (const hit of candidates) {
      // Block runs until the next heading hit of any section (by char index).
      const nextHit = sortedHits.find((h) => h.charIndex > hit.charIndex);
      const end = nextHit ? nextHit.charIndex : Math.min(fullText.length, hit.charIndex + LAST_SECTION_FALLBACK_CHARS);
      const block = fullText.slice(hit.charIndex, end).trim();
      if (!best || block.length > best.block.length) best = { hit, block };
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

    // Fallback: no dedicated heading found. Check keyword density anywhere.
    const lower = fullText.toLowerCase();
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
