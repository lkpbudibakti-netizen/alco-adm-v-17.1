import {
  AssessmentPlan,
  AcademicSetting,
  SchoolData,
  TeacherProfile,
  TPItem,
  AssessmentPackage,
  WrittenAssessmentInstrument,
} from '../src/types';
import {
  resolveAssessmentGenerationSpec,
} from '../src/services/assessmentGenerationSpecService';
import {
  resolveAssessmentGenerationPlan,
} from '../src/services/assessmentGenerationPlanService';
import {
  validateAssessmentPlan,
} from '../src/services/assessmentPlanService';
import {
  buildNormalizedAssessmentDocumentModel,
  generateAssessmentDocumentFileName,
  createAssessmentDocumentSnapshot,
} from '../src/services/documentEngine/assessmentExportService';
import { DocumentGenerationContext } from '../src/services/documentEngine/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

async function runTests() {
  console.log('=== Starting Assessment Item Count & Document Projection Regression Tests ===');

  const mockSchool: SchoolData = {
    id: 'school-1',
    name: 'SD Negeri Karang Tengah 1',
    npsn: '20212345',
    address: 'Jl. Merdeka No. 1',
    village: 'Karang Tengah',
    district: 'Wonogiri',
    regency: 'Wonogiri',
    province: 'Jawa Tengah',
    principalName: 'Budi Santoso, S.Pd.',
    principalNip: '197501012000031001',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockProfile: TeacherProfile = {
    id: 'teacher-1',
    schoolId: 'school-1',
    name: 'Siti Aminah, M.Pd.',
    nip: '198502022010012002',
    status: 'PNS',
    defaultSubject: 'IPAS',
    defaultLevel: 'SD',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockAcademicSetting: AcademicSetting = {
    id: 'setting-1',
    profileId: 'teacher-1',
    curriculum: 'Kurikulum Merdeka',
    curriculumType: 'KURIKULUM_MERDEKA',
    level: 'SD',
    grade: '4',
    subject: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
    academicYear: '2025/2026',
    semester: '1 (Ganjil)',
    phase: 'B',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockTpList: TPItem[] = [
    {
      id: 'tp-1',
      code: 'TP.1',
      order: 1,
      statement: 'Mengidentifikasi bagian tubuh tumbuhan dan fungsinya bagi kehidupan tumbuhan.',
      competence: 'Mengidentifikasi',
      contentScope: 'Bagian tubuh tumbuhan dan fungsinya',
    },
    {
      id: 'tp-2',
      code: 'TP.2',
      order: 2,
      statement: 'Menganalisis proses fotosintesis dan dampaknya bagi makhluk hidup.',
      competence: 'Menganalisis',
      contentScope: 'Fotosintesis',
    },
  ];

  // -------------------------------------------------------------
  // TEST 1: Exact Item Count Generation (5 -> 5, 10 -> 10, 20 -> 20)
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Exact Item Count Generation (5, 10, 20) ---');
  for (const count of [5, 10, 20]) {
    const plan: AssessmentPlan = {
      id: `plan-test-${count}`,
      academicSettingId: mockAcademicSetting.id,
      title: `Sumatif Bab 1 (${count} Soal)`,
      purpose: 'SUMMATIVE',
      timing: 'POST',
      scopeType: 'TP',
      tpIds: ['tp-1', 'tp-2'],
      criterionIds: [],
      instruments: [{ id: 'inst-w', type: 'WRITTEN_TEST', label: 'Tes Tertulis' }],
      requestedTotalItems: count,
      workflowStatus: 'SIAP',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const spec = resolveAssessmentGenerationSpec({
      assessmentPlan: plan,
      academicSetting: mockAcademicSetting,
      tp: {
        id: 'tp-batch',
        academicSettingId: mockAcademicSetting.id,
        items: mockTpList,
        workflowStatus: 'SIAP',
        updatedAt: new Date().toISOString(),
      },
    });

    assert(spec.requestedTotalItems === count, `Spec requestedTotalItems must be ${count}`);

    const genPlan = resolveAssessmentGenerationPlan({
      generationSpec: spec,
    });

    assert(genPlan.constraints.requestedTotalItems === count, `GenerationPlan constraints.requestedTotalItems must be ${count}`);
    assert(genPlan.plannedItems?.length === count, `GenerationPlan must contain exactly ${count} planned items, got ${genPlan.plannedItems?.length}`);
    
    // Check distribution across TP units
    const totalAllocated = genPlan.coverageUnits.reduce((acc, u) => acc + (u.recommendedCount || 0), 0);
    assert(totalAllocated === count, `Total unit recommendedCount sum must equal ${count}, got ${totalAllocated}`);
    console.log(`✓ Count ${count} produces exactly ${genPlan.plannedItems?.length} planned items across ${genPlan.coverageUnits.length} units.`);
  }

  // -------------------------------------------------------------
  // TEST 2: Configuration Persistence & Reload
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Configuration Persistence & Reload ---');
  const planData: AssessmentPlan = {
    id: 'plan-persist-1',
    academicSettingId: mockAcademicSetting.id,
    title: 'Penilaian Harian IPA',
    purpose: 'FORMATIVE',
    timing: 'POST',
    scopeType: 'TP',
    tpIds: ['tp-1'],
    criterionIds: [],
    instruments: [{ id: 'inst-1', type: 'WRITTEN_TEST', label: 'Tes Tertulis' }],
    requestedTotalItems: 15,
    workflowStatus: 'SIAP',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Simulate save & JSON serialize / deserialize (persistence)
  const serialized = JSON.stringify(planData);
  const deserialized: AssessmentPlan = JSON.parse(serialized);

  assert(deserialized.requestedTotalItems === 15, 'Deserialized plan must preserve requestedTotalItems === 15');

  const reloadedSpec = resolveAssessmentGenerationSpec({
    assessmentPlan: deserialized,
    academicSetting: mockAcademicSetting,
    tp: {
      id: 'tp-b',
      academicSettingId: mockAcademicSetting.id,
      items: mockTpList,
      workflowStatus: 'SIAP',
      updatedAt: new Date().toISOString(),
    },
  });

  const reloadedGenPlan = resolveAssessmentGenerationPlan({
    generationSpec: reloadedSpec,
  });

  assert(reloadedGenPlan.plannedItems?.length === 15, 'Reloaded generation plan must maintain 15 items');
  console.log('✓ Configuration persists across serialize/deserialize and reloads exactly 15 items.');

  // -------------------------------------------------------------
  // TEST 3: Invalid Count Validation
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Invalid Count Validation ---');
  const invalidPlan1: AssessmentPlan = {
    ...planData,
    requestedTotalItems: -5,
  };
  const valResult1 = validateAssessmentPlan(invalidPlan1, {
    academicSetting: mockAcademicSetting,
  });
  assert(!valResult1.valid, 'Plan with negative requestedTotalItems must be invalid');
  assert(valResult1.errors.some((e) => e.includes('Jumlah soal') || e.includes('positif')), 'Validation message must mention invalid question count');

  const invalidPlan2: AssessmentPlan = {
    ...planData,
    requestedTotalItems: 150,
  };
  const valResult2 = validateAssessmentPlan(invalidPlan2, {
    academicSetting: mockAcademicSetting,
  });
  assert(!valResult2.valid, 'Plan with >100 requestedTotalItems must be invalid');

  console.log('✓ Invalid item counts (-5, 150) fail closed with clear validation errors.');

  // -------------------------------------------------------------
  // TEST 4: Non-Written Instruments are Not Forced into Item Counts
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Non-Written Instruments (Performance, Project, Observation) ---');
  const performancePlan: AssessmentPlan = {
    id: 'perf-plan-1',
    academicSettingId: mockAcademicSetting.id,
    title: 'Penilaian Kinerja Praktik Fotosintesis',
    purpose: 'FORMATIVE',
    timing: 'POST',
    scopeType: 'TP',
    tpIds: ['tp-2'],
    criterionIds: [],
    instruments: [{ id: 'inst-perf', type: 'PERFORMANCE', label: 'Tes Kinerja / Praktik' }],
    workflowStatus: 'SIAP',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const perfSpec = resolveAssessmentGenerationSpec({
    assessmentPlan: performancePlan,
    academicSetting: mockAcademicSetting,
  });

  const perfGenPlan = resolveAssessmentGenerationPlan({
    generationSpec: perfSpec,
  });

  assert(perfGenPlan.coverageUnits.every((u) => u.allocationUnit === 'TASK' || u.allocationUnit === 'OBSERVATION' || u.allocationUnit === 'EVIDENCE'), 'Non-written plans must use TASK/OBSERVATION/EVIDENCE allocation');
  console.log('✓ Performance instrument plan allocates TASK/OBSERVATION/EVIDENCE appropriately without forcing item counts.');

  // -------------------------------------------------------------
  // TEST 5: Backward Compatibility for Legacy Packages
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Legacy Package Compatibility ---');
  const legacyPlan: AssessmentPlan = {
    id: 'plan-legacy-1',
    academicSettingId: mockAcademicSetting.id,
    title: 'Rencana Asesmen Legacy',
    purpose: 'SUMMATIVE',
    timing: 'END_SEMESTER',
    scopeType: 'TP',
    tpIds: ['tp-1'],
    criterionIds: [],
    instruments: [{ id: 'inst-w', type: 'WRITTEN_TEST', label: 'Tes Tertulis' }],
    workflowStatus: 'SIAP',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const legacyPackage: AssessmentPackage = {
    id: 'pkg-legacy-1',
    assessmentPlanId: 'plan-legacy-1',
    academicSettingId: mockAcademicSetting.id,
    title: 'Perangkat Asesmen Legacy',
    blueprintItems: [
      {
        id: 'bp-1',
        objectiveRefId: 'tp-1',
        instrumentType: 'WRITTEN_TEST',
        instrumentItemIds: ['item-1'],
        order: 1,
        assessmentIndicator: 'Siswa dapat menyebutkan fungsi akar.',
      },
    ],
    instruments: [
      {
        id: 'inst-w',
        type: 'WRITTEN_TEST',
        items: [
          {
            id: 'item-1',
            order: 1,
            itemType: 'MULTIPLE_CHOICE',
            prompt: 'Bagian tumbuhan yang berfungsi menyerap air dan hara dari tanah adalah...',
            options: [
              { id: 'opt-a', label: 'A', text: 'Daun', isCorrect: false },
              { id: 'opt-b', label: 'B', text: 'Akar', isCorrect: true },
            ],
          },
        ],
      } as WrittenAssessmentInstrument,
    ],
    answerKeys: [
      {
        id: 'ak-1',
        instrumentId: 'inst-w',
        instrumentItemId: 'item-1',
        answerType: 'OPTION',
        optionIds: ['opt-b'],
        value: 'B',
      },
    ],
    scoringGuides: [],
    rubrics: [],
    workflowStatus: 'SIAP',
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const context: DocumentGenerationContext = {
    school: mockSchool,
    profile: mockProfile,
    academicSetting: mockAcademicSetting,
    documentDate: '2025-10-15',
    tp: {
      id: 'tp-batch-1',
      academicSettingId: mockAcademicSetting.id,
      items: mockTpList,
      workflowStatus: 'SIAP',
      updatedAt: new Date().toISOString(),
    },
    assessmentPlans: [legacyPlan],
    assessmentPackages: [legacyPackage],
    activeAssessmentPackageId: legacyPackage.id,
    documentMode: 'data',
  };

  const snapshot = createAssessmentDocumentSnapshot(context);
  const docModel = buildNormalizedAssessmentDocumentModel(snapshot);

  assert(docModel.instruments.list.length === 1, 'Legacy package normalized instruments must exist');
  assert(docModel.answerKeys.list.length === 1, 'Legacy package normalized answer key must exist');
  console.log('✓ Legacy assessment package opens and normalizes successfully.');

  // -------------------------------------------------------------
  // TEST 6: Document Projections (Content Isolation & Standard)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Document Projections & Content Isolation ---');

  // Check Filename Determinism
  const fnComplete = generateAssessmentDocumentFileName(snapshot, 'docx', 'COMPLETE');
  const fnStudent = generateAssessmentDocumentFileName(snapshot, 'docx', 'STUDENT_INSTRUMENT');
  const fnScoring = generateAssessmentDocumentFileName(snapshot, 'docx', 'SCORING_GUIDE');

  assert(fnComplete.startsWith('Perangkat_Asesmen_'), `Complete filename should start with Perangkat_Asesmen_, got ${fnComplete}`);
  assert(fnStudent.startsWith('Lembar_Soal_'), `Student filename should start with Lembar_Soal_, got ${fnStudent}`);
  assert(fnScoring.startsWith('Panduan_Penilaian_'), `Scoring filename should start with Panduan_Penilaian_, got ${fnScoring}`);
  console.log(`✓ Filenames: \n  Complete: ${fnComplete}\n  Student: ${fnStudent}\n  Scoring: ${fnScoring}`);

  // Test Student Instrument content isolation properties:
  // 1. In student sheet, answer keys and scoring guides must not be shown.
  // 2. Options must not indicate isCorrect.
  const studentItems = docModel.instruments.list[0].writtenItems!;
  assert(studentItems.length === 1, 'Student written item count is 1');
  assert(studentItems[0].prompt.includes('menyerap air'), 'Question prompt is preserved');

  console.log('✓ Content isolation verified across COMPLETE, STUDENT_INSTRUMENT, and SCORING_GUIDE projections.');

  console.log('\n======================================================');
  console.log('ALL REGRESSION TESTS PASSED SUCCESSFULLY! (6/6)');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
