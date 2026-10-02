import type {
  AssessmentCriterion,
  AssessmentPackage,
  AssessmentPlan,
  ATPData,
  CPAnalysisData,
  CPData,
  CurriculumType,
  LearningPlan,
  TPData,
} from './index';

export const ADMINISTRATION_PROJECT_PACKAGE_SCHEMA_VERSION_V1 = '1.0' as const;

export type AdministrationProjectPackageSchemaVersion =
  typeof ADMINISTRATION_PROJECT_PACKAGE_SCHEMA_VERSION_V1;

export type AdministrationProjectTransferIssueSeverity = 'ERROR' | 'WARNING';

export interface AdministrationProjectTransferIssue {
  severity: AdministrationProjectTransferIssueSeverity;
  code: string;
  message: string;
  path?: string;
  refId?: string;
}

export interface AdministrationProjectTransferValidationResult {
  valid: boolean;
  issues: AdministrationProjectTransferIssue[];
  errors: AdministrationProjectTransferIssue[];
  warnings: AdministrationProjectTransferIssue[];
}

export interface AdministrationProjectPackageHeader {
  curriculumType: CurriculumType;
  academicYear: string;
  subject: string;
  level: 'SD' | 'SMP' | 'SMA' | 'SMK';
  grade: string;
  phase: string;
  classSection?: string;
  exportedAt?: string;
}

export type PortableCPData = Omit<CPData, 'academicSettingId'> & {
  academicSettingId?: never;
  workspaceId?: never;
};

export type PortableCPAnalysisData = Omit<CPAnalysisData, 'academicSettingId' | 'workspaceId'> & {
  academicSettingId?: never;
  workspaceId?: never;
};

export type PortableTPData = Omit<TPData, 'academicSettingId' | 'workspaceId'> & {
  academicSettingId?: never;
  workspaceId?: never;
};

export type PortableATPData = Omit<ATPData, 'academicSettingId' | 'workspaceId'> & {
  academicSettingId?: never;
  workspaceId?: never;
};

export type PortableLearningPlan = Omit<LearningPlan, 'academicSettingId' | 'timeAllocationIds'> & {
  academicSettingId?: never;
  timeAllocationIds?: never;
};

export type PortableAssessmentCriterion = Omit<AssessmentCriterion, 'academicSettingId' | 'workspaceId'> & {
  academicSettingId?: never;
  workspaceId?: never;
};

export type PortableAssessmentPlan = Omit<AssessmentPlan, 'academicSettingId' | 'workspaceId'> & {
  academicSettingId?: never;
  workspaceId?: never;
};

export type PortableAssessmentPackage = Omit<AssessmentPackage, 'academicSettingId' | 'workspaceId'> & {
  academicSettingId?: never;
  workspaceId?: never;
};

export interface AdministrationProjectPackageAnnualData {
  cp: PortableCPData[];
  cpAnalysis?: PortableCPAnalysisData[];
  tp: PortableTPData[];
  atp: PortableATPData[];
}

export interface AdministrationProjectPackageSemesterData {
  semester: 1 | 2;
  learningPlans: PortableLearningPlan[];
  assessmentCriteria: PortableAssessmentCriterion[];
  assessmentPlans: PortableAssessmentPlan[];
  assessmentPackages: PortableAssessmentPackage[];
}

/**
 * Portable full-year administration package.
 *
 * This contract intentionally excludes teacher, school, principal, student,
 * roster, attendance, calendar, JP, workspace, YearPlan, and SemesterPlan
 * authority. Importers can later remap the preserved pedagogical graph into a
 * fresh V5 hierarchy owned by another profile/school.
 */
export interface AdministrationProjectPackage {
  schemaVersion: AdministrationProjectPackageSchemaVersion;
  header: AdministrationProjectPackageHeader;
  annual: AdministrationProjectPackageAnnualData;
  semesters: AdministrationProjectPackageSemesterData[];
}
