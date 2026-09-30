import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  buildProtaProjection,
  buildK13ProtaProjection,
  validateDocumentRequirements,
  DocumentGenerationContext,
  ProtaSemesterAllocationBundle,
} from '../src/services/documentEngine';
import {
  AcademicSetting,
  ATPData,
  K13Analysis,
  TimeAllocation,
  SchoolData,
  TeacherProfile,
  AnnualJPReference,
} from '../src/types';

function runTest(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(err);
      process.exit(1);
    }
  })();
}

async function main() {
  console.log('=== RUNNING CANONICAL PROTA PROJECTION REGRESSION ===\n');

  const school: SchoolData = {
    id: 'school-1',
    name: 'SD Merdeka',
    npsn: '20230099',
    address: 'Jl. Merdeka',
    village: 'Maju',
    district: 'Jaya',
    regency: 'Bandung',
    province: 'Jawa Barat',
    principalName: 'Kepsek',
    principalNip: '19700101',
    createdAt: '',
    updatedAt: '',
  };

  const profile: TeacherProfile = {
    id: 'profile-1',
    name: 'Guru',
    nip: '19850101',
    status: 'PNS',
    defaultSubject: 'Matematika',
    defaultLevel: 'SD',
    schoolId: 'school-1',
    createdAt: '',
    updatedAt: '',
  };

  const activeSetting: AcademicSetting = {
    id: 'setting-1',
    profileId: 'profile-1',
    curriculum: 'Kurikulum Merdeka',
    curriculumType: 'KURIKULUM_MERDEKA',
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    level: 'SD',
    grade: '4',
    phase: 'B',
    subject: 'Matematika',
    subjectWeeklyJP: 4,
    totalHoursPerWeek: 4,
    updatedAt: '',
  };

  const academicSetting = activeSetting;

  const annualATP: ATPData = {
    id: 'atp-1',
    academicSettingId: 'setting-1',
    rationale: 'Rasional',
    totalJP: 72,
    updatedAt: '',
    items: [
      { id: 'atp-item-1', stepNumber: 1, tpCode: 'TP.1', tpStatement: 'TP 1 Statement', materialScope: 'Scope 1', jp: 12 },
      { id: 'atp-item-2', stepNumber: 2, tpCode: 'TP.2', tpStatement: 'TP 2 Statement', materialScope: 'Scope 2', jp: 12 },
      { id: 'atp-item-3', stepNumber: 3, tpCode: 'TP.3', tpStatement: 'TP 3 Statement', materialScope: 'Scope 3', jp: 12 },
      { id: 'atp-item-4', stepNumber: 4, tpCode: 'TP.4', tpStatement: 'TP 4 Statement', materialScope: 'Scope 4', jp: 12 },
      { id: 'atp-item-5', stepNumber: 5, tpCode: 'TP.5', tpStatement: 'TP 5 Statement', materialScope: 'Scope 5', jp: 12 },
      { id: 'atp-item-6', stepNumber: 6, tpCode: 'TP.6', tpStatement: 'TP 6 Statement', materialScope: 'Scope 6', jp: 12 },
    ],
  };

  const sampleAllocationsS1: TimeAllocation[] = [
    { id: 'alloc-1', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    { id: 'alloc-2', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-2', allocatedJP: 12, jp: 12, startWeek: 4, endWeek: 6 },
    { id: 'alloc-3', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-3', allocatedJP: 12, jp: 12, startWeek: 7, endWeek: 9 },
  ];

  const sampleAllocationsS2: TimeAllocation[] = [
    { id: 'alloc-4', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-4', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    { id: 'alloc-5', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-5', allocatedJP: 12, jp: 12, startWeek: 4, endWeek: 6 },
    { id: 'alloc-6', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-6', allocatedJP: 12, jp: 12, startWeek: 7, endWeek: 9 },
  ];

  const bundles: ProtaSemesterAllocationBundle[] = [
    { semesterPlanId: 'sem-plan-s1', semester: 1, allocations: sampleAllocationsS1 },
    { semesterPlanId: 'sem-plan-s2', semester: 2, allocations: sampleAllocationsS2 },
  ];

  const annualJPRef: AnnualJPReference = {
    officialAnnualJP: 144,
    referenceWeeklyEquivalentJP: 4,
    regulationReference: 'Permendikbudristek No. 262/M/2022',
  };

  // --- CASE 1 — Active semester independence ---
  await runTest('Case 1. Active semester does not change PROTA projection', () => {
    const ctxS1: DocumentGenerationContext = {
      school,
      profile,
      academicSetting: { ...activeSetting, semester: '1 (Ganjil)' },
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const ctxS2: DocumentGenerationContext = {
      school,
      profile,
      academicSetting: { ...activeSetting, semester: '2 (Genap)' },
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const projS1 = buildProtaProjection(ctxS1);
    const projS2 = buildProtaProjection(ctxS2);

    assert.strictEqual(projS1.totalAllocatedJP, projS2.totalAllocatedJP);
    assert.deepStrictEqual(projS1.rows, projS2.rows);
    assert.strictEqual(projS1.isReady, true);
  });

  // --- CASE 2 — ATPItem.jp is ignored ---
  await runTest('Case 2. ATPItem.jp value (99) is ignored in favor of TimeAllocation.allocatedJP (12)', () => {
    const customATP = {
      ...annualATP,
      items: annualATP.items.map((it) => ({ ...it, jp: 99 })),
    };
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: customATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.rows[0].allocatedJP, 12);
  });

  // --- CASE 3 — ATPItem.semester ignored ---
  await runTest('Case 3. ATPItem.semester legacy value (2) is ignored in favor of TimeAllocation semester plan bundle', () => {
    const customATP = {
      ...annualATP,
      items: annualATP.items.map((it) => ({ ...it, semester: 2 as 1 | 2 })),
    };
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: customATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.rows[0].semester, 1); // ATP item 1 is S1 bundle
  });

  // --- CASE 4 — No synthetic 4 ---
  await runTest('Case 4. ATP items without time allocation do not yield synthetic 4 JP; causes INCOMPLETE', () => {
    const incompleteBundles: ProtaSemesterAllocationBundle[] = [
      { semesterPlanId: 'sem-plan-s1', semester: 1, allocations: sampleAllocationsS1 },
      { semesterPlanId: 'sem-plan-s2', semester: 2, allocations: [] }, // S2 unallocated
    ];
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: incompleteBundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, false);
    assert.strictEqual(proj.validationStatus, 'INCOMPLETE');
  });

  // --- CASE 5 — S1 + S2 combination ---
  await runTest('Case 5. Complete S1 (3) + S2 (3) allocations correctly outputs 6 rows', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.rows.length, 6);
    assert.strictEqual(proj.rows.filter((r) => r.semester === 1).length, 3);
    assert.strictEqual(proj.rows.filter((r) => r.semester === 2).length, 3);
  });

  // --- CASE 6 — Cross-semester duplicate ---
  await runTest('Case 6. Duplicate allocation across semesters results in CONFLICT status', () => {
    const conflictBundles: ProtaSemesterAllocationBundle[] = [
      { semesterPlanId: 'sem-plan-s1', semester: 1, allocations: sampleAllocationsS1 },
      { semesterPlanId: 'sem-plan-s2', semester: 2, allocations: [...sampleAllocationsS2, { ...sampleAllocationsS1[0], id: 'alloc-conflict' }] },
    ];
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: conflictBundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, false);
    assert.strictEqual(proj.validationStatus, 'CONFLICT');
  });

  // --- CASE 7 — Missing allocation ---
  await runTest('Case 7. Missing allocations trigger INCOMPLETE instead of silently bypassing', () => {
    const missingBundles: ProtaSemesterAllocationBundle[] = [
      { semesterPlanId: 'sem-plan-s1', semester: 1, allocations: [sampleAllocationsS1[0], sampleAllocationsS1[1]] }, // item 3 missing
      { semesterPlanId: 'sem-plan-s2', semester: 2, allocations: sampleAllocationsS2 },
    ];
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: missingBundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, false);
    assert.strictEqual(proj.validationStatus, 'INCOMPLETE');
  });

  // --- CASE 8 — Assessment + Reserve kedua semester ---
  await runTest('Case 8. Assessments & reserves across both semesters enter totals cleanly without double count', () => {
    const nonAtpAllocationsS1: TimeAllocation[] = [
      { id: 'non-atp-s1-asm', academicSettingId: 'setting-1', sourceType: 'ASSESSMENT', sourceId: 'asm-s1', allocatedJP: 4, jp: 4, startWeek: 17, endWeek: 17, notes: 'SAS 1' },
      { id: 'non-atp-s1-res', academicSettingId: 'setting-1', sourceType: 'RESERVE', sourceId: 'res-s1', allocatedJP: 2, jp: 2, startWeek: 18, endWeek: 18, notes: 'Pekan Sunyi S1' },
    ];
    const nonAtpAllocationsS2: TimeAllocation[] = [
      { id: 'non-atp-s2-asm', academicSettingId: 'setting-1', sourceType: 'ASSESSMENT', sourceId: 'asm-s2', allocatedJP: 4, jp: 4, startWeek: 17, endWeek: 17, notes: 'SAS 2' },
      { id: 'non-atp-s2-res', academicSettingId: 'setting-1', sourceType: 'RESERVE', sourceId: 'res-s2', allocatedJP: 2, jp: 2, startWeek: 18, endWeek: 18, notes: 'Pekan Sunyi S2' },
    ];

    const compositeBundles: ProtaSemesterAllocationBundle[] = [
      { semesterPlanId: 'sem-plan-s1', semester: 1, allocations: [...sampleAllocationsS1, ...nonAtpAllocationsS1] },
      { semesterPlanId: 'sem-plan-s2', semester: 2, allocations: [...sampleAllocationsS2, ...nonAtpAllocationsS2] },
    ];

    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: compositeBundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.assessmentRows.length, 2);
    assert.strictEqual(proj.reserveRows.length, 2);
    // ATP: 6*12 = 72, Asm: 4+4 = 8, Res: 2+2 = 4 -> Total = 84
    assert.strictEqual(proj.totalAllocatedJP, 84);
    assert.strictEqual(proj.semester1AllocatedJP, 36 + 4 + 2); // 42
    assert.strictEqual(proj.semester2AllocatedJP, 36 + 4 + 2); // 42
  });

  // --- CASE 9 — AnnualJPReference ---
  await runTest('Case 9. AnnualJPReference parameters are resolved verbatim', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.officialAnnualJP, 144);
    assert.strictEqual(proj.referenceWeeklyEquivalentJP, 4);
    assert.strictEqual(proj.regulationReference, 'Permendikbudristek No. 262/M/2022');
  });

  // --- CASE 10 — BALANCED ---
  await runTest('Case 10. BALANCED status is triggered when total matches official JP', () => {
    const perfectJPRef = { ...annualJPRef, officialAnnualJP: 72 }; // Total ATP = 72
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: perfectJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.validationStatus, 'BALANCED');
  });

  // --- CASE 11 — UNDER ---
  await runTest('Case 11. UNDER_ALLOCATED status is triggered when total is less than official JP', () => {
    const higherJPRef = { ...annualJPRef, officialAnnualJP: 100 }; // Total ATP = 72
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: higherJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.validationStatus, 'UNDER_ALLOCATED');
  });

  // --- CASE 12 — OVER ---
  await runTest('Case 12. OVER_ALLOCATED status is triggered when total exceeds official JP', () => {
    const lowerJPRef = { ...annualJPRef, officialAnnualJP: 60 }; // Total ATP = 72
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: lowerJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.validationStatus, 'OVER_ALLOCATED');
  });

  // --- CASE 13 — Annual capacity unknown ---
  await runTest('Case 13. S1+S2 allocated but AnnualJPReference is missing triggers UNVERIFIED_CAPACITY & isReady = true', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: undefined,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, true);
    assert.strictEqual(proj.validationStatus, 'UNVERIFIED_CAPACITY');
    assert.strictEqual(proj.officialAnnualJP, null);
  });

  // --- CASE 14 — Blank mode ---
  await runTest('Case 14. Blank mode returns empty rows, isReady = true, status BALANCED', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'blank',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, true);
    assert.strictEqual(proj.rows.length, 0);
    assert.strictEqual(proj.validationStatus, 'BALANCED');
  });

  // --- CASE 15 — Preview/DOCX/PDF contract ---
  await runTest('Case 15. Validation of requirements works perfectly for PROTA', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const val = validateDocumentRequirements('PROTA', ctx);
    assert.strictEqual(val.isValid, true);

    const badCtx = { ...ctx, protaSemesterAllocations: [] };
    const valBad = validateDocumentRequirements('PROTA', badCtx);
    assert.strictEqual(valBad.isValid, false);
  });

  // --- CASE 16 — ATP immutability ---
  await runTest('Case 16. ATP object remains byte-for-byte unmodified after projection', () => {
    const before = JSON.stringify(annualATP);
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    buildProtaProjection(ctx);
    const after = JSON.stringify(annualATP);
    assert.strictEqual(after, before);
  });

  // ===========================================================================
  // K13 PROTA CASES
  // ===========================================================================

  const sampleK13Analysis: K13Analysis = {
    id: 'k13-anal-1',
    academicSettingId: 'setting-k13',
    updatedAt: '',
    items: [
      { id: 'kd-3.1', skl: 'SKL 1', ki: 'KI 3', kd: '3.1', indikator: 'Ind 1', materi: 'Operasi Hitung', alokasiJp: 16, kegiatan: 'Aktivitas 1' },
      { id: 'kd-3.2', skl: 'SKL 1', ki: 'KI 3', kd: '3.2', indikator: 'Ind 2', materi: 'Pecahan', alokasiJp: 20, kegiatan: 'Aktivitas 2' },
    ],
  };

  const sampleK13Allocations: TimeAllocation[] = [
    { id: 'k13-alloc-1', academicSettingId: 'setting-k13', sourceType: 'KD', sourceId: 'kd-3.1', allocatedJP: 18, jp: 18 },
  ];

  const k13Bundles: ProtaSemesterAllocationBundle[] = [
    { semesterPlanId: 'sem-plan-k13-s1', semester: 1, allocations: sampleK13Allocations },
  ];

  // --- CASE K1 — K13 analysis available without ATP Merdeka ---
  await runTest('Case K1. K13 analysis validation succeeds without ATP Merdeka requirements', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting: { ...activeSetting, curriculumType: 'K13', curriculum: 'Kurikulum 2013' },
      k13Analysis: sampleK13Analysis,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const val = validateDocumentRequirements('PROTA', ctx);
    assert.strictEqual(val.isValid, true);
  });

  // --- CASE K2 — K13 preview/export match projection ---
  await runTest('Case K2. buildK13ProtaProjection resolves correct rows', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting: { ...activeSetting, curriculumType: 'K13', curriculum: 'Kurikulum 2013' },
      k13Analysis: sampleK13Analysis,
      protaSemesterAllocations: k13Bundles,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildK13ProtaProjection(ctx);
    assert.strictEqual(proj.isReady, true);
    assert.strictEqual(proj.rows.length, 2);
    assert.strictEqual(proj.rows[0].kd, '3.1');
    assert.strictEqual(proj.rows[1].kd, '3.2');
  });

  // --- CASE K3 — TimeAllocation JP overrides K13Item.alokasiJp ---
  await runTest('Case K3. K13 TimeAllocation JP (18) overrides item.alokasiJp (16)', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting: { ...activeSetting, curriculumType: 'K13', curriculum: 'Kurikulum 2013' },
      k13Analysis: sampleK13Analysis,
      protaSemesterAllocations: k13Bundles,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildK13ProtaProjection(ctx);
    assert.strictEqual(proj.rows[0].allocatedJP, 18); // alloc is 18
    assert.strictEqual(proj.rows[1].allocatedJP, 20); // fall back to item.alokasiJp (20)
  });

  // --- CASE K4 — K13 isolation from Merdeka requirements ---
  await runTest('Case K4. K13 does not require Annual ATP, SemesterJPSetting, or buildPromesProjection', () => {
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting: { ...activeSetting, curriculumType: 'K13', curriculum: 'Kurikulum 2013' },
      k13Analysis: sampleK13Analysis,
      protaSemesterAllocations: k13Bundles,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildK13ProtaProjection(ctx);
    assert.strictEqual(proj.isReady, true);
  });

  // --- CASE 17 — duplicate same-semester ---
  await runTest('Case 17. Duplicate allocations within same semester results in CONFLICT status', () => {
    const s1DuplicateAllocations: TimeAllocation[] = [
      { id: 'alloc-1', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
      { id: 'alloc-1-dup', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-1', allocatedJP: 12, jp: 12, startWeek: 4, endWeek: 6 }, // duplicate
      { id: 'alloc-2', academicSettingId: 'setting-1', sourceType: 'ATP_ITEM', sourceId: 'atp-item-2', allocatedJP: 12, jp: 12, startWeek: 7, endWeek: 9 },
    ];
    const duplicateSameSemBundles: ProtaSemesterAllocationBundle[] = [
      { semesterPlanId: 'sem-plan-s1', semester: 1, allocations: s1DuplicateAllocations },
      { semesterPlanId: 'sem-plan-s2', semester: 2, allocations: sampleAllocationsS2 },
    ];
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: duplicateSameSemBundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, false);
    assert.strictEqual(proj.validationStatus, 'CONFLICT');
    const conflictedRows = proj.rows.filter((r) => r.atpItemId === 'atp-item-1');
    assert.strictEqual(conflictedRows.length, 0);
  });

  // --- CASE 18 — missing S1 bundle ---
  await runTest('Case 18. Missing S1 bundle results in INCOMPLETE status', () => {
    const missingS1Bundles: ProtaSemesterAllocationBundle[] = [
      { semesterPlanId: 'sem-plan-s2', semester: 2, allocations: sampleAllocationsS2 },
    ];
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: missingS1Bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, false);
    assert.strictEqual(proj.validationStatus, 'INCOMPLETE');
    assert.strictEqual(proj.unreadyReason?.includes('Semester 1 dan Semester 2 belum lengkap'), true);
  });

  // --- CASE 19 — missing S2 bundle ---
  await runTest('Case 19. Missing S2 bundle results in INCOMPLETE status', () => {
    const missingS2Bundles: ProtaSemesterAllocationBundle[] = [
      { semesterPlanId: 'sem-plan-s1', semester: 1, allocations: sampleAllocationsS1 },
    ];
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: missingS2Bundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, false);
    assert.strictEqual(proj.validationStatus, 'INCOMPLETE');
    assert.strictEqual(proj.unreadyReason?.includes('Semester 1 dan Semester 2 belum lengkap'), true);
  });

  // --- CASE 20 — duplicate semester bundle ---
  await runTest('Case 20. Duplicate semester bundles results in CONFLICT status', () => {
    const duplicateBundles: ProtaSemesterAllocationBundle[] = [
      { semesterPlanId: 'sem-plan-s1-a', semester: 1, allocations: sampleAllocationsS1 },
      { semesterPlanId: 'sem-plan-s1-b', semester: 1, allocations: sampleAllocationsS1 },
      { semesterPlanId: 'sem-plan-s2', semester: 2, allocations: sampleAllocationsS2 },
    ];
    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting,
      atp: annualATP,
      protaSemesterAllocations: duplicateBundles,
      annualJPReference: annualJPRef,
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildProtaProjection(ctx);
    assert.strictEqual(proj.isReady, false);
    assert.strictEqual(proj.validationStatus, 'CONFLICT');
    assert.strictEqual(proj.unreadyReason?.includes('Duplikasi data distribusi Semester 1 atau Semester 2'), true);
  });

  // --- CASE 21 — active semester preview metadata check ---
  await runTest('Case 21. PROTA preview metadata does not display semester', () => {
    const adminDocsSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/AdminDocsExport.tsx'),
      'utf-8'
    );

    assert.ok(
      adminDocsSource.includes(
        "activePreviewType === 'PROTA' ? 'Tahun Ajaran:' : 'Tahun Ajaran / Sem:'"
      )
    );

    assert.ok(
      adminDocsSource.includes(
        "activePreviewType === 'PROTA' ? previewAcademicYear : `${previewAcademicYear} / ${previewSemester}`"
      )
    );
  });

  // --- CASE K5 — unresolved K13 semester ---
  await runTest('Case K5. Unresolved K13 item semester resolves to null and display evaluates to -', () => {
    const k13WithLegacySemester = {
      ...sampleK13Analysis,
      items: sampleK13Analysis.items.map((item) => ({
        ...item,
        semester: 1,
      })),
    };

    const ctx: DocumentGenerationContext = {
      school,
      profile,
      academicSetting: { ...activeSetting, curriculumType: 'K13', curriculum: 'Kurikulum 2013' },
      k13Analysis: k13WithLegacySemester,
      protaSemesterAllocations: [], // No allocations at all
      documentMode: 'data',
      documentDate: '2026-07-15',
    };

    const proj = buildK13ProtaProjection(ctx);
    assert.strictEqual(proj.rows[0].semester, null);
    assert.strictEqual(proj.rows[1].semester, null);
  });

  console.log('\nAll Canonical PROTA Projection regression tests PASSED 100%!\n');
}

main();
