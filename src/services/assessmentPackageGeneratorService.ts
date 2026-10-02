import {
  AssessmentAllocationUnit,
  AssessmentAnswerKey,
  AssessmentAnswerType,
  AssessmentBlueprintItem,
  AssessmentCoverageUnit,
  AssessmentDifficultyTarget,
  AssessmentEvidenceType,
  AssessmentGeneratedContentSource,
  AssessmentGenerationContract,
  AssessmentGenerationContractUnit,
  AssessmentGenerationIssue,
  AssessmentGenerationPlan,
  AssessmentGenerationResult,
  AssessmentGenerationResultStatus,
  AssessmentGenerationSource,
  AssessmentGenerationSpec,
  AssessmentInstrument,
  AssessmentInstrumentType,
  AssessmentPackage,
  AssessmentPlannedItem,
  AssessmentRubric,
  AssessmentScoringGuide,
  AssessmentStimulusOrigin,
  AssessmentStimulusType,
  AssessmentTeacherContext,
  AssessmentAIGenerationProvider,
  AssessmentAIGenerationRawResponse,
  AssessmentAIGenerationRequest,
  CategoryResponseCategory,
  CategoryResponseStatement,
  CognitiveDemand,
  GenerateAssessmentPackageInput,
  GeneratedAssessmentUnit,
  GeneratedEvidenceUnit,
  GeneratedItemUnit,
  GeneratedObservationUnit,
  GeneratedTaskUnit,
  MatchingAssessmentEntry,
  ObservationAspect,
  OralAssessmentItem,
  PerformanceAspect,
  RubricCriterion,
  RubricScaleLevel,
  SelfPeerAssessmentInstrument,
  SelfPeerAssessmentItem,
  WrittenAssessmentItem,
  WrittenAssessmentItemType,
  WrittenAssessmentOption,
} from '../types';

const VALID_INSTRUMENT_TYPES: Set<AssessmentInstrumentType> = new Set([
  'WRITTEN_TEST',
  'ORAL_TEST',
  'PERFORMANCE',
  'OBSERVATION',
  'ASSIGNMENT',
  'PROJECT',
  'PRODUCT',
  'PORTFOLIO',
  'SELF_ASSESSMENT',
  'PEER_ASSESSMENT',
]);

const VALID_WRITTEN_ITEM_TYPES: Set<WrittenAssessmentItemType> = new Set([
  'MULTIPLE_CHOICE',
  'MULTIPLE_SELECT',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'ESSAY',
  'MATCHING',
  'CATEGORY_RESPONSE',
]);

// ==========================================
// DETERMINISTIC ID GENERATORS
// ==========================================

export function createDeterministicBlueprintId(
  packageId: string,
  coverageUnitId: string
): string {
  const cleanPkg = (packageId || 'pkg').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanCov = (coverageUnitId || 'cov').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `bp:${cleanPkg}:${cleanCov}`;
}

export function createDeterministicInstrumentId(
  packageId: string,
  instrumentType: AssessmentInstrumentType
): string {
  const cleanPkg = (packageId || 'pkg').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanType = (instrumentType || 'inst').trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `inst:${cleanPkg}:${cleanType}`;
}

export function createDeterministicItemId(
  instrumentId: string,
  index: number
): string {
  const cleanInst = (instrumentId || 'inst').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `item:${cleanInst}:${index + 1}`;
}

export function createDeterministicOptionId(
  itemId: string,
  optionIndex: number
): string {
  const cleanItem = (itemId || 'item').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const optLetter = String.fromCharCode(65 + (optionIndex % 26));
  return `opt:${cleanItem}:${optLetter}`;
}

export function createDeterministicAspectId(
  instrumentId: string,
  index: number
): string {
  const cleanInst = (instrumentId || 'inst').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `asp:${cleanInst}:${index + 1}`;
}

export function createDeterministicAnswerKeyId(
  instrumentId: string,
  itemId: string
): string {
  const cleanInst = (instrumentId || 'inst').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanItem = (itemId || 'item').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ans:${cleanInst}:${cleanItem}`;
}

export function createDeterministicRubricId(
  instrumentId: string,
  index: number
): string {
  const cleanInst = (instrumentId || 'inst').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `rubric:${cleanInst}:${index + 1}`;
}

export function createDeterministicScoringGuideId(
  instrumentId: string,
  itemIdOrInstId: string
): string {
  const cleanInst = (instrumentId || 'inst').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanRef = (itemIdOrInstId || 'main').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sg:${cleanInst}:${cleanRef}`;
}

// ==========================================
// PRE-GENERATION GUARDS
// ==========================================

export interface PreGenerationGuardResult {
  valid: boolean;
  issues: AssessmentGenerationIssue[];
}

export function resolveAuthoritativeAcademicSettingId(
  input?: Partial<GenerateAssessmentPackageInput>
): string | undefined {
  if (
    input?.academicSettingId &&
    typeof input.academicSettingId === 'string' &&
    input.academicSettingId.trim() !== ''
  ) {
    return input.academicSettingId.trim();
  }
  if (
    input?.existingPackage?.academicSettingId &&
    typeof input.existingPackage.academicSettingId === 'string' &&
    input.existingPackage.academicSettingId.trim() !== ''
  ) {
    return input.existingPackage.academicSettingId.trim();
  }
  const planAny = input?.generationPlan as any;
  if (
    planAny?.academicSettingId &&
    typeof planAny.academicSettingId === 'string' &&
    planAny.academicSettingId.trim() !== ''
  ) {
    return planAny.academicSettingId.trim();
  }
  const specAny = input?.generationPlan?.generationSpec as any;
  if (
    specAny?.academicSettingId &&
    typeof specAny.academicSettingId === 'string' &&
    specAny.academicSettingId.trim() !== ''
  ) {
    return specAny.academicSettingId.trim();
  }
  return undefined;
}

export function validatePreGenerationGuards(
  input: GenerateAssessmentPackageInput
): PreGenerationGuardResult {
  const issues: AssessmentGenerationIssue[] = [];

  // 1. Missing Input or Plan
  if (!input || !input.generationPlan) {
    issues.push({
      code: 'PLAN_MISSING',
      severity: 'BLOCKING',
      message: 'AssessmentGenerationPlan wajib disertakan untuk generasi paket asesmen.',
    });
    return { valid: false, issues };
  }

  const plan = input.generationPlan;

  // 2. Plan Resolution Status BLOCKED
  if (plan.resolution?.status === 'BLOCKED') {
    issues.push({
      code: 'PLAN_BLOCKED',
      severity: 'BLOCKING',
      message: 'AssessmentGenerationPlan berstatus BLOCKED dan tidak dapat dilanjutkan ke generasi AI.',
    });
  }

  // 3. Missing GenerationSpec
  if (!plan.generationSpec) {
    issues.push({
      code: 'SPEC_MISSING',
      severity: 'BLOCKING',
      message: 'AssessmentGenerationSpec pada GenerationPlan tidak tersedia atau kosong.',
    });
    return { valid: false, issues };
  }

  const spec = plan.generationSpec;

  // 4. Spec Resolution Status BLOCKED
  if (spec.resolution?.status === 'BLOCKED') {
    issues.push({
      code: 'SPEC_BLOCKED',
      severity: 'BLOCKING',
      message: 'AssessmentGenerationSpec berstatus BLOCKED dan tidak dapat dilanjutkan ke generasi AI.',
    });
  }

  // 5. Academic Setting ID Resolution Guard (Fail-closed on unresolved / empty)
  const resolvedSettingId = resolveAuthoritativeAcademicSettingId(input);
  if (!resolvedSettingId) {
    issues.push({
      code: 'ACADEMIC_SETTING_ID_UNRESOLVED',
      severity: 'BLOCKING',
      message: 'ID AcademicSetting kanonikal tidak ditemukan atau tidak valid. Generasi dibatalkan demi integritas data.',
    });
  }

  // 6. Coverage Units Checks
  if (!plan.coverageUnits || plan.coverageUnits.length === 0) {
    issues.push({
      code: 'NO_COVERAGE_UNITS',
      severity: 'BLOCKING',
      message: 'AssessmentGenerationPlan tidak memiliki coverage unit untuk digenerasi.',
    });
    return { valid: false, issues };
  }

  const validObjectiveIds = new Set((spec.objectives || []).map((o) => o.id));
  const criteriaMap = new Map((spec.criteria || []).map((c) => [c.id, c]));

  plan.coverageUnits.forEach((unit, idx) => {
    // Blocked Unit
    if (unit.status === 'BLOCKED') {
      issues.push({
        code: 'COVERAGE_UNIT_BLOCKED',
        severity: 'BLOCKING',
        message: `Coverage unit #${idx + 1} (${unit.id}) berstatus BLOCKED.`,
        objectiveRefId: unit.objectiveRefId,
        criterionId: unit.criterionId,
      });
    }

    // Objective Reference Check
    if (!unit.objectiveRefId || !validObjectiveIds.has(unit.objectiveRefId)) {
      issues.push({
        code: 'UNRESOLVED_OBJECTIVE_REF',
        severity: 'BLOCKING',
        message: `Coverage unit #${idx + 1} merujuk pada objectiveRefId [${unit.objectiveRefId}] yang tidak ditemukan pada GenerationSpec.`,
        objectiveRefId: unit.objectiveRefId,
      });
    }

    // Criterion Reference Check
    if (unit.criterionId) {
      const crit = criteriaMap.get(unit.criterionId);
      if (!crit) {
        issues.push({
          code: 'DANGLING_CRITERION_REF',
          severity: 'BLOCKING',
          message: `Coverage unit #${idx + 1} merujuk pada criterionId [${unit.criterionId}] yang tidak ditemukan pada GenerationSpec.`,
          objectiveRefId: unit.objectiveRefId,
          criterionId: unit.criterionId,
        });
      } else if (crit.objectiveRefId !== unit.objectiveRefId) {
        issues.push({
          code: 'CRITERION_OBJECTIVE_MISMATCH',
          severity: 'BLOCKING',
          message: `Coverage unit #${idx + 1} merujuk pada criterionId [${unit.criterionId}] yang terhubung ke objective berbeda [${crit.objectiveRefId}].`,
          objectiveRefId: unit.objectiveRefId,
          criterionId: unit.criterionId,
        });
      }
    }

    // Instrument Type Check
    if (!unit.instrumentType || !VALID_INSTRUMENT_TYPES.has(unit.instrumentType)) {
      issues.push({
        code: 'UNRESOLVED_INSTRUMENT_TYPE',
        severity: 'BLOCKING',
        message: `Coverage unit #${idx + 1} memiliki tipe instrumen yang belum terselesaikan atau tidak valid [${unit.instrumentType}].`,
        objectiveRefId: unit.objectiveRefId,
      });
    }

    // Allocation Unit Check
    if (!unit.allocationUnit) {
      issues.push({
        code: 'UNRESOLVED_ALLOCATION_UNIT',
        severity: 'BLOCKING',
        message: `Coverage unit #${idx + 1} belum memiliki allocationUnit yang terselesaikan.`,
        objectiveRefId: unit.objectiveRefId,
      });
    }

    // Required Count Check
    if (
      unit.recommendedCount === undefined ||
      typeof unit.recommendedCount !== 'number' ||
      !Number.isFinite(unit.recommendedCount) ||
      !Number.isInteger(unit.recommendedCount) ||
      unit.recommendedCount <= 0
    ) {
      issues.push({
        code: 'INVALID_UNIT_COUNT',
        severity: 'BLOCKING',
        message: `Coverage unit #${idx + 1} memiliki unit count tidak valid [${unit.recommendedCount}] (harus integer >= 1).`,
        objectiveRefId: unit.objectiveRefId,
      });
    }

    // Structural ambiguity in unit issues
    if (unit.issues && unit.issues.some((i) => i.severity === 'BLOCKING')) {
      unit.issues
        .filter((i) => i.severity === 'BLOCKING')
        .forEach((bi) => {
          issues.push(bi);
        });
    }
  });

  // 7. Existing Package Protection Check
  if (input.existingPackage) {
    const existing = input.existingPackage;
    if (existing.workflowStatus === 'SIAP') {
      issues.push({
        code: 'EXISTING_PACKAGE_CONFIRMED_SIAP',
        severity: 'BLOCKING',
        message: 'Paket asesmen yang sudah berstatus SIAP tidak dapat ditimpa otomatis oleh generasi AI awal (gunakan alur revisi terkontrol).',
      });
    } else if (existing.provenance?.generatedBy === 'USER') {
      if (
        (existing.instruments && existing.instruments.length > 0) ||
        (existing.blueprintItems && existing.blueprintItems.length > 0)
      ) {
        issues.push({
          code: 'EXISTING_PACKAGE_TEACHER_PROTECTED',
          severity: 'BLOCKING',
          message: 'Paket asesmen berisi konten yang telah dibuat/diubah oleh guru dan tidak boleh ditimpa secara silent.',
        });
      }
    }
  }

  // 8. Structural review check on plan
  if (plan.resolution?.status === 'NEEDS_REVIEW') {
    const structuralIssues = (plan.resolution?.issues || []).filter(
      (iss) =>
        iss.code === 'INSTRUMENT_RESOLUTION_AMBIGUOUS' ||
        iss.code === 'MULTIPLE_PLANNED_INSTRUMENTS' ||
        iss.code === 'NO_COMMON_INSTRUMENTS'
    );
    if (structuralIssues.length > 0) {
      issues.push({
        code: 'STRUCTURAL_AMBIGUITY_BLOCKS_GENERATION',
        severity: 'BLOCKING',
        message: 'Ambiguity struktural pada instrumen menghalangi generasi AI yang deterministik.',
      });
    }
  }

  const hasBlocking = issues.some((iss) => iss.severity === 'BLOCKING');
  return { valid: !hasBlocking, issues };
}

// ==========================================
// GENERATION CONTRACT BUILDER
// ==========================================

export function buildGenerationContract(
  plan: AssessmentGenerationPlan,
  teacherContext?: AssessmentTeacherContext,
  sourceMaterials?: AssessmentGenerationSource[],
  academicSettingId?: string
): AssessmentGenerationContract {
  const spec = plan.generationSpec!;
  const resolvedSettingId =
    academicSettingId || resolveAuthoritativeAcademicSettingId({ generationPlan: plan }) || '';

  const objMap = new Map((spec.objectives || []).map((o) => [o.id, o]));
  const critMap = new Map((spec.criteria || []).map((c) => [c.id, c]));

  const hasPlannedItems = Array.isArray(plan.plannedItems) && plan.plannedItems.length > 0;
  const plannedCoverageUnitCounts = new Map<string, number>();
  if (hasPlannedItems) {
    plan.plannedItems!.forEach((pi) => {
      plannedCoverageUnitCounts.set(
        pi.coverageUnitId,
        (plannedCoverageUnitCounts.get(pi.coverageUnitId) || 0) + 1
      );
    });
  }

  const units: AssessmentGenerationContractUnit[] = [];

  for (const cov of plan.coverageUnits) {
    const isWrittenItemCoverage =
      cov.instrumentType === 'WRITTEN_TEST' && cov.allocationUnit === 'ITEM';

    if (isWrittenItemCoverage && hasPlannedItems) {
      const allocatedCount = plannedCoverageUnitCounts.get(cov.id) || 0;
      if (allocatedCount === 0) {
        continue;
      }
    }

    const obj = objMap.get(cov.objectiveRefId);
    const crit = cov.criterionId ? critMap.get(cov.criterionId) : undefined;

    const objectiveText = obj ? obj.text : '';
    const criterionText = crit
      ? crit.description
        ? `${crit.name}: ${crit.description}`
        : crit.name
      : undefined;

    const assessmentIndicator =
      typeof cov.assessmentIndicator === 'string' && cov.assessmentIndicator.trim()
        ? cov.assessmentIndicator.trim()
        : undefined;

    const indicatorSource: AssessmentGeneratedContentSource | undefined = assessmentIndicator
      ? ((cov as any).indicatorSource || 'TEACHER')
      : undefined;

    const materialOrContext =
      typeof cov.materialOrContext === 'string' && cov.materialOrContext.trim()
        ? cov.materialOrContext.trim()
        : undefined;

    const materialSource: AssessmentGeneratedContentSource | undefined = materialOrContext
      ? ((cov as any).materialSource || 'TEACHER')
      : undefined;

    const requiredCount =
      isWrittenItemCoverage && hasPlannedItems
        ? (plannedCoverageUnitCounts.get(cov.id) || 1)
        : (cov.recommendedCount || 1);

    units.push({
      coverageUnitId: cov.id,
      objectiveRefId: cov.objectiveRefId,
      criterionId: cov.criterionId,
      objectiveText,
      criterionText,
      instrumentType: cov.instrumentType!,
      allocationUnit: cov.allocationUnit!,
      requiredCount,
      cognitiveDemand: cov.cognitiveDemand,
      stimulusType: cov.stimulusType,
      difficultyTarget: cov.difficultyTarget,
      assessmentIndicator,
      materialOrContext,
      indicatorSource,
      materialSource,
    });
  }

  return {
    assessmentPlanId: spec.assessmentPlanId,
    assessmentPackageId: spec.assessmentPackageId,
    academicSettingId: resolvedSettingId,
    curriculumContext: spec.curriculumContext,
    gradeCalibration: spec.generationProfile?.gradeCalibration,
    subjectProfile: spec.subjectProfile,
    sourceContext: spec.sourceContext || [],
    constraints: plan.constraints,
    units,
    plannedItems: plan.plannedItems,
  };
}

// ==========================================
// PROMPT BUILDER
// ==========================================

export function buildGenerationPrompts(
  contract: AssessmentGenerationContract,
  teacherContext?: AssessmentTeacherContext,
  sourceMaterials?: AssessmentGenerationSource[]
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `Anda adalah Asisten Penulis Soal dan Asesmen Pembelajaran (AI Assessment Content Generator).
Peran Anda adalah menghasilkan draf butir asesmen (soal, tugas, rubrik, bukti, observasi) secara terstruktur berdasarkan kontrak yang telah disepakati.

ATURAN GENERASI KETAT:
1. AI ADALAH CONTENT GENERATOR, BUKAN RESOLVER:
   - JANGAN mengubah atau mengarang Tujuan Pembelajaran (TP) / Kompetensi Dasar (KD).
   - JANGAN mengubah atau mengarang kriteria KKTP.
   - coverageUnitId WAJIB dikembalikan pada setiap unit dan HARUS identik dengan coverageUnitId pada kontrak.
   - objectiveRefId, criterionId, instrumentType, dan allocationUnit adalah metadata canonical milik aplikasi dan BOLEH tidak diulang pada keluaran AI.
   - Jika objectiveRefId, criterionId, instrumentType, atau allocationUnit diulang oleh AI, nilainya HARUS identik dengan kontrak.
   - JANGAN mengubah jumlah butir/tugas (requiredCount). Hasilkan PERSIS sesuai requiredCount.
   - JANGAN mengklaim konten sintetis buatan AI sebagai dokumen resmi (OFFICIAL) atau regulasi pemerintah.
   - JANGAN menandai draf sebagai SIAP atau FINAL (seluruh keluaran adalah DRAFT).
   - UNTUK TES TERTULIS (WRITTEN_TEST): Rencana butir soal (plannedItems) bersifat AUTHORITATIVE. Setiap plannedItem menentukan TEPAT: sequence, coverageUnitId, itemType, cognitiveDemand, dan difficultyTarget. AI DILARANG menentukan ulang atau mengacak distribusi bentuk soal / kognitif / kesulitan. AI WAJIB menghasilkan 1 item untuk setiap plannedItem persis sesuai targetnya. Coverage unit WRITTEN_TEST ITEM tanpa plannedItem adalah target cakupan semantik, BUKAN perintah membuat butir fisik.

2. SEMANTIK ALOKASI & KONTRAK FIELD OUTPUT:

   A. ITEM — WRITTEN_TEST
   Gunakan field:
   - coverageUnitId: WAJIB.
   - itemType: WAJIB. Pilihan valid: MULTIPLE_CHOICE, MULTIPLE_SELECT, TRUE_FALSE, SHORT_ANSWER, ESSAY, MATCHING, CATEGORY_RESPONSE.
   - prompt: WAJIB, berupa teks soal.
   - stimulus: opsional.
   
   ATURAN KUNCI JAWABAN & PEDOMAN PENSKORAN WAJIB PER ITEM_TYPE:
   1. MULTIPLE_CHOICE:
      - options: WAJIB minimal 2 opsi, dengan TEPAT SATU opsi memiliki isCorrect: true (lainnya false).
      - proposedAnswer: WAJIB dengan answerType: "OPTION", optionIndices: [index_opsi_benar], value (teks opsi benar), dan explanation.
   2. MULTIPLE_SELECT:
      - options: WAJIB minimal 2 opsi, dengan SATU ATAU LEBIH opsi memiliki isCorrect: true.
      - proposedAnswer: WAJIB dengan answerType: "MULTIPLE_OPTION", optionIndices: [array_index_opsi_benar], dan explanation.
   3. TRUE_FALSE:
      - options: WAJIB 2 opsi (Benar / Salah) dengan tepat satu isCorrect: true.
      - proposedAnswer: WAJIB dengan answerType: "OPTION" atau "EXACT", value ("Benar" atau "Salah"), dan explanation.
   4. SHORT_ANSWER:
      - proposedAnswer: WAJIB dengan answerType: "EXACT" atau "EXPECTED_RESPONSE", value (teks jawaban singkat yang benar), dan explanation.
   5. ESSAY:
      - proposedAnswer: WAJIB dengan answerType: "EXPECTED_RESPONSE", value (pokok/contoh jawaban yang diharapkan), dan explanation.
      - scoringGuideDraft: WAJIB dengan instructions (pedoman/kriteria penskoran uraian) dan maxScore (skor maksimal, misal 10 atau 100).
   6. MATCHING:
      - matchingPremises: WAJIB minimal 2 premis dengan id dan text.
      - matchingResponses: WAJIB minimal 2 respon dengan id dan text.
      - proposedAnswer: WAJIB dengan answerType: "MATCHING", matchingPairs: array pasangan premiseId dan responseId.
   7. CATEGORY_RESPONSE:
      - categoryCategories: WAJIB minimal 2 kategori dengan id dan label.
      - categoryStatements: WAJIB minimal 2 pernyataan dengan id dan text.
      - proposedAnswer: WAJIB dengan answerType: "CATEGORY_RESPONSE", categoryAnswers: array pasangan statementId dan categoryId.

   CATATAN SANGAT PENTING:
   Setiap butir soal Tes Tertulis TANPA informasi penilaian (jawaban benar / proposedAnswer / scoringGuideDraft) dianggap DRAF TIDAK LENGKAP. AI DILARANG menghasilkan soal tanpa kunci jawaban atau pedoman penskoran.

   Contoh Pilihan Ganda Lengkap:
   {
     "coverageUnitId": "...",
     "itemType": "MULTIPLE_CHOICE",
     "prompt": "Berapakah hasil dari 2 + 3?",
     "options": [
       { "text": "4", "isCorrect": false },
       { "text": "5", "isCorrect": true },
       { "text": "6", "isCorrect": false }
     ],
     "proposedAnswer": {
       "answerType": "OPTION",
       "optionIndices": [1],
       "value": "5",
       "explanation": "2 ditambah 3 sama dengan 5."
     }
   }

   B. ITEM — ORAL_TEST
   Gunakan field:
   - coverageUnitId: WAJIB.
   - itemType: gunakan SHORT_ANSWER atau ESSAY.
   - prompt: WAJIB, berupa pertanyaan lisan.
   - proposedAnswer: opsional sebagai respons yang diharapkan.
   JANGAN mengubah tes lisan menjadi MULTIPLE_CHOICE kecuali kontrak/konteks secara eksplisit memerlukannya.

   C. ITEM — SELF_ASSESSMENT / PEER_ASSESSMENT
   Gunakan field:
   - coverageUnitId: WAJIB.
   - itemType: WAJIB, gunakan SHORT_ANSWER sebagai transport-compatible itemType.
   - prompt: WAJIB, berupa pernyataan (statement) penilaian diri atau penilaian antar-teman (refleksi/perilaku/sikap murid), bukan soal akademik yang memiliki satu jawaban benar.
   - proposedAnswer tidak diperlukan (dilarang membuat kunci jawaban atau correct answer).
   - jangan membuat pedoman penskoran atau kunci jawaban untuk SELF_ASSESSMENT atau PEER_ASSESSMENT.

   Contoh Penilaian Diri:
   {
     "coverageUnitId": "...",
     "itemType": "SHORT_ANSWER",
     "prompt": "Saya dapat menjelaskan bagian yang sudah saya kuasai."
   }

   Contoh Penilaian Antar-Teman:
   {
     "coverageUnitId": "...",
     "itemType": "SHORT_ANSWER",
     "prompt": "Teman saya berkontribusi aktif dalam kerja kelompok."
   }

   D. TASK — PERFORMANCE / ASSIGNMENT / PROJECT / PRODUCT
   Gunakan field:
   - coverageUnitId: WAJIB.
   - taskPrompt: WAJIB, berupa instruksi tugas yang dapat dilakukan murid.
   - taskTitle: opsional.
   - instructions: opsional.
   - expectedDeliverable: opsional.
   - aspects: opsional, berupa array objek dengan field "label" dan dapat memiliki "description" atau "weight".
   - rubricDraft: opsional.
   - scoringGuideDraft: opsional.

   Contoh:
   {
     "coverageUnitId": "...",
     "taskTitle": "Praktik Gerak Dasar",
     "taskPrompt": "Lakukan rangkaian gerak sesuai instruksi guru.",
     "instructions": "Lakukan secara tertib dan aman.",
     "aspects": [
       {
         "label": "Ketepatan gerakan",
         "description": "Gerakan sesuai contoh."
       }
     ]
   }

   JANGAN menggunakan field generik seperti:
   - "task"
   - "description" sebagai pengganti taskPrompt
   - "activity"
   - "content"

   sebagai field utama tugas.

   E. EVIDENCE — PORTFOLIO
   Gunakan field:
   - coverageUnitId: WAJIB.
   - evidenceRequirements: WAJIB, array string minimal 1 bukti.
   - instructions: opsional.
   - rubricDraft: opsional.
   - scoringGuideDraft: opsional.

   Contoh:
   {
     "coverageUnitId": "...",
     "instructions": "Kumpulkan bukti hasil pembelajaran.",
     "evidenceRequirements": [
       "Dokumentasi hasil praktik",
       "Catatan refleksi murid"
     ]
   }

   F. OBSERVATION — OBSERVATION
   Gunakan field:
   - coverageUnitId: WAJIB.
   - aspects: WAJIB, array minimal 1 objek.
   - setiap aspek WAJIB memiliki "label".
   - "indicator" sangat dianjurkan agar perilaku dapat diamati.
   - instructions: opsional.
   - recordingScheme: opsional.
   - rubricDraft: opsional.

   Contoh:
   {
     "coverageUnitId": "...",
     "instructions": "Amati murid selama aktivitas.",
     "aspects": [
       {
         "label": "Partisipasi aktif",
         "indicator": "Murid mengikuti aktivitas sesuai instruksi."
       }
     ]
   }

   JANGAN menggunakan:
   - "observations"
   - "criteria"
   - "indicators"

   sebagai pengganti field utama "aspects".

3. KOGNISI & BAHASA:
   - Pertahankan cognitiveDemand jika diberikan pada kontrak (RECALL_UNDERSTAND, APPLY, ANALYZE_REASON, EVALUATE_CREATE).
   - JANGAN memaksakan rumus persentase baku seperti 30% LOTS / 40% MOTS / 30% HOTS.
   - JANGAN menganggap HOTS = HARD atau LOTS = EASY.
   - Sesuaikan beban membaca dan bahasa dengan kalibrasi kelas murid tanpa mencetak metadata internal di dalam teks soal.

FORMAT KELUARAN:
Keluarkan HANYA JSON murni berupa array objek unit generasi.
Setiap objek WAJIB memiliki coverageUnitId yang identik dengan kontrak.
Fokuskan keluaran pada konten asesmen yang perlu dibuat.
Metadata canonical objectiveRefId, criterionId, instrumentType, dan allocationUnit tidak wajib diulang.
Jangan menambahkan teks pembuka, penutup, atau penjelasan di luar JSON.

Ikuti nama field JSON PERSIS sebagaimana kontrak semantic di atas.
JANGAN mengganti nama field dengan sinonim.
Untuk setiap coverage unit, gunakan bentuk output yang sesuai dengan allocationUnit pada kontrak:
- ITEM → itemType + prompt
- TASK → taskPrompt
- EVIDENCE → evidenceRequirements
- OBSERVATION → aspects

Jika beberapa instrumen berbeda berada dalam satu permintaan, hasilkan semua objek tersebut dalam SATU array JSON dan gunakan bentuk field masing-masing sesuai allocationUnit.`;

  const userPrompt = `Kontrak Generasi Asesmen:
Konteks Kurikulum: ${contract.curriculumContext.curriculumType || 'Kurikulum Merdeka'}, Tingkat: ${contract.curriculumContext.schoolLevel || ''}, Kelas: ${contract.curriculumContext.grade ? 'Kelas ' + contract.curriculumContext.grade : ''}, Fase: ${contract.curriculumContext.phase || ''}
Mata Pelajaran: ${contract.subjectProfile.subjectLabel || contract.subjectProfile.subjectKey}

${
  contract.gradeCalibration
    ? `Kalibrasi Tingkat Kelas:
- Reading Load: ${contract.gradeCalibration.readingLoad}
- Instruction Load: ${contract.gradeCalibration.instructionLoad}
- Abstraction Level: ${contract.gradeCalibration.abstractionLevel}
- Visual Support: ${contract.gradeCalibration.visualSupport}`
    : ''
}

${
  teacherContext
    ? `Konteks Tambahan dari Guru:
${teacherContext.instructions ? `- Instruksi: ${teacherContext.instructions}` : ''}
${teacherContext.localContext ? `- Konteks Lokal: ${teacherContext.localContext}` : ''}
${teacherContext.focusAreas?.length ? `- Fokus: ${teacherContext.focusAreas.join(', ')}` : ''}`
    : ''
}

${
  sourceMaterials?.length
    ? `Materi Sumber Belajar:
${sourceMaterials.map((s, i) => `[Sumber ${i + 1}: ${s.title}] ${s.content}`).join('\n')}`
    : ''
}

DAFTAR UNIT YANG WAJIB DIGENERASI (${contract.units.length} UNIT, TOTAL ${contract.units.reduce((s, u) => s + (u.requiredCount || 1), 0)} HASIL):
${JSON.stringify(contract.units, null, 2)}

${
  contract.plannedItems && contract.plannedItems.length > 0
    ? `DAFTAR RENCANA BUTIR SOAL INDIVIDUAL TES TERTULIS (PLANNED ITEMS - TOTAL ${contract.plannedItems.length} BUTIR):
AI WAJIB menghasilkan TEPAT ${contract.plannedItems.length} butir tes tertulis secara individual, 1-ke-1 mengikuti target tiap planned item:
${JSON.stringify(
  contract.plannedItems.map((pi) => ({
    plannedItemId: pi.id,
    sequence: pi.sequence,
    coverageUnitId: pi.coverageUnitId,
    itemType: pi.itemType,
    cognitiveDemand: pi.cognitiveDemand,
    difficultyTarget: pi.difficultyTarget,
  })),
  null,
  2
)}
`
    : ''
}
${
  contract.units.some((u) => u.allocationUnit === 'ITEM' && (u.requiredCount || 1) > 1) ||
  contract.units.reduce((s, u) => s + (u.requiredCount || 1), 0) > contract.units.length
    ? `INSTRUKSI JUMLAH BUTIR SOAL SANGAT PENTING:
Total butir/soal yang wajib dihasilkan adalah TEPAT ${contract.units.reduce((s, u) => s + (u.requiredCount || 1), 0)} butir (sesuai requiredCount pada masing-masing unit).
Hasilkan setiap butir sebagai objek terpisah di dalam JSON array keluaran dengan coverageUnitId yang bersangkutan. JANGAN hanya menghasilkan 1 soal!`
    : ''
}

Hasilkan JSON array dari objek GeneratedAssessmentUnit yang mencakup setiap unit di atas sesuai requiredCount masing-masing.`;

  return { systemPrompt, userPrompt };
}

// ==========================================
// RUNTIME PARSING & REFERENCE VALIDATION
// ==========================================

export interface ParsedAIResponseResult {
  validatedUnits: GeneratedAssessmentUnit[];
  failedCoverageUnitIds: string[];
  issues: AssessmentGenerationIssue[];
}

export function parseAndValidateRawAIResponse(
  rawText: string,
  contract: AssessmentGenerationContract
): ParsedAIResponseResult {
  const issues: AssessmentGenerationIssue[] = [];
  const validatedUnits: GeneratedAssessmentUnit[] = [];
  const contractMap = new Map(contract.units.map((u) => [u.coverageUnitId, u]));

  let parsedRaw: any;
  try {
    let cleanText = (rawText || '').trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    parsedRaw = JSON.parse(cleanText);
  } catch (err: any) {
    return {
      validatedUnits: [],
      failedCoverageUnitIds: contract.units.map((u) => u.coverageUnitId),
      issues: [
        {
          code: 'MALFORMED_AI_RESPONSE',
          severity: 'BLOCKING',
          message: `Gagal mem-parsing keluaran AI sebagai JSON: ${err.message || 'SyntaxError'}`,
        },
      ],
    };
  }

  let candidates: any[] = [];
  if (Array.isArray(parsedRaw)) {
    candidates = parsedRaw;
  } else if (parsedRaw && Array.isArray(parsedRaw.units)) {
    candidates = parsedRaw.units;
  } else if (parsedRaw && Array.isArray(parsedRaw.items)) {
    candidates = parsedRaw.items;
  } else if (parsedRaw && typeof parsedRaw === 'object') {
    // Single unit wrapped in object
    candidates = [parsedRaw];
  } else {
    return {
      validatedUnits: [],
      failedCoverageUnitIds: contract.units.map((u) => u.coverageUnitId),
      issues: [
        {
          code: 'INVALID_AI_RESPONSE_STRUCTURE',
          severity: 'BLOCKING',
          message: 'Keluaran AI bukan merupakan array unit generasi yang valid.',
        },
      ],
    };
  }

  const generatedCountPerCoverage = new Map<string, number>();

  const hasPlannedItems = Array.isArray(contract.plannedItems) && contract.plannedItems.length > 0;
  const plannedItemByIdMap = new Map((contract.plannedItems || []).map((p) => [p.id, p]));
  const plannedItemBySeqMap = new Map((contract.plannedItems || []).map((p) => [p.sequence, p]));
  const plannedWrittenCoverageUnitIds = new Set((contract.plannedItems || []).map((p) => p.coverageUnitId));
  const fulfilledPlannedItemIds = new Set<string>();
  let writtenCandidateIndex = 0;

  candidates.forEach((candidate, idx) => {
    if (!candidate || typeof candidate !== 'object') {
      issues.push({
        code: 'INVALID_CANDIDATE_OBJECT',
        severity: 'REVIEW',
        message: `Kandidat unit #${idx + 1} bukan objek yang valid.`,
      });
      return;
    }

    const covId = candidate.coverageUnitId;
    if (!covId || typeof covId !== 'string') {
      issues.push({
        code: 'MISSING_COVERAGE_UNIT_ID',
        severity: 'REVIEW',
        message: `Kandidat unit #${idx + 1} tidak memiliki coverageUnitId.`,
      });
      return;
    }

    const contractUnit = contractMap.get(covId);
    if (!contractUnit) {
      issues.push({
        code: 'UNKNOWN_COVERAGE_UNIT_ID',
        severity: 'REVIEW',
        message: `Kandidat unit #${idx + 1} memiliki coverageUnitId [${covId}] yang tidak terdaftar pada kontrak.`,
      });
      return;
    }

    // Reference Integrity Checks against Contract (ID > TEXT MATCH)
    //
    // coverageUnitId is the mandatory canonical lookup key.
    // Once a valid coverageUnitId resolves to a contract unit,
    // canonical metadata may be omitted by the AI and hydrated
    // from the GenerationContract.
    //
    // Missing canonical echo != mismatch.
    // Explicit conflicting canonical value = mismatch.

    if (
      candidate.objectiveRefId !== undefined &&
      candidate.objectiveRefId !== contractUnit.objectiveRefId
    ) {
      issues.push({
        code: 'OBJECTIVE_REF_MISMATCH',
        severity: 'REVIEW',
        message: `Kandidat unit #${idx + 1} mengubah objectiveRefId [${candidate.objectiveRefId}] (harus [${contractUnit.objectiveRefId}]).`,
        objectiveRefId: contractUnit.objectiveRefId,
      });
      return;
    }

    if (candidate.criterionId !== undefined) {
      const candidateCrit = candidate.criterionId || undefined;
      const contractCrit = contractUnit.criterionId || undefined;

      if (candidateCrit !== contractCrit) {
        issues.push({
          code: 'CRITERION_REF_MISMATCH',
          severity: 'REVIEW',
          message: `Kandidat unit #${idx + 1} tidak cocok criterionId [${candidateCrit}] vs [${contractCrit}].`,
          objectiveRefId: contractUnit.objectiveRefId,
          criterionId: contractUnit.criterionId,
        });
        return;
      }
    }

    if (
      candidate.instrumentType !== undefined &&
      candidate.instrumentType !== contractUnit.instrumentType
    ) {
      issues.push({
        code: 'INSTRUMENT_TYPE_MISMATCH',
        severity: 'REVIEW',
        message: `Kandidat unit #${idx + 1} mengubah instrumentType [${candidate.instrumentType}] vs [${contractUnit.instrumentType}].`,
        objectiveRefId: contractUnit.objectiveRefId,
      });
      return;
    }

    if (
      candidate.allocationUnit !== undefined &&
      candidate.allocationUnit !== contractUnit.allocationUnit
    ) {
      issues.push({
        code: 'ALLOCATION_UNIT_MISMATCH',
        severity: 'REVIEW',
        message: `Kandidat unit #${idx + 1} mengubah allocationUnit [${candidate.allocationUnit}] vs [${contractUnit.allocationUnit}].`,
        objectiveRefId: contractUnit.objectiveRefId,
      });
      return;
    }

    // Extract candidate provenance & metadata
    const candIndicator =
      typeof candidate.assessmentIndicator === 'string' && candidate.assessmentIndicator.trim()
        ? candidate.assessmentIndicator.trim()
        : undefined;

    const assessmentIndicator = contractUnit.assessmentIndicator || candIndicator;
    const indicatorSource: AssessmentGeneratedContentSource | undefined = contractUnit.assessmentIndicator
      ? contractUnit.indicatorSource || 'TEACHER'
      : candIndicator
      ? 'AI_DRAFT'
      : undefined;

    const candMaterial =
      typeof candidate.materialOrContext === 'string' && candidate.materialOrContext.trim()
        ? candidate.materialOrContext.trim()
        : undefined;

    const materialOrContext = contractUnit.materialOrContext || candMaterial;
    const materialSource: AssessmentGeneratedContentSource | undefined = contractUnit.materialOrContext
      ? contractUnit.materialSource || 'TEACHER'
      : candMaterial
      ? 'AI_SYNTHETIC'
      : undefined;

    // Semantic Family Validation
    switch (contractUnit.allocationUnit) {
      case 'ITEM': {
        const isSelfPeerAssessment =
          contractUnit.instrumentType === 'SELF_ASSESSMENT' ||
          contractUnit.instrumentType === 'PEER_ASSESSMENT';

        if (
          isSelfPeerAssessment &&
          candidate.itemType !== 'SHORT_ANSWER'
        ) {
          issues.push({
            code: 'INVALID_SELF_PEER_ITEM_TYPE',
            severity: 'REVIEW',
            message:
              `Kandidat ITEM #${idx + 1} untuk ${contractUnit.instrumentType} wajib menggunakan itemType SHORT_ANSWER.`,
            objectiveRefId: contractUnit.objectiveRefId,
          });
          return;
        }

        const itemType =
          candidate.itemType ||
          (contractUnit.instrumentType === 'ORAL_TEST'
            ? 'SHORT_ANSWER'
            : 'MULTIPLE_CHOICE');
        if (!VALID_WRITTEN_ITEM_TYPES.has(itemType)) {
          issues.push({
            code: 'INVALID_ITEM_TYPE',
            severity: 'REVIEW',
            message: `Kandidat ITEM #${idx + 1} memiliki itemType tidak valid [${itemType}].`,
            objectiveRefId: contractUnit.objectiveRefId,
          });
          return;
        }

        let matchedPlannedItem: AssessmentPlannedItem | undefined;
        if (
          hasPlannedItems &&
          contractUnit.instrumentType === 'WRITTEN_TEST' &&
          contractUnit.allocationUnit === 'ITEM'
        ) {
          writtenCandidateIndex++;
          if (candidate.plannedItemId && plannedItemByIdMap.has(candidate.plannedItemId)) {
            matchedPlannedItem = plannedItemByIdMap.get(candidate.plannedItemId);
          } else if (typeof candidate.sequence === 'number' && plannedItemBySeqMap.has(candidate.sequence)) {
            matchedPlannedItem = plannedItemBySeqMap.get(candidate.sequence);
          } else {
            matchedPlannedItem = plannedItemBySeqMap.get(writtenCandidateIndex);
          }

          if (matchedPlannedItem) {
            if (covId !== matchedPlannedItem.coverageUnitId) {
              issues.push({
                code: 'PLANNED_ITEM_COVERAGE_MISMATCH',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} memiliki coverageUnitId [${covId}] berbeda dengan target plannedItem [${matchedPlannedItem.coverageUnitId}].`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              return;
            }

            if (matchedPlannedItem.itemType && itemType !== matchedPlannedItem.itemType) {
              issues.push({
                code: 'PLANNED_ITEM_TYPE_MISMATCH',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} memiliki itemType [${itemType}] berbeda dengan target plannedItem [${matchedPlannedItem.itemType}].`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              return;
            }

            let candidateCognitiveDemand: string | undefined = undefined;
            if (typeof candidate.cognitiveDemand === 'string') {
              const trimmed = candidate.cognitiveDemand.trim();
              if (trimmed.length > 0) {
                candidateCognitiveDemand = trimmed;
              }
            } else if (candidate.cognitiveDemand !== undefined && candidate.cognitiveDemand !== null) {
              candidateCognitiveDemand = String(candidate.cognitiveDemand);
            }

            if (candidateCognitiveDemand !== undefined && candidateCognitiveDemand !== matchedPlannedItem.cognitiveDemand) {
              issues.push({
                code: 'PLANNED_ITEM_COGNITIVE_DEMAND_MISMATCH',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} memiliki cognitiveDemand [${candidateCognitiveDemand}] berbeda dengan target plannedItem [${matchedPlannedItem.cognitiveDemand}].`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              return;
            }

            let candidateDifficultyTarget: string | undefined = undefined;
            if (typeof candidate.difficultyTarget === 'string') {
              const trimmed = candidate.difficultyTarget.trim();
              if (trimmed.length > 0) {
                candidateDifficultyTarget = trimmed;
              }
            } else if (candidate.difficultyTarget !== undefined && candidate.difficultyTarget !== null) {
              candidateDifficultyTarget = String(candidate.difficultyTarget);
            }

            if (candidateDifficultyTarget !== undefined && candidateDifficultyTarget !== matchedPlannedItem.difficultyTarget) {
              issues.push({
                code: 'PLANNED_ITEM_DIFFICULTY_TARGET_MISMATCH',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} memiliki difficultyTarget [${candidateDifficultyTarget}] berbeda dengan target plannedItem [${matchedPlannedItem.difficultyTarget}].`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              return;
            }

            fulfilledPlannedItemIds.add(matchedPlannedItem.id);
          }
        }

        const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim() : '';
        if (!prompt) {
          issues.push({
            code: 'EMPTY_ITEM_PROMPT',
            severity: 'REVIEW',
            message: `Kandidat ITEM #${idx + 1} memiliki prompt kosong.`,
            objectiveRefId: contractUnit.objectiveRefId,
          });
          return;
        }

        let parsedOptions: { id?: string; text: string; isCorrect?: boolean }[] | undefined;

        if (itemType === 'MULTIPLE_CHOICE' || itemType === 'MULTIPLE_SELECT' || Array.isArray(candidate.options)) {
          if (!Array.isArray(candidate.options) || candidate.options.length < 2) {
            issues.push({
              code: 'INVALID_OPTION_STRUCTURE',
              severity: 'REVIEW',
              message: `Kandidat ITEM #${idx + 1} tipe ${itemType} wajib memiliki minimal 2 opsi jawaban.`,
              objectiveRefId: contractUnit.objectiveRefId,
            });
            return;
          }

          const validOpts: { id?: string; text: string; isCorrect?: boolean }[] = [];
          let hasInvalidOption = false;

          for (let oIdx = 0; oIdx < candidate.options.length; oIdx++) {
            const opt = candidate.options[oIdx];
            if (typeof opt === 'string') {
              const trimmed = opt.trim();
              if (!trimmed) {
                hasInvalidOption = true;
                break;
              }
              validOpts.push({ text: trimmed });
            } else if (opt && typeof opt === 'object' && !Array.isArray(opt)) {
              if (typeof opt.text !== 'string' || !opt.text.trim()) {
                hasInvalidOption = true;
                break;
              }
              validOpts.push({
                id: typeof opt.id === 'string' && opt.id.trim() ? opt.id.trim() : undefined,
                text: opt.text.trim(),
                isCorrect: typeof opt.isCorrect === 'boolean' ? opt.isCorrect : undefined,
              });
            } else {
              hasInvalidOption = true;
              break;
            }
          }

          if (hasInvalidOption || validOpts.length < 2) {
            issues.push({
              code: 'INVALID_OPTION_TEXT',
              severity: 'REVIEW',
              message: `Kandidat ITEM #${idx + 1} memiliki opsi jawaban yang kosong, tidak valid, atau bukan string.`,
              objectiveRefId: contractUnit.objectiveRefId,
            });
            return;
          }

          parsedOptions = validOpts;
        }

        // Evaluation Completeness Validation for WRITTEN_TEST Items
        if (contractUnit.instrumentType === 'WRITTEN_TEST') {
          const hasOptionCorrect = parsedOptions?.some((o) => o.isCorrect === true);
          const hasProposedAns = candidate.proposedAnswer && (
            candidate.proposedAnswer.value ||
            (Array.isArray(candidate.proposedAnswer.optionIndices) && candidate.proposedAnswer.optionIndices.length > 0) ||
            (Array.isArray(candidate.proposedAnswer.matchingPairs) && candidate.proposedAnswer.matchingPairs.length > 0) ||
            (Array.isArray(candidate.proposedAnswer.categoryAnswers) && candidate.proposedAnswer.categoryAnswers.length > 0)
          );

          if (itemType === 'MULTIPLE_CHOICE' || itemType === 'MULTIPLE_SELECT' || itemType === 'TRUE_FALSE') {
            if (!hasOptionCorrect && !hasProposedAns) {
              issues.push({
                code: 'MISSING_ITEM_ANSWER_KEY',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} (${itemType}) tidak memiliki jawaban benar pada options atau proposedAnswer.`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              return;
            }
          } else if (itemType === 'SHORT_ANSWER') {
            const hasValidSAValue =
              typeof candidate.proposedAnswer?.value === 'string' &&
              candidate.proposedAnswer.value.trim().length > 0;

            if (!hasValidSAValue) {
              issues.push({
                code: 'MISSING_ITEM_PROPOSED_ANSWER',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} (SHORT_ANSWER) wajib memiliki proposedAnswer.value sebagai jawaban acuan.`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              return;
            }
          } else if (itemType === 'ESSAY') {
            let hasEssayError = false;

            const hasEssayExpectedResponse =
              typeof candidate.proposedAnswer?.value === 'string' &&
              candidate.proposedAnswer.value.trim().length > 0;

            if (!hasEssayExpectedResponse) {
              issues.push({
                code: 'MISSING_ITEM_PROPOSED_ANSWER',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} (ESSAY) wajib memiliki proposedAnswer.value sebagai pokok/rambu jawaban acuan.`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              hasEssayError = true;
            }

            const hasScoringGuideInstructions =
              candidate.scoringGuideDraft &&
              typeof candidate.scoringGuideDraft.instructions === 'string' &&
              candidate.scoringGuideDraft.instructions.trim().length > 0;

            const hasValidMaxScore =
              candidate.scoringGuideDraft &&
              typeof candidate.scoringGuideDraft.maxScore === 'number' &&
              Number.isFinite(candidate.scoringGuideDraft.maxScore) &&
              candidate.scoringGuideDraft.maxScore > 0;

            if (!hasScoringGuideInstructions || !hasValidMaxScore) {
              issues.push({
                code: 'MISSING_ESSAY_SCORING_GUIDE',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} (ESSAY) wajib memiliki scoringGuideDraft dengan instruksi pedoman penskoran dan maxScore > 0.`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              hasEssayError = true;
            }

            if (hasEssayError) {
              return;
            }
          } else if (itemType === 'MATCHING') {
            const hasMatchingPairs =
              hasProposedAns || (Array.isArray(candidate.matchingPairs) && candidate.matchingPairs.length > 0);
            if (!hasMatchingPairs) {
              issues.push({
                code: 'MISSING_MATCHING_PAIRS',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} (MATCHING) wajib memiliki pasangan kunci jawaban (matchingPairs).`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              return;
            }
          } else if (itemType === 'CATEGORY_RESPONSE') {
            const hasCatAnswers =
              hasProposedAns ||
              (Array.isArray(candidate.categoryStatements) &&
                candidate.categoryStatements.some((s: any) => s && s.correctCategoryId));
            if (!hasCatAnswers) {
              issues.push({
                code: 'MISSING_CATEGORY_ANSWERS',
                severity: 'REVIEW',
                message: `Kandidat ITEM #${idx + 1} (CATEGORY_RESPONSE) wajib memiliki kunci jawaban kategori (categoryAnswers).`,
                objectiveRefId: contractUnit.objectiveRefId,
              });
              return;
            }
          }
        }

        const scoringGuideDraft =
          candidate.scoringGuideDraft && typeof candidate.scoringGuideDraft === 'object'
            ? {
                instructions:
                  typeof candidate.scoringGuideDraft.instructions === 'string' &&
                  candidate.scoringGuideDraft.instructions.trim()
                    ? candidate.scoringGuideDraft.instructions.trim()
                    : undefined,
                maxScore:
                  typeof candidate.scoringGuideDraft.maxScore === 'number' &&
                  Number.isFinite(candidate.scoringGuideDraft.maxScore) &&
                  candidate.scoringGuideDraft.maxScore > 0
                    ? candidate.scoringGuideDraft.maxScore
                    : undefined,
              }
            : undefined;

        const itemUnit: GeneratedItemUnit = {
          allocationUnit: 'ITEM',
          coverageUnitId: contractUnit.coverageUnitId,
          objectiveRefId: contractUnit.objectiveRefId,
          criterionId: contractUnit.criterionId,
          instrumentType: contractUnit.instrumentType,
          itemType,
          prompt,
          stimulus: typeof candidate.stimulus === 'string' && candidate.stimulus.trim() ? candidate.stimulus.trim() : undefined,
          stimulusOrigin: candidate.stimulus ? 'AI_SYNTHETIC' : undefined,
          stimulusSource: typeof candidate.stimulusSource === 'string' && candidate.stimulusSource.trim() ? candidate.stimulusSource.trim() : undefined,
          options: parsedOptions,
          matchingPremises: Array.isArray(candidate.matchingPremises) ? candidate.matchingPremises : undefined,
          matchingResponses: Array.isArray(candidate.matchingResponses) ? candidate.matchingResponses : undefined,
          categoryStatements: Array.isArray(candidate.categoryStatements) ? candidate.categoryStatements : undefined,
          categoryCategories: Array.isArray(candidate.categoryCategories) ? candidate.categoryCategories : undefined,
          responseScheme: typeof candidate.responseScheme === 'string' && candidate.responseScheme.trim() ? candidate.responseScheme.trim() : undefined,
          proposedAnswer: candidate.proposedAnswer
            ? {
                answerType: candidate.proposedAnswer.answerType || 'OPTION',
                value: candidate.proposedAnswer.value,
                optionIndices: Array.isArray(candidate.proposedAnswer.optionIndices)
                  ? candidate.proposedAnswer.optionIndices
                  : undefined,
                matchingPairs: Array.isArray(candidate.proposedAnswer.matchingPairs)
                  ? candidate.proposedAnswer.matchingPairs
                  : undefined,
                categoryAnswers: Array.isArray(candidate.proposedAnswer.categoryAnswers)
                  ? candidate.proposedAnswer.categoryAnswers
                  : undefined,
                explanation: candidate.proposedAnswer.explanation,
              }
            : undefined,
          scoringGuideDraft,
          assessmentIndicator,
          indicatorSource,
          materialOrContext,
          materialSource,
          plannedItemId: matchedPlannedItem?.id || candidate.plannedItemId,
          sequence: matchedPlannedItem?.sequence || candidate.sequence,
        };

        const canonicalCognitiveDemand = matchedPlannedItem?.cognitiveDemand || contractUnit.cognitiveDemand;
        if (canonicalCognitiveDemand) {
          (itemUnit as any).cognitiveDemand = canonicalCognitiveDemand;
        }

        const canonicalDifficultyTarget = matchedPlannedItem?.difficultyTarget || contractUnit.difficultyTarget;
        if (canonicalDifficultyTarget) {
          (itemUnit as any).difficultyTarget = canonicalDifficultyTarget;
        }

        validatedUnits.push(itemUnit);
        generatedCountPerCoverage.set(covId, (generatedCountPerCoverage.get(covId) || 0) + 1);
        break;
      }

      case 'TASK': {
        const taskPrompt =
          typeof candidate.taskPrompt === 'string' && candidate.taskPrompt.trim()
            ? candidate.taskPrompt.trim()
            : typeof candidate.instructions === 'string' && candidate.instructions.trim()
            ? candidate.instructions.trim()
            : typeof candidate.taskTitle === 'string' && candidate.taskTitle.trim()
            ? candidate.taskTitle.trim()
            : '';

        if (!taskPrompt) {
          issues.push({
            code: 'EMPTY_TASK_PROMPT',
            severity: 'REVIEW',
            message: `Kandidat TASK #${idx + 1} tidak memiliki instruksi/tugas yang jelas.`,
            objectiveRefId: contractUnit.objectiveRefId,
          });
          return;
        }

        const taskTitle =
          typeof candidate.taskTitle === 'string' && candidate.taskTitle.trim()
            ? candidate.taskTitle.trim()
            : taskPrompt.length > 40
            ? `${taskPrompt.slice(0, 40)}...`
            : taskPrompt;

        const taskInstructions =
          typeof candidate.instructions === 'string' && candidate.instructions.trim()
            ? candidate.instructions.trim()
            : undefined;

        const expectedDeliverable =
          typeof candidate.expectedDeliverable === 'string' && candidate.expectedDeliverable.trim()
            ? candidate.expectedDeliverable.trim()
            : undefined;

        const aspects = Array.isArray(candidate.aspects)
          ? candidate.aspects
              .filter(
                (asp: any) =>
                  asp &&
                  typeof asp === 'object' &&
                  typeof (asp.label || asp.name) === 'string' &&
                  (asp.label || asp.name).trim()
              )
              .map((asp: any) => ({
                label: (asp.label || asp.name).trim(),
                description:
                  typeof asp.description === 'string' && asp.description.trim() ? asp.description.trim() : undefined,
                weight:
                  typeof asp.weight === 'number' && Number.isFinite(asp.weight) && asp.weight > 0
                    ? asp.weight
                    : undefined,
              }))
          : undefined;

        const rubricDraft =
          candidate.rubricDraft && typeof candidate.rubricDraft === 'object'
            ? {
                title:
                  typeof candidate.rubricDraft.title === 'string' && candidate.rubricDraft.title.trim()
                    ? candidate.rubricDraft.title.trim()
                    : undefined,
                criteria: Array.isArray(candidate.rubricDraft.criteria)
                  ? candidate.rubricDraft.criteria
                      .filter(
                        (c: any) =>
                          c &&
                          typeof c === 'object' &&
                          typeof (c.label || c.name) === 'string' &&
                          (c.label || c.name).trim()
                      )
                      .map((c: any) => ({
                        label: (c.label || c.name).trim(),
                        indicator:
                          typeof c.indicator === 'string' && c.indicator.trim() ? c.indicator.trim() : undefined,
                        weight:
                          typeof c.weight === 'number' && Number.isFinite(c.weight) && c.weight > 0
                            ? c.weight
                            : undefined,
                      }))
                  : [],
                scale: Array.isArray(candidate.rubricDraft.scale)
                  ? candidate.rubricDraft.scale
                      .filter(
                        (s: any) =>
                          s &&
                          typeof s === 'object' &&
                          typeof s.label === 'string' &&
                          s.label.trim()
                      )
                      .map((s: any, sIdx: number) => ({
                        label: s.label.trim(),
                        score: typeof s.score === 'number' && Number.isFinite(s.score) ? s.score : sIdx + 1,
                        descriptor:
                          typeof s.descriptor === 'string' && s.descriptor.trim() ? s.descriptor.trim() : undefined,
                        order: typeof s.order === 'number' && Number.isFinite(s.order) ? s.order : sIdx + 1,
                      }))
                  : [],
              }
            : undefined;

        const scoringGuideDraft =
          candidate.scoringGuideDraft && typeof candidate.scoringGuideDraft === 'object'
            ? {
                instructions:
                  typeof candidate.scoringGuideDraft.instructions === 'string' &&
                  candidate.scoringGuideDraft.instructions.trim()
                    ? candidate.scoringGuideDraft.instructions.trim()
                    : undefined,
                maxScore:
                  typeof candidate.scoringGuideDraft.maxScore === 'number' &&
                  Number.isFinite(candidate.scoringGuideDraft.maxScore) &&
                  candidate.scoringGuideDraft.maxScore > 0
                    ? candidate.scoringGuideDraft.maxScore
                    : undefined,
              }
            : undefined;

        const taskUnit: GeneratedTaskUnit = {
          allocationUnit: 'TASK',
          coverageUnitId: contractUnit.coverageUnitId,
          objectiveRefId: contractUnit.objectiveRefId,
          criterionId: contractUnit.criterionId,
          instrumentType: contractUnit.instrumentType,
          taskTitle,
          taskPrompt,
          instructions: taskInstructions,
          expectedDeliverable,
          aspects: aspects && aspects.length > 0 ? aspects : undefined,
          rubricDraft: rubricDraft && rubricDraft.criteria.length > 0 ? rubricDraft : undefined,
          scoringGuideDraft,
          assessmentIndicator,
          indicatorSource,
          materialOrContext,
          materialSource,
        };

        validatedUnits.push(taskUnit);
        generatedCountPerCoverage.set(covId, (generatedCountPerCoverage.get(covId) || 0) + 1);
        break;
      }

      case 'EVIDENCE': {
        const rawReqs = Array.isArray(candidate.evidenceRequirements)
          ? candidate.evidenceRequirements
          : typeof candidate.instructions === 'string' && candidate.instructions.trim()
          ? [candidate.instructions.trim()]
          : [];

        const evidenceRequirements = rawReqs
          .filter((r: any) => typeof r === 'string' && r.trim().length > 0)
          .map((r: string) => r.trim());

        if (evidenceRequirements.length === 0) {
          issues.push({
            code: 'EMPTY_EVIDENCE_REQUIREMENTS',
            severity: 'REVIEW',
            message: `Kandidat EVIDENCE #${idx + 1} tidak memiliki persyaratan bukti portofolio.`,
            objectiveRefId: contractUnit.objectiveRefId,
          });
          return;
        }

        const instructions =
          typeof candidate.instructions === 'string' && candidate.instructions.trim()
            ? candidate.instructions.trim()
            : undefined;

        const rubricDraft =
          candidate.rubricDraft && typeof candidate.rubricDraft === 'object'
            ? {
                title:
                  typeof candidate.rubricDraft.title === 'string' && candidate.rubricDraft.title.trim()
                    ? candidate.rubricDraft.title.trim()
                    : undefined,
                criteria: Array.isArray(candidate.rubricDraft.criteria)
                  ? candidate.rubricDraft.criteria
                      .filter(
                        (c: any) =>
                          c &&
                          typeof c === 'object' &&
                          typeof (c.label || c.name) === 'string' &&
                          (c.label || c.name).trim()
                      )
                      .map((c: any) => ({
                        label: (c.label || c.name).trim(),
                        indicator:
                          typeof c.indicator === 'string' && c.indicator.trim() ? c.indicator.trim() : undefined,
                        weight:
                          typeof c.weight === 'number' && Number.isFinite(c.weight) && c.weight > 0
                            ? c.weight
                            : undefined,
                      }))
                  : [],
                scale: Array.isArray(candidate.rubricDraft.scale)
                  ? candidate.rubricDraft.scale
                      .filter(
                        (s: any) =>
                          s &&
                          typeof s === 'object' &&
                          typeof s.label === 'string' &&
                          s.label.trim()
                      )
                      .map((s: any, sIdx: number) => ({
                        label: s.label.trim(),
                        score: typeof s.score === 'number' && Number.isFinite(s.score) ? s.score : sIdx + 1,
                        descriptor:
                          typeof s.descriptor === 'string' && s.descriptor.trim() ? s.descriptor.trim() : undefined,
                        order: typeof s.order === 'number' && Number.isFinite(s.order) ? s.order : sIdx + 1,
                      }))
                  : [],
              }
            : undefined;

        const scoringGuideDraft =
          candidate.scoringGuideDraft && typeof candidate.scoringGuideDraft === 'object'
            ? {
                instructions:
                  typeof candidate.scoringGuideDraft.instructions === 'string' &&
                  candidate.scoringGuideDraft.instructions.trim()
                    ? candidate.scoringGuideDraft.instructions.trim()
                    : undefined,
                maxScore:
                  typeof candidate.scoringGuideDraft.maxScore === 'number' &&
                  Number.isFinite(candidate.scoringGuideDraft.maxScore) &&
                  candidate.scoringGuideDraft.maxScore > 0
                    ? candidate.scoringGuideDraft.maxScore
                    : undefined,
              }
            : undefined;

        const evidenceUnit: GeneratedEvidenceUnit = {
          allocationUnit: 'EVIDENCE',
          coverageUnitId: contractUnit.coverageUnitId,
          objectiveRefId: contractUnit.objectiveRefId,
          criterionId: contractUnit.criterionId,
          instrumentType: contractUnit.instrumentType,
          instructions,
          evidenceRequirements,
          rubricDraft: rubricDraft && rubricDraft.criteria.length > 0 ? rubricDraft : undefined,
          scoringGuideDraft,
          assessmentIndicator,
          indicatorSource,
          materialOrContext,
          materialSource,
        };

        validatedUnits.push(evidenceUnit);
        generatedCountPerCoverage.set(covId, (generatedCountPerCoverage.get(covId) || 0) + 1);
        break;
      }

      case 'OBSERVATION': {
        const rawAspects = Array.isArray(candidate.aspects) ? candidate.aspects : [];
        const aspects = rawAspects
          .filter(
            (asp: any) =>
              asp &&
              typeof asp === 'object' &&
              typeof (asp.label || asp.name) === 'string' &&
              (asp.label || asp.name).trim()
          )
          .map((asp: any) => ({
            label: (asp.label || asp.name).trim(),
            indicator:
              typeof asp.indicator === 'string' && asp.indicator.trim() ? asp.indicator.trim() : undefined,
          }));

        if (aspects.length === 0) {
          issues.push({
            code: 'EMPTY_OBSERVATION_ASPECTS',
            severity: 'REVIEW',
            message: `Kandidat OBSERVATION #${idx + 1} tidak memiliki aspek pengamatan yang valid.`,
            objectiveRefId: contractUnit.objectiveRefId,
          });
          return;
        }

        const recordingScheme =
          typeof candidate.recordingScheme === 'string' && candidate.recordingScheme.trim()
            ? candidate.recordingScheme.trim()
            : undefined;

        const instructions =
          typeof candidate.instructions === 'string' && candidate.instructions.trim()
            ? candidate.instructions.trim()
            : undefined;

        const rubricDraft =
          candidate.rubricDraft && typeof candidate.rubricDraft === 'object'
            ? {
                title:
                  typeof candidate.rubricDraft.title === 'string' && candidate.rubricDraft.title.trim()
                    ? candidate.rubricDraft.title.trim()
                    : undefined,
                criteria: Array.isArray(candidate.rubricDraft.criteria)
                  ? candidate.rubricDraft.criteria
                      .filter(
                        (c: any) =>
                          c &&
                          typeof c === 'object' &&
                          typeof (c.label || c.name) === 'string' &&
                          (c.label || c.name).trim()
                      )
                      .map((c: any) => ({
                        label: (c.label || c.name).trim(),
                        indicator:
                          typeof c.indicator === 'string' && c.indicator.trim() ? c.indicator.trim() : undefined,
                      }))
                  : [],
                scale: Array.isArray(candidate.rubricDraft.scale)
                  ? candidate.rubricDraft.scale
                      .filter(
                        (s: any) =>
                          s &&
                          typeof s === 'object' &&
                          typeof s.label === 'string' &&
                          s.label.trim()
                      )
                      .map((s: any, sIdx: number) => ({
                        label: s.label.trim(),
                        score: typeof s.score === 'number' && Number.isFinite(s.score) ? s.score : sIdx + 1,
                        descriptor:
                          typeof s.descriptor === 'string' && s.descriptor.trim() ? s.descriptor.trim() : undefined,
                        order: typeof s.order === 'number' && Number.isFinite(s.order) ? s.order : sIdx + 1,
                      }))
                  : [],
              }
            : undefined;

        const observationUnit: GeneratedObservationUnit = {
          allocationUnit: 'OBSERVATION',
          coverageUnitId: contractUnit.coverageUnitId,
          objectiveRefId: contractUnit.objectiveRefId,
          criterionId: contractUnit.criterionId,
          instrumentType: contractUnit.instrumentType,
          recordingScheme,
          instructions,
          aspects,
          rubricDraft: rubricDraft && rubricDraft.criteria.length > 0 ? rubricDraft : undefined,
          assessmentIndicator,
          indicatorSource,
          materialOrContext,
          materialSource,
        };

        validatedUnits.push(observationUnit);
        generatedCountPerCoverage.set(covId, (generatedCountPerCoverage.get(covId) || 0) + 1);
        break;
      }
    }
  });

  // Verify Required Counts per Contract Unit (Count is Authoritative, NO Fake Data)
  const failedCoverageUnitIds: string[] = [];
  contract.units.forEach((cu) => {
    if (
      hasPlannedItems &&
      cu.instrumentType === 'WRITTEN_TEST' &&
      cu.allocationUnit === 'ITEM' &&
      !plannedWrittenCoverageUnitIds.has(cu.coverageUnitId)
    ) {
      return;
    }

    const generatedCount = generatedCountPerCoverage.get(cu.coverageUnitId) || 0;
    if (generatedCount < cu.requiredCount) {
      failedCoverageUnitIds.push(cu.coverageUnitId);
      issues.push({
        code: 'INSUFFICIENT_GENERATED_UNITS',
        severity: 'REVIEW',
        message: `Coverage unit [${cu.coverageUnitId}] menghasilkan ${generatedCount} dari ${cu.requiredCount} unit yang diminta.`,
        objectiveRefId: cu.objectiveRefId,
        criterionId: cu.criterionId,
      });
    }
  });

  // Verify Planned Items for WRITTEN_TEST
  if (hasPlannedItems) {
    contract.plannedItems!.forEach((pi) => {
      if (!fulfilledPlannedItemIds.has(pi.id)) {
        if (!failedCoverageUnitIds.includes(pi.coverageUnitId)) {
          failedCoverageUnitIds.push(pi.coverageUnitId);
        }
        issues.push({
          code: 'UNFULFILLED_PLANNED_ITEM',
          severity: 'REVIEW',
          message: `Planned item #${pi.sequence} (${pi.itemType}) pada coverageUnit [${pi.coverageUnitId}] tidak mendapatkan hasil generasi yang valid.`,
          objectiveRefId: contractMap.get(pi.coverageUnitId)?.objectiveRefId,
        });
      }
    });

    const validatedWrittenCount = validatedUnits.filter((u) => u.instrumentType === 'WRITTEN_TEST').length;
    if (validatedWrittenCount !== contract.plannedItems!.length) {
      issues.push({
        code: 'PLANNED_ITEMS_COUNT_MISMATCH',
        severity: 'REVIEW',
        message: `Jumlah hasil tes tertulis (${validatedWrittenCount}) tidak sesuai dengan target planned items (${contract.plannedItems!.length}).`,
      });
    }
  }

  return { validatedUnits, failedCoverageUnitIds, issues };
}

// ==========================================
// DETERMINISTIC ASSESSMENT PACKAGE MAPPER
// ==========================================

export function mapGeneratedUnitsToAssessmentPackage(
  validatedUnits: GeneratedAssessmentUnit[],
  contract: AssessmentGenerationContract,
  plan: AssessmentGenerationPlan
): AssessmentPackage {
  const now = new Date().toISOString();
  const pkgId = contract.assessmentPackageId || `pkg-${plan.generationSpec?.assessmentPlanId || 'ai'}`;
  const spec = plan.generationSpec;

  const blueprintItems: AssessmentBlueprintItem[] = [];
  const instruments: AssessmentInstrument[] = [];
  const answerKeys: AssessmentAnswerKey[] = [];
  const scoringGuides: AssessmentScoringGuide[] = [];
  const rubrics: AssessmentRubric[] = [];

  // Group generated units by instrumentType
  const unitsByInstrument = new Map<AssessmentInstrumentType, GeneratedAssessmentUnit[]>();
  validatedUnits.forEach((u) => {
    const list = unitsByInstrument.get(u.instrumentType) || [];
    list.push(u);
    unitsByInstrument.set(u.instrumentType, list);
  });

  // Keep track of item/aspect IDs per coverageUnit for Blueprint item mapping
  const coverageToItemIds = new Map<string, string[]>();

  // Map Instruments
  unitsByInstrument.forEach((units, instType) => {
    const instId = createDeterministicInstrumentId(pkgId, instType);

    switch (instType) {
      case 'WRITTEN_TEST': {
        const writtenItems: WrittenAssessmentItem[] = [];

        units.forEach((u, uIdx) => {
          if (u.allocationUnit !== 'ITEM') return;
          const itemUnit = u as GeneratedItemUnit;
          const itemId = createDeterministicItemId(instId, uIdx);

          // Track for blueprint
          const covItems = coverageToItemIds.get(u.coverageUnitId) || [];
          covItems.push(itemId);
          coverageToItemIds.set(u.coverageUnitId, covItems);

          // Build Options with deterministic IDs
          const options: WrittenAssessmentOption[] = (itemUnit.options || []).map((opt, optIdx) => ({
            id: opt.id || createDeterministicOptionId(itemId, optIdx),
            label: String.fromCharCode(65 + (optIdx % 26)),
            text: opt.text,
            isCorrect: opt.isCorrect,
          }));

          const item: WrittenAssessmentItem = {
            id: itemId,
            blueprintItemId: createDeterministicBlueprintId(pkgId, u.coverageUnitId),
            itemType: itemUnit.itemType,
            prompt: itemUnit.prompt,
            stimulus: itemUnit.stimulus,
            stimulusOrigin: itemUnit.stimulus ? 'AI_SYNTHETIC' : undefined,
            stimulusSource: itemUnit.stimulusSource,
            options: options.length > 0 ? options : undefined,
            matchingPremises: itemUnit.matchingPremises,
            matchingResponses: itemUnit.matchingResponses,
            categoryResponseStatements: itemUnit.categoryStatements ? itemUnit.categoryStatements.map((s) => ({ id: s.id, text: s.text })) : undefined,
            categoryResponseCategories: itemUnit.categoryCategories ? itemUnit.categoryCategories.map((c) => ({ id: c.id, label: c.label })) : undefined,
            order: uIdx + 1,
          };
          writtenItems.push(item);

          // Answer Key (Proposed / Unverified) & Sync Options
          const ansKeyId = createDeterministicAnswerKeyId(instId, itemId);

          if (itemUnit.itemType === 'MULTIPLE_CHOICE') {
            let matchedOptionIds: string[] = [];
            if (itemUnit.proposedAnswer?.optionIndices && itemUnit.proposedAnswer.optionIndices.length > 0) {
              matchedOptionIds = itemUnit.proposedAnswer.optionIndices
                .map((idx) => options[idx]?.id)
                .filter((id): id is string => Boolean(id));
            }
            if (matchedOptionIds.length === 0 && options.some((o) => o.isCorrect)) {
              matchedOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);
            }
            if (matchedOptionIds.length === 0 && itemUnit.proposedAnswer?.value) {
              const valStr = String(itemUnit.proposedAnswer.value).trim().toLowerCase();
              const matched = options.find(
                (o) => o.text.trim().toLowerCase() === valStr || o.label.toLowerCase() === valStr
              );
              if (matched) matchedOptionIds = [matched.id];
            }

            if (matchedOptionIds.length > 0) {
              // Synchronize options.isCorrect strictly with AnswerKey optionIds to prevent dual-source conflict
              options.forEach((opt) => {
                opt.isCorrect = matchedOptionIds.includes(opt.id);
              });

              const targetOpt = options.find((o) => o.id === matchedOptionIds[0]);
              answerKeys.push({
                id: ansKeyId,
                instrumentId: instId,
                instrumentItemId: itemId,
                answerType: 'OPTION',
                optionIds: matchedOptionIds.slice(0, 1),
                value: targetOpt?.text || targetOpt?.label || itemUnit.proposedAnswer?.value,
                notes: itemUnit.proposedAnswer?.explanation,
              });
            }
          } else if (itemUnit.itemType === 'MULTIPLE_SELECT') {
            let matchedOptionIds: string[] = [];
            if (itemUnit.proposedAnswer?.optionIndices && itemUnit.proposedAnswer.optionIndices.length > 0) {
              matchedOptionIds = itemUnit.proposedAnswer.optionIndices
                .map((idx) => options[idx]?.id)
                .filter((id): id is string => Boolean(id));
            }
            if (matchedOptionIds.length === 0 && options.some((o) => o.isCorrect)) {
              matchedOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);
            }

            if (matchedOptionIds.length > 0) {
              options.forEach((opt) => {
                opt.isCorrect = matchedOptionIds.includes(opt.id);
              });

              const selectedTexts = options
                .filter((o) => matchedOptionIds.includes(o.id))
                .map((o) => o.text)
                .join(', ');

              answerKeys.push({
                id: ansKeyId,
                instrumentId: instId,
                instrumentItemId: itemId,
                answerType: 'MULTIPLE_OPTION',
                optionIds: matchedOptionIds,
                value: selectedTexts || itemUnit.proposedAnswer?.value,
                notes: itemUnit.proposedAnswer?.explanation,
              });
            }
          } else if (itemUnit.itemType === 'TRUE_FALSE') {
            let matchedOptionIds: string[] = [];
            let ansVal = itemUnit.proposedAnswer?.value;

            if (options.length > 0) {
              if (itemUnit.proposedAnswer?.optionIndices && itemUnit.proposedAnswer.optionIndices.length > 0) {
                matchedOptionIds = itemUnit.proposedAnswer.optionIndices
                  .map((idx) => options[idx]?.id)
                  .filter((id): id is string => Boolean(id));
              }
              if (matchedOptionIds.length === 0 && options.some((o) => o.isCorrect)) {
                matchedOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);
              }
              if (matchedOptionIds.length > 0) {
                options.forEach((opt) => {
                  opt.isCorrect = matchedOptionIds.includes(opt.id);
                });
                const targetOpt = options.find((o) => o.id === matchedOptionIds[0]);
                if (targetOpt) ansVal = targetOpt.text;
              }
            }

            if (matchedOptionIds.length > 0 || (ansVal && String(ansVal).trim())) {
              answerKeys.push({
                id: ansKeyId,
                instrumentId: instId,
                instrumentItemId: itemId,
                answerType: matchedOptionIds.length > 0 ? 'OPTION' : 'EXACT',
                optionIds: matchedOptionIds.length > 0 ? matchedOptionIds : undefined,
                value: String(ansVal || '').trim(),
                notes: itemUnit.proposedAnswer?.explanation,
              });
            }
          } else if (itemUnit.itemType === 'SHORT_ANSWER') {
            const val = itemUnit.proposedAnswer?.value;
            if (val && String(val).trim()) {
              answerKeys.push({
                id: ansKeyId,
                instrumentId: instId,
                instrumentItemId: itemId,
                answerType: itemUnit.proposedAnswer?.answerType || 'EXACT',
                value: String(val).trim(),
                notes: itemUnit.proposedAnswer?.explanation,
              });
            }
          } else if (itemUnit.itemType === 'ESSAY') {
            const val = itemUnit.proposedAnswer?.value;

            if (val && String(val).trim()) {
              answerKeys.push({
                id: ansKeyId,
                instrumentId: instId,
                instrumentItemId: itemId,
                answerType: 'EXPECTED_RESPONSE',
                value: String(val).trim(),
                notes: itemUnit.proposedAnswer?.explanation,
              });
            }

            // Create Essay ScoringGuide ONLY if provided in scoringGuideDraft (no fake fallbacks!)
            const guideInstructions = itemUnit.scoringGuideDraft?.instructions;
            const maxScore = itemUnit.scoringGuideDraft?.maxScore;

            if (guideInstructions && maxScore) {
              const sgId = createDeterministicScoringGuideId(instId, itemId);
              scoringGuides.push({
                id: sgId,
                title: `Pedoman Penskoran Uraian Butir #${uIdx + 1}`,
                instrumentId: instId,
                instrumentItemId: itemId,
                guideType: 'ESSAY',
                instructions: guideInstructions,
                maxScore: maxScore,
              });
            }
          } else if (itemUnit.itemType === 'MATCHING') {
            const pairs = itemUnit.proposedAnswer?.matchingPairs || (itemUnit as any).matchingPairs || [];
            if (pairs.length > 0) {
              answerKeys.push({
                id: ansKeyId,
                instrumentId: instId,
                instrumentItemId: itemId,
                answerType: 'MATCHING',
                matchingPairs: pairs,
                notes: itemUnit.proposedAnswer?.explanation,
              });
            }
          } else if (itemUnit.itemType === 'CATEGORY_RESPONSE') {
            const categoryAnswers: { statementId: string; categoryId: string }[] =
              (itemUnit.proposedAnswer?.categoryAnswers as unknown as { statementId: string; categoryId: string }[]) ||
              (itemUnit.categoryStatements
                ? (itemUnit.categoryStatements as any[])
                    .filter((s) => s && s.correctCategoryId)
                    .map((s) => ({ statementId: String(s.id), categoryId: String(s.correctCategoryId) }))
                : []);

            if (categoryAnswers.length > 0) {
              answerKeys.push({
                id: ansKeyId,
                instrumentId: instId,
                instrumentItemId: itemId,
                answerType: 'CATEGORY_RESPONSE',
                categoryAnswers: categoryAnswers,
                notes: itemUnit.proposedAnswer?.explanation,
              });
            }
          }

          // Scoring Guide for non-essay objective items (always generated deterministically)
          if (itemUnit.itemType !== 'ESSAY') {
            const sgId = createDeterministicScoringGuideId(instId, itemId);
            let instText = 'Setiap jawaban benar mendapat skor 1, jawaban salah atau tidak diisi mendapat skor 0.';
            let maxScore = 1;

            if (itemUnit.itemType === 'MULTIPLE_CHOICE') {
              instText = 'Setiap jawaban benar mendapat skor 1, jawaban salah atau tidak diisi mendapat skor 0.';
              maxScore = 1;
            } else if (itemUnit.itemType === 'TRUE_FALSE') {
              instText = 'Setiap jawaban benar mendapat skor 1, jawaban salah atau tidak diisi mendapat skor 0.';
              maxScore = 1;
            } else if (itemUnit.itemType === 'MULTIPLE_SELECT') {
              instText = 'Semua pilihan benar dipilih dan tidak ada pilihan salah dipilih mendapat skor 1, selain itu mendapat skor 0.';
              maxScore = 1;
            } else if (itemUnit.itemType === 'MATCHING') {
              const count = itemUnit.matchingPremises?.length || 1;
              instText = `Setiap pasangan premis dan respons yang dijodohkan dengan benar mendapat skor 1. Skor maksimal adalah ${count}.`;
              maxScore = count;
            } else if (itemUnit.itemType === 'CATEGORY_RESPONSE') {
              const count = itemUnit.categoryStatements?.length || 1;
              instText = `Setiap pernyataan yang dikelompokkan ke dalam kategori yang benar mendapat skor 1. Skor maksimal adalah ${count}.`;
              maxScore = count;
            } else if (itemUnit.itemType === 'SHORT_ANSWER') {
              instText = 'Jawaban eksak yang tepat dan sesuai kunci mendapat skor 1, jawaban salah mendapat skor 0.';
              maxScore = 1;
            }

            // Use AI/draft overrides if they are specified
            if (itemUnit.scoringGuideDraft) {
              if (itemUnit.scoringGuideDraft.instructions) {
                instText = itemUnit.scoringGuideDraft.instructions;
              }
              if (itemUnit.scoringGuideDraft.maxScore !== undefined) {
                maxScore = itemUnit.scoringGuideDraft.maxScore;
              }
            }

            scoringGuides.push({
              id: sgId,
              title: `Pedoman Penskoran Butir #${uIdx + 1}`,
              instrumentId: instId,
              instrumentItemId: itemId,
              guideType: 'OBJECTIVE',
              instructions: instText,
              maxScore: maxScore,
            });
          }
        });

        instruments.push({
          id: instId,
          type: 'WRITTEN_TEST',
          title: 'Instrumen Tes Tertulis',
          instructions: undefined,
          items: writtenItems,
        });
        break;
      }

      case 'ORAL_TEST': {
        const oralItems: OralAssessmentItem[] = [];
        units.forEach((u, uIdx) => {
          if (u.allocationUnit !== 'ITEM') return;
          const itemUnit = u as GeneratedItemUnit;
          const itemId = createDeterministicItemId(instId, uIdx);

          const covItems = coverageToItemIds.get(u.coverageUnitId) || [];
          covItems.push(itemId);
          coverageToItemIds.set(u.coverageUnitId, covItems);

          oralItems.push({
            id: itemId,
            blueprintItemId: createDeterministicBlueprintId(pkgId, u.coverageUnitId),
            prompt: itemUnit.prompt,
            expectedResponse: itemUnit.proposedAnswer?.value || itemUnit.proposedAnswer?.explanation,
            order: uIdx + 1,
          });

          if (itemUnit.scoringGuideDraft && itemUnit.scoringGuideDraft.instructions) {
            const sgId = createDeterministicScoringGuideId(instId, itemId);
            scoringGuides.push({
              id: sgId,
              title: `Pedoman Penskoran Tes Lisan Butir #${uIdx + 1}`,
              instrumentId: instId,
              instrumentItemId: itemId,
              guideType: 'MANUAL',
              instructions: itemUnit.scoringGuideDraft.instructions,
              maxScore: itemUnit.scoringGuideDraft.maxScore || 5,
            });
          }
        });

        instruments.push({
          id: instId,
          type: 'ORAL_TEST',
          title: 'Instrumen Tes Lisan',
          instructions: undefined,
          items: oralItems,
        });
        break;
      }

      case 'SELF_ASSESSMENT':
      case 'PEER_ASSESSMENT': {
        const selfPeerItems: SelfPeerAssessmentItem[] = [];
        let responseScheme: string | undefined;

        units.forEach((u, uIdx) => {
          if (u.allocationUnit !== 'ITEM') return;
          const itemUnit = u as GeneratedItemUnit;
          const itemId = createDeterministicItemId(instId, uIdx);

          if (!responseScheme && itemUnit.responseScheme) {
            responseScheme = itemUnit.responseScheme;
          }

          const covItems = coverageToItemIds.get(u.coverageUnitId) || [];
          covItems.push(itemId);
          coverageToItemIds.set(u.coverageUnitId, covItems);

          selfPeerItems.push({
            id: itemId,
            statement: itemUnit.prompt,
            category: undefined,
          });
        });

        const isSelf = instType === 'SELF_ASSESSMENT';
        instruments.push({
          id: instId,
          type: instType,
          title: isSelf
            ? 'Instrumen Penilaian Diri'
            : 'Instrumen Penilaian Antar-Teman',
          instructions: undefined,
          items: selfPeerItems,
          responseScheme: responseScheme || undefined,
        } as SelfPeerAssessmentInstrument);
        break;
      }

      case 'PERFORMANCE': {
        const aspects: PerformanceAspect[] = [];
        let combinedTask: string | undefined;
        let performanceInstructions: string | undefined;
        let rubricId: string | undefined;
        let scoringGuideId: string | undefined;

        units.forEach((u, uIdx) => {
          if (u.allocationUnit !== 'TASK') return;
          const taskUnit = u as GeneratedTaskUnit;
          const aspId = createDeterministicAspectId(instId, uIdx);

          if (!combinedTask) {
            combinedTask = taskUnit.taskPrompt || taskUnit.instructions || taskUnit.taskTitle || taskUnit.expectedDeliverable;
          }

          if (!performanceInstructions && taskUnit.instructions) {
            performanceInstructions = taskUnit.instructions;
          }

          const covItems =
            coverageToItemIds.get(u.coverageUnitId) || [];

          if (
            taskUnit.aspects &&
            taskUnit.aspects.length > 0
          ) {
            taskUnit.aspects.forEach((asp, aIdx) => {
              const actualAspectId =
                `${aspId}-${aIdx + 1}`;

              aspects.push({
                id: actualAspectId,
                label: asp.label,
                description: asp.description,
                weight: asp.weight,
              });

              covItems.push(actualAspectId);
            });
          } else {
            aspects.push({
              id: aspId,
              label: taskUnit.taskTitle,
              description: taskUnit.instructions,
            });

            covItems.push(aspId);
          }

          coverageToItemIds.set(
            u.coverageUnitId,
            covItems
          );

          // Rubric Draft
          if (taskUnit.rubricDraft && !rubricId) {
            rubricId = createDeterministicRubricId(instId, 1);
            const critList: RubricCriterion[] = (taskUnit.rubricDraft.criteria || []).map((c, cIdx) => ({
              id: `crit-${rubricId}-${cIdx + 1}`,
              label: c.label,
              indicator: c.indicator,
              weight: c.weight,
            }));
            const scaleList: RubricScaleLevel[] = (taskUnit.rubricDraft.scale || []).map((s, sIdx) => ({
              id: `scale-${rubricId}-${sIdx + 1}`,
              label: s.label,
              score: s.score,
              descriptor: s.descriptor,
              order: s.order || sIdx + 1,
            }));

            rubrics.push({
              id: rubricId,
              title: taskUnit.rubricDraft.title || `Rubrik ${taskUnit.taskTitle}`,
              instrumentId: instId,
              criteria: critList,
              scale: scaleList,
              status: 'DRAFT',
            });
          }

          // Scoring Guide Draft
          if (taskUnit.scoringGuideDraft && !scoringGuideId) {
            scoringGuideId = createDeterministicScoringGuideId(instId, 'main');
            scoringGuides.push({
              id: scoringGuideId,
              title: 'Pedoman Penilaian Kinerja',
              instrumentId: instId,
              guideType: 'RUBRIC_BASED',
              instructions: taskUnit.scoringGuideDraft.instructions,
              maxScore: taskUnit.scoringGuideDraft.maxScore,
            });
          }
        });

        instruments.push({
          id: instId,
          type: 'PERFORMANCE',
          title: 'Instrumen Penilaian Kinerja / Praktik',
          task: combinedTask!,
          instructions: performanceInstructions,
          aspects: aspects.length > 0 ? aspects : undefined,
          rubricId,
          scoringGuideId,
        });
        break;
      }

      case 'OBSERVATION': {
        const aspects: ObservationAspect[] = [];
        let rubricId: string | undefined;
        let recordingScheme: string | undefined;
        let obsInstructions: string | undefined;

        units.forEach((u, uIdx) => {
          if (u.allocationUnit !== 'OBSERVATION') return;
          const obsUnit = u as GeneratedObservationUnit;
          const aspId = createDeterministicAspectId(instId, uIdx);

          const covItems =
            coverageToItemIds.get(u.coverageUnitId) || [];

          if (!recordingScheme && obsUnit.recordingScheme) {
            recordingScheme = obsUnit.recordingScheme;
          }
          if (!obsInstructions && obsUnit.instructions) {
            obsInstructions = obsUnit.instructions;
          }

          obsUnit.aspects.forEach((asp, aIdx) => {
            const actualAspectId =
              `${aspId}-${aIdx + 1}`;

            aspects.push({
              id: actualAspectId,
              label: asp.label,
              indicator: asp.indicator,
            });

            covItems.push(actualAspectId);
          });

          coverageToItemIds.set(
            u.coverageUnitId,
            covItems
          );

          if (obsUnit.rubricDraft && !rubricId) {
            rubricId = createDeterministicRubricId(instId, 1);
            const critList: RubricCriterion[] = (obsUnit.rubricDraft.criteria || []).map((c, cIdx) => ({
              id: `crit-${rubricId}-${cIdx + 1}`,
              label: c.label,
              indicator: c.indicator,
            }));
            const scaleList: RubricScaleLevel[] = (obsUnit.rubricDraft.scale || []).map((s, sIdx) => ({
              id: `scale-${rubricId}-${sIdx + 1}`,
              label: s.label,
              score: s.score,
              descriptor: s.descriptor,
              order: s.order || sIdx + 1,
            }));

            rubrics.push({
              id: rubricId,
              title: obsUnit.rubricDraft.title || 'Rubrik Lembar Observasi',
              instrumentId: instId,
              criteria: critList,
              scale: scaleList,
              status: 'DRAFT',
            });
          }
        });

        instruments.push({
          id: instId,
          type: 'OBSERVATION',
          title: 'Instrumen Lembar Pengamatan / Observasi',
          instructions: obsInstructions,
          recordingScheme,
          aspects,
        });
        break;
      }

      case 'PORTFOLIO': {
        const evidenceReqs: string[] = [];
        let rubricId: string | undefined;
        let scoringGuideId: string | undefined;
        let portfolioInstructions: string | undefined;

        units.forEach((u) => {
          if (u.allocationUnit !== 'EVIDENCE') return;
          const evUnit = u as GeneratedEvidenceUnit;

          if (!portfolioInstructions && evUnit.instructions) {
            portfolioInstructions = evUnit.instructions;
          }

          evUnit.evidenceRequirements.forEach((req) => {
            if (!evidenceReqs.includes(req)) evidenceReqs.push(req);
          });

          if (evUnit.rubricDraft && !rubricId) {
            rubricId = createDeterministicRubricId(instId, 1);
            rubrics.push({
              id: rubricId,
              title: evUnit.rubricDraft.title || 'Rubrik Penilaian Portofolio',
              instrumentId: instId,
              criteria: (evUnit.rubricDraft.criteria || []).map((c, cIdx) => ({
                id: `crit-${rubricId}-${cIdx + 1}`,
                label: c.label,
                indicator: c.indicator,
                weight: c.weight,
              })),
              scale: (evUnit.rubricDraft.scale || []).map((s, sIdx) => ({
                id: `scale-${rubricId}-${sIdx + 1}`,
                label: s.label,
                score: s.score,
                descriptor: s.descriptor,
                order: s.order || sIdx + 1,
              })),
              status: 'DRAFT',
            });
          }

          if (evUnit.scoringGuideDraft && !scoringGuideId) {
            scoringGuideId = createDeterministicScoringGuideId(instId, 'main');
            scoringGuides.push({
              id: scoringGuideId,
              title: 'Pedoman Penilaian Portofolio',
              instrumentId: instId,
              guideType: 'RUBRIC_BASED',
              instructions: evUnit.scoringGuideDraft.instructions,
              maxScore: evUnit.scoringGuideDraft.maxScore,
            });
          }
        });

        instruments.push({
          id: instId,
          type: 'PORTFOLIO',
          title: 'Instrumen Asesmen Portofolio',
          instructions: portfolioInstructions,
          evidenceRequirements: evidenceReqs,
          rubricId,
          scoringGuideId,
        });
        break;
      }

      case 'ASSIGNMENT': {
        let rubricId: string | undefined;
        let scoringGuideId: string | undefined;
        let assignmentInstructions: string | undefined;
        let expectedOutput: string | undefined;

        units.forEach((u) => {
          if (u.allocationUnit !== 'TASK') return;
          const taskUnit = u as GeneratedTaskUnit;

          if (!assignmentInstructions) {
            assignmentInstructions = taskUnit.instructions || taskUnit.taskPrompt || taskUnit.taskTitle || taskUnit.expectedDeliverable;
          }
          if (!expectedOutput && taskUnit.expectedDeliverable) {
            expectedOutput = taskUnit.expectedDeliverable;
          }

          if (taskUnit.rubricDraft && !rubricId) {
            rubricId = createDeterministicRubricId(instId, 1);
            rubrics.push({
              id: rubricId,
              title: taskUnit.rubricDraft.title || 'Rubrik Penugasan',
              instrumentId: instId,
              criteria: (taskUnit.rubricDraft.criteria || []).map((c, cIdx) => ({
                id: `crit-${rubricId}-${cIdx + 1}`,
                label: c.label,
                indicator: c.indicator,
                weight: c.weight,
              })),
              scale: (taskUnit.rubricDraft.scale || []).map((s, sIdx) => ({
                id: `scale-${rubricId}-${sIdx + 1}`,
                label: s.label,
                score: s.score,
                descriptor: s.descriptor,
                order: s.order || sIdx + 1,
              })),
              status: 'DRAFT',
            });
          }

          if (taskUnit.scoringGuideDraft && !scoringGuideId) {
            scoringGuideId = createDeterministicScoringGuideId(instId, 'main');
            scoringGuides.push({
              id: scoringGuideId,
              title: 'Pedoman Penilaian Penugasan',
              instrumentId: instId,
              guideType: 'RUBRIC_BASED',
              instructions: taskUnit.scoringGuideDraft.instructions,
              maxScore: taskUnit.scoringGuideDraft.maxScore,
            });
          }
        });

        instruments.push({
          id: instId,
          type: 'ASSIGNMENT',
          title: 'Instrumen Penugasan',
          instructions: assignmentInstructions!,
          expectedOutput,
          rubricId,
          scoringGuideId,
        });
        break;
      }

      case 'PROJECT': {
        let rubricId: string | undefined;
        let scoringGuideId: string | undefined;
        let projectBrief: string | undefined;
        let expectedDeliverable: string | undefined;

        units.forEach((u) => {
          if (u.allocationUnit !== 'TASK') return;
          const taskUnit = u as GeneratedTaskUnit;

          if (!projectBrief) {
            projectBrief = taskUnit.taskPrompt || taskUnit.instructions || taskUnit.taskTitle || taskUnit.expectedDeliverable;
          }
          if (!expectedDeliverable && taskUnit.expectedDeliverable) {
            expectedDeliverable = taskUnit.expectedDeliverable;
          }

          if (taskUnit.rubricDraft && !rubricId) {
            rubricId = createDeterministicRubricId(instId, 1);
            rubrics.push({
              id: rubricId,
              title: taskUnit.rubricDraft.title || 'Rubrik Proyek',
              instrumentId: instId,
              criteria: (taskUnit.rubricDraft.criteria || []).map((c, cIdx) => ({
                id: `crit-${rubricId}-${cIdx + 1}`,
                label: c.label,
                indicator: c.indicator,
                weight: c.weight,
              })),
              scale: (taskUnit.rubricDraft.scale || []).map((s, sIdx) => ({
                id: `scale-${rubricId}-${sIdx + 1}`,
                label: s.label,
                score: s.score,
                descriptor: s.descriptor,
                order: s.order || sIdx + 1,
              })),
              status: 'DRAFT',
            });
          }

          if (taskUnit.scoringGuideDraft && !scoringGuideId) {
            scoringGuideId = createDeterministicScoringGuideId(instId, 'main');
            scoringGuides.push({
              id: scoringGuideId,
              title: 'Pedoman Penilaian Proyek',
              instrumentId: instId,
              guideType: 'RUBRIC_BASED',
              instructions: taskUnit.scoringGuideDraft.instructions,
              maxScore: taskUnit.scoringGuideDraft.maxScore,
            });
          }
        });

        instruments.push({
          id: instId,
          type: 'PROJECT',
          title: 'Instrumen Penilaian Proyek',
          projectBrief: projectBrief!,
          expectedDeliverable,
          rubricId,
          scoringGuideId,
        });
        break;
      }

      case 'PRODUCT': {
        let rubricId: string | undefined;
        let scoringGuideId: string | undefined;
        let productBrief: string | undefined;
        let expectedProduct: string | undefined;

        units.forEach((u) => {
          if (u.allocationUnit !== 'TASK') return;
          const taskUnit = u as GeneratedTaskUnit;

          if (!productBrief) {
            productBrief = taskUnit.taskPrompt || taskUnit.instructions || taskUnit.taskTitle || taskUnit.expectedDeliverable;
          }
          if (!expectedProduct && taskUnit.expectedDeliverable) {
            expectedProduct = taskUnit.expectedDeliverable;
          }

          if (taskUnit.rubricDraft && !rubricId) {
            rubricId = createDeterministicRubricId(instId, 1);
            rubrics.push({
              id: rubricId,
              title: taskUnit.rubricDraft.title || 'Rubrik Penilaian Produk',
              instrumentId: instId,
              criteria: (taskUnit.rubricDraft.criteria || []).map((c, cIdx) => ({
                id: `crit-${rubricId}-${cIdx + 1}`,
                label: c.label,
                indicator: c.indicator,
                weight: c.weight,
              })),
              scale: (taskUnit.rubricDraft.scale || []).map((s, sIdx) => ({
                id: `scale-${rubricId}-${sIdx + 1}`,
                label: s.label,
                score: s.score,
                descriptor: s.descriptor,
                order: s.order || sIdx + 1,
              })),
              status: 'DRAFT',
            });
          }

          if (taskUnit.scoringGuideDraft && !scoringGuideId) {
            scoringGuideId = createDeterministicScoringGuideId(instId, 'main');
            scoringGuides.push({
              id: scoringGuideId,
              title: 'Pedoman Penilaian Produk',
              instrumentId: instId,
              guideType: 'RUBRIC_BASED',
              instructions: taskUnit.scoringGuideDraft.instructions,
              maxScore: taskUnit.scoringGuideDraft.maxScore,
            });
          }
        });

        instruments.push({
          id: instId,
          type: 'PRODUCT',
          title: 'Instrumen Penilaian Produk',
          productBrief: productBrief!,
          expectedProduct,
          rubricId,
          scoringGuideId,
        });
        break;
      }
    }
  });

  // Map Blueprint Items
  contract.units.forEach((cu, idx) => {
    const itemIds = coverageToItemIds.get(cu.coverageUnitId) || [];
    const generatedForUnit = validatedUnits.filter((u) => u.coverageUnitId === cu.coverageUnitId);

    // PARTIAL GENERATION FAIL-CLOSED:
    // A GenerationContract unit without any validated generated content
    // must NOT become a blueprint item with synthetic linkage.
    //
    // Missing generated content is represented by ABSENCE of blueprint.
    // Coverage validation will deterministically report
    // MISSING_PLANNED_COVERAGE.
    if (generatedForUnit.length === 0) {
      return;
    }

    const expectedInstrumentId =
      createDeterministicInstrumentId(
        pkgId,
        cu.instrumentType
      );

    const resolvedInstrumentId =
      instruments.some(
        (inst) => inst.id === expectedInstrumentId
      )
        ? expectedInstrumentId
        : undefined;

    if (itemIds.length === 0) {
      // Create a single blueprint item representing the holistic instrument (PROJECT, PRODUCT, PORTFOLIO, ASSIGNMENT)
      const bpId = createDeterministicBlueprintId(pkgId, cu.coverageUnitId);
      const bpItem: AssessmentBlueprintItem = {
        id: bpId,
        coverageUnitId: cu.coverageUnitId,
        objectiveRefId: cu.objectiveRefId,
        criterionId: cu.criterionId,
        assessmentIndicator:
          cu.assessmentIndicator ||
          generatedForUnit[0]?.assessmentIndicator ||
          undefined,
        materialOrContext:
          cu.materialOrContext ||
          generatedForUnit[0]?.materialOrContext ||
          undefined,
        instrumentType: cu.instrumentType,
        instrumentId: resolvedInstrumentId,
        instrumentItemIds: [],
        order: blueprintItems.length + 1,
        status: 'DRAFT',
        cognitiveDemand: cu.cognitiveDemand,
        evidenceType: plan.coverageUnits.find((u) => u.id === cu.coverageUnitId)?.evidenceType,
        stimulusType: cu.stimulusType,
        difficultyTarget: cu.difficultyTarget,
        recommendedItemCount: cu.requiredCount,
      };
      blueprintItems.push(bpItem);
      return;
    }

    if (cu.allocationUnit !== 'ITEM') {
      // Create a single blueprint item referencing all aspect/item IDs of this holistic instrument
      const bpId = createDeterministicBlueprintId(pkgId, cu.coverageUnitId);
      const bpItem: AssessmentBlueprintItem = {
        id: bpId,
        coverageUnitId: cu.coverageUnitId,
        objectiveRefId: cu.objectiveRefId,
        criterionId: cu.criterionId,
        assessmentIndicator:
          cu.assessmentIndicator ||
          generatedForUnit[0]?.assessmentIndicator ||
          undefined,
        materialOrContext:
          cu.materialOrContext ||
          generatedForUnit[0]?.materialOrContext ||
          undefined,
        instrumentType: cu.instrumentType,
        instrumentId: resolvedInstrumentId,
        instrumentItemIds: itemIds,
        order: blueprintItems.length + 1,
        status: 'DRAFT',
        cognitiveDemand: cu.cognitiveDemand,
        evidenceType: plan.coverageUnits.find((u) => u.id === cu.coverageUnitId)?.evidenceType,
        stimulusType: cu.stimulusType,
        difficultyTarget: cu.difficultyTarget,
        recommendedItemCount: cu.requiredCount,
      };
      blueprintItems.push(bpItem);
    } else {
      // Generate individual blueprint items per instrument item to preserve item-level target accuracy
      itemIds.forEach((itemId, subIdx) => {
        let plannedItem: any = undefined;
        if (
          contract.plannedItems &&
          cu.instrumentType === 'WRITTEN_TEST' &&
          cu.allocationUnit === 'ITEM'
        ) {
          const matchingPlannedItems = contract.plannedItems.filter((p) => p.coverageUnitId === cu.coverageUnitId);
          if (subIdx < matchingPlannedItems.length) {
            plannedItem = matchingPlannedItems[subIdx];
          }
        }

        const bpId = itemIds.length === 1
          ? createDeterministicBlueprintId(pkgId, cu.coverageUnitId)
          : `${createDeterministicBlueprintId(pkgId, cu.coverageUnitId)}-${subIdx + 1}`;

        const bpItem: AssessmentBlueprintItem = {
          id: bpId,
          coverageUnitId: cu.coverageUnitId,
          objectiveRefId: cu.objectiveRefId,
          criterionId: cu.criterionId,
          assessmentIndicator:
            cu.assessmentIndicator ||
            generatedForUnit[0]?.assessmentIndicator ||
            undefined,
          materialOrContext:
            cu.materialOrContext ||
            generatedForUnit[0]?.materialOrContext ||
            undefined,
          instrumentType: cu.instrumentType,
          instrumentId: resolvedInstrumentId,
          instrumentItemIds: [itemId],
          order: blueprintItems.length + 1,
          status: 'DRAFT',
          cognitiveDemand: plannedItem?.cognitiveDemand || cu.cognitiveDemand,
          evidenceType: plan.coverageUnits.find((u) => u.id === cu.coverageUnitId)?.evidenceType,
          stimulusType: cu.stimulusType,
          difficultyTarget: plannedItem?.difficultyTarget || cu.difficultyTarget,
          recommendedItemCount: 1,
        };
        blueprintItems.push(bpItem);
      });
    }
  });

  const pkg: AssessmentPackage = {
    id: pkgId,
    assessmentPlanId: contract.assessmentPlanId,
    academicSettingId: contract.academicSettingId,
    title: `Perangkat Asesmen - ${contract.subjectProfile.subjectLabel || contract.subjectProfile.subjectKey}`,
    blueprintItems,
    instruments,
    answerKeys,
    scoringGuides,
    rubrics,
    workflowStatus: 'DRAFT', // CRITICAL: AI GENERATION ALWAYS PRODUCES DRAFT, NEVER SIAP
    needsReview: true,
    reviewReason: 'Draf hasil generasi AI, wajib ditinjau dan divalidasi oleh guru.',
    revision: 1,
    provenance: {
      generatedBy: 'AI',
      generatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  return pkg;
}

// ==========================================
// MAIN GENERATOR ENTRY POINT
// ==========================================

export async function generateAssessmentPackageDraft(
  input: GenerateAssessmentPackageInput
): Promise<AssessmentGenerationResult> {
  // 1. Pre-generation Guards Check (Fail-closed, no AI call if blocked)
  const guardResult = validatePreGenerationGuards(input);
  if (!guardResult.valid) {
    const failedCoverageUnitIds = input?.generationPlan?.coverageUnits?.map((u) => u.id) || [];
    return {
      status: 'BLOCKED',
      generatedPackage: undefined,
      contract: undefined,
      generatedUnits: [],
      failedCoverageUnitIds,
      issues: guardResult.issues,
    };
  }

  const plan = input.generationPlan;

  // 2. Build Deterministic Generation Contract
  const contract = buildGenerationContract(plan, input.teacherContext, input.sourceMaterials);

  // 3. Build Prompts
  const { systemPrompt, userPrompt } = buildGenerationPrompts(
    contract,
    input.teacherContext,
    input.sourceMaterials
  );

  const request: AssessmentAIGenerationRequest = {
    systemPrompt,
    userPrompt,
    generationContract: contract,
  };

  // 4. Provider Execution
  if (!input.provider) {
    return {
      status: 'FAILED',
      contract,
      generatedPackage: undefined,
      generatedUnits: [],
      failedCoverageUnitIds: contract.units.map((u) => u.coverageUnitId),
      issues: [
        {
          code: 'PROVIDER_MISSING',
          severity: 'BLOCKING',
          message: 'AssessmentAIGenerationProvider tidak tersedia atau belum disuntikkan.',
        },
      ],
    };
  }

  let rawResponse: AssessmentAIGenerationRawResponse;
  try {
    rawResponse = await input.provider.generate(request);
  } catch (err: any) {
    return {
      status: 'FAILED',
      contract,
      generatedPackage: undefined,
      generatedUnits: [],
      failedCoverageUnitIds: contract.units.map((u) => u.coverageUnitId),
      issues: [
        {
          code: 'PROVIDER_EXECUTION_ERROR',
          severity: 'BLOCKING',
          message: `Eksekusi AI provider mengalami kegagalan: ${err.message || 'UnknownError'}`,
        },
      ],
    };
  }

  // 5. Runtime Parsing & Reference Validation
  const parseResult = parseAndValidateRawAIResponse(rawResponse.rawText, contract);

  let status: AssessmentGenerationResultStatus;
  if (parseResult.validatedUnits.length === 0) {
    status = 'FAILED';
  } else if (parseResult.failedCoverageUnitIds.length > 0) {
    status = 'PARTIAL';
  } else {
    status = 'GENERATED';
  }

  // 6. Map to AssessmentPackage (Always DRAFT, never SIAP, no auto-confirmation)
  let generatedPackage: AssessmentPackage | undefined;
  if (parseResult.validatedUnits.length > 0) {
    generatedPackage = mapGeneratedUnitsToAssessmentPackage(
      parseResult.validatedUnits,
      contract,
      plan
    );
  }

  return {
    status,
    generatedPackage,
    contract,
    generatedUnits: parseResult.validatedUnits,
    failedCoverageUnitIds: parseResult.failedCoverageUnitIds,
    issues: [...guardResult.issues, ...parseResult.issues],
  };
}
