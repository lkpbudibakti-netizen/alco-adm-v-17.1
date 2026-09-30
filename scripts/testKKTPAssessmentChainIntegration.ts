import assert from 'node:assert';
import {
  createInitialStorageV5,
  loadStorageV5,
  saveStorageV5,
  createYearHierarchyV5,
  getSemesterDataV5,
  saveAssessmentCriteriaV5,
  saveAssessmentPlansV5,
  saveAssessmentPackagesV5,
  saveLearningPlansV5,
  saveGradeV5,
} from '../src/services/storageV5';
import {
  AssessmentCriterion,
  AssessmentPlan,
  AssessmentPackage,
  LearningPlan,
  Assessment,
  AssessmentResult,
  TPData,
  TeacherProfile,
  SchoolData,
} from '../src/types';
import { getRuntimeContextV5 } from '../src/services/runtimeV5';

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
(global as any).localStorage = mockStorage;

console.log('=== RUNNING INTEGRATION AUDIT: KKTP + ASSESSMENT CHAIN PERSISTENCE ===\n');

let totalTests = 0;
let passedTests = 0;

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

// Setup V5 initial state with 1 Profile, 1 YearPlan, Semester 1 & Semester 2
mockStorage.clear();
let state = createInitialStorageV5();

const profile: TeacherProfile = {
  id: 'prof-test-1',
  name: 'Guru Test KKTP',
  nip: '1234567890',
  schoolId: 'sch-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as any;

const school: SchoolData = {
  id: 'sch-1',
  npsn: '12345678',
  name: 'SD Negeri Test KKTP',
  address: 'Jl. Education No. 1',
  village: 'Cibinong',
  district: 'Cibinong',
  regency: 'Bogor',
  province: 'Jawa Barat',
  principalName: 'Kepala Sekolah M.Pd.',
  principalNip: '198001012000011001',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

state.profiles = [profile];
state.schools = [school];
saveStorageV5(state);

const { yearPlan, semesterPlans } = createYearHierarchyV5({
  profileId: profile.id,
  schoolId: school.id,
  academicYear: '2025/2026',
  level: 'SD',
  grade: 'Kelas 4',
  subject: 'Matematika',
  curriculumType: 'KURIKULUM_MERDEKA',
});

const sem1Plan = semesterPlans[0];
const sem2Plan = semesterPlans[1];

const currState = loadStorageV5();
currState.activeSemesterPlanId = sem1Plan.id;
saveStorageV5(currState);

runTest('1. KKTP (AssessmentCriterion) Persistence & Canonical TP Linkage', () => {
  const criteria: AssessmentCriterion[] = [
    {
      id: 'crit-m1-1',
      academicSettingId: sem1Plan.id,
      tpId: 'tp-m1-1',
      description: 'Peserta didik dapat memahami konsep pecahan senilai',
      approach: 'rubrik',
      indicators: ['Menjelaskan pecahan senilai'],
      levels: [
        { level: '1', label: 'Perlu Bimbingan', description: 'Belum memahami' },
        { level: '2', label: 'Baik', description: 'Sudah memahami' },
      ],
      workflowStatus: 'SIAP',
      needsReview: false,
      updatedAt: new Date().toISOString(),
    },
  ];

  saveAssessmentCriteriaV5(sem1Plan.id, criteria);

  // Verify direct storage read
  const sem1Data = getSemesterDataV5(sem1Plan.id);
  assert.strictEqual(sem1Data.assessmentCriteria?.length, 1);
  assert.strictEqual(sem1Data.assessmentCriteria?.[0].tpId, 'tp-m1-1');
  assert.strictEqual(sem1Data.assessmentCriteria?.[0].id, 'crit-m1-1');

  // Verify runtime context read
  const runtime = getRuntimeContextV5();
  assert.ok(runtime.semesterData?.assessmentCriteria);
  assert.strictEqual(runtime.semesterData.assessmentCriteria.length, 1);
  assert.strictEqual(runtime.semesterData.assessmentCriteria[0].id, 'crit-m1-1');
});

runTest('2. AssessmentPlan Persistence V5 & Semester Isolation', () => {
  const plans: AssessmentPlan[] = [
    {
      id: 'plan-m1-1',
      academicSettingId: sem1Plan.id,
      title: 'Sumatif Bab 1 Pecahan',
      purpose: 'SUMMATIVE',
      timing: 'POST',
      scopeType: 'TP',
      tpIds: ['tp-m1-1'],
      criterionIds: ['crit-m1-1'],
      instruments: [{ id: 'inst-1', type: 'WRITTEN_TEST' }],
      workflowStatus: 'SIAP',
      needsReview: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  saveAssessmentPlansV5(sem1Plan.id, plans);

  const runtime = getRuntimeContextV5();
  assert.ok(runtime.semesterData?.assessmentPlan);
  assert.strictEqual(runtime.semesterData.assessmentPlan.length, 1);
  assert.strictEqual(runtime.semesterData.assessmentPlan[0].id, 'plan-m1-1');
});

runTest('3. AssessmentPackage Persistence V5 & Plan Relation', () => {
  const pkgs: AssessmentPackage[] = [
    {
      id: 'pkg-m1-1',
      academicSettingId: sem1Plan.id,
      assessmentPlanId: 'plan-m1-1',
      title: 'Perangkat Soal Sumatif Bab 1 Pecahan',
      blueprintItems: [],
      instruments: [],
      answerKeys: [],
      scoringGuides: [],
      rubrics: [],
      workflowStatus: 'SIAP',
      needsReview: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  saveAssessmentPackagesV5(sem1Plan.id, pkgs);

  const runtime = getRuntimeContextV5();
  assert.ok(runtime.semesterData?.assessmentPackage);
  assert.strictEqual(runtime.semesterData.assessmentPackage.length, 1);
  assert.strictEqual(runtime.semesterData.assessmentPackage[0].assessmentPlanId, 'plan-m1-1');
});

runTest('4. Semester 1 vs Semester 2 Data Isolation', () => {
  // Save Semester 2 assessment criteria and plan
  const sem2Criteria: AssessmentCriterion[] = [
    {
      id: 'crit-m2-1',
      academicSettingId: sem2Plan.id,
      tpId: 'tp-m2-1',
      description: 'Peserta didik dapat mengukur bangun datar',
      approach: 'deskripsi',
      indicators: ['Mengukur keliling'],
      levels: [],
      workflowStatus: 'SIAP',
      needsReview: false,
      updatedAt: new Date().toISOString(),
    },
  ];
  saveAssessmentCriteriaV5(sem2Plan.id, sem2Criteria);

  // Switch active semester to Semester 2
  let currState = loadStorageV5();
  currState.activeSemesterPlanId = sem2Plan.id;
  saveStorageV5(currState);

  // Runtime context for Semester 2
  const runtimeSem2 = getRuntimeContextV5();
  assert.strictEqual(runtimeSem2.activeSemesterPlan?.id, sem2Plan.id);
  assert.strictEqual(runtimeSem2.semesterData?.assessmentCriteria?.length, 1);
  assert.strictEqual(runtimeSem2.semesterData?.assessmentCriteria?.[0].id, 'crit-m2-1');
  assert.strictEqual(runtimeSem2.semesterData?.assessmentPlan, undefined);

  // Switch back to Semester 1
  currState = loadStorageV5();
  currState.activeSemesterPlanId = sem1Plan.id;
  saveStorageV5(currState);

  const runtimeSem1 = getRuntimeContextV5();
  assert.strictEqual(runtimeSem1.activeSemesterPlan?.id, sem1Plan.id);
  assert.strictEqual(runtimeSem1.semesterData?.assessmentCriteria?.length, 1);
  assert.strictEqual(runtimeSem1.semesterData?.assessmentCriteria?.[0].id, 'crit-m1-1');
  assert.strictEqual(runtimeSem1.semesterData?.assessmentPlan?.length, 1);
  assert.strictEqual(runtimeSem1.semesterData?.assessmentPackage?.length, 1);
});

runTest('5. Legacy Grade Persistence V5', () => {
  const assessment: Assessment = {
    id: 'asm-1',
    academicSettingId: sem1Plan.id,
    tpId: 'tp-m1-1',
    type: 'formatif',
    title: 'Kuis Pecahan',
    date: '2026-08-15',
    maxScore: 100,
    createdAt: new Date().toISOString(),
  };
  const result: AssessmentResult = {
    id: 'res-1',
    assessmentId: 'asm-1',
    studentId: 'std-1',
    score: 85,
    status: 'tercapai',
  };

  saveGradeV5(sem1Plan.id, {
    assessments: [assessment],
    results: [result],
  });

  const runtime = getRuntimeContextV5();
  assert.strictEqual(runtime.semesterData?.grade?.assessments.length, 1);
  assert.strictEqual(runtime.semesterData?.grade?.results.length, 1);
  assert.strictEqual(runtime.semesterData?.grade?.assessments[0].title, 'Kuis Pecahan');
});

console.log(`\n========================================`);
console.log(`ALL INTEGRATION TESTS PASSED (${passedTests}/${totalTests})`);
console.log(`========================================`);
