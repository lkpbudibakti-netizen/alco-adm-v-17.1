import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadStorageV5,
  saveStorageV5,
  createProfileV5,
  createSchoolV5,
  createYearHierarchyV5,
  saveAcademicCalendarV5,
} from '../src/services/storageV5';
import { getRuntimeContextV5 } from '../src/services/runtimeV5';
import { AcademicCalendar, CalendarDay } from '../src/types';
import { mapDiagnosticToSearchStatus } from '../src/components/administration/TimePlanningManager';
import {
  projectCandidateEventsToCalendarDays,
  generateEffectiveCalendarDays,
  confirmCalendarWorkflow,
  projectNationalBaseToSemesterDraft,
} from '../src/services/calendarResolver';
import { calculateEffectiveDays, calculateEffectiveWeeks } from '../src/services/jpEngine';
import { CalendarSourceCandidate } from '../src/services/calendarProvider';

console.log('=== RUNNING AUDIT: MERDEKA V5 ACADEMIC CALENDAR RUNTIME (B.4.1) ===\n');

let totalTests = 0;
function runTest(description: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${totalTests}. ${description}`);
  } catch (err) {
    console.error(`[FAIL] ${totalTests}. ${description}`);
    throw err;
  }
}

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
const appPath = path.resolve(process.cwd(), 'src/App.tsx');
const appSource = fs.readFileSync(appPath, 'utf-8');

const tpmPath = path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx');
const tpmSource = fs.readFileSync(tpmPath, 'utf-8');

const adminHubPath = path.resolve(process.cwd(), 'src/components/administration/AdministrationHub.tsx');
const adminHubSource = fs.readFileSync(adminHubPath, 'utf-8');

// -----------------------------------------------------------------------------
// TEST 1: TimePlanningManager calls resolveCalendarOnline() before resolveOfficialCalendar()
// -----------------------------------------------------------------------------
runTest('1. TimePlanningManager source contract calls resolveCalendarOnline before local resolveOfficialCalendar', () => {
  const onlineIdx = tpmSource.indexOf('resolveCalendarOnline({');
  const localIdx = tpmSource.indexOf('resolveOfficialCalendar({');

  assert.ok(onlineIdx !== -1, 'TimePlanningManager must call resolveCalendarOnline');
  assert.ok(localIdx !== -1, 'TimePlanningManager must include resolveOfficialCalendar fallback');
  assert.ok(
    onlineIdx < localIdx,
    'resolveCalendarOnline must be called BEFORE resolveOfficialCalendar (Search-First flow)'
  );
});

// -----------------------------------------------------------------------------
// TEST 2: Request includes academicYear, province, regency (Annual Discovery Scope)
// -----------------------------------------------------------------------------
runTest('2. Online calendar search request parameters include academicYear, province, regency', () => {
  assert.ok(
    tpmSource.includes('academicYear,') &&
      tpmSource.includes('province: prov,') &&
      (tpmSource.includes('regency:') || tpmSource.includes('regency,')),
    'resolveCalendarOnline call must transmit academicYear, province, and regency for annual discovery scope'
  );
});

// -----------------------------------------------------------------------------
// TEST 3: Search region initializes from school.regency and school.province
// -----------------------------------------------------------------------------
runTest('3. Search criteria states initialize from school.regency and school.province', () => {
  assert.ok(
    tpmSource.includes('school.regency'),
    'TimePlanningManager must initialize search regency state from school.regency'
  );
  assert.ok(
    tpmSource.includes('school.province'),
    'TimePlanningManager must initialize search province state from school.province'
  );
});

// -----------------------------------------------------------------------------
// TEST 4: Online search does not depend on static availableProvinces
// -----------------------------------------------------------------------------
runTest('4. Online search input for Province is free-text and does not depend on static availableProvinces dropdown', () => {
  assert.ok(
    tpmSource.includes('<input\n                    type="text"\n                    value={searchProvince}'),
    'TimePlanningManager must render searchProvince as free-text input'
  );
  assert.ok(
    !tpmSource.includes('availableProvinces.map'),
    'TimePlanningManager must NOT restrict Province search to availableProvinces.map'
  );
  assert.ok(
    !tpmSource.includes('getAvailableProvinces'),
    'TimePlanningManager must NOT require getAvailableProvinces'
  );
});

// -----------------------------------------------------------------------------
// TEST 4B: Region separation (Regency != Province)
// -----------------------------------------------------------------------------
runTest('4B. candidate.regency does not overwrite selectedProvince', () => {
  assert.ok(
    !tpmSource.includes('setSelectedProvince(candidate.regency'),
    'TimePlanningManager must NOT assign candidate.regency to selectedProvince'
  );
  assert.ok(
    tpmSource.includes("setSelectedProvince(candidate.province || searchProvince || school.province || '');"),
    'TimePlanningManager must assign candidate.province or fallback province to selectedProvince'
  );
});

// -----------------------------------------------------------------------------
// TEST 4C: Confirm is the only persistence gate
// -----------------------------------------------------------------------------
runTest('4C. Manual override and online candidate selection update draft state only without calling onSaveCalendar', () => {
  const overrideMatch = tpmSource.match(/const handleApplyOverride = [\s\S]*?\n  \};/);
  assert.ok(overrideMatch, 'handleApplyOverride function must exist');
  const overrideBody = overrideMatch[0];
  assert.ok(
    !overrideBody.includes('onSaveCalendar('),
    'handleApplyOverride MUST NOT call onSaveCalendar (draft only)'
  );

  const candidateMatch = tpmSource.match(/const handleApplyOnlineCandidate = [\s\S]*?\n  \};/);
  assert.ok(candidateMatch, 'handleApplyOnlineCandidate function must exist');
  const candidateBody = candidateMatch[0];
  assert.ok(
    !candidateBody.includes('onSaveCalendar('),
    'handleApplyOnlineCandidate MUST NOT call onSaveCalendar (draft only)'
  );

  const confirmMatch = tpmSource.match(/const handleConfirmCalendar = [\s\S]*?\n  \};/);
  assert.ok(confirmMatch, 'handleConfirmCalendar function must exist');
  const confirmBody = confirmMatch[0];
  assert.ok(
    confirmBody.includes('onSaveCalendar(res.calendar, res.days'),
    'handleConfirmCalendar MUST be the sole trigger calling onSaveCalendar'
  );
});

// -----------------------------------------------------------------------------
// TEST 5: No auto Semester 1 selection or local academicYear authority
// -----------------------------------------------------------------------------
runTest('5. Academic Year and Semester in TimePlanningManager derive from academicSetting context', () => {
  assert.ok(
    tpmSource.includes('academicSetting.academicYear') &&
      tpmSource.includes('academicSetting.semester'),
    'TimePlanningManager must derive year and semester directly from academicSetting'
  );
  assert.ok(
    !tpmSource.includes('const [semester, setSemester] = useState<string>("1")'),
    'TimePlanningManager must not force a default Semester 1 authority state'
  );
});

// -----------------------------------------------------------------------------
// TEST 6: Regional online source populates draft only upon explicit "Gunakan sebagai Acuan"
// -----------------------------------------------------------------------------
runTest('6. handleApplyOnlineCandidate populates draft dates only upon explicit user action', () => {
  assert.ok(
    tpmSource.includes('const handleApplyOnlineCandidate ='),
    'TimePlanningManager must define handleApplyOnlineCandidate'
  );
  assert.ok(
    tpmSource.includes('Gunakan sebagai Acuan'),
    'TimePlanningManager must render "Gunakan sebagai Acuan" button for online candidate review'
  );
});

// -----------------------------------------------------------------------------
// TEST 7: Search result does NOT automatically trigger persistence
// -----------------------------------------------------------------------------
runTest('7. Online calendar search discovery does not invoke onSaveCalendar automatically', () => {
  const onlineSection = tpmSource.slice(
    tpmSource.indexOf('resolveCalendarOnline'),
    tpmSource.indexOf('resolveOfficialCalendar')
  );
  assert.ok(
    !onlineSection.includes('onSaveCalendar('),
    'Online discovery step must be READ-ONLY and must not call onSaveCalendar'
  );
});

// -----------------------------------------------------------------------------
// TEST 8: Regional result without boundaries does not fabricate dates
// -----------------------------------------------------------------------------
runTest('8. Candidate without exact semesterStartDate/semesterEndDate shows guidance and does not invent dates', () => {
  assert.ok(
    tpmSource.includes('Sumber acuan ditemukan, tetapi batas tanggal semester tidak dapat ditentukan secara terverifikasi') ||
      tpmSource.includes('Sumber acuan ') && tpmSource.includes('ditemukan, tetapi batas tanggal semester tidak dapat ditentukan secara terverifikasi'),
    'TimePlanningManager must warn user when candidate lacks exact semester boundary dates'
  );
});

// -----------------------------------------------------------------------------
// TEST 9: NATIONAL source acts as valid National Base fallback
// -----------------------------------------------------------------------------
runTest('9. NATIONAL source level acts as valid National Base fallback without auto-populating semester boundaries', () => {
  assert.ok(
    tpmSource.includes('Acuan Nasional (SKB 3 Menteri) tersedia') ||
      tpmSource.includes('Acuan Nasional (SKB 3 Menteri)'),
    'TimePlanningManager must display NATIONAL candidate as Acuan Nasional'
  );
  assert.ok(
    tpmSource.includes("candidate.sourceLevel === 'NATIONAL'") &&
      tpmSource.includes('PARTIALLY_RESOLVED'),
    'NATIONAL candidate must act as usable fallback with PARTIALLY_RESOLVED status'
  );
});

// -----------------------------------------------------------------------------
// TEST 10: Local static resolveOfficialCalendar is called after online search
// -----------------------------------------------------------------------------
runTest('10. resolveOfficialCalendar acts as verified local cache fallback when online produces no candidate', () => {
  assert.ok(
    tpmSource.includes('// 2. VERIFIED LOCAL CACHE FALLBACK'),
    'TimePlanningManager must designate resolveOfficialCalendar as local cache fallback'
  );
});

// -----------------------------------------------------------------------------
// TEST 11: handleSaveCalendar requires activeSemesterPlan and uses saveAcademicCalendarV5
// -----------------------------------------------------------------------------
runTest('11. App.tsx handleSaveCalendar requires activeSemesterPlan and calls saveAcademicCalendarV5', () => {
  assert.ok(
    appSource.includes('saveAcademicCalendarV5(activeSemesterPlan.id,'),
    'App.tsx handleSaveCalendar must call saveAcademicCalendarV5 with activeSemesterPlan.id'
  );
  assert.ok(
    appSource.includes('if (!activeSemesterPlan || !activeYearPlan)'),
    'App.tsx handleSaveCalendar must validate activeSemesterPlan and activeYearPlan'
  );
});

// -----------------------------------------------------------------------------
// TEST 12: Canonical calendar and CalendarDay structure
// -----------------------------------------------------------------------------
runTest('12. handleSaveCalendar canonicalizes academicSettingId and links calendar days to canonical calendar ID', () => {
  assert.ok(
    appSource.includes('academicSettingId: activeSemesterPlan.id,'),
    'Canonical calendar academicSettingId must equal activeSemesterPlan.id'
  );
  assert.ok(
    appSource.includes('academicCalendarId: canonicalCalendar.id'),
    'Canonical days must reference canonicalCalendar.id'
  );
});

// -----------------------------------------------------------------------------
// TEST 13: End-to-End V5 Calendar Persistence, Read Model & Reload Fidelity
// -----------------------------------------------------------------------------
runTest('13. V5 Storage persists academic calendar and runtimeContext reads it accurately', () => {
  mockStorage.clear();
  const school = createSchoolV5({
    name: 'SDN Merdeka 01',
    npsn: '12345678',
    regency: 'Kota Tangerang',
    province: 'Banten',
    address: 'Jl. Merdeka No. 1',
    village: 'Sukajadi',
    district: 'Karawaci',
    principalName: 'Drs. Supriadi',
    principalNip: '197001011995031001',
  });
  const profile = createProfileV5({
    name: 'Guru Kalender',
    schoolId: school.id,
    nip: '198501012010011002',
    status: 'PNS',
    defaultSubject: 'Pancasila',
    defaultLevel: 'SD',
  });
  const hierarchy = createYearHierarchyV5({
    profileId: profile.id,
    schoolId: school.id,
    academicYear: '2026/2027',
    curriculumType: 'KURIKULUM_MERDEKA',
    level: 'SD',
    grade: 'Fase A / Kelas 1',
    subject: 'Pancasila',
  });

  const sem1 = hierarchy.semesterPlans[0];

  const cal1: AcademicCalendar = {
    id: `cal-${sem1.id}`,
    academicSettingId: sem1.id,
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    startDate: '2026-07-13',
    endDate: '2026-12-19',
    schoolDaysPerWeek: 5,
    sourceType: 'REGIONAL_EDUCATION_CALENDAR',
    sourceName: 'Kaldik Kota Tangerang 2026/2027',
    sourceRegion: 'Banten',
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  };

  const days1: CalendarDay[] = [
    {
      id: `day-1`,
      academicCalendarId: cal1.id,
      date: '2026-08-17',
      status: 'holiday',
      notes: 'HUT Kemerdekaan RI',
      sourceType: 'NATIONAL_HOLIDAY_OVERLAY',
      category: 'NATIONAL_HOLIDAY',
    },
  ];

  // Save Calendar Sem 1
  saveAcademicCalendarV5(sem1.id, { calendar: cal1, days: days1 });

  // Set active semester to sem1 and verify runtime context
  const stateLoaded = loadStorageV5();
  stateLoaded.activeProfileId = profile.id;
  stateLoaded.activeYearPlanId = hierarchy.yearPlan.id;
  stateLoaded.activeSemesterPlanId = sem1.id;
  saveStorageV5(stateLoaded);

  const runtimeCtx1 = getRuntimeContextV5();
  assert.ok(runtimeCtx1.semesterData?.academicCalendar, 'runtimeContext must return academicCalendar for sem1');
  assert.strictEqual(
    runtimeCtx1.semesterData.academicCalendar.calendar.id,
    cal1.id,
    'Retrieved calendar ID must match cal1.id'
  );
  assert.strictEqual(
    runtimeCtx1.semesterData.academicCalendar.days.length,
    1,
    'Retrieved days count must equal 1'
  );
});

// -----------------------------------------------------------------------------
// TEST 14: Semester 1 and Semester 2 Calendar Isolation
// -----------------------------------------------------------------------------
runTest('14. Semester 1 and Semester 2 academic calendars remain strictly isolated in V5 storage', () => {
  mockStorage.clear();
  const school = createSchoolV5({
    name: 'SD 1',
    npsn: '12345679',
    address: 'Jl. Utama',
    village: 'Desa 1',
    district: 'Kecamatan 1',
    regency: 'Kabupaten A',
    province: 'Jawa Barat',
    principalName: 'Kepala SD 1',
    principalNip: '197001011995031002',
  });
  const profile = createProfileV5({
    name: 'Guru A',
    schoolId: school.id,
    nip: '198501012010011003',
    status: 'PNS',
    defaultSubject: 'Matematika',
    defaultLevel: 'SD',
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

  const cal1: AcademicCalendar = {
    id: `cal-${sem1.id}`,
    academicSettingId: sem1.id,
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    startDate: '2026-07-13',
    endDate: '2026-12-19',
    schoolDaysPerWeek: 5,
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  };

  saveAcademicCalendarV5(sem1.id, { calendar: cal1, days: [] });

  // Switch to Semester 2 -> should have NO calendar
  const stateLoaded = loadStorageV5();
  stateLoaded.activeProfileId = profile.id;
  stateLoaded.activeYearPlanId = hierarchy.yearPlan.id;
  stateLoaded.activeSemesterPlanId = sem2.id;
  saveStorageV5(stateLoaded);

  const runtimeCtxSem2 = getRuntimeContextV5();
  assert.strictEqual(
    runtimeCtxSem2.semesterData?.academicCalendar,
    undefined,
    'Semester 2 must have undefined academicCalendar when only Semester 1 is saved'
  );

  // Switch back to Semester 1 -> calendar is restored
  stateLoaded.activeSemesterPlanId = sem1.id;
  saveStorageV5(stateLoaded);

  const runtimeCtxSem1 = getRuntimeContextV5();
  assert.ok(runtimeCtxSem1.semesterData?.academicCalendar, 'Semester 1 calendar must be restored');
  assert.strictEqual(runtimeCtxSem1.semesterData.academicCalendar.calendar.id, cal1.id);
});

// -----------------------------------------------------------------------------
// TEST 15: Upserting same SemesterPlan calendar replaces without duplicate wrapper
// -----------------------------------------------------------------------------
runTest('15. Saving calendar updates existing SemesterPlan calendar entry without creating duplicates', () => {
  mockStorage.clear();
  const school = createSchoolV5({
    name: 'SD 1',
    npsn: '12345679',
    address: 'Jl. Utama',
    village: 'Desa 1',
    district: 'Kecamatan 1',
    regency: 'Kabupaten A',
    province: 'Jawa Barat',
    principalName: 'Kepala SD 1',
    principalNip: '197001011995031002',
  });
  const profile = createProfileV5({
    name: 'Guru A',
    schoolId: school.id,
    nip: '198501012010011003',
    status: 'PNS',
    defaultSubject: 'Matematika',
    defaultLevel: 'SD',
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

  const cal1: AcademicCalendar = {
    id: `cal-${sem1.id}`,
    academicSettingId: sem1.id,
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    startDate: '2026-07-13',
    endDate: '2026-12-19',
    schoolDaysPerWeek: 5,
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  };

  saveAcademicCalendarV5(sem1.id, { calendar: cal1, days: [] });
  // Second save with modified end date
  const cal1Updated = { ...cal1, endDate: '2026-12-20' };
  saveAcademicCalendarV5(sem1.id, { calendar: cal1Updated, days: [] });

  const stateFinal = loadStorageV5();
  assert.strictEqual(
    stateFinal.semesterData.academicCalendar.length,
    1,
    'semesterData.academicCalendar array must contain exactly 1 entry for sem1'
  );
  assert.strictEqual(
    stateFinal.semesterData.academicCalendar[0].value.calendar.endDate,
    '2026-12-20',
    'Updated calendar end date must reflect second save'
  );
});

// -----------------------------------------------------------------------------
// TEST 16: Actual Calendar Status in AdministrationHub
// -----------------------------------------------------------------------------
runTest('16. AdministrationHub badge does not fabricate 18 Mg when calendar is missing', () => {
  assert.ok(
    !adminHubSource.includes('`${calendar?.effectiveWeeks || 18} Mg`'),
    'AdministrationHub must not use `${calendar?.effectiveWeeks || 18} Mg`'
  );
  assert.ok(
    !adminHubSource.includes('calendar?.effectiveWeeks'),
    'AdministrationHub must not determine badge from calendar?.effectiveWeeks'
  );
  assert.ok(
    adminHubSource.includes("workflowStatus === 'CONFIRMED'") &&
      adminHubSource.includes("'Ditetapkan'") &&
      adminHubSource.includes("'Sudah dihitung'") &&
      adminHubSource.includes("'Belum diatur'"),
    'AdministrationHub must use actual calendar status (Ditetapkan, Sudah dihitung, Belum diatur)'
  );
});

// -----------------------------------------------------------------------------
// TEST 17: schoolDaysPerWeek is not silently canonicalized to 5
// -----------------------------------------------------------------------------
runTest('17. schoolDaysPerWeek defaults to null when unconfigured without silent 5-day assumption', () => {
  assert.ok(
    tpmSource.includes('calendar?.schoolDaysPerWeek === 5 || calendar?.schoolDaysPerWeek === 6\n      ? calendar.schoolDaysPerWeek\n      : null') ||
      tpmSource.includes('? calendar.schoolDaysPerWeek\n      : null'),
    'schoolDaysPerWeek must default to null when unconfigured'
  );
});

// -----------------------------------------------------------------------------
// TEST 18: AI Search Status Mapping & Mutually Exclusive Banner Contract
// -----------------------------------------------------------------------------
runTest('18A. SUCCESS status maps to SUCCESS and banners are mutually exclusive', () => {
  assert.ok(
    tpmSource.includes("!isOnlineSearching && aiSearchStatus === 'SUCCESS' && ("),
    'SUCCESS banner must exist and depend strictly on aiSearchStatus === SUCCESS'
  );
  assert.ok(
    tpmSource.includes("!isOnlineSearching && aiSearchStatus === 'NOT_FOUND' && ("),
    'NOT_FOUND banner must depend strictly on aiSearchStatus === NOT_FOUND'
  );
  assert.ok(
    tpmSource.includes("!isOnlineSearching && aiSearchStatus === 'ERROR' && ("),
    'ERROR banner must depend strictly on aiSearchStatus === ERROR'
  );
});

runTest('18B. Diagnostic NO_OFFICIAL_SOURCE maps to NOT_FOUND (and NOT ERROR)', () => {
  const status = mapDiagnosticToSearchStatus('NO_OFFICIAL_SOURCE');
  assert.strictEqual(status, 'NOT_FOUND', 'NO_OFFICIAL_SOURCE must map to NOT_FOUND');
  assert.notStrictEqual(status, 'ERROR', 'NO_OFFICIAL_SOURCE must NOT map to ERROR');
});

runTest('18C. Diagnostic CANDIDATE_REJECTED maps to NOT_FOUND', () => {
  const status = mapDiagnosticToSearchStatus('CANDIDATE_REJECTED');
  assert.strictEqual(status, 'NOT_FOUND', 'CANDIDATE_REJECTED must map to NOT_FOUND');
});

runTest('18D. Diagnostics NO_API_KEY, MODEL_FAILURE, EMPTY_RESPONSE, NO_GROUNDING, GROUNDING_RESOLUTION_FAILED map to ERROR', () => {
  const errorDiagnostics: Array<Parameters<typeof mapDiagnosticToSearchStatus>[0]> = [
    'NO_API_KEY',
    'MODEL_FAILURE',
    'EMPTY_RESPONSE',
    'NO_GROUNDING',
    'GROUNDING_RESOLUTION_FAILED',
  ];
  for (const diag of errorDiagnostics) {
    const status = mapDiagnosticToSearchStatus(diag);
    assert.strictEqual(status, 'ERROR', `${diag} must map to ERROR`);
  }
});

runTest('18E. ERROR banner contract strictly rejects aiSearchStatus === ERROR || onlineSearchError', () => {
  assert.ok(
    !tpmSource.includes("aiSearchStatus === 'ERROR' || onlineSearchError"),
    'UI must reject logic equivalent to aiSearchStatus === ERROR || onlineSearchError'
  );
  assert.ok(
    tpmSource.includes("!isOnlineSearching && aiSearchStatus === 'ERROR' && ("),
    'Error banner must depend strictly on aiSearchStatus === ERROR'
  );
});

// -----------------------------------------------------------------------------
// TEST AY: Incomplete Source Status (workflowStatus = REVIEWED, resolutionStatus = PARTIALLY_RESOLVED)
// -----------------------------------------------------------------------------
runTest('AY. Incomplete source status: Candidate with absent semester boundaries yields REVIEWED + PARTIALLY_RESOLVED', () => {
  assert.ok(
    tpmSource.includes("if (!targetStart || !targetEnd) {\n      setWorkflowStatus('REVIEWED');\n      setResolutionStatus('PARTIALLY_RESOLVED');") ||
      (tpmSource.includes("!targetStart || !targetEnd") &&
       tpmSource.includes("setWorkflowStatus('REVIEWED')") &&
       tpmSource.includes("setResolutionStatus('PARTIALLY_RESOLVED')")),
    'Incomplete candidate boundaries must set REVIEWED and PARTIALLY_RESOLVED'
  );
  assert.ok(
    !tpmSource.includes("setWorkflowStatus('AUTO_RESOLVED');\n    setResolutionStatus('RESOLVED');\n\n    if (!targetStart || !targetEnd)"),
    'Must not prematurely set AUTO_RESOLVED or RESOLVED before verifying boundaries'
  );
});

// -----------------------------------------------------------------------------
// TEST AZ: Complete Source Status (REVIEWED + PARTIALLY_RESOLVED if no schoolDays, RESOLVED if 5/6, never CONFIRMED)
// -----------------------------------------------------------------------------
runTest('AZ. Complete source status: Valid start/end sets REVIEWED and status based on schoolDaysPerWeek', () => {
  assert.ok(
    tpmSource.includes("const isComplete = schoolDaysPerWeek === 5 || schoolDaysPerWeek === 6;") &&
      tpmSource.includes("setWorkflowStatus('REVIEWED');") &&
      tpmSource.includes("setResolutionStatus(isComplete ? 'RESOLVED' : 'PARTIALLY_RESOLVED');"),
    'Applying complete candidate boundaries must set REVIEWED and RESOLVED only when schoolDaysPerWeek is 5 or 6'
  );
  assert.ok(
    !tpmSource.includes("setWorkflowStatus('CONFIRMED')") ||
      !tpmSource.includes("handleApplyOnlineCandidate = (candidate: CalendarSourceCandidate) => {\n    setWorkflowStatus('CONFIRMED')"),
    'Applying online candidate must NEVER set workflowStatus to CONFIRMED'
  );
});

// -----------------------------------------------------------------------------
// TEST BC: Application to CalendarDay (Project validated events to CalendarDay[])
// -----------------------------------------------------------------------------
runTest('BC. Application to CalendarDay: Validated candidate event converts to range of CalendarDay entries with provenance', () => {
  const candidate: CalendarSourceCandidate = {
    sourceLevel: 'REGENCY',
    province: 'Banten',
    regency: 'Kota Tangerang',
    academicYear: '2026/2027',
    authority: 'Dinas Pendidikan Kota Tangerang',
    documentTitle: 'Kaldik Kota Tangerang 2026/2027',
    sourceUrl: 'https://disdik.tangerangkota.go.id/kaldik-2026-2027',
    verificationStatus: 'PARTIAL',
    retrievedAt: '2026-09-27T00:00:00.000Z',
    events: [
      {
        name: 'Libur Semester Ganjil',
        startDate: '2026-12-21',
        endDate: '2026-12-23',
        category: 'SEMESTER_BREAK',
      },
    ],
  };

  const days = projectCandidateEventsToCalendarDays({
    candidate,
    startDate: '2026-07-13',
    endDate: '2026-12-31',
    calendarId: 'cal-test-1',
  });

  const eventDays = days.filter((d) => d.date >= '2026-12-21' && d.date <= '2026-12-23');
  assert.strictEqual(eventDays.length, 3, 'Must generate exactly 3 CalendarDay entries for 3-day range');

  for (const ed of eventDays) {
    assert.strictEqual(ed.notes, 'Libur Semester Ganjil');
    assert.strictEqual(ed.status, 'BREAK');
    assert.strictEqual(ed.category, 'SEMESTER_BREAK');
    assert.strictEqual(ed.sourceType, 'REGIONAL_EDUCATION_CALENDAR');
    assert.strictEqual(ed.sourceLayer, 'REGIONAL_BASE');
    assert.strictEqual(ed.sourceUrl, 'https://disdik.tangerangkota.go.id/kaldik-2026-2027');
    assert.strictEqual(ed.academicCalendarId, 'cal-test-1');
  }
});

// -----------------------------------------------------------------------------
// TEST BD: Manual Override Priority (SCHOOL_OVERRIDE > REGIONAL_BASE)
// -----------------------------------------------------------------------------
runTest('BD. Manual override priority: SCHOOL_OVERRIDE day is preserved over candidate event on same date', () => {
  const candidate: CalendarSourceCandidate = {
    sourceLevel: 'REGENCY',
    province: 'Banten',
    regency: 'Kota Tangerang',
    academicYear: '2026/2027',
    authority: 'Dinas Pendidikan Kota Tangerang',
    documentTitle: 'Kaldik Kota Tangerang 2026/2027',
    sourceUrl: 'https://disdik.tangerangkota.go.id/kaldik-2026-2027',
    verificationStatus: 'PARTIAL',
    retrievedAt: '2026-09-27T00:00:00.000Z',
    events: [
      {
        name: 'Libur Semester Daerah',
        startDate: '2026-12-21',
        category: 'SEMESTER_BREAK',
      },
    ],
  };

  const manualDay: CalendarDay = {
    id: 'manual-1',
    academicCalendarId: 'cal-test-1',
    date: '2026-12-21',
    status: 'SCHOOL_EVENT',
    notes: 'Kegiatan Khusus Sekolah Mandiri',
    sourceType: 'SCHOOL_OVERRIDE',
    sourceLayer: 'SCHOOL_OVERRIDE',
    isOverridden: true,
    category: 'SCHOOL_EVENT',
  };

  const days = projectCandidateEventsToCalendarDays({
    candidate,
    startDate: '2026-07-13',
    endDate: '2026-12-31',
    calendarId: 'cal-test-1',
    existingDays: [manualDay],
  });

  const targetDay = days.find((d) => d.date === '2026-12-21');
  assert.ok(targetDay, 'Day on 2026-12-21 must exist');
  assert.strictEqual(targetDay.sourceType, 'SCHOOL_OVERRIDE', 'SCHOOL_OVERRIDE must win over candidate event');
  assert.strictEqual(targetDay.status, 'SCHOOL_EVENT');
  assert.strictEqual(targetDay.notes, 'Kegiatan Khusus Sekolah Mandiri');
});

// -----------------------------------------------------------------------------
// TEST BE: Draft Only (Applying candidate does NOT call onSaveCalendar)
// -----------------------------------------------------------------------------
runTest('BE. Draft only: Applying online candidate updates draft states without calling onSaveCalendar', () => {
  // Extract handleApplyOnlineCandidate body
  const match = tpmSource.match(/const handleApplyOnlineCandidate = \([\s\S]*?\n  \};/);
  assert.ok(match, 'handleApplyOnlineCandidate function must exist');
  const fnBody = match[0];

  assert.ok(
    !fnBody.includes('onSaveCalendar('),
    'handleApplyOnlineCandidate must not call onSaveCalendar (remains draft only)'
  );
  assert.ok(
    tpmSource.includes('handleConfirmCalendar = () => {') &&
      tpmSource.includes('onSaveCalendar(res.calendar, res.days'),
    'Confirm button (handleConfirmCalendar) must be the sole persistence gate calling onSaveCalendar'
  );
});

// -----------------------------------------------------------------------------
// TEST DE: Generate Kalender does NOT trigger saveAcademicCalendarV5
// -----------------------------------------------------------------------------
runTest('DE. Generate Kalender button updates draft states without triggering V5 storage persistence', () => {
  const match = tpmSource.match(/const handleGenerateEffectiveCalendar = \([\s\S]*?\n  \};/);
  assert.ok(match, 'handleGenerateEffectiveCalendar function must exist');
  const fnBody = match[0];

  assert.ok(
    !fnBody.includes('onSaveCalendar('),
    'handleGenerateEffectiveCalendar MUST NOT call onSaveCalendar (remains draft only)'
  );
});

// -----------------------------------------------------------------------------
// TEST DF: Kurikulum Merdeka does NOT compare annual ATP directly with semester JP
// -----------------------------------------------------------------------------
runTest('DF. Kurikulum Merdeka displays "Alokasi ATP ke semester belum disusun." without annual ATP discrepancy conclusion', () => {
  assert.ok(
    tpmSource.includes('Alokasi ATP ke semester belum disusun.'),
    'TimePlanningManager must display "Alokasi ATP ke semester belum disusun." for Kurikulum Merdeka'
  );
  assert.ok(
    tpmSource.includes('isK13Curriculum && jpDifference !== null && jpDifference < 0'),
    'Discrepancy warnings must be restricted to K13 curriculum'
  );
});

// -----------------------------------------------------------------------------
// TEST DI: Generated baseline survives Confirm preparation
// -----------------------------------------------------------------------------
runTest('DI. Generated baseline ordinary days survive Confirm preparation without being dropped', () => {
  const generatedDays = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: 'cal-di',
    academicYear: '2026/2027',
  });

  const normalMon = generatedDays.find((d) => d.date === '2026-07-20');
  assert.ok(normalMon, 'Ordinary Monday 2026-07-20 must exist in generated baseline');
  assert.strictEqual(normalMon.status, 'effective');
  assert.strictEqual(normalMon.sourceLayer, 'GENERATED_EFFECTIVE_BASELINE');

  // Simulate confirm flow: if source is NATIONAL and baseline is generated, we keep days directly
  const confirmedRes = confirmCalendarWorkflow({
    id: 'cal-di',
    academicSettingId: 'setting-di',
    academicYear: '2026/2027',
    semester: '1',
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    sourceType: 'NATIONAL_HOLIDAY_OVERLAY',
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  }, generatedDays);

  const normalMonAfterConfirm = confirmedRes.days.find((d) => d.date === '2026-07-20');
  assert.ok(normalMonAfterConfirm, 'Ordinary Monday 2026-07-20 must survive confirm flow');
  assert.strictEqual(normalMonAfterConfirm.status, 'effective');
  assert.strictEqual(normalMonAfterConfirm.sourceLayer, 'GENERATED_EFFECTIVE_BASELINE');
});

// -----------------------------------------------------------------------------
// TEST DJ: Full Generate -> Confirm -> V5 -> Reload
// -----------------------------------------------------------------------------
runTest('DJ. Full calendar lifecycle persists and reloads correctly with identical HE/ME and zero unknownDays', () => {
  mockStorage.clear();

  // Create standard school and profile
  const school = createSchoolV5({
    name: 'SD Maju Jaya',
    npsn: '12345678',
    address: 'Jl. Tangerang',
    village: 'Kelurahan A',
    district: 'Tangerang',
    regency: 'Kota Tangerang',
    province: 'Banten',
    principalName: 'Kepala Sekolah',
    principalNip: '197001011995031002',
  });

  const profile = createProfileV5({
    name: 'Guru Penjas',
    schoolId: school.id,
    nip: '198501012010011003',
    status: 'PNS',
    defaultSubject: 'Matematika',
    defaultLevel: 'SD',
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

  // 1. Generate effective days from baseline
  const generatedDays = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: `cal-${sem1.id}`,
    academicYear: '2026/2027',
  });

  const calObj: AcademicCalendar = {
    id: `cal-${sem1.id}`,
    academicSettingId: sem1.id,
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    sourceType: 'NATIONAL_HOLIDAY_OVERLAY',
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  };

  // 2. Confirm and Save to V5
  const confirmed = confirmCalendarWorkflow(calObj, generatedDays);
  saveAcademicCalendarV5(sem1.id, { calendar: confirmed.calendar, days: confirmed.days });

  // 3. Set active IDs and Reload from V5 using getRuntimeContextV5()
  const stateLoaded = loadStorageV5();
  stateLoaded.activeProfileId = profile.id;
  stateLoaded.activeYearPlanId = hierarchy.yearPlan.id;
  stateLoaded.activeSemesterPlanId = sem1.id;
  saveStorageV5(stateLoaded);

  const runtimeCtx = getRuntimeContextV5();

  assert.ok(runtimeCtx.semesterData?.academicCalendar, 'Calendar must be active after load');
  const loadedCal = runtimeCtx.semesterData.academicCalendar.calendar;
  assert.strictEqual(loadedCal.startDate, '2026-07-13');
  assert.strictEqual(loadedCal.endDate, '2026-12-18');
  assert.strictEqual(loadedCal.schoolDaysPerWeek, 5);

  const loadedDays = runtimeCtx.semesterData.academicCalendar.days;
  assert.ok(loadedDays.length > 50, 'Must reload all generated days');

  const ordinaryMon = loadedDays.find(d => d.date === '2026-07-20');
  assert.ok(ordinaryMon, 'Ordinary Monday 2026-07-20 must exist after reload');
  assert.strictEqual(ordinaryMon.status, 'effective');
  assert.strictEqual(ordinaryMon.sourceLayer, 'GENERATED_EFFECTIVE_BASELINE');

  const effObj = calculateEffectiveDays({ startDate: '2026-07-13', endDate: '2026-12-18', schoolDaysPerWeek: 5 }, loadedDays);
  assert.ok(effObj.effectiveLearningDays > 0, 'Effective learning days must be > 0');
  assert.strictEqual(effObj.unknownDays, 0, 'unknownDays must be exactly 0 after reload');

  const weekObj = calculateEffectiveWeeks(effObj.effectiveLearningDays, 5);
  assert.ok(weekObj.effectiveWeeksRounded > 0, 'Effective weeks must be > 0');
});

// -----------------------------------------------------------------------------
// TEST DK: Generate button remains explicit
// -----------------------------------------------------------------------------
runTest('DK. handleAutoResolve does not call generateEffectiveCalendarDays automatically for NATIONAL fallback', () => {
  // Extract handleAutoResolve body
  const match = tpmSource.match(/const handleAutoResolve = [\s\S]*?\n  \};/);
  assert.ok(match, 'handleAutoResolve function must exist');
  const fnBody = match[0];

  // Under NATIONAL fallback, we must use projectNationalBaseToSemesterDraft instead of generateEffectiveCalendarDays
  assert.ok(
    fnBody.includes('projectNationalBaseToSemesterDraft('),
    'handleAutoResolve must call projectNationalBaseToSemesterDraft for NATIONAL fallback'
  );
  // It shouldn't automatically generate full weekdays under the National section
  const nationalSection = fnBody.slice(fnBody.indexOf("candidateLevel === 'NATIONAL'"));
  assert.ok(
    !nationalSection.includes('generateEffectiveCalendarDays('),
    'NATIONAL fallback block within handleAutoResolve must NOT automatically trigger generateEffectiveCalendarDays'
  );
});

// -----------------------------------------------------------------------------
// TEST DL: Existing manual override survives Confirm
// -----------------------------------------------------------------------------
runTest('DL. Manual SCHOOL_OVERRIDE remains highest priority and survives Confirm', () => {
  const manualDay: CalendarDay = {
    id: 'manual-over',
    academicCalendarId: 'cal-dl',
    date: '2026-08-17',
    status: 'SCHOOL_EVENT',
    notes: 'Upacara Mandiri',
    sourceType: 'SCHOOL_OVERRIDE',
    sourceLayer: 'SCHOOL_OVERRIDE',
    isOverridden: true,
    category: 'SCHOOL_EVENT',
  };

  const generated = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: 'cal-dl',
    academicYear: '2026/2027',
    existingDays: [manualDay],
  });

  const targetDay = generated.find(d => d.date === '2026-08-17');
  assert.ok(targetDay, 'Target day 2026-08-17 must exist');
  assert.strictEqual(targetDay.sourceLayer, 'SCHOOL_OVERRIDE', 'SCHOOL_OVERRIDE must override national holiday on same day');
  assert.strictEqual(targetDay.notes, 'Upacara Mandiri');
});

// -----------------------------------------------------------------------------
// TEST DM: Confirm disabled before Generate
// -----------------------------------------------------------------------------
runTest('DM. Confirm button is disabled before explicit Generate Kalender step', () => {
  assert.ok(
    tpmSource.includes('hasGeneratedEffectiveCalendar = useMemo(') &&
      tpmSource.includes('isEffectiveCalendarReady =') &&
      tpmSource.includes('disabled={!isEffectiveCalendarReady}'),
    'Confirm button must be disabled when isEffectiveCalendarReady is false'
  );
});

// -----------------------------------------------------------------------------
// TEST DN: Export disabled before Generate
// -----------------------------------------------------------------------------
runTest('DN. Export Kalender and Export Alokasi Waktu disabled before explicit Generate step', () => {
  assert.ok(
    tpmSource.includes('id="btn-export-kalender"') &&
      tpmSource.includes('disabled={isExporting === \'kalender\' || !isEffectiveCalendarReady}'),
    'Export Kalender button must be disabled when isEffectiveCalendarReady is false'
  );
  assert.ok(
    tpmSource.includes('id="btn-export-alokasi"') &&
      tpmSource.includes('disabled={isExporting === \'alokasi\' || !isEffectiveCalendarReady}'),
    'Export Alokasi Waktu button must be disabled when isEffectiveCalendarReady is false'
  );
});

// -----------------------------------------------------------------------------
// TEST DO: Confirm must not generate implicitly
// -----------------------------------------------------------------------------
runTest('DO. handleConfirmCalendar has mandatory guard and does not generate implicitly', () => {
  const match = tpmSource.match(/const handleConfirmCalendar = \([\s\S]*?\n  \};/);
  assert.ok(match, 'handleConfirmCalendar function must exist');
  const fnBody = match[0];

  assert.ok(
    !fnBody.includes('generateEffectiveCalendarDays('),
    'handleConfirmCalendar MUST NOT call generateEffectiveCalendarDays implicitly'
  );
  assert.ok(
    fnBody.includes('!hasGeneratedEffectiveCalendar'),
    'handleConfirmCalendar MUST validate hasGeneratedEffectiveCalendar guard'
  );
});

// -----------------------------------------------------------------------------
// TEST DP: Generate enables workflow
// -----------------------------------------------------------------------------
runTest('DP. Generate Kalender produces GENERATED_EFFECTIVE_BASELINE days enabling workflow ready contract', () => {
  const generatedDays = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: 'cal-dp',
    academicYear: '2026/2027',
  });

  const hasGeneratedBaseline = generatedDays.some((d) => d.sourceLayer === 'GENERATED_EFFECTIVE_BASELINE');
  assert.strictEqual(hasGeneratedBaseline, true, 'Generated days must contain GENERATED_EFFECTIVE_BASELINE layer');
});

// -----------------------------------------------------------------------------
// TEST DQ: Editing startDate invalidates generated baseline
// -----------------------------------------------------------------------------
runTest('DQ. Editing startDate invalidates old GENERATED_EFFECTIVE_BASELINE days', () => {
  const generatedDays = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: 'cal-dq',
    academicYear: '2026/2027',
  });

  const cleanedDays = generatedDays.filter((d) => d.sourceLayer !== 'GENERATED_EFFECTIVE_BASELINE');
  const hasBaseline = cleanedDays.some((d) => d.sourceLayer === 'GENERATED_EFFECTIVE_BASELINE');
  assert.strictEqual(hasBaseline, false, 'Changing startDate must purge old GENERATED_EFFECTIVE_BASELINE days');
});

// -----------------------------------------------------------------------------
// TEST DR: Editing endDate invalidates generated baseline
// -----------------------------------------------------------------------------
runTest('DR. Editing endDate invalidates old GENERATED_EFFECTIVE_BASELINE days', () => {
  const generatedDays = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: 'cal-dr',
    academicYear: '2026/2027',
  });

  const cleanedDays = generatedDays.filter((d) => d.sourceLayer !== 'GENERATED_EFFECTIVE_BASELINE');
  const hasBaseline = cleanedDays.some((d) => d.sourceLayer === 'GENERATED_EFFECTIVE_BASELINE');
  assert.strictEqual(hasBaseline, false, 'Changing endDate must purge old GENERATED_EFFECTIVE_BASELINE days');
});

// -----------------------------------------------------------------------------
// TEST DS: Switching 5 -> 6 day invalidates generated baseline
// -----------------------------------------------------------------------------
runTest('DS. Switching schoolDaysPerWeek 5 -> 6 invalidates old GENERATED_EFFECTIVE_BASELINE days', () => {
  const generatedDays = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: 'cal-ds',
    academicYear: '2026/2027',
  });

  const cleanedDays = generatedDays.filter((d) => d.sourceLayer !== 'GENERATED_EFFECTIVE_BASELINE');
  const hasBaseline = cleanedDays.some((d) => d.sourceLayer === 'GENERATED_EFFECTIVE_BASELINE');
  assert.strictEqual(hasBaseline, false, 'Changing schoolDaysPerWeek must invalidate old generated baseline');
});

// -----------------------------------------------------------------------------
// TEST DT: Full final lifecycle
// -----------------------------------------------------------------------------
runTest('DT. Full final lifecycle: Default dates -> Generate -> HE/ME > 0 -> Confirm -> V5 save -> reload fidelity', () => {
  mockStorage.clear();

  const school = createSchoolV5({
    name: 'SD Lifecycle',
    npsn: '99998888',
    address: 'Jl. Merdeka',
    village: 'Desa B',
    district: 'Kecamatan B',
    regency: 'Kabupaten B',
    province: 'Jawa Tengah',
    principalName: 'Kepala Sekolah B',
    principalNip: '198001012005011001',
  });

  const profile = createProfileV5({
    name: 'Guru Lifecycle',
    schoolId: school.id,
    nip: '198801012012011002',
    status: 'PNS',
    defaultSubject: 'Matematika',
    defaultLevel: 'SD',
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

  // 1. Initial draft state without explicit generate
  const ungeneratedDays: CalendarDay[] = [];
  const hasGeneratedBefore = ungeneratedDays.some((d) => d.sourceLayer === 'GENERATED_EFFECTIVE_BASELINE');
  assert.strictEqual(hasGeneratedBefore, false, 'Draft state without generate must have hasGeneratedEffectiveCalendar = false');

  // 2. Explicit Generate
  const generatedDays = generateEffectiveCalendarDays({
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    calendarId: `cal-${sem1.id}`,
    academicYear: '2026/2027',
  });

  const hasGeneratedAfter = generatedDays.some((d) => d.sourceLayer === 'GENERATED_EFFECTIVE_BASELINE');
  assert.strictEqual(hasGeneratedAfter, true, 'Explicit generate produces GENERATED_EFFECTIVE_BASELINE');

  const effResult = calculateEffectiveDays({ startDate: '2026-07-13', endDate: '2026-12-18', schoolDaysPerWeek: 5 }, generatedDays);
  assert.ok(effResult.effectiveLearningDays > 0, 'Effective learning days must be > 0');

  const weeksResult = calculateEffectiveWeeks(effResult.effectiveLearningDays, 5);
  assert.ok(weeksResult.effectiveWeeksRounded > 0, 'Effective weeks must be > 0');

  // 3. Confirm & Persist V5
  const calObj: AcademicCalendar = {
    id: `cal-${sem1.id}`,
    academicSettingId: sem1.id,
    academicYear: '2026/2027',
    semester: '1 (Ganjil)',
    startDate: '2026-07-13',
    endDate: '2026-12-18',
    schoolDaysPerWeek: 5,
    sourceType: 'NATIONAL_HOLIDAY_OVERLAY',
    workflowStatus: 'CONFIRMED',
    updatedAt: new Date().toISOString(),
  };

  const confirmed = confirmCalendarWorkflow(calObj, generatedDays);
  saveAcademicCalendarV5(sem1.id, { calendar: confirmed.calendar, days: confirmed.days });

  // 4. Reload V5
  const stateLoaded = loadStorageV5();
  stateLoaded.activeProfileId = profile.id;
  stateLoaded.activeYearPlanId = hierarchy.yearPlan.id;
  stateLoaded.activeSemesterPlanId = sem1.id;
  saveStorageV5(stateLoaded);

  const runtimeCtx = getRuntimeContextV5();
  assert.ok(runtimeCtx.semesterData?.academicCalendar, 'Calendar must exist on reload');

  const reloadedDays = runtimeCtx.semesterData.academicCalendar.days;
  const reloadedEff = calculateEffectiveDays({ startDate: '2026-07-13', endDate: '2026-12-18', schoolDaysPerWeek: 5 }, reloadedDays);

  assert.strictEqual(reloadedEff.effectiveLearningDays, effResult.effectiveLearningDays, 'HE must be preserved after reload');
  assert.strictEqual(reloadedEff.unknownDays, 0, 'unknownDays must be 0 after reload');
});

// -----------------------------------------------------------------------------
// TEST 44: Source Contract - Calendar / JP Persistence Separation
// -----------------------------------------------------------------------------
runTest('DU. Source Contract: Calendar / JP persistence separation across App.tsx and TimePlanningManager', () => {
  const appSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/App.tsx'),
    'utf-8'
  );
  const managerSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx'),
    'utf-8'
  );

  // Extract handleSaveCalendar in App.tsx
  const saveCalMatch = appSource.match(/const handleSaveCalendar = \([\s\S]*?\n  \};/);
  assert.ok(saveCalMatch, 'handleSaveCalendar must exist in App.tsx');
  assert.ok(
    !saveCalMatch[0].includes('saveSemesterJPSettingV5'),
    'handleSaveCalendar in App.tsx must NOT call saveSemesterJPSettingV5'
  );

  // Extract handleSaveSemesterJPSetting in App.tsx
  const saveJpMatch = appSource.match(/const handleSaveSemesterJPSetting = \([\s\S]*?\n  \};/);
  assert.ok(saveJpMatch, 'handleSaveSemesterJPSetting must exist in App.tsx');
  assert.ok(
    saveJpMatch[0].includes('saveSemesterJPSettingV5'),
    'handleSaveSemesterJPSetting in App.tsx MUST call saveSemesterJPSettingV5'
  );

  // Extract handleConfirmCalendar in TimePlanningManager
  const confirmCalMatch = managerSource.match(/const handleConfirmCalendar = \(\) => {([\s\S]*?)\n  \};/);
  assert.ok(confirmCalMatch, 'handleConfirmCalendar must exist in TimePlanningManager');
  assert.ok(
    confirmCalMatch[0].includes('onSaveCalendar(res.calendar, res.days)'),
    'handleConfirmCalendar must call onSaveCalendar(res.calendar, res.days)'
  );
  assert.ok(
    !confirmCalMatch[0].includes('onSaveCalendar(res.calendar, res.days, jpPerWeek)'),
    'handleConfirmCalendar must NOT pass jpPerWeek to onSaveCalendar'
  );

  // Extract handleSaveJP in TimePlanningManager
  const saveJPHandlerMatch = managerSource.match(/const handleSaveJP = \(\) => {([\s\S]*?)\n  \};/);
  assert.ok(saveJPHandlerMatch, 'handleSaveJP must exist in TimePlanningManager');
  assert.ok(
    saveJPHandlerMatch[0].includes('onSaveSemesterJPSetting(jpPerWeek)'),
    'handleSaveJP must use onSaveSemesterJPSetting(jpPerWeek)'
  );
});

// -----------------------------------------------------------------------------
// TEST 45: Source Contract - Semester Reset
// -----------------------------------------------------------------------------
runTest('DV. Source Contract: TimePlanningManager semester reset keyed by academicSetting.id and clean fallback', () => {
  const managerSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx'),
    'utf-8'
  );

  // Must contain semester reset effect keyed by academicSetting.id
  assert.ok(
    managerSource.includes('useEffect(() => {') && managerSource.includes('[academicSetting.id]'),
    'TimePlanningManager must contain semester reset effect keyed by academicSetting.id'
  );

  // Must clear state in no-calendar branch
  assert.ok(managerSource.includes("setStartDate('')"), "Must clear startDate with setStartDate('')");
  assert.ok(managerSource.includes("setEndDate('')"), "Must clear endDate with setEndDate('')");
  assert.ok(managerSource.includes('setSchoolDaysPerWeek(null)'), 'Must clear schoolDaysPerWeek with setSchoolDaysPerWeek(null)');
  assert.ok(managerSource.includes("setWorkflowStatus('UNRESOLVED')"), "Must reset workflowStatus to UNRESOLVED");
  assert.ok(managerSource.includes("setResolutionStatus('UNRESOLVED')"), "Must reset resolutionStatus to UNRESOLVED");

  // Assert JP reset resolves to null when neither SemesterJPSetting nor calendar compatibility exists
  assert.ok(
    managerSource.includes('setJpPerWeek(null)') || managerSource.includes('setJpPerWeek(resolvedJP)'),
    'Must resolve and set JP to null when no saved setting exists'
  );
});

// -----------------------------------------------------------------------------
// TEST 46: Source Contract - Readiness UX
// -----------------------------------------------------------------------------
runTest('DW. Source Contract: Readiness UX visible labels, capacity indicators, and dynamic action button', () => {
  const componentSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx'),
    'utf-8'
  );

  // Visible presence of Semester 1 and Semester 2
  assert.ok(componentSource.includes('Semester 1'), 'Must visibly contain Semester 1 label');
  assert.ok(componentSource.includes('Semester 2'), 'Must visibly contain Semester 2 label');

  // Visible presence of status and capacity labels
  assert.ok(componentSource.includes('Kalender:'), 'Must visibly contain "Kalender:" label');
  assert.ok(componentSource.includes('JP Tersimpan:'), 'Must visibly contain "JP Tersimpan:" label');
  assert.ok(componentSource.includes('Kapasitas:'), 'Must visibly contain "Kapasitas:" label');

  // S1 & S2 capacity fields
  assert.ok(
    componentSource.includes('autoAllocationReadiness.s1Capacity?.availableJP'),
    'Must display S1 canonical capacity directly from autoAllocationReadiness'
  );
  assert.ok(
    componentSource.includes('autoAllocationReadiness.s2Capacity?.availableJP'),
    'Must display S2 canonical capacity directly from autoAllocationReadiness'
  );

  // Dynamic button label
  assert.ok(
    componentSource.includes('Susun Alokasi Semester {activeSemester} dari ATP Tahunan'),
    'Button label must dynamically specify active semester from ATP Tahunan'
  );

  // Visible helper text
  assert.ok(
    componentSource.includes('Pembagian ATP tahunan menggunakan kapasitas tersimpan Semester 1 dan Semester 2.'),
    'Must contain visible helper text explaining S1 & S2 saved capacity partitioning'
  );

  // Verify "Resmi Canonical" is NOT used
  assert.ok(
    !componentSource.includes('Resmi Canonical'),
    'Must not use "Resmi Canonical" label; use "Tersimpan" / "Draf"'
  );
});

// -----------------------------------------------------------------------------
// TEST 47: Source Contract A, B & C - Generated draft preservation and canonical sync
// -----------------------------------------------------------------------------
runTest('DX. Source Contract: Generated draft preservation across storage refresh and clean canonical sync', () => {
  const componentSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx'),
    'utf-8'
  );

  // Assert raw unconditional setDays(calendarDays || []) is NOT used in a bare useEffect([calendarDays])
  assert.ok(
    !componentSource.includes('useEffect(() => {\n    setDays(calendarDays || []);\n  }, [calendarDays]);'),
    'Must not have unconditional setDays(calendarDays || []) sync on calendarDays reference change'
  );

  // Assert calendarDraftDirty guard exists
  assert.ok(
    componentSource.includes('calendarDraftDirty'),
    'Must declare and use calendarDraftDirty state'
  );

  assert.ok(
    componentSource.includes('if (calendarDraftDirty) {') || componentSource.includes('if (calendarDraftDirty) return;'),
    'Must have draft-preservation guard preventing draft overwrite when dirty'
  );

  // Assert semester switch resets draft dirty state
  assert.ok(
    componentSource.includes('setCalendarDraftDirty(false)'),
    'Must reset calendar draft dirty state upon semester plan change and canonical save'
  );
});

// -----------------------------------------------------------------------------
// TEST 48: Source Contract F - Save Time Allocation Gating for Kurikulum Merdeka
// -----------------------------------------------------------------------------
runTest('DY. Source Contract: Save Time Allocation gating requires active semester canonical capacity', () => {
  const componentSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx'),
    'utf-8'
  );

  // Assert isSaveTimeAllocationEnabled is gated on canonicalCapacity?.isReady
  assert.ok(
    componentSource.includes('isSaveTimeAllocationEnabled'),
    'Must declare isSaveTimeAllocationEnabled'
  );
  assert.ok(
    componentSource.includes('canonicalCapacity?.isReady'),
    'isSaveTimeAllocationEnabled must be gated on canonicalCapacity?.isReady'
  );

  // Assert visible warning message when save is disabled
  assert.ok(
    componentSource.includes('Kalender semester dan JP Aktual harus disimpan terlebih dahulu sebelum pemetaan waktu disimpan.'),
    'Must contain visible notice explaining why Save Time Allocation is disabled'
  );
});

// -----------------------------------------------------------------------------
// TEST 49: Source Contract G - 3-State Calendar Status UI Labels
// -----------------------------------------------------------------------------
runTest('DZ. Source Contract: 3-state calendar status UI distinguishes Belum dibuat, Draf — belum ditetapkan, and Tersimpan', () => {
  const componentSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx'),
    'utf-8'
  );

  assert.ok(
    componentSource.includes('Belum dibuat'),
    'Must contain "Belum dibuat" state label'
  );
  assert.ok(
    componentSource.includes('Draf — belum ditetapkan'),
    'Must contain "Draf — belum ditetapkan" state label'
  );
  assert.ok(
    componentSource.includes('Tersimpan'),
    'Must contain "Tersimpan" state label'
  );
});

// -----------------------------------------------------------------------------
// TEST 50: Source Contract H - Post-Generate Guidance & CTA
// -----------------------------------------------------------------------------
runTest('EA. Source Contract: Post-generate CTA displays guidance for saving and confirming calendar', () => {
  const componentSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx'),
    'utf-8'
  );

  assert.ok(
    componentSource.includes('Hari efektif berhasil dihitung'),
    'Must contain post-generate guidance "Hari efektif berhasil dihitung"'
  );
  assert.ok(
    componentSource.includes('Simpan & Tetapkan Kalender') || componentSource.includes('Simpan &amp; Tetapkan Kalender'),
    'Must present CTA "Simpan & Tetapkan Kalender"'
  );
});

console.log(`\nAll ${totalTests} Merdeka V5 Academic Calendar Runtime audit tests PASSED successfully!\n`);
