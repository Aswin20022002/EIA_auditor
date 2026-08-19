// Synthetic verification harness. Builds a small fake "report" text that
// reproduces the exact failure patterns documented in the gap analysis
// (a "Structure of the Report" preview list, a repeated "10.1 Introduction"
// sub-heading, a project_desc chapter long enough to blow past the old
// 2,200-char excerpt cap, and out-of-order page numbers) and checks the
// fixed detection code against each one. Not a substitute for re-running
// against the real 636-page PDF (can't -- it's not in this container), but
// pins down that each documented bug pattern is actually fixed in isolation.

import {
  detectSections,
  SECTION_DEFS,
  findRegulatoryEvidence,
  flagCitationOutliers,
  charIndexToPage,
} from "./lib/sections";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}${detail ? "  -- " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------
// Fixture: build fake page offsets (1 char = 1 "page" boundary marker
// every PAGE_LEN chars, close enough for this test) and a full text with
// the real Tagros-style bug patterns baked in at known offsets.
// ---------------------------------------------------------------------
const PAGE_LEN = 2000;

// Running-position builder: advanceToPage(N) appends exactly enough filler
// (ending on its own newline, so the next pushed heading always starts a
// fresh line) to bring the document's current length up to page N's
// absolute offset. Chosen over ad hoc per-chunk padding after the first
// draft of this fixture produced wrong absolute positions -- computing
// each gap by hand as "target minus whatever's already been written"
// is exactly the kind of arithmetic that's easy to get wrong, which is
// what happened here; a running total sidesteps it.
let doc = "";
function advanceToPage(targetPage: number) {
  const targetLen = (targetPage - 1) * PAGE_LEN;
  if (doc.length < targetLen) {
    doc += "x".repeat(targetLen - doc.length - 1) + "\n";
  }
}
function push(text: string) {
  doc += text;
}

push("FRONT MATTER AND COVER PAGE.\n");

// Real Chapter 1 heading, page 25.
advanceToPage(25);
push("1. INTRODUCTION\nThis chapter introduces the project background and proponent.\n");

// "Structure of the Report" preview list, page 51 -- the exact bug pattern
// from the gap analysis: one clause per chapter, colon-introduced.
advanceToPage(51);
push(
  "1.4.1 Structure of the Report\n" +
    "Chapter 10- Environmental Management Plan: This is the key Chapter of the report describing mitigation measures.\n" +
    "Chapter 12 - Disclosure of Consultants engaged: Names of consultants engaged in preparation of this report.\n"
);

// Chapter 2 (Project Description), page 179, deliberately long (past the
// old 2,200-char non-priority excerpt cap) with greenbelt/ZLD/CEMS facts
// buried well past that cutoff, plus a stray "10.1 Introduction"-style
// sub-heading inside it (the other half of the real collision).
advanceToPage(179);
let projectDesc = "2. PROJECT DESCRIPTION\n";
projectDesc += "Filler technical description of the manufacturing process. ".repeat(120); // >> 2200 chars
projectDesc += "\n10.1 Introduction\nThis sub-section restates scope for this specific unit.\n"; // decoy
projectDesc += "Filler technical description continues further still. ".repeat(80);
projectDesc += "\nThe green belt developed covers 35.35% of the total plot area on a ground-level basis.\n";
projectDesc += "Filler continues. ".repeat(60);
projectDesc += "\nThe unit will achieve Zero Liquid Discharge (ZLD) with treated effluent recycled back into the cooling tower makeup.\n";
projectDesc += "Filler continues. ".repeat(60);
projectDesc += "\nContinuous Emission Monitoring Systems (CEMS) are installed and connected to the SPCB server.\n";
projectDesc += "Filler continues. ".repeat(40);
projectDesc += "\n";
push(projectDesc);

// Chapter 3 (Baseline), page 367.
advanceToPage(367);
push("3. DESCRIPTION OF THE ENVIRONMENT (BASELINE)\nMonitoring was carried out during August to October 2019 across all environmental attributes.\n");

// Chapter 10 (EMP), real heading, page 582.
advanceToPage(582);
push(
  "10. ENVIRONMENTAL MANAGEMENT PLAN\n10.1 Introduction\nThis chapter details the EMP budget and implementation schedule, and the roles of the Environmental Management Cell.\n"
);

// Chapter 12 (Disclosure), real heading, page 632.
advanceToPage(632);
push("12. DISCLOSURE OF CONSULTANTS\nHubert Enviro Care Systems, NABET accredited Category A, engaged as the EIA consultant.\n");

const fullText = doc;

// Page offsets: one entry per PAGE_LEN chars, matching the fixture above.
const pageOffsets: number[] = [];
for (let i = 0; i < fullText.length; i += PAGE_LEN) pageOffsets.push(i);

// ---------------------------------------------------------------------
// 1. Missing chapter (§2.1)
// ---------------------------------------------------------------------
check(
  "cost_benefit SectionDef now exists between benefits (Ch.8) and emp (Ch.10)",
  SECTION_DEFS.some((d) => d.id === "cost_benefit"),
);
const costBenefitIdx = SECTION_DEFS.findIndex((d) => d.id === "cost_benefit");
const empIdx = SECTION_DEFS.findIndex((d) => d.id === "emp");
const benefitsIdx = SECTION_DEFS.findIndex((d) => d.id === "benefits");
check("cost_benefit sits between benefits and emp in document order", costBenefitIdx === benefitsIdx + 1 && empIdx === costBenefitIdx + 1);
check(
  "clause labels renumbered correctly (emp=Ch.10, summary=Ch.11, disclosure=Ch.12)",
  SECTION_DEFS.find((d) => d.id === "emp")?.clause === "Ch. 10" &&
    SECTION_DEFS.find((d) => d.id === "summary")?.clause === "Ch. 11" &&
    SECTION_DEFS.find((d) => d.id === "disclosure")?.clause === "Ch. 12",
);

// ---------------------------------------------------------------------
// 2. Citation collisions (§2.2, §2.7)
// ---------------------------------------------------------------------
const detected = detectSections(fullText, pageOffsets);
const byId = Object.fromEntries(detected.map((d) => [d.id, d]));

check(
  `intro resolves near real page 25, not the "Structure of the Report" preview (page ~51) or the decoy "10.1 Introduction" inside project_desc`,
  typeof byId.intro?.page === "number" && byId.intro.page <= 27,
  `got page ${byId.intro?.page}`,
);
check(
  "emp resolves near real page 582, not the preview-list page (~51)",
  typeof byId.emp?.page === "number" && byId.emp.page >= 580 && byId.emp.page <= 584,
  `got page ${byId.emp?.page}`,
);
check(
  "disclosure resolves near real page 632, not the preview-list page (~51)",
  typeof byId.disclosure?.page === "number" && byId.disclosure.page >= 630,
  `got page ${byId.disclosure?.page}`,
);
check(
  "baseline resolves near real page 367, unaffected by earlier collisions",
  typeof byId.baseline?.page === "number" && byId.baseline.page >= 365 && byId.baseline.page <= 369,
  `got page ${byId.baseline?.page}`,
);

// ---------------------------------------------------------------------
// 3. Regulatory evidence reaches the LLM regardless of chapter excerpt cap (§2.3)
// ---------------------------------------------------------------------
const evidence = findRegulatoryEvidence(fullText, pageOffsets);
check("greenbelt evidence located independent of excerpt cap", evidence.greenbelt_norm.length > 0 && /35\.35/.test(evidence.greenbelt_norm[0].text));
check("ZLD evidence located independent of excerpt cap", evidence.zld_consistency.length > 0 && /recycled/i.test(evidence.zld_consistency[0].text));
check("CEMS evidence located independent of excerpt cap", evidence.cems_status.length > 0 && /installed/i.test(evidence.cems_status[0].text));
check("baseline_recency evidence located (Aug-Oct 2019)", evidence.baseline_recency.length > 0);
check("consultant_accreditation evidence located (NABET + category)", evidence.consultant_accreditation.length > 0);

// ---------------------------------------------------------------------
// 4. Citation monotonicity sanity check (bonus, README note)
// ---------------------------------------------------------------------
// Only the 5 chapters this fixture actually built real content for have a
// meaningful page to assert on; the rest were never written into this
// synthetic doc at all (unlike a real 636-page report, which has content,
// dedicated or scattered, for every chapter), so they're excluded here
// rather than asserted against a fixture that doesn't model them.
const craftedIds = ["intro", "project_desc", "baseline", "emp", "disclosure"];
const fakeChecklistGood = craftedIds.map((id) => ({ id, page: byId[id]?.page }));
const outliersGood = flagCitationOutliers(
  fakeChecklistGood,
  SECTION_DEFS.filter((d) => craftedIds.includes(d.id))
);
check("no false-positive outliers once citations are correctly resolved", outliersGood.size === 0, `flagged: ${[...outliersGood].join(", ")}`);

const fakeChecklistBad = [
  { id: "project_desc", page: 179 },
  { id: "baseline", page: 367 },
  { id: "emp", page: 51 }, // the original bug's actual bad value
  { id: "disclosure", page: 51 },
];
const outliersBad = flagCitationOutliers(fakeChecklistBad, SECTION_DEFS.filter((d) => ["project_desc", "baseline", "emp", "disclosure"].includes(d.id)));
check("monotonicity check DOES flag the original bug's page-51 collisions", outliersBad.has("emp"), `flagged: ${[...outliersBad].join(", ")}`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
