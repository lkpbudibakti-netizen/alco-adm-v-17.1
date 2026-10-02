import type {
  AppStorageStateV5,
  AdministrationWorkspaceV5,
} from '../types/storageV5';
import type {
  AssessmentCriterion,
  AssessmentPackage,
  AssessmentPlan,
  ATPData,
  ATPItem,
  CPAnalysisData,
  CPAnalysisItem,
  CPData,
  CPElem,
  LearningPlan,
  SemesterPlan,
  TPData,
  TPItem,
  YearPlan,
} from '../types';
import type {
  AdministrationProjectPackage,
  AdministrationProjectPackageSemesterData,
  AdministrationProjectTransferIssue,
  PortableAssessmentCriterion,
  PortableAssessmentPackage,
  PortableAssessmentPlan,
  PortableATPData,
  PortableCPAnalysisData,
  PortableCPData,
  PortableLearningPlan,
  PortableTPData,
} from '../types/administrationProjectTransfer';
import {
  createInitialStorageV5,
  saveStorageV5,
  STORAGE_KEY_V5,
  validateStorageStateV5,
} from './storageV5';
import { validateAdministrationProjectPackage } from './administrationProjectTransferService';
import { validateAssessmentPackage } from './assessmentPackageService';

export interface AdministrationProjectImportParams {
  package: AdministrationProjectPackage;
  targetProfileId: string;
  targetSchoolId: string;
  targetClassSection?: string;
}

export interface AdministrationProjectImportSuccess {
  success: true;
  yearPlanId: string;
  workspaceId: string;
  semesterPlanIds: {
    semester1: string;
    semester2: string;
  };
  remapSummary: {
    tpItemCount: number;
    atpItemCount: number;
    learningPlanCount: number;
    assessmentCriterionCount: number;
    assessmentPlanCount: number;
    assessmentPackageCount: number;
  };
}

export interface AdministrationProjectImportFailure {
  success: false;
  errorCode: string;
  message: string;
  issues?: AdministrationProjectTransferIssue[] | ImportIssue[];
}

export interface ImportIssue {
  code: string;
  message: string;
  path?: string;
  refId?: string;
}

export type AdministrationProjectImportResult =
  | AdministrationProjectImportSuccess
  | AdministrationProjectImportFailure;

interface ImportContext {
  now: string;
  yearPlan: YearPlan;
  workspace: AdministrationWorkspaceV5;
  semesterPlansByNumber: Map<1 | 2, SemesterPlan>;
  cpIdMap: Map<string, string>;
  cpElementIdMap: Map<string, string>;
  cpAnalysisIdMap: Map<string, string>;
  cpAnalysisItemIdMap: Map<string, string>;
  tpDataIdMap: Map<string, string>;
  tpItemIdMap: Map<string, string>;
  atpDataIdMap: Map<string, string>;
  atpItemIdMap: Map<string, string>;
  learningPlanIdMap: Map<string, string>;
  criterionIdMap: Map<string, string>;
  assessmentPlanIdMap: Map<string, string>;
  assessmentPackageIdMap: Map<string, string>;
  issues: ImportIssue[];
}

export function importAdministrationProject(
  params: AdministrationProjectImportParams
): AdministrationProjectImportResult {
  const packageValidation = validateAdministrationProjectPackage(params.package);
  if (!packageValidation.valid) {
    return {
      success: false,
      errorCode: 'PACKAGE_VALIDATION_FAILED',
      message: 'AdministrationProjectPackage gagal validasi. Import dibatalkan.',
      issues: packageValidation.issues,
    };
  }

  const storageRead = readStorageV5Snapshot();
  if (!storageRead.success) return storageRead;

  return importAdministrationProjectIntoState(storageRead.state, params);
}

export function importAdministrationProjectIntoState(
  currentState: AppStorageStateV5,
  params: AdministrationProjectImportParams
): AdministrationProjectImportResult {
  const packageValidation = validateAdministrationProjectPackage(params.package);
  if (!packageValidation.valid) {
    return {
      success: false,
      errorCode: 'PACKAGE_VALIDATION_FAILED',
      message: 'AdministrationProjectPackage gagal validasi. Import dibatalkan.',
      issues: packageValidation.issues,
    };
  }

  const targetProfile = currentState.profiles.find((profile) => profile.id === params.targetProfileId);
  if (!targetProfile) {
    return failure('TARGET_PROFILE_NOT_FOUND', `Target profile [${params.targetProfileId}] tidak ditemukan.`);
  }

  const targetSchool = currentState.schools.find((school) => school.id === params.targetSchoolId);
  if (!targetSchool) {
    return failure('TARGET_SCHOOL_NOT_FOUND', `Target school [${params.targetSchoolId}] tidak ditemukan.`);
  }
  if (targetProfile.schoolId && targetProfile.schoolId !== targetSchool.id) {
    return failure(
      'TARGET_PROFILE_SCHOOL_MISMATCH',
      `Target profile [${targetProfile.id}] tidak terhubung dengan target school [${targetSchool.id}].`
    );
  }

  const targetClassSection =
    params.targetClassSection !== undefined
      ? (params.targetClassSection.trim() || undefined)
      : params.package.header.classSection;

  const duplicate = currentState.yearPlans.find(
    (yearPlan) =>
      yearPlan.profileId === params.targetProfileId &&
      yearPlan.schoolId === params.targetSchoolId &&
      yearPlan.academicYear === params.package.header.academicYear &&
      yearPlan.grade === params.package.header.grade &&
      (yearPlan.classSection || '') === (targetClassSection || '') &&
      yearPlan.subject.trim().toLowerCase() === params.package.header.subject.trim().toLowerCase()
  );
  if (duplicate) {
    return failure(
      'DUPLICATE_PROJECT',
      `Project target dengan identitas yang sama sudah ada: YearPlan [${duplicate.id}].`
    );
  }

  const nextState = clone(currentState);
  const context = createImportContext(params.package, params.targetProfileId, params.targetSchoolId, targetClassSection);

  const annualResult = buildAnnualData(params.package, context);
  const semesterResults = ([1, 2] as const).map((semester) =>
    buildSemesterData(params.package, semester, context)
  );

  if (context.issues.length > 0) {
    return {
      success: false,
      errorCode: 'REFERENCE_REMAP_FAILED',
      message: 'Import dibatalkan karena ada reference wajib yang tidak dapat diremap.',
      issues: context.issues,
    };
  }

  nextState.yearPlans.push(context.yearPlan);
  nextState.workspaces.push(context.workspace);
  nextState.semesterPlans.push(...Array.from(context.semesterPlansByNumber.values()));
  nextState.activeProfileId = params.targetProfileId;
  nextState.activeYearPlanId = context.yearPlan.id;
  nextState.activeWorkspaceId = context.workspace.id;
  nextState.activeSemesterPlanId = undefined;

  if (annualResult.cp) nextState.annualData.cp.push({ yearPlanId: context.yearPlan.id, value: annualResult.cp });
  if (annualResult.cpAnalysis) {
    nextState.annualData.cpAnalysis.push({ yearPlanId: context.yearPlan.id, value: annualResult.cpAnalysis });
  }
  if (annualResult.tp) nextState.annualData.tp.push({ yearPlanId: context.yearPlan.id, value: annualResult.tp });
  if (annualResult.atp) nextState.annualData.atp.push({ yearPlanId: context.yearPlan.id, value: annualResult.atp });

  semesterResults.forEach((result) => {
    const semesterPlan = context.semesterPlansByNumber.get(result.semester)!;
    nextState.semesterData.learningPlan.push({
      semesterPlanId: semesterPlan.id,
      value: result.learningPlans,
    });
    nextState.semesterData.assessmentCriteria.push({
      semesterPlanId: semesterPlan.id,
      value: result.assessmentCriteria,
    });
    nextState.semesterData.assessmentPlan.push({
      semesterPlanId: semesterPlan.id,
      value: result.assessmentPlans,
    });
    nextState.semesterData.assessmentPackage.push({
      semesterPlanId: semesterPlan.id,
      value: result.assessmentPackages,
    });
  });

  const assessmentIssues = validateImportedAssessmentPackages(
    semesterResults,
    context.yearPlan,
    annualResult.tp
  );
  if (assessmentIssues.length > 0) {
    return {
      success: false,
      errorCode: 'ASSESSMENT_PACKAGE_VALIDATION_FAILED',
      message: 'Import dibatalkan karena validasi AssessmentPackage hasil remap gagal.',
      issues: assessmentIssues,
    };
  }

  try {
    validateStorageStateV5(nextState);
    saveStorageV5(nextState);
  } catch (err) {
    return failure(
      'STORAGE_VALIDATION_FAILED',
      err instanceof Error ? err.message : 'Validasi Storage V5 gagal. Import dibatalkan.'
    );
  }

  return {
    success: true,
    yearPlanId: context.yearPlan.id,
    workspaceId: context.workspace.id,
    semesterPlanIds: {
      semester1: context.semesterPlansByNumber.get(1)!.id,
      semester2: context.semesterPlansByNumber.get(2)!.id,
    },
    remapSummary: {
      tpItemCount: context.tpItemIdMap.size,
      atpItemCount: context.atpItemIdMap.size,
      learningPlanCount: context.learningPlanIdMap.size,
      assessmentCriterionCount: context.criterionIdMap.size,
      assessmentPlanCount: context.assessmentPlanIdMap.size,
      assessmentPackageCount: context.assessmentPackageIdMap.size,
    },
  };
}

function createImportContext(
  pkg: AdministrationProjectPackage,
  profileId: string,
  schoolId: string,
  classSection?: string
): ImportContext {
  const now = new Date().toISOString();
  const yearPlanId = newId('yp');
  const workspaceId = newId('ws');
  const semesterPlan1Id = newId('sp1');
  const semesterPlan2Id = newId('sp2');

  const yearPlan: YearPlan = {
    id: yearPlanId,
    profileId,
    schoolId,
    academicYear: pkg.header.academicYear,
    curriculumType: pkg.header.curriculumType,
    level: pkg.header.level,
    grade: pkg.header.grade,
    ...(classSection !== undefined ? { classSection } : {}),
    subject: pkg.header.subject,
    phase: pkg.header.phase,
    createdAt: now,
    updatedAt: now,
  };

  const workspace: AdministrationWorkspaceV5 = {
    id: workspaceId,
    profileId,
    schoolId,
    yearPlanId,
    name: `${pkg.header.subject} - ${pkg.header.grade} (${pkg.header.academicYear})`,
    createdAt: now,
    updatedAt: now,
  };

  return {
    now,
    yearPlan,
    workspace,
    semesterPlansByNumber: new Map([
      [1, { id: semesterPlan1Id, yearPlanId, semester: 1, createdAt: now, updatedAt: now }],
      [2, { id: semesterPlan2Id, yearPlanId, semester: 2, createdAt: now, updatedAt: now }],
    ]),
    cpIdMap: new Map(),
    cpElementIdMap: new Map(),
    cpAnalysisIdMap: new Map(),
    cpAnalysisItemIdMap: new Map(),
    tpDataIdMap: new Map(),
    tpItemIdMap: new Map(),
    atpDataIdMap: new Map(),
    atpItemIdMap: new Map(),
    learningPlanIdMap: new Map(),
    criterionIdMap: new Map(),
    assessmentPlanIdMap: new Map(),
    assessmentPackageIdMap: new Map(),
    issues: [],
  };
}

function buildAnnualData(
  pkg: AdministrationProjectPackage,
  context: ImportContext
): {
  cp?: CPData;
  cpAnalysis?: CPAnalysisData;
  tp?: TPData;
  atp?: ATPData;
} {
  assertSingleAnnualEntity(pkg.annual.cp, 'annual.cp', context);
  assertSingleAnnualEntity(pkg.annual.cpAnalysis || [], 'annual.cpAnalysis', context);
  assertSingleAnnualEntity(pkg.annual.tp, 'annual.tp', context);
  assertSingleAnnualEntity(pkg.annual.atp, 'annual.atp', context);

  const cp = pkg.annual.cp[0] ? remapCP(pkg.annual.cp[0], context) : undefined;
  const cpAnalysis = pkg.annual.cpAnalysis?.[0]
    ? remapCPAnalysis(pkg.annual.cpAnalysis[0], context)
    : undefined;
  const tp = pkg.annual.tp[0] ? remapTP(pkg.annual.tp[0], context) : undefined;
  const atp = pkg.annual.atp[0] ? remapATP(pkg.annual.atp[0], context) : undefined;

  return { cp, cpAnalysis, tp, atp };
}

function buildSemesterData(
  pkg: AdministrationProjectPackage,
  semester: 1 | 2,
  context: ImportContext
): {
  semester: 1 | 2;
  learningPlans: LearningPlan[];
  assessmentCriteria: AssessmentCriterion[];
  assessmentPlans: AssessmentPlan[];
  assessmentPackages: AssessmentPackage[];
} {
  const source = pkg.semesters.find((entry) => entry.semester === semester);
  if (!source) {
    return {
      semester,
      learningPlans: [],
      assessmentCriteria: [],
      assessmentPlans: [],
      assessmentPackages: [],
    };
  }

  registerSemesterMaps(source, context);

  const assessmentCriteria = source.assessmentCriteria.map((criterion, index) =>
    remapAssessmentCriterion(criterion, context, `semesters.${semester}.assessmentCriteria[${index}]`)
  );
  const learningPlans = source.learningPlans.map((plan, index) =>
    remapLearningPlan(plan, context, `semesters.${semester}.learningPlans[${index}]`)
  );
  const assessmentPlans = source.assessmentPlans.map((plan, index) =>
    remapAssessmentPlan(plan, context, `semesters.${semester}.assessmentPlans[${index}]`)
  );
  const assessmentPackages = source.assessmentPackages.map((assessmentPackage, index) =>
    remapAssessmentPackage(assessmentPackage, context, `semesters.${semester}.assessmentPackages[${index}]`)
  );

  return {
    semester,
    learningPlans,
    assessmentCriteria,
    assessmentPlans,
    assessmentPackages,
  };
}

function registerSemesterMaps(source: AdministrationProjectPackageSemesterData, context: ImportContext): void {
  source.learningPlans.forEach((plan) => {
    context.learningPlanIdMap.set(plan.id, newId('lp'));
  });
  source.assessmentCriteria.forEach((criterion) => {
    context.criterionIdMap.set(criterion.id, newId('kktp'));
  });
  source.assessmentPlans.forEach((plan) => {
    context.assessmentPlanIdMap.set(plan.id, newId('ap'));
  });
  source.assessmentPackages.forEach((assessmentPackage) => {
    context.assessmentPackageIdMap.set(assessmentPackage.id, newId('pkg'));
  });
}

function remapCP(source: PortableCPData, context: ImportContext): CPData {
  const cp = clone(source) as CPData;
  const oldId = source.id;
  const newCpId = newId('cp');
  context.cpIdMap.set(oldId, newCpId);
  cp.id = newCpId;
  cp.academicSettingId = context.yearPlan.id;
  cp.elements = (source.elements || []).map((element) => {
    const next = clone(element) as CPElem;
    const newElementId = newId('cpe');
    context.cpElementIdMap.set(element.id, newElementId);
    next.id = newElementId;
    return next;
  });
  cp.updatedAt = context.now;
  return cp;
}

function remapCPAnalysis(source: PortableCPAnalysisData, context: ImportContext): CPAnalysisData {
  const cpAnalysis = clone(source) as CPAnalysisData;
  const oldId = source.id;
  const newAnalysisId = newId('cpa');
  context.cpAnalysisIdMap.set(oldId, newAnalysisId);
  cpAnalysis.id = newAnalysisId;
  cpAnalysis.academicSettingId = context.yearPlan.id;
  cpAnalysis.workspaceId = context.workspace.id;
  cpAnalysis.cpId = remapOptional(source.cpId, context.cpIdMap, context, 'annual.cpAnalysis.cpId');
  cpAnalysis.items = (source.items || []).map((item) => {
    const next = clone(item) as CPAnalysisItem;
    const newItemId = newId('cpai');
    context.cpAnalysisItemIdMap.set(item.id, newItemId);
    next.id = newItemId;
    next.elementId = remapOptional(item.elementId, context.cpElementIdMap, context, 'annual.cpAnalysis.items.elementId');
    return next;
  });
  cpAnalysis.updatedAt = context.now;
  return cpAnalysis;
}

function remapTP(source: PortableTPData, context: ImportContext): TPData {
  const tp = clone(source) as TPData;
  context.tpDataIdMap.set(source.id, newId('tpd'));
  tp.id = context.tpDataIdMap.get(source.id)!;
  tp.academicSettingId = context.yearPlan.id;
  tp.workspaceId = context.workspace.id;
  tp.cpId = remapOptional(source.cpId, context.cpIdMap, context, 'annual.tp.cpId');
  tp.cpAnalysisId = remapOptional(source.cpAnalysisId, context.cpAnalysisIdMap, context, 'annual.tp.cpAnalysisId');
  tp.items = (source.items || []).map((item) => {
    const next = clone(item) as TPItem;
    const newItemId = newId('tp');
    context.tpItemIdMap.set(item.id, newItemId);
    next.id = newItemId;
    next.cpAnalysisId = remapOptional(item.cpAnalysisId, context.cpAnalysisItemIdMap, context, 'annual.tp.items.cpAnalysisId');
    next.cpAnalysisItemIds = remapOptionalArray(
      item.cpAnalysisItemIds,
      context.cpAnalysisItemIdMap,
      context,
      'annual.tp.items.cpAnalysisItemIds'
    );
    return next;
  });
  tp.updatedAt = context.now;
  return tp;
}

function remapATP(source: PortableATPData, context: ImportContext): ATPData {
  const atp = clone(source) as ATPData;
  context.atpDataIdMap.set(source.id, newId('atpd'));
  atp.id = context.atpDataIdMap.get(source.id)!;
  atp.academicSettingId = context.yearPlan.id;
  atp.workspaceId = context.workspace.id;
  atp.tpId = remapOptional(source.tpId, context.tpItemIdMap, context, 'annual.atp.tpId');
  atp.tpDataId = remapOptional(source.tpDataId, context.tpDataIdMap, context, 'annual.atp.tpDataId');
  atp.items = (source.items || []).map((item, index) =>
    remapATPItem(item, context, `annual.atp.items[${index}]`)
  );
  atp.updatedAt = context.now;
  return atp;
}

function remapATPItem(source: ATPItem, context: ImportContext, path: string): ATPItem {
  const item = clone(source) as ATPItem;
  const newItemId = newId('atpi');
  context.atpItemIdMap.set(source.id, newItemId);
  item.id = newItemId;
  item.tpId = requireMapped(source.tpId, context.tpItemIdMap, context, `${path}.tpId`);
  return item;
}

function remapLearningPlan(source: PortableLearningPlan, context: ImportContext, path: string): LearningPlan {
  const plan = clone(source) as LearningPlan;
  plan.id = requireMapped(source.id, context.learningPlanIdMap, context, `${path}.id`);
  plan.academicSettingId = context.yearPlan.id;
  plan.curriculumType = context.yearPlan.curriculumType;
  plan.status = 'DRAFT';
  plan.tpIds = remapRequiredArray(source.tpIds, context.tpItemIdMap, context, `${path}.tpIds`);
  plan.atpItemIds = remapRequiredArray(source.atpItemIds, context.atpItemIdMap, context, `${path}.atpItemIds`);
  plan.kktpCriterionIds = remapOptionalArray(source.kktpCriterionIds, context.criterionIdMap, context, `${path}.kktpCriterionIds`);
  plan.timeAllocationIds = [];
  plan.objectives = (source.objectives || []).map((objective, index) => ({
    ...clone(objective),
    tpId: remapOptional(objective.tpId, context.tpItemIdMap, context, `${path}.objectives[${index}].tpId`),
  }));
  plan.learningExperiences = source.learningExperiences?.map((experience, index) => ({
    ...clone(experience),
    linkedTpIds: remapOptionalArray(
      experience.linkedTpIds,
      context.tpItemIdMap,
      context,
      `${path}.learningExperiences[${index}].linkedTpIds`
    ),
  }));
  plan.assessmentPlan = {
    initial: remapLearningAssessmentItems(source.assessmentPlan?.initial, context, `${path}.assessmentPlan.initial`),
    formative: remapLearningAssessmentItems(source.assessmentPlan?.formative, context, `${path}.assessmentPlan.formative`),
    summative: remapLearningAssessmentItems(source.assessmentPlan?.summative, context, `${path}.assessmentPlan.summative`),
  };
  plan.reflection = {
    ...(plan.reflection || {}),
    teacherReflection: appendReviewNote(
      plan.reflection?.teacherReflection,
      'Hasil import perlu review karena konteks target dan alokasi waktu belum direkonsiliasi.'
    ),
  };
  plan.confirmedAt = undefined;
  plan.updatedAt = context.now;
  return plan;
}

function remapLearningAssessmentItems(
  items: LearningPlan['assessmentPlan']['initial'] | undefined,
  context: ImportContext,
  path: string
): LearningPlan['assessmentPlan']['initial'] {
  return items?.map((item, index) => ({
    ...clone(item),
    linkedTpIds: remapRequiredArray(item.linkedTpIds, context.tpItemIdMap, context, `${path}[${index}].linkedTpIds`),
  }));
}

function remapAssessmentCriterion(
  source: PortableAssessmentCriterion,
  context: ImportContext,
  path: string
): AssessmentCriterion {
  const criterion = clone(source) as AssessmentCriterion;
  criterion.id = requireMapped(source.id, context.criterionIdMap, context, `${path}.id`);
  criterion.academicSettingId = context.yearPlan.id;
  criterion.workspaceId = context.workspace.id;
  criterion.tpId = requireMapped(source.tpId, context.tpItemIdMap, context, `${path}.tpId`);
  criterion.updatedAt = context.now;
  return criterion;
}

function remapAssessmentPlan(source: PortableAssessmentPlan, context: ImportContext, path: string): AssessmentPlan {
  const plan = clone(source) as AssessmentPlan;
  plan.id = requireMapped(source.id, context.assessmentPlanIdMap, context, `${path}.id`);
  plan.academicSettingId = context.yearPlan.id;
  plan.workspaceId = context.workspace.id;
  plan.tpIds = remapRequiredArray(source.tpIds, context.tpItemIdMap, context, `${path}.tpIds`);
  plan.criterionIds = remapRequiredArray(source.criterionIds, context.criterionIdMap, context, `${path}.criterionIds`);
  plan.learningPlanIds = remapOptionalArray(source.learningPlanIds, context.learningPlanIdMap, context, `${path}.learningPlanIds`);
  plan.confirmedAt = undefined;
  plan.updatedAt = context.now;
  return plan;
}

function remapAssessmentPackage(
  source: PortableAssessmentPackage,
  context: ImportContext,
  path: string
): AssessmentPackage {
  const assessmentPackage = clone(source) as AssessmentPackage;
  assessmentPackage.id = requireMapped(source.id, context.assessmentPackageIdMap, context, `${path}.id`);
  assessmentPackage.assessmentPlanId = requireMapped(
    source.assessmentPlanId,
    context.assessmentPlanIdMap,
    context,
    `${path}.assessmentPlanId`
  );
  assessmentPackage.academicSettingId = context.yearPlan.id;
  assessmentPackage.workspaceId = context.workspace.id;
  assessmentPackage.blueprintItems = (source.blueprintItems || []).map((item, index) => ({
    ...clone(item),
    objectiveRefId: requireMapped(
      item.objectiveRefId,
      context.tpItemIdMap,
      context,
      `${path}.blueprintItems[${index}].objectiveRefId`
    ),
    criterionId: remapOptional(
      item.criterionId,
      context.criterionIdMap,
      context,
      `${path}.blueprintItems[${index}].criterionId`
    ),
  }));
  assessmentPackage.updatedAt = context.now;
  return assessmentPackage;
}

function validateImportedAssessmentPackages(
  semesterResults: Array<{
    assessmentCriteria: AssessmentCriterion[];
    assessmentPlans: AssessmentPlan[];
    assessmentPackages: AssessmentPackage[];
  }>,
  yearPlan: YearPlan,
  tp?: TPData
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  semesterResults.forEach((semesterResult, semesterIndex) => {
    semesterResult.assessmentPackages.forEach((assessmentPackage) => {
      const assessmentPlan = semesterResult.assessmentPlans.find(
        (candidate) => candidate.id === assessmentPackage.assessmentPlanId
      );
      const validation = validateAssessmentPackage(assessmentPackage, {
        academicSetting: {
          id: yearPlan.id,
          profileId: yearPlan.profileId,
          curriculum: yearPlan.curriculumType === 'K13' ? 'Kurikulum 2013' : 'Kurikulum Merdeka',
          curriculumType: yearPlan.curriculumType,
          academicYear: yearPlan.academicYear,
          semester: '',
          level: yearPlan.level,
          grade: yearPlan.grade,
          phase: yearPlan.phase || '',
          subject: yearPlan.subject,
          updatedAt: '',
        },
        assessmentPlan: assessmentPlan
          ? {
              ...assessmentPlan,
              workflowStatus: 'SIAP',
              needsReview: false,
            }
          : undefined,
        assessmentCriteria: semesterResult.assessmentCriteria,
        tp,
      });
      validation.errors.forEach((message) => {
        issues.push({
          code: 'ASSESSMENT_PACKAGE_INVALID',
          message,
          path: `semesters[${semesterIndex}].assessmentPackages.${assessmentPackage.id}`,
        });
      });
    });
  });
  return issues;
}

function readStorageV5Snapshot():
  | { success: true; state: AppStorageStateV5 }
  | AdministrationProjectImportFailure {
  if (typeof localStorage === 'undefined') {
    return { success: true, state: createInitialStorageV5() };
  }

  const raw = localStorage.getItem(STORAGE_KEY_V5);
  if (raw === null) {
    return { success: true, state: createInitialStorageV5() };
  }

  try {
    return { success: true, state: validateStorageStateV5(JSON.parse(raw)) };
  } catch (err) {
    return failure(
      'STORAGE_READ_FAILED',
      err instanceof Error ? err.message : 'Storage V5 tidak dapat dibaca.'
    );
  }
}

function assertSingleAnnualEntity(values: unknown[] | undefined, path: string, context: ImportContext): void {
  if ((values || []).length > 1) {
    context.issues.push({
      code: 'UNSUPPORTED_MULTIPLE_ANNUAL_ENTITY',
      message: `${path} berisi lebih dari satu entity. Import Core saat ini hanya menerima satu wrapper V5 per annual collection.`,
      path,
    });
  }
}

function remapRequiredArray(
  ids: string[] | undefined,
  map: Map<string, string>,
  context: ImportContext,
  path: string
): string[] {
  return (ids || []).map((id, index) => requireMapped(id, map, context, `${path}[${index}]`));
}

function remapOptionalArray(
  ids: string[] | undefined,
  map: Map<string, string>,
  context?: ImportContext,
  path?: string
): string[] | undefined {
  if (!ids) return undefined;
  return ids.map((id, index) =>
    context && path ? requireMapped(id, map, context, `${path}[${index}]`) : map.get(id) || id
  );
}

function remapOptional(
  id: string | undefined,
  map: Map<string, string>,
  context?: ImportContext,
  path?: string
): string | undefined {
  if (!id) return undefined;
  const mapped = map.get(id);
  if (!mapped && context && path) {
    context.issues.push({
      code: 'MISSING_REFERENCE_MAP',
      message: `Reference [${id}] tidak memiliki mapping.`,
      path,
      refId: id,
    });
  }
  return mapped || id;
}

function requireMapped(
  id: string | undefined,
  map: Map<string, string>,
  context: ImportContext,
  path: string
): string {
  if (!id) {
    context.issues.push({
      code: 'MISSING_REQUIRED_REFERENCE',
      message: `Reference wajib kosong pada ${path}.`,
      path,
    });
    return '';
  }
  const mapped = map.get(id);
  if (!mapped) {
    context.issues.push({
      code: 'MISSING_REFERENCE_MAP',
      message: `Reference [${id}] tidak memiliki mapping.`,
      path,
      refId: id,
    });
    return id;
  }
  return mapped;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function appendReviewNote(existing: string | undefined, note: string): string {
  if (!existing || existing.trim() === '') return note;
  if (existing.includes(note)) return existing;
  return `${existing}\n${note}`;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function failure(errorCode: string, message: string): AdministrationProjectImportFailure {
  return {
    success: false,
    errorCode,
    message,
  };
}
