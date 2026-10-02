import type {
  AppStorageStateV5,
  SemesterScopedEntry,
  YearScopedEntry,
} from '../types/storageV5';
import type {
  AssessmentCriterion,
  AssessmentPackage,
  AssessmentPlan,
  LearningPlan,
  SemesterNumber,
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
import { ADMINISTRATION_PROJECT_PACKAGE_SCHEMA_VERSION_V1 } from '../types/administrationProjectTransfer';
import {
  createInitialStorageV5,
  STORAGE_KEY_V5,
  validateStorageStateV5,
} from './storageV5';
import { validateAdministrationProjectPackage } from './administrationProjectTransferService';

export interface AdministrationProjectExportSuccess {
  success: true;
  package: AdministrationProjectPackage;
  validation: ReturnType<typeof validateAdministrationProjectPackage>;
}

export interface AdministrationProjectExportFailure {
  success: false;
  errorCode: string;
  message: string;
  validation?: ReturnType<typeof validateAdministrationProjectPackage>;
  issues?: AdministrationProjectTransferIssue[];
}

export type AdministrationProjectExportResult =
  | AdministrationProjectExportSuccess
  | AdministrationProjectExportFailure;

export interface AdministrationProjectExportOptions {
  exportedAt?: string;
}

const FORBIDDEN_PORTABLE_KEYS = new Set([
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

export function exportAdministrationProject(
  yearPlanId: string,
  options?: AdministrationProjectExportOptions
): AdministrationProjectExportResult {
  const storageRead = readStorageV5Snapshot();
  if (!storageRead.success) {
    return storageRead;
  }
  return exportAdministrationProjectFromState(storageRead.state, yearPlanId, options);
}

export function exportAdministrationProjectFromState(
  state: AppStorageStateV5,
  yearPlanId: string,
  options?: AdministrationProjectExportOptions
): AdministrationProjectExportResult {
  const yearPlan = state.yearPlans.find((candidate) => candidate.id === yearPlanId);
  if (!yearPlan) {
    return failure(
      'YEAR_PLAN_NOT_FOUND',
      `YearPlan [${yearPlanId}] tidak ditemukan.`
    );
  }

  const workspace = state.workspaces.find((candidate) => candidate.yearPlanId === yearPlan.id);
  if (!workspace) {
    return failure(
      'WORKSPACE_NOT_FOUND',
      `Workspace untuk YearPlan [${yearPlan.id}] tidak ditemukan.`
    );
  }

  const annual = resolveAnnualPortableData(state, yearPlan.id);
  const semesters = ([1, 2] as const).map((semester) =>
    resolveSemesterPortableData(state, yearPlan, semester)
  );

  const pkg: AdministrationProjectPackage = {
    schemaVersion: ADMINISTRATION_PROJECT_PACKAGE_SCHEMA_VERSION_V1,
    header: {
      curriculumType: yearPlan.curriculumType,
      academicYear: yearPlan.academicYear,
      subject: yearPlan.subject,
      level: yearPlan.level,
      grade: yearPlan.grade,
      phase: yearPlan.phase || '',
      ...(yearPlan.classSection !== undefined ? { classSection: yearPlan.classSection } : {}),
      exportedAt: options?.exportedAt || new Date().toISOString(),
    },
    annual,
    semesters,
  };

  const validation = validateAdministrationProjectPackage(pkg);
  if (!validation.valid) {
    return {
      success: false,
      errorCode: 'PACKAGE_VALIDATION_FAILED',
      message: 'AdministrationProjectPackage gagal validasi dan tidak dapat diekspor.',
      validation,
      issues: validation.issues,
    };
  }

  return {
    success: true,
    package: pkg,
    validation,
  };
}

function resolveAnnualPortableData(state: AppStorageStateV5, yearPlanId: string): AdministrationProjectPackage['annual'] {
  const cp = findYearScopedValue(state.annualData.cp, yearPlanId);
  const cpAnalysis = findYearScopedValue(state.annualData.cpAnalysis, yearPlanId);
  const tp = findYearScopedValue(state.annualData.tp, yearPlanId);
  const atp = findYearScopedValue(state.annualData.atp, yearPlanId);

  return {
    cp: cp ? [sanitizePortable<PortableCPData>(cp)] : [],
    cpAnalysis: cpAnalysis ? [sanitizePortable<PortableCPAnalysisData>(cpAnalysis)] : [],
    tp: tp ? [sanitizePortable<PortableTPData>(tp)] : [],
    atp: atp ? [sanitizePortable<PortableATPData>(atp)] : [],
  };
}

function resolveSemesterPortableData(
  state: AppStorageStateV5,
  yearPlan: YearPlan,
  semester: SemesterNumber
): AdministrationProjectPackageSemesterData {
  const semesterPlan = state.semesterPlans.find(
    (candidate) => candidate.yearPlanId === yearPlan.id && candidate.semester === semester
  );

  if (!semesterPlan) {
    return emptySemesterPortableData(semester);
  }

  return {
    semester,
    learningPlans: sanitizePortableArray<LearningPlan, PortableLearningPlan>(
      findSemesterScopedValue(state.semesterData.learningPlan, semesterPlan.id)
    ),
    assessmentCriteria: sanitizePortableArray<AssessmentCriterion, PortableAssessmentCriterion>(
      findSemesterScopedValue(state.semesterData.assessmentCriteria, semesterPlan.id)
    ),
    assessmentPlans: sanitizePortableArray<AssessmentPlan, PortableAssessmentPlan>(
      findSemesterScopedValue(state.semesterData.assessmentPlan, semesterPlan.id)
    ),
    assessmentPackages: sanitizePortableArray<AssessmentPackage, PortableAssessmentPackage>(
      findSemesterScopedValue(state.semesterData.assessmentPackage, semesterPlan.id)
    ),
  };
}

function emptySemesterPortableData(semester: SemesterNumber): AdministrationProjectPackageSemesterData {
  return {
    semester,
    learningPlans: [],
    assessmentCriteria: [],
    assessmentPlans: [],
    assessmentPackages: [],
  };
}

function findYearScopedValue<T>(
  collection: YearScopedEntry<T>[],
  yearPlanId: string
): T | undefined {
  return collection.find((entry) => entry.yearPlanId === yearPlanId)?.value;
}

function findSemesterScopedValue<T>(
  collection: SemesterScopedEntry<T>[],
  semesterPlanId: string
): T | undefined {
  return collection.find((entry) => entry.semesterPlanId === semesterPlanId)?.value;
}

function sanitizePortableArray<TInput, TOutput>(values: TInput[] | undefined): TOutput[] {
  return Array.isArray(values)
    ? values.map((value) => sanitizePortable<TOutput>(value))
    : [];
}

function sanitizePortable<T>(value: unknown): T {
  return sanitizePortableValue(value) as T;
}

function sanitizePortableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePortableValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (FORBIDDEN_PORTABLE_KEYS.has(key)) return;
    output[key] = sanitizePortableValue(child);
  });
  return output;
}

function failure(errorCode: string, message: string): AdministrationProjectExportFailure {
  return {
    success: false,
    errorCode,
    message,
  };
}

function readStorageV5Snapshot():
  | { success: true; state: AppStorageStateV5 }
  | AdministrationProjectExportFailure {
  if (typeof localStorage === 'undefined') {
    return {
      success: true,
      state: createInitialStorageV5(),
    };
  }

  const raw = localStorage.getItem(STORAGE_KEY_V5);
  if (raw === null) {
    return {
      success: true,
      state: createInitialStorageV5(),
    };
  }

  try {
    return {
      success: true,
      state: validateStorageStateV5(JSON.parse(raw)),
    };
  } catch (err) {
    return failure(
      'STORAGE_READ_FAILED',
      err instanceof Error ? err.message : 'Storage V5 tidak dapat dibaca.'
    );
  }
}
