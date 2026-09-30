import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  loadStorageV5,
  saveStorageV5,
  createSchoolV5,
  createProfileV5,
  createYearHierarchyV5,
  saveAcademicCalendarV5,
  saveSemesterJPSettingV5,
  saveTimeAllocationV5,
  saveATPV5,
} from '../src/services/storageV5';
import { getRuntimeContextV5 } from '../src/services/runtimeV5';
import {
  buildPromesProjection,
  generatePROMES,
  generatePdfDocument,
  validateDocumentRequirements,
  DocumentGenerationContext,
} from '../src/services/documentEngine';
import {
  AcademicCalendar,
  CalendarDay,
  TimeAllocation,
  AcademicSetting,
  ATPData,
} from '../src/types';

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;

console.log('=== RUNNING CANONICAL PROMES PROJECTION REGRESSION ===\n');

const school = createSchoolV5({
  name: 'SD Merdeka B.4.3A',
  npsn: '20230099',
  address: 'Jl. Merdeka No. 1',
  village: 'Maju',
  district: 'Jaya',
  regency: 'Bandung',
  province: 'Jawa Barat',
  principalName: 'Kepala Sekolah',
  principalNip: '197001011990011001',
});

const profile = createProfileV5({
  name: 'Guru PROMES',
  nip: '198501012010011001',
  status: 'PNS',
  defaultSubject: 'Matematika',
  defaultLevel: 'SD',
  schoolId: school.id,
});

const hierarchy = createYearHierarchyV5({
  schoolId: school.id,
  profileId: profile.id,
  academicYear: '2026/2027',
  grade: '4',
  level: 'SD',
  subject: 'Matematika',
  curriculumType: 'KURIKULUM_MERDEKA',
});

const sem1 = hierarchy.semesterPlans[0];
const sem2 = hierarchy.semesterPlans[1];

const sampleAnnualATP: ATPData = {
  id: `atp-annual-${hierarchy.yearPlan.id}`,
  academicSettingId: hierarchy.yearPlan.id,
  rationale: 'Rasional ATP Tahunan',
  totalJP: 144,
  updatedAt: new Date().toISOString(),
  items: [
    { id: 'atp-1', stepNumber: 1, tpCode: 'TP.1', tpStatement: 'Bilangan Cacah', materialScope: 'Bilangan', jp: 99 },
    { id: 'atp-2', stepNumber: 2, tpCode: 'TP.2', tpStatement: 'Penjumlahan', materialScope: 'Operasi Hitung', jp: 99 },
    { id: 'atp-3', stepNumber: 3, tpCode: 'TP.3', tpStatement: 'Pengurangan', materialScope: 'Operasi Hitung', jp: 99 },
    { id: 'atp-4', stepNumber: 4, tpCode: 'TP.4', tpStatement: 'Perkalian', materialScope: 'Operasi Hitung', jp: 99 },
    { id: 'atp-5', stepNumber: 5, tpCode: 'TP.5', tpStatement: 'Pembagian', materialScope: 'Operasi Hitung', jp: 99 },
  ],
};

saveATPV5(hierarchy.yearPlan.id, sampleAnnualATP);

const annualAtpBackup = JSON.stringify(sampleAnnualATP);

// Helper for confirmed calendar days
function makeConfirmedCalendarDays(calId: string, startDateStr: string, weeks: number): CalendarDay[] {
  const days: CalendarDay[] = [];
  const start = new Date(startDateStr);
  let dayCounter = 1;

  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const isWeekday = d >= 0 && d <= 4; // Mon-Fri
      days.push({
        id: `day-${calId}-${dayCounter++}`,
        academicCalendarId: calId,
        date: start.toISOString().slice(0, 10),
        status: isWeekday ? 'EFFECTIVE_LEARNING' : 'NON_LEARNING',
      });
      start.setDate(start.getDate() + 1);
    }
  }
  return days;
}

const s1CalId = `cal-${sem1.id}`;
const s1Days = makeConfirmedCalendarDays(s1CalId, '2026-07-13', 18); // 18 weeks starting July 13
const s1Cal: AcademicCalendar = {
  id: s1CalId,
  academicSettingId: sem1.id,
  academicYear: '2026/2027',
  semester: '1 (Ganjil)',
  startDate: '2026-07-13',
  endDate: '2026-11-13',
  schoolDaysPerWeek: 5,
  workflowStatus: 'CONFIRMED',
  updatedAt: new Date().toISOString(),
};

saveAcademicCalendarV5(sem1.id, { calendar: s1Cal, days: s1Days });

saveSemesterJPSettingV5(sem1.id, {
  semesterPlanId: sem1.id,
  actualScheduledWeeklyJP: 5,
  source: 'TEACHER_CONFIRMED',
});

const activeSetting: AcademicSetting = {
  id: sem1.id,
  profileId: profile.id,
  academicYear: '2026/2027',
  grade: '4',
  level: 'SD',
  phase: 'B',
  subject: 'Matematika',
  semester: '1 (Ganjil)',
  curriculum: 'Kurikulum Merdeka',
  curriculumType: 'KURIKULUM_MERDEKA',
  subjectWeeklyJP: 4,
  totalHoursPerWeek: 4,
  updatedAt: new Date().toISOString(),
};

// -----------------------------------------------------------------------------
// TEST 1, 2 & 3: No legacy JP fallback, Unallocated excluded, No synthetic 4 JP
// -----------------------------------------------------------------------------
runTest('1, 2 & 3. No legacy ATPItem.jp fallback, excludes unallocated ATP items, no synthetic 4 JP', () => {
  // Semester 1 has time allocations for only 3 out of 5 ATP items
  const s1Allocations: TimeAllocation[] = [
    { id: 'alloc-1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    { id: 'alloc-2', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-2', atpItemId: 'atp-2', allocatedJP: 16, jp: 16, startWeek: 4, endWeek: 7 },
    { id: 'alloc-3', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-3', atpItemId: 'atp-3', allocatedJP: 20, jp: 20, startWeek: 8, endWeek: 12 },
  ];

  saveTimeAllocationV5(sem1.id, s1Allocations);

  const context: DocumentGenerationContext = {
    school,
    profile,
    academicSetting: activeSetting,
    atp: sampleAnnualATP,
    calendar: s1Cal,
    calendarDays: s1Days,
    timeAllocations: s1Allocations,
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const projection = buildPromesProjection(context);

  assert.strictEqual(projection.isReady, true);
  assert.strictEqual(projection.rows.length, 3, 'Must include exactly 3 allocated ATP items (excluding unallocated 2 items)');

  // Test 1: Uses TimeAllocation.allocatedJP (12), NOT ATPItem.jp (99)
  assert.strictEqual(projection.rows[0].allocatedJP, 12, 'First item must use allocatedJP 12, not legacy ATPItem.jp 99');
  assert.strictEqual(projection.rows[1].allocatedJP, 16);
  assert.strictEqual(projection.rows[2].allocatedJP, 20);

  // Test 3: No unallocated item is present with synthetic 4 JP
  const hasAtp4 = projection.rows.some((r) => r.atpItemId === 'atp-4');
  assert.strictEqual(hasAtp4, false, 'Unallocated atp-4 must NOT appear in PROMES rows');
});

// -----------------------------------------------------------------------------
// TEST 4: Actual weekly JP source priority
// -----------------------------------------------------------------------------
runTest('4. Actual scheduled weekly JP strictly comes from SemesterJPSetting', () => {
  const context: DocumentGenerationContext = {
    school,
    profile,
    academicSetting: {
      ...activeSetting,
      subjectWeeklyJP: 4, // setting = 4
      totalHoursPerWeek: 4,
    },
    atp: sampleAnnualATP,
    calendar: s1Cal,
    calendarDays: s1Days,
    timeAllocations: [
      { id: 'alloc-1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    ],
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' }, // JP setting = 5
    documentMode: 'data',
  };

  const projection = buildPromesProjection(context);
  assert.strictEqual(projection.actualScheduledWeeklyJP, 5, 'actualScheduledWeeklyJP must be 5 from SemesterJPSetting');
});

// -----------------------------------------------------------------------------
// TEST 5 & 6: Cross-month allocation & Rounding-safe monthly distribution
// -----------------------------------------------------------------------------
runTest('5 & 6. Cross-month week distribution and rounding-safe monthly sum', () => {
  // startWeek = 3 (July 27), endWeek = 6 (August)
  // Week 3 is in July, Weeks 4, 5, 6 are in August
  // allocatedJP = 16 -> 4 JP/week -> July = 4 JP, August = 12 JP, sum = 16 JP
  const allocCross: TimeAllocation = {
    id: 'alloc-cross',
    academicSettingId: sem1.id,
    sourceType: 'ATP_ITEM',
    sourceId: 'atp-2',
    atpItemId: 'atp-2',
    allocatedJP: 16,
    jp: 16,
    startWeek: 3,
    endWeek: 6,
  };

  const context: DocumentGenerationContext = {
    school,
    profile,
    academicSetting: activeSetting,
    atp: sampleAnnualATP,
    calendar: s1Cal,
    calendarDays: s1Days,
    timeAllocations: [allocCross],
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const projection = buildPromesProjection(context);
  const row = projection.rows[0];

  assert.strictEqual(row.monthlyJP['Juli'], 4, 'July must get 4 JP (1 week)');
  assert.strictEqual(row.monthlyJP['Agustus'], 12, 'August must get 12 JP (3 weeks)');

  const sumMonthly = Object.values(row.monthlyJP).reduce((a, b) => a + b, 0);
  assert.strictEqual(sumMonthly, 16, 'sum(monthlyJP) must strictly equal allocatedJP (16)');

  // Test 6: Rounding-safe uneven distribution (10 JP across 3 weeks)
  const allocUneven: TimeAllocation = {
    id: 'alloc-uneven',
    academicSettingId: sem1.id,
    sourceType: 'ATP_ITEM',
    sourceId: 'atp-1',
    atpItemId: 'atp-1',
    allocatedJP: 10,
    jp: 10,
    startWeek: 1,
    endWeek: 3,
  };

  const contextUneven: DocumentGenerationContext = {
    ...context,
    timeAllocations: [allocUneven],
  };

  const projUneven = buildPromesProjection(contextUneven);
  const rowUneven = projUneven.rows[0];
  const sumUneven = Object.values(rowUneven.monthlyJP).reduce((a, b) => a + b, 0);

  assert.strictEqual(sumUneven, 10, 'sum(monthlyJP) must strictly equal allocatedJP (10) without rounding drift');
});

// -----------------------------------------------------------------------------
// TEST 7 & 8: Assessment and Reserve preserved
// -----------------------------------------------------------------------------
runTest('7 & 8. Non-ATP Assessment and Reserve allocations enter projection and totals', () => {
  const allocsWithNonAtp: TimeAllocation[] = [
    { id: 'atp-alloc-1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    { id: 'asm-alloc-1', academicSettingId: sem1.id, sourceType: 'ASSESSMENT', sourceId: 'pts', allocatedJP: 4, jp: 4, startWeek: 9, endWeek: 9, notes: 'PTS' },
    { id: 'res-alloc-1', academicSettingId: sem1.id, sourceType: 'RESERVE', sourceId: 'cad', allocatedJP: 8, jp: 8, startWeek: 18, endWeek: 18, notes: 'Cadangan' },
  ];

  const context: DocumentGenerationContext = {
    school,
    profile,
    academicSetting: activeSetting,
    atp: sampleAnnualATP,
    calendar: s1Cal,
    calendarDays: s1Days,
    timeAllocations: allocsWithNonAtp,
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const projection = buildPromesProjection(context);

  assert.strictEqual(projection.rows.length, 1);
  assert.strictEqual(projection.assessmentRows.length, 1);
  assert.strictEqual(projection.reserveRows.length, 1);
  assert.strictEqual(projection.totalAllocatedJP, 24, 'Total allocated JP must be 12 + 4 + 8 = 24 JP');
});

// -----------------------------------------------------------------------------
// TEST 9: Validation Status (BALANCED, UNDER_ALLOCATED, OVER_ALLOCATED)
// -----------------------------------------------------------------------------
runTest('9. Validation status correctly assesses BALANCED, UNDER_ALLOCATED, OVER_ALLOCATED', () => {
  // Available JP = 18 weeks * 5 = 90 JP
  const totalAvail = 90;

  // 1. UNDER_ALLOCATED (60 JP < 90 JP)
  const allocsUnder: TimeAllocation[] = [
    { id: '1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 60, jp: 60, startWeek: 1, endWeek: 10 },
  ];
  const projUnder = buildPromesProjection({
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP, calendar: s1Cal, calendarDays: s1Days, timeAllocations: allocsUnder,
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' }, documentMode: 'data',
  });
  assert.strictEqual(projUnder.validationStatus, 'UNDER_ALLOCATED');
  assert.strictEqual(projUnder.remainingJP, 30);

  // 2. BALANCED (90 JP === 90 JP)
  const allocsBalanced: TimeAllocation[] = [
    { id: '1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 90, jp: 90, startWeek: 1, endWeek: 18 },
  ];
  const projBalanced = buildPromesProjection({
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP, calendar: s1Cal, calendarDays: s1Days, timeAllocations: allocsBalanced,
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' }, documentMode: 'data',
  });
  assert.strictEqual(projBalanced.validationStatus, 'BALANCED');
  assert.strictEqual(projBalanced.remainingJP, 0);

  // 3. OVER_ALLOCATED (100 JP > 90 JP)
  const allocsOver: TimeAllocation[] = [
    { id: '1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 100, jp: 100, startWeek: 1, endWeek: 18 },
  ];
  const projOver = buildPromesProjection({
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP, calendar: s1Cal, calendarDays: s1Days, timeAllocations: allocsOver,
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' }, documentMode: 'data',
  });
  assert.strictEqual(projOver.validationStatus, 'OVER_ALLOCATED');
  assert.strictEqual(projOver.remainingJP, -10);
});

// -----------------------------------------------------------------------------
// TEST 10: Preview / DOCX / PDF Source Contract
// -----------------------------------------------------------------------------
runTest('10. DOCX and PDF generators execute cleanly using canonical PROMES projection', async () => {
  const s1Allocations: TimeAllocation[] = [
    { id: 'alloc-1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    { id: 'alloc-2', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-2', atpItemId: 'atp-2', allocatedJP: 16, jp: 16, startWeek: 4, endWeek: 7 },
  ];

  const context: DocumentGenerationContext = {
    school,
    profile,
    academicSetting: activeSetting,
    atp: sampleAnnualATP,
    calendar: s1Cal,
    calendarDays: s1Days,
    timeAllocations: s1Allocations,
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
    skipDownload: true,
  };

  // Test DOCX PROMES generation
  const docxRes = await generatePROMES(context);
  assert.strictEqual(docxRes.success, true);
  assert.ok(docxRes.blob);

  // Test PDF PROMES generation
  const pdfRes = await generatePdfDocument('PROMES', context);
  assert.ok(pdfRes.blob);
  assert.strictEqual(pdfRes.fileName.includes('PROMES'), true);
});

// -----------------------------------------------------------------------------
// TEST 11 & 12: Annual ATP Immutability & Semester Isolation
// -----------------------------------------------------------------------------
runTest('11 & 12. Annual ATP byte immutability and semester isolation in V5', () => {
  const runtime = getRuntimeContextV5();
  const currentAnnualAtp = runtime.annualData?.atp;

  assert.strictEqual(
    JSON.stringify(currentAnnualAtp),
    annualAtpBackup,
    'Annual ATP must remain byte-for-byte unmodified after PROMES projection workflows'
  );

  // Test Semester Isolation
  // Save S2 allocations
  const s2Allocations: TimeAllocation[] = [
    { id: 'alloc-s2-1', academicSettingId: sem2.id, sourceType: 'ATP_ITEM', sourceId: 'atp-4', atpItemId: 'atp-4', allocatedJP: 20, jp: 20, startWeek: 1, endWeek: 4 },
  ];
  saveTimeAllocationV5(sem2.id, s2Allocations);

  const contextS1: DocumentGenerationContext = {
    school,
    profile,
    academicSetting: activeSetting,
    atp: sampleAnnualATP,
    calendar: s1Cal,
    calendarDays: s1Days,
    timeAllocations: [
      { id: 'alloc-1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    ],
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const projS1 = buildPromesProjection(contextS1);
  assert.strictEqual(projS1.rows.length, 1);
  assert.strictEqual(projS1.rows[0].atpItemId, 'atp-1', 'S1 PROMES must NOT include S2 allocations (atp-4)');
});

// -----------------------------------------------------------------------------
// HARDENING CASE 1: Calendar not confirmed -> Fail Closed
// -----------------------------------------------------------------------------
runTest('Hardening 1. Unconfirmed calendar causes buildPromesProjection.isReady = false, DOCX & PDF reject', async () => {
  const unconfirmedCal: AcademicCalendar = {
    ...s1Cal,
    workflowStatus: 'UNRESOLVED',
  };
  const context: DocumentGenerationContext = {
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP,
    calendar: unconfirmedCal, calendarDays: s1Days,
    timeAllocations: [
      { id: 'alloc-1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    ],
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const proj = buildPromesProjection(context);
  assert.strictEqual(proj.isReady, false);
  assert.ok(proj.unreadyReason?.includes('kalender pendidikan'));

  await assert.rejects(async () => {
    await generatePROMES(context);
  }, /kalender pendidikan/);

  await assert.rejects(async () => {
    await generatePdfDocument('PROMES', context);
  }, /kalender pendidikan/);
});

// -----------------------------------------------------------------------------
// HARDENING CASE 2: SemesterJPSetting missing -> Fail Closed
// -----------------------------------------------------------------------------
runTest('Hardening 2. Missing SemesterJPSetting causes buildPromesProjection.isReady = false, DOCX & PDF reject', async () => {
  const context: DocumentGenerationContext = {
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP,
    calendar: s1Cal, calendarDays: s1Days,
    timeAllocations: [
      { id: 'alloc-1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    ],
    semesterJPSetting: undefined,
    documentMode: 'data',
  };

  const proj = buildPromesProjection(context);
  assert.strictEqual(proj.isReady, false);
  assert.ok(proj.unreadyReason?.includes('Jam Pelajaran'));

  await assert.rejects(async () => {
    await generatePROMES(context);
  }, /Jam Pelajaran/);

  await assert.rejects(async () => {
    await generatePdfDocument('PROMES', context);
  }, /Jam Pelajaran/);
});

// -----------------------------------------------------------------------------
// HARDENING CASE 3: ATP TimeAllocation missing -> Fail Closed
// -----------------------------------------------------------------------------
runTest('Hardening 3. Missing ATP TimeAllocation causes buildPromesProjection.isReady = false, DOCX & PDF reject', async () => {
  const context: DocumentGenerationContext = {
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP,
    calendar: s1Cal, calendarDays: s1Days,
    timeAllocations: [],
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const proj = buildPromesProjection(context);
  assert.strictEqual(proj.isReady, false);
  assert.ok(proj.unreadyReason?.includes('alokasi ATP'));

  await assert.rejects(async () => {
    await generatePROMES(context);
  }, /alokasi ATP/);

  await assert.rejects(async () => {
    await generatePdfDocument('PROMES', context);
  }, /alokasi ATP/);
});

// -----------------------------------------------------------------------------
// HARDENING CASE 4: Blank Mode Bypass
// -----------------------------------------------------------------------------
runTest('Hardening 4. Blank mode creates DOCX and PDF even without confirmed calendar or JP setting', async () => {
  const context: DocumentGenerationContext = {
    school, profile, academicSetting: activeSetting,
    calendar: undefined,
    calendarDays: [],
    timeAllocations: [],
    semesterJPSetting: undefined,
    documentMode: 'blank',
    skipDownload: true,
  };

  const docxRes = await generatePROMES(context);
  assert.strictEqual(docxRes.success, true);

  const pdfRes = await generatePdfDocument('PROMES', context);
  assert.ok(pdfRes.blob);
});

// -----------------------------------------------------------------------------
// HARDENING CASE 5: validateDocumentRequirements
// -----------------------------------------------------------------------------
runTest('Hardening 5. validateDocumentRequirements("PROMES") fails when readiness prerequisites are missing', () => {
  const invalidContext: Partial<DocumentGenerationContext> = {
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP,
    calendar: s1Cal, calendarDays: s1Days,
    timeAllocations: [],
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const valRes = validateDocumentRequirements('PROMES', invalidContext);
  assert.strictEqual(valRes.isValid, false);
  assert.ok(valRes.missingFields.some((f) => f.includes('alokasi ATP')));
});

// -----------------------------------------------------------------------------
// HARDENING CASE 6: Mixed S1/S2 Input
// -----------------------------------------------------------------------------
runTest('Hardening 6. Projection defensively filters out timeAllocations from other semesters', () => {
  const mixedAllocations: TimeAllocation[] = [
    { id: 'alloc-s1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    { id: 'alloc-s2', academicSettingId: sem2.id, sourceType: 'ATP_ITEM', sourceId: 'atp-4', atpItemId: 'atp-4', allocatedJP: 20, jp: 20, startWeek: 1, endWeek: 4 },
  ];

  const contextS1: DocumentGenerationContext = {
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP,
    calendar: s1Cal, calendarDays: s1Days,
    timeAllocations: mixedAllocations,
    semesterJPSetting: { semesterPlanId: sem1.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const proj = buildPromesProjection(contextS1);
  assert.strictEqual(proj.rows.length, 1);
  assert.strictEqual(proj.rows[0].atpItemId, 'atp-1');
});

// -----------------------------------------------------------------------------
// HARDENING CASE 7: Wrong SemesterJPSetting Scope
// -----------------------------------------------------------------------------
runTest('Hardening 7. SemesterJPSetting for wrong semesterPlanId is rejected and causes fail closed', () => {
  const context: DocumentGenerationContext = {
    school, profile, academicSetting: activeSetting, atp: sampleAnnualATP,
    calendar: s1Cal, calendarDays: s1Days,
    timeAllocations: [
      { id: 'alloc-1', academicSettingId: sem1.id, sourceType: 'ATP_ITEM', sourceId: 'atp-1', atpItemId: 'atp-1', allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    ],
    semesterJPSetting: { semesterPlanId: sem2.id, actualScheduledWeeklyJP: 5, source: 'TEACHER_CONFIRMED' },
    documentMode: 'data',
  };

  const proj = buildPromesProjection(context);
  assert.strictEqual(proj.actualScheduledWeeklyJP, null);
  assert.strictEqual(proj.isReady, false);
});

console.log('\nAll Canonical PROMES Projection regression tests PASSED 100%!\n');
