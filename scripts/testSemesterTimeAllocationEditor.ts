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
import { validateTimeAllocations, normalizeWeekRange } from '../src/services/jpEngine';
import {
  TimeAllocation,
  SemesterJPSetting,
  ATPData,
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

console.log('=== RUNNING SEMESTER TIME ALLOCATION EDITOR & CAPACITY REGRESSION ===');

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
  name: 'SD Negeri Cipta Cerdas',
  npsn: '20230001',
  address: 'Jl. Merdeka No. 45',
  village: 'Cihideung',
  district: 'Parongpong',
  regency: 'Kabupaten Bandung Barat',
  province: 'Jawa Barat',
  principalName: 'Dr. H. Hendra Wijaya, M.Pd.',
  principalNip: '197201011998031005',
});

const profile = createProfileV5({
  name: 'Dewi Lestari, S.Pd.',
  nip: '199002152016022001',
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

// Initial annual ATP data (Annual scope)
const initialAnnualATP: ATPData = {
  id: `atp-${hierarchy.yearPlan.id}`,
  academicSettingId: hierarchy.yearPlan.id,
  phase: 'A',
  updatedAt: new Date().toISOString(),
  items: [
    {
      id: 'atp-item-1',
      tpId: 'tp-1',
      tpCode: 'TP.1',
      tpStatement: 'Mengenal bilangan cacah 1-20',
      materialScope: 'Bilangan Cacah',
      stepNumber: 1,
    },
    {
      id: 'atp-item-2',
      tpId: 'tp-2',
      tpCode: 'TP.2',
      tpStatement: 'Melakukan operasi penjumlahan sederhana',
      materialScope: 'Penjumlahan',
      stepNumber: 2,
    },
    {
      id: 'atp-item-3',
      tpId: 'tp-3',
      tpCode: 'TP.3',
      tpStatement: 'Melakukan operasi pengurangan sederhana',
      materialScope: 'Pengurangan',
      stepNumber: 3,
    },
    {
      id: 'atp-item-4',
      tpId: 'tp-4',
      tpCode: 'TP.4',
      tpStatement: 'Mengenal bangun datar sederhana',
      materialScope: 'Geometri',
      stepNumber: 4,
    },
  ],
};

saveATPV5(hierarchy.yearPlan.id, initialAnnualATP);
const annualAtpBackup = JSON.stringify(initialAnnualATP);

// Set active IDs
const state = loadStorageV5();
state.activeProfileId = profile.id;
state.activeYearPlanId = hierarchy.yearPlan.id;
state.activeSemesterPlanId = sem1.id;
saveStorageV5(state);

// -----------------------------------------------------------------------------
// TEST 1: Source Code Contract - No auto-distribution or jpPerWeek injection
// -----------------------------------------------------------------------------
runTest('1 & 2. TimePlanningManager.tsx does not use currAtpItem?.jp ?? jpPerWeek fallback or auto-distribution', () => {
  const tpmPath = path.resolve(process.cwd(), 'src/components/administration/TimePlanningManager.tsx');
  const tpmSource = fs.readFileSync(tpmPath, 'utf-8');

  assert.ok(
    !tpmSource.includes('currAtpItem?.jp\n          ? Number(currAtpItem.jp)\n          : jpPerWeek'),
    'Must not use currAtpItem.jp ?? jpPerWeek fallback in ATP allocation'
  );
  assert.ok(
    !tpmSource.includes('currAtpItem?.jp ?? jpPerWeek'),
    'Must not use currAtpItem.jp ?? jpPerWeek fallback expression'
  );
  assert.ok(
    tpmSource.includes('handleUpdateAtpAllocation'),
    'Must define handleUpdateAtpAllocation for explicit user edits'
  );
  assert.ok(
    tpmSource.includes('validateTimeAllocations(allocations,'),
    'Must integrate validateTimeAllocations'
  );
});

// -----------------------------------------------------------------------------
// TEST 2: ATP without allocation does NOT produce automatic JP
// -----------------------------------------------------------------------------
runTest('2. ATP items without time allocation yield empty timeAllocation and null planned JP', () => {
  const runtime = getRuntimeContextV5();
  const allocations = runtime.semesterData?.timeAllocation || [];
  assert.strictEqual(allocations.length, 0, 'Initial unallocated semester has 0 TimeAllocations');

  const totalPlannedJP = allocations.length === 0
    ? null
    : allocations.reduce((sum, item) => sum + (Number(item.allocatedJP ?? item.jp) || 0), 0);

  assert.strictEqual(totalPlannedJP, null, 'Unallocated planned JP must evaluate to null (Belum dialokasikan)');
});

// -----------------------------------------------------------------------------
// TEST 3: Valid allocation persists with JP / startWeek / endWeek
// -----------------------------------------------------------------------------
runTest('3. Valid allocation persists with allocatedJP, startWeek, and endWeek', () => {
  const alloc1: TimeAllocation = {
    id: `alloc-${sem1.id}-1`,
    academicSettingId: sem1.id,
    sourceType: 'ATP_ITEM',
    sourceId: 'atp-item-1',
    atpItemId: 'atp-item-1',
    semester: '1 (Ganjil)',
    startWeek: 1,
    endWeek: 3,
    weekNumber: 1,
    jp: 12,
    allocatedJP: 12,
  };

  const alloc2: TimeAllocation = {
    id: `alloc-${sem1.id}-2`,
    academicSettingId: sem1.id,
    sourceType: 'ATP_ITEM',
    sourceId: 'atp-item-2',
    atpItemId: 'atp-item-2',
    semester: '1 (Ganjil)',
    startWeek: 4,
    endWeek: 6,
    weekNumber: 4,
    jp: 12,
    allocatedJP: 12,
  };

  saveTimeAllocationV5(sem1.id, [alloc1, alloc2]);

  const runtime = getRuntimeContextV5();
  const savedAllocations = runtime.semesterData?.timeAllocation || [];
  assert.strictEqual(savedAllocations.length, 2);
  assert.strictEqual(savedAllocations[0].startWeek, 1);
  assert.strictEqual(savedAllocations[0].endWeek, 3);
  assert.strictEqual(savedAllocations[0].allocatedJP, 12);
  assert.strictEqual(savedAllocations[1].startWeek, 4);
  assert.strictEqual(savedAllocations[1].endWeek, 6);
  assert.strictEqual(savedAllocations[1].allocatedJP, 12);
});

// -----------------------------------------------------------------------------
// TEST 4: Invalid Week Range Normalization and Bounds Locking
// -----------------------------------------------------------------------------
runTest('4. Week range bounds normalization locks startWeek >= 1, endWeek >= startWeek, and clamps to effectiveWeeks', () => {
  const effectiveWeeks = 18;

  // 1. startWeek < 1 -> normalized to 1
  const c1 = normalizeWeekRange(0, 5, effectiveWeeks);
  assert.strictEqual(c1.startWeek, 1, 'startWeek 0 must be normalized to 1');
  assert.strictEqual(c1.endWeek, 5);

  const c1Neg = normalizeWeekRange(-4, 3, effectiveWeeks);
  assert.strictEqual(c1Neg.startWeek, 1, 'negative startWeek must be normalized to 1');
  assert.strictEqual(c1Neg.endWeek, 3);

  // 2. endWeek < startWeek -> endWeek = startWeek
  const c2 = normalizeWeekRange(6, 2, effectiveWeeks);
  assert.strictEqual(c2.startWeek, 6);
  assert.strictEqual(c2.endWeek, 6, 'endWeek < startWeek must be set to startWeek');

  const c2Null = normalizeWeekRange(4, null, effectiveWeeks);
  assert.strictEqual(c2Null.startWeek, 4);
  assert.strictEqual(c2Null.endWeek, 4, 'missing/null endWeek must default to startWeek');

  // 3. startWeek > effectiveWeeks -> clamped to effectiveWeeks
  const c3 = normalizeWeekRange(22, 25, effectiveWeeks);
  assert.strictEqual(c3.startWeek, 18, 'startWeek > effectiveWeeks must be clamped to effectiveWeeks');
  assert.strictEqual(c3.endWeek, 18, 'endWeek must also be bounded by effectiveWeeks');

  // 4. endWeek > effectiveWeeks -> clamped to effectiveWeeks
  const c4 = normalizeWeekRange(5, 30, effectiveWeeks);
  assert.strictEqual(c4.startWeek, 5);
  assert.strictEqual(c4.endWeek, 18, 'endWeek > effectiveWeeks must be clamped to effectiveWeeks');
});

// -----------------------------------------------------------------------------
// TEST 4 & 5 & 6: Capacity Validation (Under, Balanced, Over)
// -----------------------------------------------------------------------------
runTest('4, 5 & 6. validateTimeAllocations correctly assesses UNDER_ALLOCATED, BALANCED, and OVER_ALLOCATED', () => {
  // Available JP = 24 JP (e.g., 6 weeks * 4 JP/week)
  const availableJP = 24;

  // Case A: 24 JP total -> BALANCED
  const balancedAllocs: TimeAllocation[] = [
    { id: '1', academicSettingId: sem1.id, allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
    { id: '2', academicSettingId: sem1.id, allocatedJP: 12, jp: 12, startWeek: 4, endWeek: 6 },
  ];
  const balancedRes = validateTimeAllocations(balancedAllocs, availableJP);
  assert.strictEqual(balancedRes.status, 'BALANCED');
  assert.strictEqual(balancedRes.totalAllocatedJP, 24);
  assert.strictEqual(balancedRes.remainingJP, 0);

  // Case B: 12 JP total -> UNDER_ALLOCATED (+12 JP sisa)
  const underAllocs: TimeAllocation[] = [
    { id: '1', academicSettingId: sem1.id, allocatedJP: 12, jp: 12, startWeek: 1, endWeek: 3 },
  ];
  const underRes = validateTimeAllocations(underAllocs, availableJP);
  assert.strictEqual(underRes.status, 'UNDER_ALLOCATED');
  assert.strictEqual(underRes.totalAllocatedJP, 12);
  assert.strictEqual(underRes.remainingJP, 12);

  // Case C: 28 JP total -> OVER_ALLOCATED (-4 JP defisit)
  const overAllocs: TimeAllocation[] = [
    { id: '1', academicSettingId: sem1.id, allocatedJP: 16, jp: 16, startWeek: 1, endWeek: 4 },
    { id: '2', academicSettingId: sem1.id, allocatedJP: 12, jp: 12, startWeek: 5, endWeek: 7 },
  ];
  const overRes = validateTimeAllocations(overAllocs, availableJP);
  assert.strictEqual(overRes.status, 'OVER_ALLOCATED');
  assert.strictEqual(overRes.totalAllocatedJP, 28);
  assert.strictEqual(overRes.remainingJP, -4);
});

// -----------------------------------------------------------------------------
// TEST 7: Reload V5 produces identical allocations
// -----------------------------------------------------------------------------
runTest('7. Storage V5 reload roundtrip produces lossless identical time allocations', () => {
  const loadedState = loadStorageV5();
  saveStorageV5(loadedState);

  const runtime = getRuntimeContextV5();
  const reloadedAllocs = runtime.semesterData?.timeAllocation || [];
  assert.strictEqual(reloadedAllocs.length, 2);
  assert.strictEqual(reloadedAllocs[0].sourceId, 'atp-item-1');
  assert.strictEqual(reloadedAllocs[0].allocatedJP, 12);
  assert.strictEqual(reloadedAllocs[0].startWeek, 1);
  assert.strictEqual(reloadedAllocs[0].endWeek, 3);
  assert.strictEqual(reloadedAllocs[1].sourceId, 'atp-item-2');
  assert.strictEqual(reloadedAllocs[1].allocatedJP, 12);
  assert.strictEqual(reloadedAllocs[1].startWeek, 4);
  assert.strictEqual(reloadedAllocs[1].endWeek, 6);
});

// -----------------------------------------------------------------------------
// TEST 8: Semester 1 and Semester 2 allocations remain isolated
// -----------------------------------------------------------------------------
runTest('8. Semester 1 and Semester 2 time allocations remain strictly isolated', () => {
  // Add Sem 2 allocation
  const sem2Alloc: TimeAllocation = {
    id: `alloc-${sem2.id}-1`,
    academicSettingId: sem2.id,
    sourceType: 'ATP_ITEM',
    sourceId: 'atp-item-3',
    atpItemId: 'atp-item-3',
    semester: '2 (Genap)',
    startWeek: 1,
    endWeek: 4,
    weekNumber: 1,
    jp: 16,
    allocatedJP: 16,
  };
  saveTimeAllocationV5(sem2.id, [sem2Alloc]);

  // Read Sem 1
  const state1 = loadStorageV5();
  state1.activeSemesterPlanId = sem1.id;
  saveStorageV5(state1);

  const ctx1 = getRuntimeContextV5();
  assert.strictEqual(ctx1.semesterData?.timeAllocation?.length, 2);
  assert.strictEqual(ctx1.semesterData?.timeAllocation?.[0].sourceId, 'atp-item-1');

  // Read Sem 2
  const state2 = loadStorageV5();
  state2.activeSemesterPlanId = sem2.id;
  saveStorageV5(state2);

  const ctx2 = getRuntimeContextV5();
  assert.strictEqual(ctx2.semesterData?.timeAllocation?.length, 1);
  assert.strictEqual(ctx2.semesterData?.timeAllocation?.[0].sourceId, 'atp-item-3');
  assert.strictEqual(ctx2.semesterData?.timeAllocation?.[0].allocatedJP, 16);
});

// -----------------------------------------------------------------------------
// TEST 9: Annual ATP is byte-for-byte unmodified
// -----------------------------------------------------------------------------
runTest('9. Annual ATP Data remains byte-for-byte unchanged throughout semester allocation workflows', () => {
  const runtime = getRuntimeContextV5();
  const currentAnnualATP = runtime.annualData?.atp;
  assert.ok(currentAnnualATP, 'Annual ATP must exist');
  assert.strictEqual(
    JSON.stringify(currentAnnualATP),
    annualAtpBackup,
    'Annual ATP must remain byte-identical without semester mutations'
  );
});

console.log('\nAll Semester Time Allocation Editor & Capacity regression tests PASSED 100%!\n');
