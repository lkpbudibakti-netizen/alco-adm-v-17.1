import { ADMINISTRATION_PROJECT_PACKAGE_SCHEMA_VERSION_V1 } from '../types/administrationProjectTransfer';
import type {
  AdministrationProjectPackage,
  AdministrationProjectPackageSemesterData,
  AdministrationProjectTransferIssue,
  AdministrationProjectTransferIssueSeverity,
  AdministrationProjectTransferValidationResult,
  PortableAssessmentPackage,
} from '../types/administrationProjectTransfer';

type IssueInput = Omit<AdministrationProjectTransferIssue, 'severity'>;

const REQUIRED_HEADER_FIELDS = [
  'curriculumType',
  'academicYear',
  'subject',
  'level',
  'grade',
  'phase',
] as const;

const SUPPORTED_SCHEMA_VERSIONS = new Set<string>([
  ADMINISTRATION_PROJECT_PACKAGE_SCHEMA_VERSION_V1,
]);

const FORBIDDEN_PORTABLE_FIELD_NAMES = new Set([
  'TeacherProfile',
  'SchoolData',
  'PrincipalHistory',
  'profileId',
  'schoolId',
  'activeProfileId',
  'activeWorkspaceId',
  'activeYearPlanId',
  'activeSemesterPlanId',
  'yearPlanId',
  'semesterPlanId',
  'academicSettingId',
  'workspaceId',
  'roster',
  'student',
  'students',
  'studentId',
  'attendance',
  'attendanceSessions',
  'attendanceRecords',
  'gradeData',
  'assessmentResults',
  'remedial',
  'remedialRecords',
  'enrichment',
  'enrichmentRecords',
  'academicCalendar',
  'calendar',
  'calendarDays',
  'SemesterJPSetting',
  'semesterJPSettings',
  'TimeAllocation',
  'timeAllocation',
  'timeAllocations',
  'timeAllocationIds',
]);

const isPresent = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const asArray = <T>(value: T[] | undefined | null): T[] =>
  Array.isArray(value) ? value : [];

export function validateAdministrationProjectPackage(
  pkg: AdministrationProjectPackage
): AdministrationProjectTransferValidationResult {
  const issues: AdministrationProjectTransferIssue[] = [];
  const addIssue = (severity: AdministrationProjectTransferIssueSeverity, issue: IssueInput) => {
    issues.push({ severity, ...issue });
  };
  const error = (issue: IssueInput) => addIssue('ERROR', issue);
  const warning = (issue: IssueInput) => addIssue('WARNING', issue);

  if (!pkg || typeof pkg !== 'object') {
    error({
      code: 'PACKAGE_INVALID',
      message: 'AdministrationProjectPackage harus berupa object.',
      path: '$',
    });
    return buildResult(issues);
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.has(pkg.schemaVersion)) {
    error({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `schemaVersion [${String(pkg.schemaVersion)}] tidak didukung.`,
      path: 'schemaVersion',
    });
  }

  validateHeader(pkg, error);
  validateRootCollections(pkg, error);
  validateForbiddenPortableFields(pkg, error);

  const tpItemIds = new Set<string>();
  const atpItemIds = new Set<string>();
  const criterionIds = new Set<string>();
  const learningPlanIds = new Set<string>();
  const assessmentPlanIds = new Set<string>();
  const assessmentPackageIds = new Set<string>();

  asArray(pkg.annual?.tp).forEach((tpData, tpDataIndex) => {
    asArray(tpData.items).forEach((tp, itemIndex) => {
      registerCanonicalId(tp.id, tpItemIds, error, {
        code: 'DUPLICATE_TP_ID',
        entityName: 'TPItem.id',
        path: `annual.tp[${tpDataIndex}].items[${itemIndex}].id`,
      });
    });
  });

  asArray(pkg.annual?.atp).forEach((atpData, atpDataIndex) => {
    asArray(atpData.items).forEach((atp, itemIndex) => {
      const path = `annual.atp[${atpDataIndex}].items[${itemIndex}]`;
      registerCanonicalId(atp.id, atpItemIds, error, {
        code: 'DUPLICATE_ATP_ITEM_ID',
        entityName: 'ATPItem.id',
        path: `${path}.id`,
      });
      requireReference(atp.tpId, tpItemIds, error, {
        code: 'DANGLING_ATP_TP_REFERENCE',
        message: `ATPItem.tpId [${String(atp.tpId)}] tidak resolve ke TPItem.id.`,
        path: `${path}.tpId`,
      });
    });
  });

  const semesters = asArray(pkg.semesters);
  const seenSemesters = new Set<number>();
  semesters.forEach((semesterData, semesterIndex) => {
    const path = `semesters[${semesterIndex}]`;
    if (semesterData.semester !== 1 && semesterData.semester !== 2) {
      error({
        code: 'INVALID_SEMESTER',
        message: `Semester harus 1 atau 2, ditemukan [${String(semesterData.semester)}].`,
        path: `${path}.semester`,
      });
    } else if (seenSemesters.has(semesterData.semester)) {
      error({
        code: 'DUPLICATE_SEMESTER',
        message: `Semester [${semesterData.semester}] muncul lebih dari satu kali.`,
        path: `${path}.semester`,
      });
    } else {
      seenSemesters.add(semesterData.semester);
    }

    collectSemesterIds(semesterData, path, {
      error,
      criterionIds,
      learningPlanIds,
      assessmentPlanIds,
      assessmentPackageIds,
    });
  });

  ([1, 2] as const).forEach((semester) => {
    if (!seenSemesters.has(semester)) {
      error({
        code: 'SEMESTER_REQUIRED',
        message: `AdministrationProjectPackage wajib merepresentasikan semester ${semester}.`,
        path: 'semesters',
      });
    }
  });

  semesters.forEach((semesterData, semesterIndex) => {
    validateSemesterReferences(semesterData, `semesters[${semesterIndex}]`, {
      error,
      warning,
      tpItemIds,
      atpItemIds,
      criterionIds,
      learningPlanIds,
      assessmentPlanIds,
    });
  });

  return buildResult(issues);
}

function validateHeader(
  pkg: AdministrationProjectPackage,
  error: (issue: IssueInput) => void
): void {
  if (!pkg.header || typeof pkg.header !== 'object') {
    error({
      code: 'HEADER_MISSING',
      message: 'Header portable wajib ada.',
      path: 'header',
    });
    return;
  }

  REQUIRED_HEADER_FIELDS.forEach((field) => {
    if (!isPresent(pkg.header[field])) {
      error({
        code: 'HEADER_FIELD_REQUIRED',
        message: `Header.${field} wajib diisi.`,
        path: `header.${field}`,
      });
    }
  });

  if (pkg.header.curriculumType !== 'KURIKULUM_MERDEKA' && pkg.header.curriculumType !== 'K13') {
    error({
      code: 'HEADER_CURRICULUM_TYPE_INVALID',
      message: `Header.curriculumType [${String(pkg.header.curriculumType)}] tidak valid.`,
      path: 'header.curriculumType',
    });
  }
}

function validateRootCollections(
  pkg: AdministrationProjectPackage,
  error: (issue: IssueInput) => void
): void {
  if (!pkg.annual || typeof pkg.annual !== 'object') {
    error({
      code: 'ANNUAL_DATA_REQUIRED',
      message: 'Annual data portable wajib ada.',
      path: 'annual',
    });
    return;
  }

  (['cp', 'tp', 'atp'] as const).forEach((field) => {
    if (!Array.isArray(pkg.annual[field])) {
      error({
        code: 'ANNUAL_COLLECTION_REQUIRED',
        message: `annual.${field} wajib berupa array.`,
        path: `annual.${field}`,
      });
    }
  });

  if (!Array.isArray(pkg.semesters)) {
    error({
      code: 'SEMESTERS_REQUIRED',
      message: 'semesters wajib berupa array berisi semester 1 dan 2.',
      path: 'semesters',
    });
  }
}

function validateForbiddenPortableFields(
  value: unknown,
  error: (issue: IssueInput) => void,
  path = '$',
  seen = new Set<unknown>()
): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateForbiddenPortableFields(item, error, `${path}[${index}]`, seen));
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    const childPath = path === '$' ? key : `${path}.${key}`;
    if (FORBIDDEN_PORTABLE_FIELD_NAMES.has(key)) {
      error({
        code: 'FORBIDDEN_PORTABLE_FIELD',
        message: `Field [${key}] tidak boleh masuk AdministrationProjectPackage portable.`,
        path: childPath,
      });
    }
    validateForbiddenPortableFields(child, error, childPath, seen);
  });
}

function collectSemesterIds(
  semesterData: AdministrationProjectPackageSemesterData,
  path: string,
  context: {
    error: (issue: IssueInput) => void;
    criterionIds: Set<string>;
    learningPlanIds: Set<string>;
    assessmentPlanIds: Set<string>;
    assessmentPackageIds: Set<string>;
  }
): void {
  asArray(semesterData.assessmentCriteria).forEach((criterion, index) => {
    registerCanonicalId(criterion.id, context.criterionIds, context.error, {
      code: 'DUPLICATE_KKTP_ID',
      entityName: 'AssessmentCriterion.id',
      path: `${path}.assessmentCriteria[${index}].id`,
    });
  });

  asArray(semesterData.learningPlans).forEach((plan, index) => {
    registerCanonicalId(plan.id, context.learningPlanIds, context.error, {
      code: 'DUPLICATE_LEARNING_PLAN_ID',
      entityName: 'LearningPlan.id',
      path: `${path}.learningPlans[${index}].id`,
    });
  });

  asArray(semesterData.assessmentPlans).forEach((plan, index) => {
    registerCanonicalId(plan.id, context.assessmentPlanIds, context.error, {
      code: 'DUPLICATE_ASSESSMENT_PLAN_ID',
      entityName: 'AssessmentPlan.id',
      path: `${path}.assessmentPlans[${index}].id`,
    });
  });

  asArray(semesterData.assessmentPackages).forEach((assessmentPackage, index) => {
    registerCanonicalId(assessmentPackage.id, context.assessmentPackageIds, context.error, {
      code: 'DUPLICATE_ASSESSMENT_PACKAGE_ID',
      entityName: 'AssessmentPackage.id',
      path: `${path}.assessmentPackages[${index}].id`,
    });
  });
}

function validateSemesterReferences(
  semesterData: AdministrationProjectPackageSemesterData,
  path: string,
  context: {
    error: (issue: IssueInput) => void;
    warning: (issue: IssueInput) => void;
    tpItemIds: Set<string>;
    atpItemIds: Set<string>;
    criterionIds: Set<string>;
    learningPlanIds: Set<string>;
    assessmentPlanIds: Set<string>;
  }
): void {
  asArray(semesterData.assessmentCriteria).forEach((criterion, index) => {
    requireReference(criterion.tpId, context.tpItemIds, context.error, {
      code: 'DANGLING_KKTP_TP_REFERENCE',
      message: `KKTP.tpId [${String(criterion.tpId)}] tidak resolve ke TPItem.id.`,
      path: `${path}.assessmentCriteria[${index}].tpId`,
    });
  });

  asArray(semesterData.learningPlans).forEach((plan, index) => {
    const planPath = `${path}.learningPlans[${index}]`;
    validateReferences(plan.tpIds, context.tpItemIds, context.error, {
      code: 'DANGLING_LEARNING_PLAN_TP_REFERENCE',
      message: 'LearningPlan.tpIds berisi referensi TP yang tidak resolve.',
      path: `${planPath}.tpIds`,
    });
    validateReferences(plan.atpItemIds, context.atpItemIds, context.error, {
      code: 'DANGLING_LEARNING_PLAN_ATP_REFERENCE',
      message: 'LearningPlan.atpItemIds berisi referensi ATPItem yang tidak resolve.',
      path: `${planPath}.atpItemIds`,
    });
    validateReferences(plan.kktpCriterionIds, context.criterionIds, context.error, {
      code: 'DANGLING_LEARNING_PLAN_KKTP_REFERENCE',
      message: 'LearningPlan.kktpCriterionIds berisi referensi KKTP yang tidak resolve.',
      path: `${planPath}.kktpCriterionIds`,
    });
    asArray(plan.objectives).forEach((objective, objectiveIndex) => {
      if (objective.tpId) {
        requireReference(objective.tpId, context.tpItemIds, context.error, {
          code: 'DANGLING_LEARNING_OBJECTIVE_TP_REFERENCE',
          message: `LearningPlan.objectives[].tpId [${objective.tpId}] tidak resolve ke TPItem.id.`,
          path: `${planPath}.objectives[${objectiveIndex}].tpId`,
        });
      }
    });
    asArray(plan.learningExperiences).forEach((experience, experienceIndex) => {
      validateReferences(experience.linkedTpIds, context.tpItemIds, context.error, {
        code: 'DANGLING_LEARNING_EXPERIENCE_TP_REFERENCE',
        message: 'LearningPlan.learningExperiences[].linkedTpIds berisi referensi TP yang tidak resolve.',
        path: `${planPath}.learningExperiences[${experienceIndex}].linkedTpIds`,
      });
    });
    const assessmentPlanBuckets = [
      { name: 'initial', items: plan.assessmentPlan?.initial },
      { name: 'formative', items: plan.assessmentPlan?.formative },
      { name: 'summative', items: plan.assessmentPlan?.summative },
    ];
    assessmentPlanBuckets.forEach(({ name, items }) => {
      asArray(items).forEach((item, itemIndex) => {
        validateReferences(item.linkedTpIds, context.tpItemIds, context.error, {
          code: 'DANGLING_LEARNING_ASSESSMENT_PLAN_TP_REFERENCE',
          message: 'LearningPlan.assessmentPlan.*[].linkedTpIds berisi referensi TP yang tidak resolve.',
          path: `${planPath}.assessmentPlan.${name}[${itemIndex}].linkedTpIds`,
        });
      });
    });
  });

  asArray(semesterData.assessmentPlans).forEach((plan, index) => {
    const planPath = `${path}.assessmentPlans[${index}]`;
    validateReferences(plan.tpIds, context.tpItemIds, context.error, {
      code: 'DANGLING_ASSESSMENT_PLAN_TP_REFERENCE',
      message: 'AssessmentPlan.tpIds berisi referensi TP yang tidak resolve.',
      path: `${planPath}.tpIds`,
    });
    validateReferences(plan.criterionIds, context.criterionIds, context.error, {
      code: 'DANGLING_ASSESSMENT_PLAN_CRITERION_REFERENCE',
      message: 'AssessmentPlan.criterionIds berisi referensi KKTP yang tidak resolve.',
      path: `${planPath}.criterionIds`,
    });
    validateReferences(plan.learningPlanIds, context.learningPlanIds, context.error, {
      code: 'DANGLING_ASSESSMENT_PLAN_LEARNING_PLAN_REFERENCE',
      message: 'AssessmentPlan.learningPlanIds berisi referensi LearningPlan yang tidak resolve.',
      path: `${planPath}.learningPlanIds`,
    });
  });

  asArray(semesterData.assessmentPackages).forEach((assessmentPackage, index) => {
    validateAssessmentPackageReferences(assessmentPackage, `${path}.assessmentPackages[${index}]`, context);
  });

  if (semesterData.semester !== 1 && semesterData.semester !== 2) {
    context.warning({
      code: 'SEMESTER_REFERENCES_SKIPPED_FOR_INVALID_SEMESTER',
      message: 'Sebagian validasi referensi semester mungkin tidak bermakna karena nomor semester tidak valid.',
      path,
    });
  }
}

function validateAssessmentPackageReferences(
  assessmentPackage: PortableAssessmentPackage,
  path: string,
  context: {
    error: (issue: IssueInput) => void;
    tpItemIds: Set<string>;
    criterionIds: Set<string>;
    assessmentPlanIds: Set<string>;
  }
): void {
  requireReference(assessmentPackage.assessmentPlanId, context.assessmentPlanIds, context.error, {
    code: 'DANGLING_ASSESSMENT_PACKAGE_PLAN_REFERENCE',
    message: `AssessmentPackage.assessmentPlanId [${String(assessmentPackage.assessmentPlanId)}] tidak resolve ke AssessmentPlan.id.`,
    path: `${path}.assessmentPlanId`,
  });

  const blueprintIds = new Set<string>();
  const instrumentIds = new Set<string>();
  const instrumentItemIds = new Set<string>();
  const rubricIds = new Set<string>();
  const scoringGuideIds = new Set<string>();
  const optionIdsByItemId = new Map<string, Set<string>>();
  const matchingPremiseIdsByItemId = new Map<string, Set<string>>();
  const matchingResponseIdsByItemId = new Map<string, Set<string>>();
  const categoryStatementIdsByItemId = new Map<string, Set<string>>();
  const categoryIdsByItemId = new Map<string, Set<string>>();

  asArray(assessmentPackage.blueprintItems).forEach((item, index) => {
    const itemPath = `${path}.blueprintItems[${index}]`;
    registerCanonicalId(item.id, blueprintIds, context.error, {
      code: 'DUPLICATE_BLUEPRINT_ITEM_ID',
      entityName: 'AssessmentBlueprintItem.id',
      path: `${itemPath}.id`,
    });
    requireReference(item.objectiveRefId, context.tpItemIds, context.error, {
      code: 'DANGLING_BLUEPRINT_OBJECTIVE_REFERENCE',
      message: `AssessmentBlueprintItem.objectiveRefId [${String(item.objectiveRefId)}] tidak resolve ke TPItem.id.`,
      path: `${itemPath}.objectiveRefId`,
    });
    if (item.criterionId) {
      requireReference(item.criterionId, context.criterionIds, context.error, {
        code: 'DANGLING_BLUEPRINT_CRITERION_REFERENCE',
        message: `AssessmentBlueprintItem.criterionId [${item.criterionId}] tidak resolve ke KKTP.id.`,
        path: `${itemPath}.criterionId`,
      });
    }
  });

  asArray(assessmentPackage.rubrics).forEach((rubric, index) => {
    registerCanonicalId(rubric.id, rubricIds, context.error, {
      code: 'DUPLICATE_RUBRIC_ID',
      entityName: 'AssessmentRubric.id',
      path: `${path}.rubrics[${index}].id`,
    });
  });

  asArray(assessmentPackage.scoringGuides).forEach((guide, index) => {
    registerCanonicalId(guide.id, scoringGuideIds, context.error, {
      code: 'DUPLICATE_SCORING_GUIDE_ID',
      entityName: 'AssessmentScoringGuide.id',
      path: `${path}.scoringGuides[${index}].id`,
    });
  });

  asArray(assessmentPackage.instruments).forEach((instrument, instrumentIndex) => {
    const instrumentPath = `${path}.instruments[${instrumentIndex}]`;
    registerCanonicalId(instrument.id, instrumentIds, context.error, {
      code: 'DUPLICATE_INSTRUMENT_ID',
      entityName: 'AssessmentInstrument.id',
      path: `${instrumentPath}.id`,
    });

    validateOptionalLocalReference((instrument as { blueprintItemId?: string }).blueprintItemId, blueprintIds, context.error, {
      code: 'DANGLING_INSTRUMENT_BLUEPRINT_REFERENCE',
      message: `Instrument.blueprintItemId tidak resolve ke blueprintItem.id.`,
      path: `${instrumentPath}.blueprintItemId`,
    });
    validateOptionalLocalReference((instrument as { rubricId?: string }).rubricId, rubricIds, context.error, {
      code: 'DANGLING_INSTRUMENT_RUBRIC_REFERENCE',
      message: `Instrument.rubricId tidak resolve ke rubric.id.`,
      path: `${instrumentPath}.rubricId`,
    });
    validateOptionalLocalReference((instrument as { scoringGuideId?: string }).scoringGuideId, scoringGuideIds, context.error, {
      code: 'DANGLING_INSTRUMENT_SCORING_GUIDE_REFERENCE',
      message: `Instrument.scoringGuideId tidak resolve ke scoringGuide.id.`,
      path: `${instrumentPath}.scoringGuideId`,
    });

    asArray((instrument as { items?: Array<Record<string, unknown>> }).items).forEach((item, itemIndex) => {
      const itemPath = `${instrumentPath}.items[${itemIndex}]`;
      const itemId = typeof item.id === 'string' ? item.id : undefined;
      registerCanonicalId(itemId, instrumentItemIds, context.error, {
        code: 'DUPLICATE_INSTRUMENT_ITEM_ID',
        entityName: 'instrumentItem.id',
        path: `${itemPath}.id`,
      });
      validateOptionalLocalReference(item.blueprintItemId, blueprintIds, context.error, {
        code: 'DANGLING_ITEM_BLUEPRINT_REFERENCE',
        message: `instrumentItem.blueprintItemId tidak resolve ke blueprintItem.id.`,
        path: `${itemPath}.blueprintItemId`,
      });

      if (!itemId) return;
      optionIdsByItemId.set(itemId, collectIds(item.options));
      matchingPremiseIdsByItemId.set(itemId, collectIds(item.matchingPremises));
      matchingResponseIdsByItemId.set(itemId, collectIds(item.matchingResponses));
      categoryStatementIdsByItemId.set(itemId, collectIds(item.categoryResponseStatements));
      categoryIdsByItemId.set(itemId, collectIds(item.categoryResponseCategories));

      asArray(item.matchingPairs as Array<{ premiseId?: string; responseId?: string }> | undefined).forEach((pair, pairIndex) => {
        requireReference(pair.premiseId, matchingPremiseIdsByItemId.get(itemId) ?? new Set(), context.error, {
          code: 'DANGLING_ITEM_MATCHING_PREMISE_REFERENCE',
          message: `Legacy matchingPairs.premiseId [${String(pair.premiseId)}] tidak resolve ke matchingPremises.id.`,
          path: `${itemPath}.matchingPairs[${pairIndex}].premiseId`,
        });
        requireReference(pair.responseId, matchingResponseIdsByItemId.get(itemId) ?? new Set(), context.error, {
          code: 'DANGLING_ITEM_MATCHING_RESPONSE_REFERENCE',
          message: `Legacy matchingPairs.responseId [${String(pair.responseId)}] tidak resolve ke matchingResponses.id.`,
          path: `${itemPath}.matchingPairs[${pairIndex}].responseId`,
        });
      });
    });
  });

  asArray(assessmentPackage.blueprintItems).forEach((item, index) => {
    if (item.instrumentId) {
      requireReference(item.instrumentId, instrumentIds, context.error, {
        code: 'DANGLING_BLUEPRINT_INSTRUMENT_REFERENCE',
        message: `AssessmentBlueprintItem.instrumentId [${item.instrumentId}] tidak resolve ke instrument.id.`,
        path: `${path}.blueprintItems[${index}].instrumentId`,
      });
    }
    validateReferences(item.instrumentItemIds, instrumentItemIds, context.error, {
      code: 'DANGLING_BLUEPRINT_INSTRUMENT_ITEM_REFERENCE',
      message: 'AssessmentBlueprintItem.instrumentItemIds berisi referensi instrumentItem.id yang tidak resolve.',
      path: `${path}.blueprintItems[${index}].instrumentItemIds`,
    });
  });

  validateAssessmentPackageSupportReferences(assessmentPackage, path, {
    error: context.error,
    instrumentIds,
    instrumentItemIds,
    optionIdsByItemId,
    matchingPremiseIdsByItemId,
    matchingResponseIdsByItemId,
    categoryStatementIdsByItemId,
    categoryIdsByItemId,
  });
}

function validateAssessmentPackageSupportReferences(
  assessmentPackage: PortableAssessmentPackage,
  path: string,
  context: {
    error: (issue: IssueInput) => void;
    instrumentIds: Set<string>;
    instrumentItemIds: Set<string>;
    optionIdsByItemId: Map<string, Set<string>>;
    matchingPremiseIdsByItemId: Map<string, Set<string>>;
    matchingResponseIdsByItemId: Map<string, Set<string>>;
    categoryStatementIdsByItemId: Map<string, Set<string>>;
    categoryIdsByItemId: Map<string, Set<string>>;
  }
): void {
  asArray(assessmentPackage.answerKeys).forEach((answerKey, index) => {
    const keyPath = `${path}.answerKeys[${index}]`;
    requireReference(answerKey.instrumentId, context.instrumentIds, context.error, {
      code: 'DANGLING_ANSWER_KEY_INSTRUMENT_REFERENCE',
      message: `AssessmentAnswerKey.instrumentId [${String(answerKey.instrumentId)}] tidak resolve ke instrument.id.`,
      path: `${keyPath}.instrumentId`,
    });
    requireReference(answerKey.instrumentItemId, context.instrumentItemIds, context.error, {
      code: 'DANGLING_ANSWER_KEY_INSTRUMENT_ITEM_REFERENCE',
      message: `AssessmentAnswerKey.instrumentItemId [${String(answerKey.instrumentItemId)}] tidak resolve ke instrumentItem.id.`,
      path: `${keyPath}.instrumentItemId`,
    });
    validateReferences(answerKey.optionIds, context.optionIdsByItemId.get(answerKey.instrumentItemId) ?? new Set(), context.error, {
      code: 'DANGLING_ANSWER_KEY_OPTION_REFERENCE',
      message: 'AssessmentAnswerKey.optionIds berisi referensi option.id yang tidak resolve pada item target.',
      path: `${keyPath}.optionIds`,
    });
    asArray(answerKey.matchingPairs).forEach((pair, pairIndex) => {
      requireReference(pair.premiseId, context.matchingPremiseIdsByItemId.get(answerKey.instrumentItemId) ?? new Set(), context.error, {
        code: 'DANGLING_ANSWER_KEY_MATCHING_PREMISE_REFERENCE',
        message: `AssessmentAnswerKey.matchingPairs.premiseId [${String(pair.premiseId)}] tidak resolve pada item target.`,
        path: `${keyPath}.matchingPairs[${pairIndex}].premiseId`,
      });
      requireReference(pair.responseId, context.matchingResponseIdsByItemId.get(answerKey.instrumentItemId) ?? new Set(), context.error, {
        code: 'DANGLING_ANSWER_KEY_MATCHING_RESPONSE_REFERENCE',
        message: `AssessmentAnswerKey.matchingPairs.responseId [${String(pair.responseId)}] tidak resolve pada item target.`,
        path: `${keyPath}.matchingPairs[${pairIndex}].responseId`,
      });
    });
    asArray(answerKey.categoryAnswers).forEach((answer, answerIndex) => {
      requireReference(answer.statementId, context.categoryStatementIdsByItemId.get(answerKey.instrumentItemId) ?? new Set(), context.error, {
        code: 'DANGLING_ANSWER_KEY_CATEGORY_STATEMENT_REFERENCE',
        message: `AssessmentAnswerKey.categoryAnswers.statementId [${String(answer.statementId)}] tidak resolve pada item target.`,
        path: `${keyPath}.categoryAnswers[${answerIndex}].statementId`,
      });
      requireReference(answer.categoryId, context.categoryIdsByItemId.get(answerKey.instrumentItemId) ?? new Set(), context.error, {
        code: 'DANGLING_ANSWER_KEY_CATEGORY_REFERENCE',
        message: `AssessmentAnswerKey.categoryAnswers.categoryId [${String(answer.categoryId)}] tidak resolve pada item target.`,
        path: `${keyPath}.categoryAnswers[${answerIndex}].categoryId`,
      });
    });
  });

  asArray(assessmentPackage.rubrics).forEach((rubric, index) => {
    const rubricPath = `${path}.rubrics[${index}]`;
    validateOptionalLocalReference(rubric.instrumentId, context.instrumentIds, context.error, {
      code: 'DANGLING_RUBRIC_INSTRUMENT_REFERENCE',
      message: `AssessmentRubric.instrumentId tidak resolve ke instrument.id.`,
      path: `${rubricPath}.instrumentId`,
    });
    validateOptionalLocalReference(rubric.instrumentItemId, context.instrumentItemIds, context.error, {
      code: 'DANGLING_RUBRIC_ITEM_REFERENCE',
      message: `AssessmentRubric.instrumentItemId tidak resolve ke instrumentItem.id.`,
      path: `${rubricPath}.instrumentItemId`,
    });
  });

  asArray(assessmentPackage.scoringGuides).forEach((guide, index) => {
    const guidePath = `${path}.scoringGuides[${index}]`;
    validateOptionalLocalReference(guide.instrumentId, context.instrumentIds, context.error, {
      code: 'DANGLING_SCORING_GUIDE_INSTRUMENT_REFERENCE',
      message: `AssessmentScoringGuide.instrumentId tidak resolve ke instrument.id.`,
      path: `${guidePath}.instrumentId`,
    });
    validateOptionalLocalReference(guide.instrumentItemId, context.instrumentItemIds, context.error, {
      code: 'DANGLING_SCORING_GUIDE_ITEM_REFERENCE',
      message: `AssessmentScoringGuide.instrumentItemId tidak resolve ke instrumentItem.id.`,
      path: `${guidePath}.instrumentItemId`,
    });
  });
}

function registerCanonicalId(
  id: string | undefined,
  seen: Set<string>,
  error: (issue: IssueInput) => void,
  options: {
    code: string;
    entityName: string;
    path: string;
  }
): void {
  if (!isPresent(id)) {
    error({
      code: 'CANONICAL_ID_REQUIRED',
      message: `${options.entityName} wajib ada untuk kontrak portable.`,
      path: options.path,
    });
    return;
  }
  if (seen.has(id)) {
    error({
      code: options.code,
      message: `Duplicate ${options.entityName} [${id}] membuat reference ambigu.`,
      path: options.path,
      refId: id,
    });
    return;
  }
  seen.add(id);
}

function validateReferences(
  ids: string[] | undefined,
  validIds: Set<string>,
  error: (issue: IssueInput) => void,
  options: {
    code: string;
    message: string;
    path: string;
  }
): void {
  asArray(ids).forEach((id, index) => {
    requireReference(id, validIds, error, {
      ...options,
      path: `${options.path}[${index}]`,
    });
  });
}

function validateOptionalLocalReference(
  id: unknown,
  validIds: Set<string>,
  error: (issue: IssueInput) => void,
  options: {
    code: string;
    message: string;
    path: string;
  }
): void {
  if (typeof id !== 'string' || id.trim().length === 0) return;
  requireReference(id, validIds, error, options);
}

function requireReference(
  id: unknown,
  validIds: Set<string>,
  error: (issue: IssueInput) => void,
  options: {
    code: string;
    message: string;
    path: string;
  }
): void {
  if (typeof id !== 'string' || id.trim().length === 0 || !validIds.has(id)) {
    error({
      ...options,
      refId: typeof id === 'string' ? id : undefined,
    });
  }
}

function collectIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) return ids;
  value.forEach((item) => {
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      ids.add((item as { id: string }).id);
    }
  });
  return ids;
}

function buildResult(issues: AdministrationProjectTransferIssue[]): AdministrationProjectTransferValidationResult {
  const errors = issues.filter((issue) => issue.severity === 'ERROR');
  const warnings = issues.filter((issue) => issue.severity === 'WARNING');
  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
  };
}
