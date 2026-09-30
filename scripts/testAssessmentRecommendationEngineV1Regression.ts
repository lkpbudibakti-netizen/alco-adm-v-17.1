import {
  resolveGradeBracket,
  getBaselineWrittenTotalItems,
  getRecommendedItemTypeDistribution,
  getRecommendedCognitiveDistribution,
  getRecommendedDifficultyDistribution,
  generateAssessmentRecommendation,
  allocateIntegerDistribution,
} from '../src/services/assessmentRecommendationService';
import {
  AcademicSetting,
  AssessmentPlan,
  WrittenAssessmentItemType,
  CognitiveDemand,
  AssessmentDifficultyTarget,
} from '../src/types';
import { resolveAssessmentGenerationSpec } from '../src/services/assessmentGenerationSpecService';
import { resolveAssessmentGenerationPlan } from '../src/services/assessmentGenerationPlanService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

console.log('===============================================================');
console.log('RUNNING: Assessment Recommendation Engine v1 Regression Tests');
console.log('===============================================================');

// 1. Grade Bracket Resolution
console.log('\n--- 1. Grade Bracket Resolution ---');
const sdEarlySetting: AcademicSetting = {
  id: 'set-sd-1',
  profileId: 'prof-1',
  academicYear: '2025/2026',
  semester: '1 (Ganjil)',
  level: 'SD',
  grade: '1',
  phase: 'A',
  curriculum: 'Kurikulum Merdeka',
  curriculumType: 'KURIKULUM_MERDEKA',
  subject: 'Matematika',
  subjectWeeklyJP: 4,
  updatedAt: '2025-10-01',
};
assert(resolveGradeBracket(sdEarlySetting) === 'SD_EARLY', 'SD 1 must resolve to SD_EARLY');

const sdMiddleSetting: AcademicSetting = {
  ...sdEarlySetting,
  grade: '4',
  phase: 'B',
};
assert(resolveGradeBracket(sdMiddleSetting) === 'SD_MIDDLE', 'SD 4 must resolve to SD_MIDDLE');

const sdUpperSetting: AcademicSetting = {
  ...sdEarlySetting,
  grade: '6',
  phase: 'C',
};
assert(resolveGradeBracket(sdUpperSetting) === 'SD_UPPER', 'SD 6 must resolve to SD_UPPER');

const smpSetting: AcademicSetting = {
  ...sdEarlySetting,
  level: 'SMP',
  grade: '8',
  phase: 'D',
};
assert(resolveGradeBracket(smpSetting) === 'SMP', 'SMP 8 must resolve to SMP');

const smaSetting: AcademicSetting = {
  ...sdEarlySetting,
  level: 'SMA',
  grade: '11',
  phase: 'F',
};
assert(resolveGradeBracket(smaSetting) === 'SMA_SMK', 'SMA 11 must resolve to SMA_SMK');
console.log('✅ Grade Bracket Resolution verified.');

// 2. Baseline Written Total Items Table Verification
console.log('\n--- 2. Baseline Item Count Table Verification ---');

// PRE / Diagnostik Awal
assert(getBaselineWrittenTotalItems({ timing: 'PRE', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SD_EARLY' }) === 5, 'PRE SD 1-2 = 5');
assert(getBaselineWrittenTotalItems({ timing: 'PRE', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SD_MIDDLE' }) === 8, 'PRE SD 3-4 = 8');
assert(getBaselineWrittenTotalItems({ timing: 'PRE', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SD_UPPER' }) === 10, 'PRE SD 5-6 = 10');
assert(getBaselineWrittenTotalItems({ timing: 'PRE', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SMP' }) === 10, 'PRE SMP = 10');
assert(getBaselineWrittenTotalItems({ timing: 'PRE', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SMA_SMK' }) === 15, 'PRE SMA/SMK = 15');

// POST (Single TP / Formatif Akhir TP)
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'TP', purpose: 'SUMMATIVE', gradeBracket: 'SD_EARLY' }) === 8, 'POST SD 1-2 = 8');
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'TP', purpose: 'SUMMATIVE', gradeBracket: 'SD_MIDDLE' }) === 10, 'POST SD 3-4 = 10');
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'TP', purpose: 'SUMMATIVE', gradeBracket: 'SD_UPPER' }) === 10, 'POST SD 5-6 = 10');
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'TP', purpose: 'SUMMATIVE', gradeBracket: 'SMP' }) === 15, 'POST SMP = 15');
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'TP', purpose: 'SUMMATIVE', gradeBracket: 'SMA_SMK' }) === 15, 'POST SMA/SMK = 15');

// Formatif / DURING
assert(getBaselineWrittenTotalItems({ timing: 'DURING', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SD_EARLY' }) === 5, 'DURING SD 1-2 = 5');
assert(getBaselineWrittenTotalItems({ timing: 'DURING', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SD_MIDDLE' }) === 5, 'DURING SD 3-4 = 5');
assert(getBaselineWrittenTotalItems({ timing: 'DURING', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SD_UPPER' }) === 10, 'DURING SD 5-6 = 10');
assert(getBaselineWrittenTotalItems({ timing: 'DURING', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SMP' }) === 10, 'DURING SMP = 10');
assert(getBaselineWrittenTotalItems({ timing: 'DURING', scopeType: 'TP', purpose: 'FORMATIVE', gradeBracket: 'SMA_SMK' }) === 10, 'DURING SMA/SMK = 10');

// Sumatif Unit / Bab (scopeType UNIT)
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'UNIT', purpose: 'SUMMATIVE', gradeBracket: 'SD_EARLY' }) === 10, 'UNIT SD 1-2 = 10');
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'UNIT', purpose: 'SUMMATIVE', gradeBracket: 'SD_MIDDLE' }) === 15, 'UNIT SD 3-4 = 15');
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'UNIT', purpose: 'SUMMATIVE', gradeBracket: 'SD_UPPER' }) === 20, 'UNIT SD 5-6 = 20');
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'UNIT', purpose: 'SUMMATIVE', gradeBracket: 'SMP' }) === 25, 'UNIT SMP = 25');
assert(getBaselineWrittenTotalItems({ timing: 'POST', scopeType: 'UNIT', purpose: 'SUMMATIVE', gradeBracket: 'SMA_SMK' }) === 30, 'UNIT SMA/SMK = 30');

// MID_SEMESTER / STS
assert(getBaselineWrittenTotalItems({ timing: 'MID_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SD_EARLY' }) === 20, 'STS SD 1-2 = 20');
assert(getBaselineWrittenTotalItems({ timing: 'MID_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SD_MIDDLE' }) === 25, 'STS SD 3-4 = 25');
assert(getBaselineWrittenTotalItems({ timing: 'MID_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SD_UPPER' }) === 30, 'STS SD 5-6 = 30');
assert(getBaselineWrittenTotalItems({ timing: 'MID_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SMP' }) === 30, 'STS SMP = 30');
assert(getBaselineWrittenTotalItems({ timing: 'MID_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SMA_SMK' }) === 35, 'STS SMA/SMK = 35');

// END_SEMESTER / SAS
assert(getBaselineWrittenTotalItems({ timing: 'END_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SD_EARLY' }) === 25, 'SAS SD 1-2 = 25');
assert(getBaselineWrittenTotalItems({ timing: 'END_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SD_MIDDLE' }) === 35, 'SAS SD 3-4 = 35');
assert(getBaselineWrittenTotalItems({ timing: 'END_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SD_UPPER' }) === 40, 'SAS SD 5-6 = 40');
assert(getBaselineWrittenTotalItems({ timing: 'END_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SMP' }) === 40, 'SAS SMP = 40');
assert(getBaselineWrittenTotalItems({ timing: 'END_SEMESTER', scopeType: 'SEMESTER', purpose: 'SUMMATIVE', gradeBracket: 'SMA_SMK' }) === 45, 'SAS SMA/SMK = 45');
console.log('✅ Baseline Item Count Table verified.');

// 3. Exact STS and SAS Presets
console.log('\n--- 3. Exact STS and SAS Distribution Presets ---');
const stsSmpDist = getRecommendedItemTypeDistribution({
  totalItems: 30,
  timing: 'MID_SEMESTER',
  purpose: 'SUMMATIVE',
  scopeType: 'SEMESTER',
  gradeBracket: 'SMP',
});
assert(stsSmpDist.MULTIPLE_CHOICE === 18, 'STS SMP MC must be 18');
assert(stsSmpDist.MULTIPLE_SELECT === 5, 'STS SMP MS must be 5');
assert(stsSmpDist.SHORT_ANSWER === 4, 'STS SMP SA must be 4');
assert(stsSmpDist.ESSAY === 3, 'STS SMP Essay must be 3');
assert(
  Object.values(stsSmpDist).reduce((a, b) => a + b, 0) === 30,
  'STS SMP item sum must equal 30'
);

const sasSmaDist = getRecommendedItemTypeDistribution({
  totalItems: 45,
  timing: 'END_SEMESTER',
  purpose: 'SUMMATIVE',
  scopeType: 'SEMESTER',
  gradeBracket: 'SMA_SMK',
});
assert(sasSmaDist.MULTIPLE_CHOICE === 24, 'SAS SMA MC must be 24');
assert(sasSmaDist.MULTIPLE_SELECT === 7, 'SAS SMA MS must be 7');
assert(sasSmaDist.SHORT_ANSWER === 6, 'SAS SMA SA must be 6');
assert(sasSmaDist.ESSAY === 8, 'SAS SMA Essay must be 8');
assert(
  Object.values(sasSmaDist).reduce((a, b) => a + b, 0) === 45,
  'SAS SMA item sum must equal 45'
);
console.log('✅ STS/SAS Presets verified.');

// 4. Mathematical Invariance & Largest Remainder Method (Hamilton/Hare)
console.log('\n--- 4. Integer Sum Invariance (Largest Remainder Method) ---');
for (const count of [3, 5, 7, 8, 10, 13, 15, 20, 25, 27, 30, 35, 40, 45, 50]) {
  const itemDist = getRecommendedItemTypeDistribution({
    totalItems: count,
    timing: 'POST',
    purpose: 'SUMMATIVE',
    scopeType: 'UNIT',
    gradeBracket: 'SMP',
  });
  const sumItem = Object.values(itemDist).reduce((a, b) => a + b, 0);
  assert(sumItem === count, `Item distribution sum for ${count} must equal ${count}, got ${sumItem}`);

  const cogDist = getRecommendedCognitiveDistribution({
    totalItems: count,
    timing: 'POST',
    gradeBracket: 'SMP',
  });
  const sumCog = Object.values(cogDist).reduce((a, b) => a + b, 0);
  assert(sumCog === count, `Cognitive distribution sum for ${count} must equal ${count}, got ${sumCog}`);

  const diffDist = getRecommendedDifficultyDistribution({
    totalItems: count,
    timing: 'POST',
  });
  const sumDiff = Object.values(diffDist).reduce((a, b) => a + b, 0);
  assert(sumDiff === count, `Difficulty distribution sum for ${count} must equal ${count}, got ${sumDiff}`);
}
console.log('✅ Largest Remainder Method Integer Sum Invariance verified.');

// 5. Non-Written Assessment Recommendation Behavior
console.log('\n--- 5. Non-Written Assessment Recommendation ---');
const perfRec = generateAssessmentRecommendation({
  academicSetting: smpSetting,
  instruments: [{ id: 'inst-1', type: 'PERFORMANCE', label: 'Unjuk Kerja' }],
});
assert(perfRec === null, 'Non-written assessment recommendation must return null and not force item counts');
console.log('✅ Non-written assessments do not force written question counts.');

// 6. Teacher Override & Downstream Pipeline Integration
console.log('\n--- 6. Teacher Override Downstream Pipeline ---');
const customPlan: AssessmentPlan = {
  id: 'asp-custom-rec-1',
  academicSettingId: smpSetting.id,
  title: 'Penilaian Sumatif Bab 1 Matematika',
  purpose: 'SUMMATIVE',
  timing: 'POST',
  scopeType: 'UNIT',
  tpIds: ['tp-1', 'tp-2'],
  criterionIds: ['crit-1', 'crit-2'],
  instruments: [{ id: 'inst-1', type: 'WRITTEN_TEST', label: 'Tes Tertulis' }],
  requestedTotalItems: 20, // Teacher custom override (baseline for SMP UNIT is 25)
  workflowStatus: 'SIAP',
  createdAt: '2025-10-01',
  updatedAt: '2025-10-01',
};

const spec = resolveAssessmentGenerationSpec({
  assessmentPlan: customPlan,
  academicSetting: smpSetting,
  tp: {
    id: 'tp-data-1',
    academicSettingId: smpSetting.id,
    workflowStatus: 'SIAP',
    updatedAt: '',
    items: [
      {
        id: 'tp-1',
        code: 'TP.1',
        competence: 'Menganalisis pola bilangan',
        contentScope: 'Pola aritmatika',
        statement: 'Menganalisis pola bilangan aritmatika',
        order: 1,
      },
      {
        id: 'tp-2',
        code: 'TP.2',
        competence: 'Menyelesaikan masalah',
        contentScope: 'Pola geometri',
        statement: 'Menyelesaikan masalah pola bilangan geometri',
        order: 2,
      },
    ],
  },
  assessmentCriteria: [
    {
      id: 'crit-1',
      tpId: 'tp-1',
      description: 'Mampu menemukan pola aritmatika',
      academicSettingId: smpSetting.id,
      approach: 'rubrik',
      indicators: [],
      levels: [],
      updatedAt: '2025-10-01',
    },
    {
      id: 'crit-2',
      tpId: 'tp-2',
      description: 'Mampu menghitung suku ke-n',
      academicSettingId: smpSetting.id,
      approach: 'rubrik',
      indicators: [],
      levels: [],
      updatedAt: '2025-10-01',
    },
  ],
});

assert(spec.requestedTotalItems === 20, 'Spec must preserve teacher requestedTotalItems = 20');

const genPlan = resolveAssessmentGenerationPlan({
  generationSpec: spec,
});

assert(genPlan.constraints.requestedTotalItems === 20, 'GenerationPlan must preserve requestedTotalItems = 20');
assert(genPlan.plannedItems?.length === 20, `GenerationPlan must produce exactly 20 planned items, got ${genPlan.plannedItems?.length}`);

console.log('✅ Teacher override passes completely to GenerationPlan plannedItems.');

// 7. Fail-Closed on Unresolved Academic Setting
console.log('\n--- 7. Fail-Closed on Unresolved Academic Setting ---');
const unknownSetting: AcademicSetting = {
  id: 'set-unknown',
  profileId: 'prof-1',
  academicYear: '2025/2026',
  grade: '',
  phase: '',
  level: '',
  subject: 'Umum',
  curriculum: '',
  updatedAt: '',
};
assert(resolveGradeBracket(unknownSetting) === undefined, 'Unknown setting must return undefined grade bracket');
assert(
  generateAssessmentRecommendation({
    academicSetting: unknownSetting,
    instruments: [{ id: 'inst-1', type: 'WRITTEN_TEST', label: 'Tes Tertulis' }],
  }) === null,
  'Unknown setting must return null recommendation (Fail-Closed)'
);
console.log('✅ Fail-closed verified on unknown setting.');

// 8. End-to-End SAS Grade 5 Exact Distribution Flow
console.log('\n--- 8. End-to-End SAS Grade 5 Exact Distribution Flow ---');
const sasPlan: AssessmentPlan = {
  id: 'asp-sas-sd5',
  academicSettingId: sdUpperSetting.id,
  title: 'Sumatif Akhir Semester (SAS) Matematika Kelas 5',
  purpose: 'SUMMATIVE',
  timing: 'END_SEMESTER',
  scopeType: 'SEMESTER',
  tpIds: ['tp-1', 'tp-2'],
  criterionIds: ['crit-1', 'crit-2'],
  instruments: [{ id: 'inst-1', type: 'WRITTEN_TEST', label: 'Tes Tertulis' }],
  requestedTotalItems: 40,
  itemTypeDistribution: {
    MULTIPLE_CHOICE: 22,
    MULTIPLE_SELECT: 6,
    TRUE_FALSE: 0,
    MATCHING: 0,
    CATEGORY_RESPONSE: 0,
    SHORT_ANSWER: 6,
    ESSAY: 6,
  },
  cognitiveDistribution: {
    RECALL_UNDERSTAND: 12,
    APPLY: 18,
    ANALYZE_REASON: 10,
    EVALUATE_CREATE: 0,
  },
  difficultyDistribution: {
    BASIC: 10,
    MODERATE: 20,
    CHALLENGING: 10,
  },
  isTeacherCustomized: false,
  workflowStatus: 'SIAP',
  createdAt: '2025-10-01',
  updatedAt: '2025-10-01',
};

const sasSpec = resolveAssessmentGenerationSpec({
  assessmentPlan: sasPlan,
  academicSetting: sdUpperSetting,
  tp: {
    id: 'tp-data-1',
    academicSettingId: sdUpperSetting.id,
    workflowStatus: 'SIAP',
    updatedAt: '',
    items: [
      { id: 'tp-1', code: 'TP.1', competence: 'Menganalisis', contentScope: 'Operasi Pecahan', statement: 'Menganalisis operasi pecahan', order: 1 },
      { id: 'tp-2', code: 'TP.2', competence: 'Menyelesaikan masalah', contentScope: 'Kelipatan FPB KPK', statement: 'Menyelesaikan masalah FPB dan KPK', order: 2 },
    ],
  },
  assessmentCriteria: [
    { id: 'crit-1', tpId: 'tp-1', description: 'Operasi pecahan', academicSettingId: sdUpperSetting.id, approach: 'rubrik', indicators: [], levels: [], updatedAt: '' },
    { id: 'crit-2', tpId: 'tp-2', description: 'FPB KPK', academicSettingId: sdUpperSetting.id, approach: 'rubrik', indicators: [], levels: [], updatedAt: '' },
  ],
});

assert(sasSpec.requestedTotalItems === 40, 'SAS spec requestedTotalItems must be 40');
assert(sasSpec.itemTypeDistribution?.MULTIPLE_CHOICE === 22, 'SAS spec MC must be 22');

const sasGenPlan = resolveAssessmentGenerationPlan({
  generationSpec: sasSpec,
});

assert(sasGenPlan.plannedItems?.length === 40, 'SAS genPlan must have exactly 40 planned items');

const countByItemType = (sasGenPlan.plannedItems || []).reduce<Record<string, number>>((acc, item) => {
  const type = item.itemType || 'UNKNOWN';
  acc[type] = (acc[type] || 0) + 1;
  return acc;
}, {});

assert(countByItemType.MULTIPLE_CHOICE === 22, `Planned MC must be 22, got ${countByItemType.MULTIPLE_CHOICE}`);
assert(countByItemType.MULTIPLE_SELECT === 6, `Planned MS must be 6, got ${countByItemType.MULTIPLE_SELECT}`);
assert(countByItemType.SHORT_ANSWER === 6, `Planned SA must be 6, got ${countByItemType.SHORT_ANSWER}`);
assert(countByItemType.ESSAY === 6, `Planned Essay must be 6, got ${countByItemType.ESSAY}`);

console.log('✅ End-to-end SAS Grade 5 exact distributions verified.');

console.log('\n===============================================================');
console.log('🎉 ALL ASSESSMENT RECOMMENDATION ENGINE V1 TESTS PASSED!');
console.log('===============================================================');
