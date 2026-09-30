import assert from 'node:assert';
import {
  resolveSemesterLearningScopes,
  resolveAvailableScopes,
  resolveAtpItemSemesterJP,
  resolveDirectTpSemesterJP,
  validateLearningPlan,
  createEmptyLearningPlan,
  resolveLearningPlanAllocatedJP,
} from '../src/services/learningPlanService';
import {
  TPData,
  ATPData,
  TimeAllocation,
  AcademicSetting,
  LearningPlan,
  TPItem,
  ATPItem,
} from '../src/types';

console.log('=== RUNNING LEARNING PLAN SEMESTER SCOPE REGRESSION SUITE ===\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${totalTests}. ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`[FAIL] ${totalTests}. ${name}:`, err.message);
    throw err;
  }
}

// --------------------------------------------------------------------------
// TEST FIXTURES
// --------------------------------------------------------------------------
const mockSetting: AcademicSetting = {
  id: 'setting-sem-1',
  profileId: 'p1',
  subject: 'Matematika',
  level: 'SD',
  grade: 'Kelas 4',
  phase: 'Fase B',
  semester: '1 (Ganjil)',
  academicYear: '2026/2027',
  curriculum: 'Kurikulum Merdeka',
  curriculumType: 'KURIKULUM_MERDEKA',
  updatedAt: new Date().toISOString(),
};

const annualTpData: TPData = {
  id: 'tpdata-annual',
  academicSettingId: 'setting-sem-1',
  updatedAt: new Date().toISOString(),
  workflowStatus: 'SIAP',
  items: [
    {
      id: 'tp-1',
      order: 1,
      code: 'TP 1.1',
      statement: 'Memahami bilangan cacah sampai 10.000.',
      competence: 'Memahami',
      contentScope: 'Bilangan Cacah',
    },
    {
      id: 'tp-2',
      order: 2,
      code: 'TP 1.2',
      statement: 'Melakukan operasi hitung perkalian dan pembagian.',
      competence: 'Melakukan',
      contentScope: 'Operasi Hitung',
    },
    {
      id: 'tp-3',
      order: 3,
      code: 'TP 1.3',
      statement: 'Memahami pecahan senilai.',
      competence: 'Memahami',
      contentScope: 'Pecahan Senilai',
    },
    {
      id: 'tp-4',
      order: 4,
      code: 'TP 1.4',
      statement: 'Menganalisis pola gambar dan pola bilangan.',
      competence: 'Menganalisis',
      contentScope: 'Pola Bilangan',
    },
  ],
};

const annualAtpData: ATPData = {
  id: 'atpdata-annual',
  academicSettingId: 'setting-sem-1',
  updatedAt: new Date().toISOString(),
  totalJP: 36,
  workflowStatus: 'SIAP',
  items: [
    {
      id: 'atp-a1',
      stepNumber: 1,
      tpId: 'tp-1',
      tpCode: 'TP 1.1',
      tpStatement: 'Memahami bilangan cacah sampai 10.000.',
      materialScope: 'Bilangan Cacah',
      jp: 99, // Annual legacy number - must NOT be used for semester scope
    },
    {
      id: 'atp-a2',
      stepNumber: 2,
      tpId: 'tp-2',
      tpCode: 'TP 1.2',
      tpStatement: 'Melakukan operasi hitung perkalian dan pembagian.',
      materialScope: 'Operasi Hitung',
      jp: 99,
    },
    {
      id: 'atp-a3',
      stepNumber: 3,
      tpId: 'tp-3',
      tpCode: 'TP 1.3',
      tpStatement: 'Memahami pecahan senilai.',
      materialScope: 'Pecahan Senilai',
      jp: 99,
    },
    {
      id: 'atp-a4',
      stepNumber: 4,
      tpId: 'tp-4',
      tpCode: 'TP 1.4',
      tpStatement: 'Menganalisis pola gambar dan pola bilangan.',
      materialScope: 'Pola Bilangan',
      jp: 99,
    },
  ],
};

// --------------------------------------------------------------------------
// CASE A: SEMESTER 1 SCOPES
// --------------------------------------------------------------------------
runTest('Case A — Semester 1: only allocated ATP items (A1, A2) appear as scopes', () => {
  const sem1Allocations: TimeAllocation[] = [
    {
      id: 'ta-1',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a1',
      atpItemId: 'atp-a1',
      semester: '1',
      allocatedJP: 8,
      jp: 8,
    },
    {
      id: 'ta-2',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a2',
      atpItemId: 'atp-a2',
      semester: '1',
      allocatedJP: 10,
      jp: 10,
    },
  ];

  const scopes = resolveSemesterLearningScopes(annualTpData, annualAtpData, sem1Allocations);

  assert.strictEqual(scopes.length, 2, 'Exactly 2 scopes returned for Semester 1');
  assert.strictEqual(scopes[0].id, 'atp-a1', 'First scope is A1');
  assert.strictEqual(scopes[0].tpCode, 'TP 1.1');
  assert.strictEqual(scopes[1].id, 'atp-a2', 'Second scope is A2');
  assert.strictEqual(scopes[1].tpCode, 'TP 1.2');

  // Verify A3 and A4 are NOT present
  assert.strictEqual(scopes.some((s) => s.id === 'atp-a3'), false, 'A3 must not appear in Semester 1');
  assert.strictEqual(scopes.some((s) => s.id === 'atp-a4'), false, 'A4 must not appear in Semester 1');
});

// --------------------------------------------------------------------------
// CASE B: SEMESTER 2 SCOPES
// --------------------------------------------------------------------------
runTest('Case B — Semester 2: only allocated ATP items (A3, A4) appear as scopes', () => {
  const sem2Allocations: TimeAllocation[] = [
    {
      id: 'ta-3',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a3',
      atpItemId: 'atp-a3',
      semester: '2',
      allocatedJP: 6,
      jp: 6,
    },
    {
      id: 'ta-4',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a4',
      atpItemId: 'atp-a4',
      semester: '2',
      allocatedJP: 8,
      jp: 8,
    },
  ];

  const scopes = resolveSemesterLearningScopes(annualTpData, annualAtpData, sem2Allocations);

  assert.strictEqual(scopes.length, 2, 'Exactly 2 scopes returned for Semester 2');
  assert.strictEqual(scopes[0].id, 'atp-a3', 'First scope is A3');
  assert.strictEqual(scopes[0].tpCode, 'TP 1.3');
  assert.strictEqual(scopes[1].id, 'atp-a4', 'Second scope is A4');
  assert.strictEqual(scopes[1].tpCode, 'TP 1.4');

  // Verify Semester 1 items do NOT appear
  assert.strictEqual(scopes.some((s) => s.id === 'atp-a1'), false, 'A1 must not appear in Semester 2');
  assert.strictEqual(scopes.some((s) => s.id === 'atp-a2'), false, 'A2 must not appear in Semester 2');
});

// --------------------------------------------------------------------------
// CASE C: JP DERIVATION
// --------------------------------------------------------------------------
runTest('Case C — JP values come strictly from active semester TimeAllocation', () => {
  const sem1Allocations: TimeAllocation[] = [
    {
      id: 'ta-1',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a1',
      atpItemId: 'atp-a1',
      semester: '1',
      allocatedJP: 8,
      jp: 8,
    },
    {
      id: 'ta-2',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a2',
      atpItemId: 'atp-a2',
      semester: '1',
      allocatedJP: 10,
      jp: 10,
    },
  ];

  const scopes = resolveSemesterLearningScopes(annualTpData, annualAtpData, sem1Allocations);

  assert.strictEqual(scopes[0].jp, 8, 'A1.jp must be exactly 8 (not annual 99)');
  assert.strictEqual(scopes[1].jp, 10, 'A2.jp must be exactly 10 (not annual 99)');
});

// --------------------------------------------------------------------------
// CASE D: NO ALLOCATION
// --------------------------------------------------------------------------
runTest('Case D — No TimeAllocation yields 0 scopes (never fall back to annual TPs)', () => {
  const scopesEmpty = resolveSemesterLearningScopes(annualTpData, annualAtpData, []);
  assert.strictEqual(scopesEmpty.length, 0, 'Empty allocations must return 0 scopes');

  const scopesNull = resolveSemesterLearningScopes(annualTpData, annualAtpData, null);
  assert.strictEqual(scopesNull.length, 0, 'Null allocations must return 0 scopes');
});

// --------------------------------------------------------------------------
// CASE E: DIRECT TP ALLOCATION
// --------------------------------------------------------------------------
runTest('Case E — Direct TP allocation yields SINGLE_TP scope when not in ATP', () => {
  const directTpAllocations: TimeAllocation[] = [
    {
      id: 'ta-direct-tp3',
      academicSettingId: 'setting-sem-1',
      sourceType: 'TP',
      sourceId: 'tp-3',
      tpId: 'tp-3',
      semester: '1',
      allocatedJP: 6,
      jp: 6,
    },
  ];

  // ATP is empty or unallocated for TP 3
  const scopes = resolveSemesterLearningScopes(annualTpData, { ...annualAtpData, items: [] }, directTpAllocations);

  assert.strictEqual(scopes.length, 1, 'Exactly 1 scope resolved for direct TP');
  assert.strictEqual(scopes[0].type, 'SINGLE_TP', 'Scope type is SINGLE_TP');
  assert.strictEqual(scopes[0].id, 'tp-3');
  assert.strictEqual(scopes[0].tpCode, 'TP 1.3');
  assert.strictEqual(scopes[0].jp, 6, 'Scope JP is 6 from direct allocation');
});

// --------------------------------------------------------------------------
// CASE F: EXCLUDE NON-LEARNING ALLOCATIONS (ASSESSMENT, RESERVE)
// --------------------------------------------------------------------------
runTest('Case F — Non-learning allocations (ASSESSMENT, RESERVE) are excluded from scopes', () => {
  const mixedAllocations: TimeAllocation[] = [
    {
      id: 'ta-1',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a1',
      atpItemId: 'atp-a1',
      semester: '1',
      allocatedJP: 8,
      jp: 8,
    },
    {
      id: 'ta-assessment',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ASSESSMENT',
      sourceId: 'asm-1',
      semester: '1',
      allocatedJP: 4,
      jp: 4,
    },
    {
      id: 'ta-reserve',
      academicSettingId: 'setting-sem-1',
      sourceType: 'RESERVE',
      sourceId: 'res-1',
      semester: '1',
      allocatedJP: 2,
      jp: 2,
    },
  ];

  const scopes = resolveSemesterLearningScopes(annualTpData, annualAtpData, mixedAllocations);

  assert.strictEqual(scopes.length, 1, 'Only the ATP_ITEM allocation is admitted as learning scope');
  assert.strictEqual(scopes[0].id, 'atp-a1');
  assert.strictEqual(scopes.some((s) => s.id === 'asm-1' || s.id === 'res-1'), false);
});

// --------------------------------------------------------------------------
// CASE G: SAME TP WITH MULTIPLE ATP STEPS
// --------------------------------------------------------------------------
runTest('Case G — Multiple ATP steps for same TP generate distinct ATP_STEP scopes without collapsing', () => {
  const multiStepAtpData: ATPData = {
    ...annualAtpData,
    items: [
      {
        id: 'atp-step-1a',
        stepNumber: 1,
        tpId: 'tp-1',
        tpCode: 'TP 1.1',
        materialScope: 'Bilangan Cacah Bagian 1',
      },
      {
        id: 'atp-step-1b',
        stepNumber: 2,
        tpId: 'tp-1',
        tpCode: 'TP 1.1',
        materialScope: 'Bilangan Cacah Bagian 2',
      },
    ],
  };

  const multiAllocations: TimeAllocation[] = [
    {
      id: 'ta-1a',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-step-1a',
      atpItemId: 'atp-step-1a',
      semester: '1',
      allocatedJP: 4,
      jp: 4,
    },
    {
      id: 'ta-1b',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-step-1b',
      atpItemId: 'atp-step-1b',
      semester: '1',
      allocatedJP: 6,
      jp: 6,
    },
  ];

  const scopes = resolveSemesterLearningScopes(annualTpData, multiStepAtpData, multiAllocations);

  assert.strictEqual(scopes.length, 2, '2 distinct ATP_STEP scopes created for same TP');
  assert.strictEqual(scopes[0].id, 'atp-step-1a');
  assert.strictEqual(scopes[0].jp, 4);
  assert.strictEqual(scopes[1].id, 'atp-step-1b');
  assert.strictEqual(scopes[1].jp, 6);
});

// --------------------------------------------------------------------------
// CASE H: VALIDATION OF STALE / OUT-OF-SEMESTER LEARNING PLAN
// --------------------------------------------------------------------------
runTest('Case H — LearningPlan referencing items not in active semester fails validation', () => {
  const sem1Allocations: TimeAllocation[] = [
    {
      id: 'ta-1',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a1',
      atpItemId: 'atp-a1',
      semester: '1',
      allocatedJP: 8,
      jp: 8,
    },
  ];

  // Plan in Semester 1 referencing atp-a3 (Semester 2 item)
  const stalePlan: LearningPlan = {
    id: 'lp-stale',
    academicSettingId: 'setting-sem-1',
    curriculumType: 'KURIKULUM_MERDEKA',
    sourceType: 'MANUAL',
    status: 'DRAFT',
    tpIds: ['tp-3'],
    atpItemIds: ['atp-a3'],
    title: 'Modul Pecahan Senilai',
    objectives: [],
    learningSteps: { opening: [], core: [{ id: 'c1', description: 'Inti' }], closing: [] },
    assessmentPlan: { initial: [], formative: [{ id: 'f1', type: 'FORMATIVE', description: 'Formatif', linkedTpIds: ['tp-3'] }], summative: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const validation = validateLearningPlan(stalePlan, {
    academicSetting: mockSetting,
    tp: annualTpData,
    atp: annualAtpData,
    timeAllocations: sem1Allocations,
  });

  assert.strictEqual(validation.valid, false, 'Plan referencing out-of-semester ATP must not be valid');
  assert.ok(
    validation.errors.some((e) => e.includes('atp-a3') && e.includes('semester aktif')),
    'Validation error mentions atp-a3 not having allocation in active semester'
  );
  assert.ok(
    validation.errors.some((e) => e.includes('tp-3') && e.includes('semester aktif')),
    'Validation error mentions tp-3 not having allocation in active semester'
  );
});

// --------------------------------------------------------------------------
// CASE I: BACKWARD COMPATIBILITY ALIASES & NO UNSPECIFIED MUTATIONS
// --------------------------------------------------------------------------
runTest('Case I — resolveAvailableScopes alias preserves identical behavior', () => {
  const sem1Allocations: TimeAllocation[] = [
    {
      id: 'ta-1',
      academicSettingId: 'setting-sem-1',
      sourceType: 'ATP_ITEM',
      sourceId: 'atp-a1',
      atpItemId: 'atp-a1',
      semester: '1',
      allocatedJP: 8,
      jp: 8,
    },
  ];

  const direct = resolveSemesterLearningScopes(annualTpData, annualAtpData, sem1Allocations);
  const viaAlias = resolveAvailableScopes(annualTpData, annualAtpData, sem1Allocations);

  assert.deepStrictEqual(direct, viaAlias, 'Alias resolveAvailableScopes returns identical result');
});

console.log(`\n==========================================`);
console.log(`ALL ${totalTests} LEARNING PLAN SEMESTER SCOPE TESTS PASSED SUCCESSFULLY!`);
console.log(`==========================================`);
