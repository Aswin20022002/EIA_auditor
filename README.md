# EIA Auditor

## Market positioning (benchmark)

Three real reference points, checked directly rather than assumed:

| | **V7 Go** (v7labs.com) | **PARIVESH 2.0** (MoEFCC's own portal) | **Enviro Annotations** (enviroannotations.com) | **This app** |
|---|---|---|---|---|
| What it is | Horizontal enterprise document-AI platform; EIA is one vertical page among many | Government single-window portal for filing and tracking clearances | Manual civic-journalism site, hand-summarizing every EAC/SEIAA meeting | Purpose-built for India EIA Notification 2006 review |
| Stage of the process | Post-hoc document extraction, any industry | **Pre-report**: screening, category classification, ToR issuance | **Post-decision**: reporting on what committees already decided | **Pre-decision**: auditing the report itself before or during appraisal |
| Source-grounding | "AI Citations": every finding links to its exact location in the doc (their headline feature) | N/A | N/A (manual) | Page-cited excerpts, located in code against the real text. See below |
| ToR-vs-report traceability | No | No (issues ToR templates, doesn't check compliance after submission) | No (reports on outcomes, not the report content) | **Yes**, at `/tor-check` |
| Access | Custom enterprise pricing, sales demo required | Free, official | Free, editorial | Free, self-hosted |

**The two gaps that mattered most, and what was built for each:**

1. **V7 Go's whole pitch is that every AI finding traces to its exact source location**, explicitly framed as the mechanism that "catches errors instantly" and builds trust. This app didn't do that until this pass: page numbers are now tracked all the way from client-side extraction through to every checklist item, red flag, and ToR clause. See *Page-cited findings* below.
2. **Reading through Enviro Annotations' recent meeting summaries turned up the same handful of things EAC/SEIAA committees flag over and over**: baseline data older than 3 years, greenbelt claims that don't meet the 33%/40% norm (or that count potted plants and rooftop greenery, which regulators explicitly exclude), "ZLD" claimed for a system that doesn't match CPCB's actual definition, missing CEMS installation, NABET consultant accreditation category mismatched to project category. None of this is generic "sounds vague" detection. It's five specific, named checks against documented regulatory criteria. See *Regulatory pattern checks* below.

## Two tools, one app

**`/` (Single-report audit).** Upload one EIA report and get the completeness
score, red-flag log, regulatory pattern checks, and public-hearing summary
described below.

**`/tor-check` (ToR traceability matrix).** Upload the Terms of Reference
(ToR) letter alongside the EIA report. Every ToR requirement (numbered
point) gets checked individually against the report as addressed, partial,
or not addressed, and matched to the chapter (and page) that covers it. This
is closer to how an EAC/SEAC committee member actually reviews a
submission: working down the ToR list item by item, not just skimming the
report in isolation. Both ToR letters and EIA reports for a project are
published together on Parivesh, so the two documents are easy to source as
a pair.

---

Upload a draft Environmental Impact Assessment (EIA) report (PDF) to `/`
and get back:

1. **Structural completeness check.** Every chapter checked against the generic
   structure mandated under India's **EIA Notification 2006**, marked
   present, thin, or missing, with a 0-100 completeness score, and the page
   number where each chapter was actually located.
2. **Red-flag log.** Sentences that read as vague, unquantified, or boilerplate
   ("no significant impact is anticipated" with no supporting data) are quoted,
   explained, and page-cited. This is a well-documented, real criticism of many
   Indian EIA reports: that they're often generic or copy-pasted rather than
   site-specific.
3. **Regulatory pattern checks.** Five specific checks sourced from reading
   real recent EAC/SEIAA meeting minutes (see benchmark table above): baseline
   data recency, greenbelt/green-cover norm compliance, ZLD claim consistency,
   CEMS installation status, and consultant NABET accreditation. Each is
   `pass`, `concern`, or `not_determinable`. The model is explicitly told to
   say "not determinable" rather than guess when the report doesn't state
   something.
4. **Public-hearing handout.** A plain-language summary of the project, its
   top impacts, and mitigation measures, written for a resident with no
   technical background. EIA reports are legally required to be accessible to
   the public before the mandatory hearing, but a 200+ page technical document
   rarely is in practice.
5. **Verdict.** A plain-language risk rating (low/moderate/high) and, if
   there's anything to fix, an ordered "fix these first" list, shown at the
   top of both dashboards. This is computed in code (`lib/verdict.ts`) from
   the checklist/regulatory/red-flag fields above it, never asserted fresh
   by the LLM, so it can't say something the rest of the page doesn't back
   up. Same idea for `/tor-check`'s verdict, computed from clause statuses.

**Who this is for, as a product:** the project proponent or EIA consultant
(self-check before submission), the State/Central appraisal committee
(faster first-pass review), and the affected public (an actual accessible
summary). That three-sided value is the pitch.

## Page-cited findings

Every chapter, red flag, and ToR clause now carries the page number it was
actually found on (page badges throughout the UI). This is computed in
code, not trusted from the model:

- **Chapter locations** come directly from the heading-detection regex.
  Wherever a chapter heading was matched, that match's character offset is
  converted to a page number using a per-page offset map built during
  client-side extraction.
- **Red-flag and ToR-clause excerpts** are located by searching for the
  model's quoted text inside the actual source text and resolving *that*
  position to a page number. This deliberately does not ask the model to
  report its own page number, since an LLM citing its own citation is
  exactly the kind of ungrounded claim this app exists to catch in other
  documents.

This required extracting text **per page** (`mergePages: false` in unpdf)
instead of one merged blob, and re-threading a `pageOffsets` array through
extraction, noise-stripping, truncation, the API payload, and both analysis
routes. Repeated-header/footer stripping (which removes lines) is now a
two-pass process: detect noisy lines globally, then filter each page
individually, so the per-page character offsets stay valid after cleaning.

## How it works

```
PDF upload (stays on-device)
  -> per-page text extraction IN THE BROWSER (unpdf, mergePages: false)
  -> global noise detection, then per-page filtering (keeps offsets valid)
  -> only the extracted TEXT + a pageOffsets[] map is sent to the server
  -> rule-based chapter detection (regex over headings + keyword fallback),
     each hit resolved to a page number
  -> ONE structured prompt per tool to the configured LLM (Gemini 2.5
     Flash by default, Groq as an automatic fallback, see "LLM provider"
     below)
  -> red-flag / ToR-clause excerpts re-located in the source text server-side
     to attach a verified page number
  -> deterministic verdict/risk computed in code from the fields above,
     never asserted by the LLM
  -> dashboard
```

**Why extraction happens in the browser, not on the server:** real published
EIA reports (Parivesh, SPCB sites, company disclosures) are routinely
50-300MB once scanned annexures, lab certificates and drawings are included.
Vercel's Serverless Functions have a **hard, non-configurable 4.5MB request
body limit**, so uploading the raw PDF to an API route would 413-fail on
most real reports. Parsing the PDF client-side means only the extracted text
(typically a few hundred KB, even for a 500-page report) ever goes over the
network, so file size stops being a problem. The PDF-parsing engine itself
(about 1.6MB) is dynamically imported and only loads when someone actually
uploads a file, so it doesn't add to the initial page weight.

The chapter detection runs locally in the API route (no LLM call, just
regex/keyword matching against real-world Indian EIA report phrasing) and
only the relevant excerpts, not the whole document, are sent to the LLM.
This keeps each request comfortably inside either provider's free-tier
limits, and keeps the whole request well under the 60-second serverless
function ceiling.

## LLM provider

The app calls whichever provider is configured through a single client
(`lib/llm.ts`), so the rest of the code never touches a provider SDK
directly:

- **Gemini 2.5 Flash** (`GEMINI_API_KEY`) is used first if set. Its free
  tier gives a ~1M-token context window, which is what lets each analysis
  send generous, full excerpts per chapter instead of trimming them down to
  fit a small context. Get a free key at
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- **Groq** (`GROQ_API_KEY`, `openai/gpt-oss-120b`) is used if Gemini isn't
  configured, or automatically as a fallback for a single call if Gemini
  returns a rate-limit or server error and both keys are set. Get a free
  key at [console.groq.com/keys](https://console.groq.com/keys).

Set `LLM_PROVIDER=groq` to prefer Groq even when a Gemini key is also
present. Worth knowing: Google has tightened Gemini's free daily request
quota more than once (most recently around Dec 2025), so if you're relying
on this for a live demo, test it beforehand and keep both keys set.

**Handling messy real-world PDFs:** repeated running headers/footers (report
title, page numbers) are stripped before chapter detection, since they'd
otherwise pollute both the heading matching and the excerpt budget. Chapter
headings are matched loosely: arabic numbers, roman numerals, or no
numbering at all, since real consultants format them inconsistently, and
every heading pattern is anchored to the start of a line so it can't
false-match a chapter reference buried inside an unrelated paragraph (a
real bug this app used to have: an unanchored pattern hunting for "NABET
accredited" would fire on a baseline chapter's methodology paragraph just
as happily as on the actual Disclosure of Consultants heading, truncating
whatever real chapter came before it). Table-of-Contents lines are filtered
out of heading detection for the same reason: a EIA report's own ToC lists
every chapter heading too, dot-leaders and all, and would otherwise get
matched as the chapter itself instead of the real content pages later in
the document. Publicly posted reports are also often partial (an Executive
Summary, or a single volume without the annexures), so the model is asked
to identify that up front (`documentScope`) rather than let a genuinely
partial document just look like an incomplete one.

## Exporting a result

The **Export summary** button on both `/` and `/tor-check` triggers the
browser's native print dialog against a stylesheet that hides navigation and
buttons, leaving a clean one-page (or few-page) audit summary. This is
usable as "Save as PDF" to attach to a submission, or print for a public
hearing. No PDF-generation library needed for this; the browser already
does it well.

## Local setup

```bash
npm install
cp .env.example .env.local   # then paste in a free key (see "LLM provider" above)
npm run dev
```

Open http://localhost:3000.

## Deploying to Vercel

1. Push this folder to a new GitHub repo.
2. In Vercel: **New Project, then Import** the repo.
3. Add an environment variable: `GEMINI_API_KEY` (and/or `GROQ_API_KEY`) —
   see "LLM provider" above for where to get a free key.
4. Deploy.

No other configuration is needed. Both API routes already set
`maxDuration = 60`, which is the maximum Vercel allows on the free Hobby
plan (default is 10s, so this matters; don't remove it).

## Known limitations (worth stating up front, not discovering during a demo)

- **Fully-scanned PDFs with no text layer won't work.** If a report is pure
  images of pages, extraction returns almost nothing and you get a clear
  error before anything is sent anywhere, rather than silently producing
  garbage. OCR the file first if you hit this. In practice this is more
  common for older reports and annexures than for a report's main chapters,
  which are usually a typed Word-to-PDF export even when scanned exhibits
  are attached.
- **Very large reports get truncated at about 1.2 million characters**
  (roughly 800 to 900 pages of dense text), not chunked and combined. In
  practice this covers essentially every real report's main narrative
  chapters plus most annexures; the UI discloses truncation
  (`meta.truncated`) rather than hiding it, and states the actual number of
  characters analyzed rather than the total extracted (a bug in an earlier
  version conflated the two). Page citations for anything past the
  truncation point are naturally unavailable, since that text was never
  sent.
- **Chapter detection is heuristic**, not a layout-aware parser. It accepts
  arabic numbers, roman numerals, or no numbering, and several common
  phrasings per chapter, but reports with genuinely unusual structure or
  heavily columned layouts may still be mis-segmented. The LLM is prompted
  to sanity-check the heuristic against the actual excerpt text rather than
  trust it blindly, but it isn't infallible.
- **Page-citation lookup is a text search, not a PDF coordinate system.** If
  the model paraphrases an excerpt instead of quoting it verbatim, or if the
  same short phrase appears on multiple pages, the citation can miss or
  point at the wrong occurrence. It fails safe: no page badge shown, rather
  than showing a wrong page with false confidence.
- **The five regulatory checks are pattern checks against what the excerpts
  say, not independent verification.** They can't confirm a claimed NABET
  category against the actual NABET database, or confirm a monitoring date
  is real. They check whether the report's own text is internally
  consistent with the documented criteria. Still meaningfully more specific
  than generic "does this look complete" scoring.
- **In-browser parsing is CPU/memory-bound by the visitor's device**, not
  the server. A 300+ page scanned-heavy PDF may take a noticeable few
  seconds on a slower laptop. The UI shows live progress rather than a
  frozen spinner, but there's no server fallback if a browser tab genuinely
  can't handle a file.
- This is a **screening aid, not a regulatory determination**. The footer
  says as much, and that framing should probably survive into how you
  present it.

## Stack

Next.js 14 (App Router, TypeScript), Tailwind CSS, [unpdf](https://github.com/unjs/unpdf)
for extraction, [Gemini 2.5 Flash](https://ai.google.dev) with
[Groq](https://console.groq.com) (`openai/gpt-oss-120b`) as an automatic
fallback for the analysis calls (see "LLM provider" above), deployed on
Vercel.
