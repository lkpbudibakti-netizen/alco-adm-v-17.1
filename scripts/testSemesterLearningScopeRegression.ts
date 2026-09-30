import {
  resolveSemesterLearningScopes,
  resolveAtpItemSemesterJP,
  resolveDirectTpSemesterJP,
  validateLearningPlan,
} from '../src/services/learningPlanService';
import { validateATPReferences } from '../src/services/cpWorkflowService';
import { TPData, ATPData, TimeAllocation, LearningPlan, AcademicSetting } from '../src/types';

console.log('=== RUNNING SEMESTER LEARNING SCOPE RESOLUTION REGRESSION SUITE ===\n');

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${msg}`);
    failedCount++;
  }
}

const timeStamp = '2026-01-01T00:00:00.000Z';

// 1. Setup Annual TP and ATP Data
const annualTPData: TPData = {
  id: 'tp-annual-1',
  academicSettingId: 'setting-1',
  phase: 'A',
  workflowStatus: 'SIAP',
  updatedAt: timeStamp,
  items: [
    { id: 'tp-1', code: 'TP 1.1', statement: 'Mengenal bilangan cacah sampai 10', contentScope: 'Bilangan Cacah', competence: 'Mengenal', order: 1 },
    { id: 'tp-2', code: 'TP 1.2', statement: 'Membaca dan menulis lambang bilangan', contentScope: 'Lambang Bilangan', competence: 'Membaca', order: 2 },
    { id: 'tp-3', code: 'TP 1.3', statement: 'Membandingkan dan mengurutkan bilangan', contentScope: 'Urutan Bilangan', competence: 'Membandingkan', order: 3 },
    { id: 'tp-4', code: 'TP 1.4', statement: 'Menjumlahkan bilangan cacah sampai 10', contentScope: 'Penjumlahan', competence: 'Menjumlahkan', order: 4 },
    { id: 'tp-5', code: 'TP 2.1', statement: 'Mengenal bangun datar sederhana', contentScope: 'Geometri Datar', competence: 'Mengenal', order: 5 },
  ],
};

const annualATPData: ATPData = {
  id: 'atp-annual-1',
  academicSettingId: 'setting-1',
  tpId: 'tp-annual-1',
  tpDataId: 'tp-annual-1',
  basedOnTpUpdatedAt: timeStamp,
  phase: 'A',
  workflowStatus: 'SIAP',
  updatedAt: timeStamp,
  items: [
    { id: 'atp-a', tpId: 'tp-1', tpCode: 'TP 1.1', tpStatement: 'Mengenal bilangan cacah sampai 10', stepNumber: 1, sequence: 1, materialScope: 'Konsep Bilangan 1-10', jp: 99, allocatedJP: 99 },
    { id: 'atp-b', tpId: 'tp-2', tpCode: 'TP 1.2', tpStatement: 'Membaca dan menulis lambang bilangan', stepNumber: 2, sequence: 2, materialScope: 'Lambang Bilangan 1-10', jp: 99, allocatedJP: 99 },
    { id: 'atp-c', tpId: 'tp-3', tpCode: 'TP 1.3', tpStatement: 'Membandingkan dan mengurutkan bilangan', stepNumber: 3, sequence: 3, materialScope: 'Urutan Bilangan 1-10', jp: 99, allocatedJP: 99 },
    { id: 'atp-d', tpId: 'tp-4', tpCode: 'TP 1.4', tpStatement: 'Menjumlahkan bilangan cacah sampai 10', stepNumber: 4, sequence: 4, materialScope: 'Operasi Penjumlahan 1-10', jp: 99, allocatedJP: 99 },
    { id: 'atp-e', tpId: 'tp-5', tpCode: 'TP 2.1', tpStatement: 'Mengenal bangun datar sederhana', stepNumber: 5, sequence: 5, materialScope: 'Bangun Datar Segitiga & Segiempat', jp: 99, allocatedJP: 99 },
  ],
};

// 2. Active Semester 1 Allocations
const semester1Allocations: TimeAllocation[] = [
  { id: 'ta-1', academicSettingId: 'setting-1', jp: 8, sourceType: 'ATP_ITEM', sourceId: 'atp-a', atpItemId: 'atp-a', allocatedJP: 8 },
  { id: 'ta-2', academicSettingId: 'setting-1', jp: 10, sourceType: 'ATP_ITEM', sourceId: 'atp-b', atpItemId: 'atp-b', allocatedJP: 10 },
  { id: 'ta-3', academicSettingId: 'setting-1', jp: 6, sourceType: 'ATP_ITEM', sourceId: 'atp-c', atpItemId: 'atp-c', allocatedJP: 6 },
  // Non-learning allocations that should be ignored
  { id: 'ta-asm', academicSettingId: 'setting-1', jp: 4, sourceType: 'ASSESSMENT', sourceId: 'asm-1', allocatedJP: 4 },
  { id: 'ta-res', academicSettingId: 'setting-1', jp: 2, sourceType: 'RESERVE', sourceId: 'res-1', allocatedJP: 2 },
];

// 3. Active Semester 2 Allocations
const semester2Allocations: TimeAllocation[] = [
  { id: 'ta-4', academicSettingId: 'setting-1', jp: 8, sourceType: 'ATP_ITEM', sourceId: 'atp-d', atpItemId: 'atp-d', allocatedJP: 8 },
  { id: 'ta-5', academicSettingId: 'setting-1', jp: 10, sourceType: 'ATP_ITEM', sourceId: 'atp-e', atpItemId: 'atp-e', allocatedJP: 10 },
];

// TEST 1: Active Semester 1 scopes resolution
const sem1Scopes = resolveSemesterLearningScopes(annualTPData, annualATPData, semester1Allocations);
assert(sem1Scopes.length === 3, 'Semester 1 must return exactly 3 learning scopes');
assert(
  sem1Scopes.some((s) => s.id === 'atp-a' && s.tpCode === 'TP 1.1' && s.jp === 8),
  'Semester 1 scope contains TP 1.1 with exact 8 JP'
);
assert(
  sem1Scopes.some((s) => s.id === 'atp-b' && s.tpCode === 'TP 1.2' && s.jp === 10),
  'Semester 1 scope contains TP 1.2 with exact 10 JP'
);
assert(
  sem1Scopes.some((s) => s.id === 'atp-c' && s.tpCode === 'TP 1.3' && s.jp === 6),
  'Semester 1 scope contains TP 1.3 with exact 6 JP'
);
assert(
  !sem1Scopes.some((s) => s.tpCode === 'TP 1.4' || s.tpCode === 'TP 2.1'),
  'Semester 1 scope does NOT contain TP 1.4 or TP 2.1'
);

// TEST 2: Active Semester 2 scopes resolution
const sem2Scopes = resolveSemesterLearningScopes(annualTPData, annualATPData, semester2Allocations);
assert(sem2Scopes.length === 2, 'Semester 2 must return exactly 2 learning scopes');
assert(
  sem2Scopes.some((s) => s.id === 'atp-d' && s.tpCode === 'TP 1.4' && s.jp === 8),
  'Semester 2 scope contains TP 1.4 with exact 8 JP'
);
assert(
  sem2Scopes.some((s) => s.id === 'atp-e' && s.tpCode === 'TP 2.1' && s.jp === 10),
  'Semester 2 scope contains TP 2.1 with exact 10 JP'
);
assert(
  !sem2Scopes.some((s) => s.tpCode === 'TP 1.1' || s.tpCode === 'TP 1.2' || s.tpCode === 'TP 1.3'),
  'Semester 2 scope does NOT contain Semester 1 TPs'
);

// TEST 3: No fallback to annual ATPItem.jp (99 JP in fixtures)
assert(
  sem1Scopes.every((s) => s.jp !== 99),
  'No scope uses annual fallback ATPItem.jp=99'
);

// TEST 4: Direct TP allocation without ATP item
const tpDirectData: TPData = {
  id: 'tp-direct-1',
  academicSettingId: 'setting-1',
  phase: 'A',
  workflowStatus: 'SIAP',
  updatedAt: timeStamp,
  items: [
    { id: 'tp-direct-10', code: 'TP 3.1', statement: 'Materi Langsung TP', contentScope: 'Materi Mandiri', competence: 'Materi', order: 1 },
  ],
};
const directTpAllocation: TimeAllocation[] = [
  { id: 'ta-dir-1', academicSettingId: 'setting-1', jp: 12, sourceType: 'TP', sourceId: 'tp-direct-10', tpId: 'tp-direct-10', allocatedJP: 12 },
];
const directScopes = resolveSemesterLearningScopes(tpDirectData, null, directTpAllocation);
assert(directScopes.length === 1, 'Direct TP allocation produces 1 scope');
assert(directScopes[0].type === 'SINGLE_TP', 'Direct TP allocation produces SINGLE_TP scope');
assert(directScopes[0].jp === 12, 'Direct TP allocation has exact 12 JP');
assert(directScopes[0].tpCode === 'TP 3.1', 'Direct TP allocation has correct TP code');

// TEST 5: Empty allocations results in 0 scopes (never annual all)
const emptyScopes = resolveSemesterLearningScopes(annualTPData, annualATPData, []);
assert(emptyScopes.length === 0, 'Empty time allocations returns 0 scopes');

const nullScopes = resolveSemesterLearningScopes(annualTPData, annualATPData, null);
assert(nullScopes.length === 0, 'Null time allocations returns 0 scopes');

// TEST 6: Validation against active semester timeAllocations
const mockSetting: AcademicSetting = {
  id: 'setting-1',
  profileId: 'prof-1',
  curriculum: 'Kurikulum Merdeka',
  academicYear: '2026/2027',
  semester: '1 (Ganjil)',
  curriculumType: 'KURIKULUM_MERDEKA',
  phase: 'A',
  grade: 'Kelas 1',
  subject: 'Matematika',
  updatedAt: timeStamp,
};

const validSem1Plan: LearningPlan = {
  id: 'lp-sem1-valid',
  academicSettingId: 'setting-1',
  curriculumType: 'KURIKULUM_MERDEKA',
  sourceType: 'AI_DRAFT',
  status: 'DRAFT',
  tpIds: ['tp-1'],
  atpItemIds: ['atp-a'],
  title: 'Modul Ajar 1',
  topic: 'Konsep Bilangan 1-10',
  objectives: [{ id: 'tp-1', tpId: 'tp-1', statement: 'Mengenal bilangan cacah sampai 10' }],
  learningExperiences: [
    { id: 'exp-1', phase: 'UNDERSTAND', description: 'Memahami bilangan' },
    { id: 'exp-2', phase: 'APPLY', description: 'Mengaplikasikan bilangan' },
    { id: 'exp-3', phase: 'REFLECT', description: 'Merefleksikan bilangan' },
  ],
  learningSteps: { opening: [], core: [], closing: [] },
  assessmentPlan: {
    initial: [],
    formative: [{ id: 'asm-form-1', type: 'FORMATIVE', linkedTpIds: ['tp-1'], technique: 'Tes Tertulis', instrument: 'Lembar Soal', description: 'Kuis formatif mengenal bilangan' }],
    summative: [],
  },
  resources: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const validRes = validateLearningPlan(validSem1Plan, {
  academicSetting: mockSetting,
  tp: annualTPData,
  atp: annualATPData,
  timeAllocations: semester1Allocations,
});
assert(validRes.valid, 'LearningPlan matching Semester 1 allocations is valid');

// Plan referring to Semester 2 item during Semester 1 context
const invalidCrossSemPlan: LearningPlan = {
  ...validSem1Plan,
  id: 'lp-sem2-in-sem1',
  tpIds: ['tp-4'], // TP 1.4 is Sem 2
  atpItemIds: ['atp-d'], // ATP D is Sem 2
  objectives: [{ id: 'tp-4', tpId: 'tp-4', statement: 'Menjumlahkan bilangan cacah sampai 10' }],
};

const invalidRes = validateLearningPlan(invalidCrossSemPlan, {
  academicSetting: mockSetting,
  tp: annualTPData,
  atp: annualATPData,
  timeAllocations: semester1Allocations,
});
assert(!invalidRes.valid, 'LearningPlan referring to Semester 2 ATP/TP in Semester 1 context is REJECTED');
assert(
  invalidRes.errors.some((e) => e.includes('tidak memiliki alokasi waktu pada semester aktif')),
  'Validation reports error about missing active semester time allocation'
);

console.log('\n==========================================');
console.log(`TOTAL PASSED: ${passedCount}`);
console.log(`TOTAL FAILED: ${failedCount}`);
console.log('==========================================');

if (failedCount > 0) {
  process.exit(1);
}
