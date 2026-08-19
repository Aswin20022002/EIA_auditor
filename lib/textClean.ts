/**
 * Real EIA reports (scanned, or exported from Word) repeat a running
 * header/footer on every page: report title, project name, consultant
 * name, page numbers. Left in, these pollute heading-detection (a repeated
 * title can look like a heading) and waste the excerpt budget sent to the
 * LLM. Split into two passes (detect, then filter) so callers that need to
 * preserve per-page character offsets, for page citation, can filter
 * each page individually against a globally-detected noise set, rather
 * than filtering the whole joined text and losing offset alignment.
 */
export function findRepeatedLines(fullText: string, minRepeats = 6): Set<string> {
  const lines = fullText.split(/\n/);
  const counts = new Map<string, number>();

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 4 || line.length > 120) continue; // headers/footers are short
    const key = line.toLowerCase().replace(/\d+/g, "#"); // normalize page numbers
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Set([...counts.entries()].filter(([, n]) => n >= minRepeats).map(([k]) => k));
}

export function filterNoisyLines(text: string, noisyKeys: Set<string>): string {
  if (noisyKeys.size === 0) return text;
  return text
    .split(/\n/)
    .filter((raw) => {
      const line = raw.trim();
      if (line.length < 4 || line.length > 120) return true;
      const key = line.toLowerCase().replace(/\d+/g, "#");
      return !noisyKeys.has(key);
    })
    .join("\n");
}

export function stripRepeatedLines(text: string, minRepeats = 6): string {
  return filterNoisyLines(text, findRepeatedLines(text, minRepeats));
}
