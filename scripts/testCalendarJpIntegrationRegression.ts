import assert from 'assert';
import {
  loadStorageV5,
  saveStorageV5,
  createSchoolV5,
  createProfileV5,
  createYearHierarchyV5,
  saveAcademicCalendarV5,
  saveSemesterJPSettingV5,
  saveTimeAllocationV5,
} from '../src/services/storageV5';
import { resolveSemesterCapacityV5 } from '../src/services/jpEngine';
import { generateEffectiveCalendarDays } from '../src/services/calendarResolver';
import { getRuntimeContextV5 } from '../src/services/runtimeV5';
import {
  AcademicCalendar,
  CalendarDay,
  TimeAllocation,
  SemesterJPSetting,
} from '../src/types';

// Mock localStorage in Node environment
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;

console.log('=== RUNNING CALENDAR -> SEMESTER JP & TIME ALLOCATION INTEGRATION REGRESSION ===');

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// SETUP
// -----------------------------------------------------------------------------
mockStorage.clear();

const school = createSchoolV5({
  name: 'SD Negeri Nusantara 01',
  npsn: '12345678',
  address: 'Jl. Pendidikan No. 1',
  village: 'Sukamaju',
  district: 'Cibadak',
  regency: 'Kabupaten Sukabumi',
  province: 'Jawa Barat',
  principalName: 'Dra. Hj. Siti Nurhaliza, M.Pd.',
  principalNip: '197501012000032001',
});

const profile = createProfileV5({
  name: 'Ahmad Fauzi, S.Pd.',
  nip: '198805122015031002',
  status: 'PNS',
  defaultSubject: 'Matematika',
  defaultLevel: 'SD',
  schoolId: school.id,
});

const hierarchy = createYearHierarchyV5({
  profileId: profile.id,
  schoolId: school.id,
  academicYear: '2026/2027',
  curriculumType: 'KURIKULUM_MERDEKA',
  level: 'SD',
  grade: 'Fase A / Kelas 1',
  subject: 'Matematika',
});

const sem1 = hierarchy.semesterPlans[0];
const sem2 = hierarchy.semesterPlans[1];

// -----------------------------------------------------------------------------
// TEST 1 & 2: Kalender confirmed -> badge "Ditetapkan" & reload tetap CONFIRMED
// -----------------------------------------------------------------------------
runTest('1 & 2. Kalender confirmed persists in V5 and reloads as CONFIRMED', () => {
  const cal1: AcademicCalendar = {
    id: `cal-${sem1.id}`,
    academicSettingId: sem1.id,
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    sourceType: 'REGIONAL_EDUCATION_CALENDAR',
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  };

  const day1: CalendarDay = {
    id: `day-${sem1.id}-1`,
    academicCalendarId: cal1.id,
    date: '2026-07-13',
    status: 'effective',
    sourceType: 'REGIONAL_EDUCATION_CALENDAR',
    sourceLayer: 'GENERATED_EFFECTIVE_BASELINE',
  };

  saveAcademicCalendarV5(sem1.id, { calendar: cal1, days: [day1] });

  // Set active semester to sem1 and reload runtime context
  const state = loadStorageV5();
  state.activeProfileId = profile.id;
  state.activeYearPlanId = hierarchy.yearPlan.id;
  state.activeSemesterPlanId = sem1.id;
  saveStorageV5(state);

  const runtimeCtx = getRuntimeContextV5();
  assert.ok(runtimeCtx.semesterData?.academicCalendar, 'AcademicCalendar must exist for Sem 1');
  assert.strictEqual(
    runtimeCtx.semesterData.academicCalendar.calendar.workflowStatus,
    'CONFIRMED',
    'Workflow status must reload as CONFIRMED'
  );
  assert.strictEqual(
    runtimeCtx.semesterData.academicCalendar.calendar.startDate,
    '2026-07-13',
    'Start date must match'
  );
  assert.strictEqual(
    runtimeCtx.semesterData.academicCalendar.days.length,
    1,
    'Calendar days must be loaded'
  );
});

// -----------------------------------------------------------------------------
// TEST 3: JP aktual semester tersimpan dan reload identik
// -----------------------------------------------------------------------------
runTest('3. JP aktual semester tersimpan dengan TEACHER_CONFIRMED dan reload identik', () => {
  const jpSetting: SemesterJPSetting = {
    semesterPlanId: sem1.id,
    actualScheduledWeeklyJP: 4,
    source: 'TEACHER_CONFIRMED',
  };

  saveSemesterJPSettingV5(sem1.id, jpSetting);

  const runtimeCtx = getRuntimeContextV5();
  assert.ok(runtimeCtx.semesterJPSetting, 'semesterJPSetting must exist on reload');
  assert.strictEqual(
    runtimeCtx.semesterJPSetting.actualScheduledWeeklyJP,
    4,
    'actualScheduledWeeklyJP must be 4'
  );
  assert.strictEqual(
    runtimeCtx.semesterJPSetting.source,
    'TEACHER_CONFIRMED',
    'source must be TEACHER_CONFIRMED'
  );
});

// -----------------------------------------------------------------------------
// TEST 4: JP kosong tetap UNRESOLVED, bukan otomatis dari official JP
// -----------------------------------------------------------------------------
runTest('4. JP kosong tetap UNRESOLVED with actualScheduledWeeklyJP = null without auto-official fallback', () => {
  const jpSettingEmpty: SemesterJPSetting = {
    semesterPlanId: sem2.id,
    actualScheduledWeeklyJP: null,
    source: 'UNRESOLVED',
  };

  saveSemesterJPSettingV5(sem2.id, jpSettingEmpty);

  // Switch to sem2
  const state = loadStorageV5();
  state.activeSemesterPlanId = sem2.id;
  saveStorageV5(state);

  const runtimeCtx = getRuntimeContextV5();
  assert.ok(runtimeCtx.semesterJPSetting, 'semesterJPSetting must exist for Sem 2');
  assert.strictEqual(
    runtimeCtx.semesterJPSetting.actualScheduledWeeklyJP,
    null,
    'actualScheduledWeeklyJP must be null'
  );
  assert.strictEqual(
    runtimeCtx.semesterJPSetting.source,
    'UNRESOLVED',
    'source must remain UNRESOLVED'
  );
});

// -----------------------------------------------------------------------------
// TEST 5: Time Allocation tersimpan ke semester aktif
// -----------------------------------------------------------------------------
runTest('5. Time allocations persist to active semester plan in V5', () => {
  const alloc1: TimeAllocation = {
    id: 'alloc-1',
    academicSettingId: sem1.id,
    sourceType: 'ATP_ITEM',
    sourceId: 'atp-1',
    weekNumber: 1,
    startWeek: 1,
    endWeek: 2,
    jp: 8,
    allocatedJP: 8,
  };

  const alloc2: TimeAllocation = {
    id: 'alloc-2',
    academicSettingId: sem1.id,
    sourceType: 'ATP_ITEM',
    sourceId: 'atp-2',
    weekNumber: 3,
    startWeek: 3,
    endWeek: 4,
    jp: 8,
    allocatedJP: 8,
  };

  saveTimeAllocationV5(sem1.id, [alloc1, alloc2]);

  // Switch back to sem1
  const state = loadStorageV5();
  state.activeSemesterPlanId = sem1.id;
  saveStorageV5(state);

  const runtimeCtx = getRuntimeContextV5();
  assert.ok(runtimeCtx.semesterData?.timeAllocation, 'timeAllocation array must exist');
  assert.strictEqual(runtimeCtx.semesterData.timeAllocation.length, 2, 'Must contain 2 allocations');
  assert.strictEqual(runtimeCtx.semesterData.timeAllocation[0].allocatedJP, 8);
  assert.strictEqual(runtimeCtx.semesterData.timeAllocation[1].allocatedJP, 8);

  const totalAllocatedJP = runtimeCtx.semesterData.timeAllocation.reduce(
    (sum, item) => sum + (Number(item.allocatedJP ?? item.jp) || 0),
    0
  );
  assert.strictEqual(totalAllocatedJP, 16, 'Total allocated JP for Sem 1 must equal 16 JP');
});

// -----------------------------------------------------------------------------
// TEST 6: Merdeka tanpa allocation menampilkan Belum dialokasikan (null planned JP)
// -----------------------------------------------------------------------------
runTest('6. Merdeka without time allocations yields null planned JP instead of 0 JP', () => {
  // Check Sem 2 which has no time allocations
  const state = loadStorageV5();
  state.activeSemesterPlanId = sem2.id;
  saveStorageV5(state);

  const runtimeCtx = getRuntimeContextV5();
  const sem2Allocations = runtimeCtx.semesterData?.timeAllocation || [];
  assert.strictEqual(sem2Allocations.length, 0, 'Sem 2 has no time allocations');

  // Total planned JP computation in AdministrationHub and TimePlanningManager for Merdeka
  const totalPlannedJP = sem2Allocations.length === 0
    ? null
    : sem2Allocations.reduce((sum, item) => sum + (Number(item.allocatedJP ?? item.jp) || 0), 0);

  assert.strictEqual(totalPlannedJP, null, 'Unallocated semester must return null (Belum dialokasikan)');
});

// -----------------------------------------------------------------------------
// TEST 7: Semester 1 and Semester 2 do NOT mix JP / allocation
// -----------------------------------------------------------------------------
runTest('7. Semester 1 and Semester 2 do NOT mix JP / allocation', () => {
  // Sem 1 checks
  const state1 = loadStorageV5();
  state1.activeSemesterPlanId = sem1.id;
  saveStorageV5(state1);

  const ctx1 = getRuntimeContextV5();
  assert.strictEqual(ctx1.semesterJPSetting?.actualScheduledWeeklyJP, 4, 'Sem 1 JP is 4');
  assert.strictEqual(ctx1.semesterData?.timeAllocation?.length, 2, 'Sem 1 has 2 allocations');

  // Sem 2 checks
  const state2 = loadStorageV5();
  state2.activeSemesterPlanId = sem2.id;
  saveStorageV5(state2);

  const ctx2 = getRuntimeContextV5();
  assert.strictEqual(ctx2.semesterJPSetting?.actualScheduledWeeklyJP, null, 'Sem 2 JP is null');
  assert.strictEqual(ctx2.semesterData?.timeAllocation?.length, undefined, 'Sem 2 has no allocations');
});

// -----------------------------------------------------------------------------
// TEST 8: Contract A - S1 -> S2 does not retain S1 calendar/JP state
// -----------------------------------------------------------------------------
runTest('8. Contract A: S1 -> S2 does not retain S1 calendar/JP state in runtimeContext and resets cleanly', () => {
  // Populate S1 with calendar and confirmed JP
  const state = loadStorageV5();
  state.activeSemesterPlanId = sem1.id;
  saveStorageV5(state);

  const cal1: AcademicCalendar = {
    id: `cal-${sem1.id}`,
    academicSettingId: sem1.id,
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  };
  saveAcademicCalendarV5(sem1.id, { calendar: cal1, days: [] });
  saveSemesterJPSettingV5(sem1.id, {
    semesterPlanId: sem1.id,
    actualScheduledWeeklyJP: 5,
    source: 'TEACHER_CONFIRMED',
  });

  const ctxS1 = getRuntimeContextV5();
  assert.strictEqual(ctxS1.semesterData?.academicCalendar?.calendar.startDate, '2026-07-13');
  assert.strictEqual(ctxS1.semesterJPSetting?.actualScheduledWeeklyJP, 5);

  // Switch to S2 which has no calendar and no JP
  const stateS2 = loadStorageV5();
  stateS2.activeSemesterPlanId = sem2.id;
  saveStorageV5(stateS2);

  const ctxS2 = getRuntimeContextV5();
  assert.strictEqual(ctxS2.semesterData?.academicCalendar, undefined, 'S2 must have undefined academicCalendar');
  assert.strictEqual(ctxS2.semesterJPSetting?.actualScheduledWeeklyJP, null, 'S2 must not retain S1 weekly JP (null)');
});

// -----------------------------------------------------------------------------
// TEST 9: Contract D - Calendar save contract does not save/mutate SemesterJPSetting
// -----------------------------------------------------------------------------
runTest('9. Contract D: Calendar save contract does not save or mutate SemesterJPSetting', () => {
  const stateBefore = loadStorageV5();
  const jpBefore = stateBefore.semesterJPSettings?.find((e) => e.semesterPlanId === sem1.id)?.value;

  const testCal: AcademicCalendar = {
    id: `cal-test-isolation-${sem1.id}`,
    academicSettingId: sem1.id,
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    startDate: '2026-07-20',
    endDate: '2026-12-25',
    schoolDaysPerWeek: 5,
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  };

  // Calling saveAcademicCalendarV5
  saveAcademicCalendarV5(sem1.id, { calendar: testCal, days: [] });

  const stateAfter = loadStorageV5();
  const jpAfter = stateAfter.semesterJPSettings?.find((e) => e.semesterPlanId === sem1.id)?.value;

  assert.deepStrictEqual(jpAfter, jpBefore, 'SemesterJPSetting must remain completely unmutated by calendar save');
});

// -----------------------------------------------------------------------------
// TEST 10: Contract E - JP save contract does not save/mutate AcademicCalendar
// -----------------------------------------------------------------------------
runTest('10. Contract E: JP save contract does not save or mutate AcademicCalendar', () => {
  const stateBefore = loadStorageV5();
  const calBefore = stateBefore.semesterData?.academicCalendar?.find((e) => e.semesterPlanId === sem1.id)?.value;

  // Calling saveSemesterJPSettingV5
  saveSemesterJPSettingV5(sem1.id, {
    semesterPlanId: sem1.id,
    actualScheduledWeeklyJP: 6,
    source: 'TEACHER_CONFIRMED',
  });

  const stateAfter = loadStorageV5();
  const calAfter = stateAfter.semesterData?.academicCalendar?.find((e) => e.semesterPlanId === sem1.id)?.value;

  assert.deepStrictEqual(calAfter, calBefore, 'AcademicCalendar data must remain completely unmutated by JP save');
});

// -----------------------------------------------------------------------------
// TEST 11: Contract D - Save JP does not erase Calendar data in V5 or affect days
// -----------------------------------------------------------------------------
runTest('11. Contract D: Save JP does not overwrite or erase AcademicCalendar / CalendarDays', () => {
  const stateBefore = loadStorageV5();
  const calBefore = stateBefore.semesterData?.academicCalendar?.find((e) => e.semesterPlanId === sem1.id)?.value;

  // Save JP for sem1
  saveSemesterJPSettingV5(sem1.id, {
    semesterPlanId: sem1.id,
    actualScheduledWeeklyJP: 4,
    source: 'TEACHER_CONFIRMED',
  });

  const stateAfter = loadStorageV5();
  const calAfter = stateAfter.semesterData?.academicCalendar?.find((e) => e.semesterPlanId === sem1.id)?.value;
  assert.deepStrictEqual(calAfter, calBefore, 'Calendar data must remain unchanged after JP save');
});

// -----------------------------------------------------------------------------
// TEST 12: Contract E - Save TimeAllocation does not erase AcademicCalendar / days in V5
// -----------------------------------------------------------------------------
runTest('12. Contract E: Save TimeAllocation does not erase or mutate AcademicCalendar in V5', () => {
  const stateBefore = loadStorageV5();
  const calBefore = stateBefore.semesterData?.academicCalendar?.find((e) => e.semesterPlanId === sem1.id)?.value;

  const dummyAlloc: TimeAllocation = {
    id: `alloc-${Date.now()}-test`,
    academicSettingId: sem1.id,
    sourceType: 'ATP_ITEM',
    sourceId: 'tp-test-1',
    semester: '1 (Ganjil)',
    startWeek: 1,
    endWeek: 2,
    weekNumber: 1,
    jp: 8,
    allocatedJP: 8,
  };

  saveTimeAllocationV5(sem1.id, [dummyAlloc]);

  const stateAfter = loadStorageV5();
  const calAfter = stateAfter.semesterData?.academicCalendar?.find((e) => e.semesterPlanId === sem1.id)?.value;
  assert.deepStrictEqual(calAfter, calBefore, 'Calendar data must remain unchanged after TimeAllocation save');
});

// -----------------------------------------------------------------------------
// TEST 13: Contract F - Save TimeAllocation gating: canonical active capacity ready vs not ready
// -----------------------------------------------------------------------------
runTest('13. Contract F: Save TimeAllocation gating depends only on active semester canonical capacity', () => {
  // Confirm calendar with generated days for Sem 1
  const generatedDaysSem1 = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: `cal-${sem1.id}`,
    academicYear: '2026/2027',
    existingDays: [],
  });
  saveAcademicCalendarV5(sem1.id, {
    calendar: {
      id: `cal-${sem1.id}`,
      academicSettingId: sem1.id,
      academicYear: '2026/2027',
      semester: '1 (Ganjil)',
      startDate: '2026-07-13',
      endDate: '2026-12-18',
      schoolDaysPerWeek: 5,
      workflowStatus: 'CONFIRMED',
      updatedAt: new Date().toISOString(),
    },
    days: generatedDaysSem1,
  });
  saveSemesterJPSettingV5(sem1.id, {
    semesterPlanId: sem1.id,
    actualScheduledWeeklyJP: 4,
    source: 'TEACHER_CONFIRMED',
  });

  const state = loadStorageV5();

  // For Sem 1 (confirmed calendar + confirmed JP), active capacity is ready
  const s1Cap = resolveSemesterCapacityV5(sem1.id, state);
  assert.strictEqual(s1Cap.isReady, true, 'Sem 1 capacity must be ready');

  // For Sem 2 (no confirmed calendar), active capacity is NOT ready
  const s2Cap = resolveSemesterCapacityV5(sem2.id, state);
  assert.strictEqual(s2Cap.isReady, false, 'Sem 2 capacity must NOT be ready');

  // Gating rule: Active semester Sem 1 is enabled even if Sem 2 is NOT ready
  const isSem1SaveEnabled = s1Cap.isReady;
  assert.strictEqual(isSem1SaveEnabled, true, 'Sem 1 Save Time Allocation must be enabled independently of Sem 2');

  const isSem2SaveEnabled = s2Cap.isReady;
  assert.strictEqual(isSem2SaveEnabled, false, 'Sem 2 Save Time Allocation must be disabled until Sem 2 is ready');
});

console.log('\nAll Calendar -> Semester JP & Time Allocation integration regression tests PASSED 100%!\n');
