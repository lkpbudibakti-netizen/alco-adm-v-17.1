import { CurriculumType } from './index';

export const PROJECT_TRANSFER_SCHEMA_VERSION_V1 = '1.0' as const;

export type ProjectTransferSchemaVersion = typeof PROJECT_TRANSFER_SCHEMA_VERSION_V1 | 'v1';

/**
 * Portable representation of an administration project header/metadata.
 * Independent of internal storage IDs.
 */
export interface ProjectTransferHeader {
  schemaVersion: string;
  curriculumType: CurriculumType;
  subject: string;
  level: string;
  grade: string;
  phase: string;
  academicYear: string;
}

/**
 * Portable representation of a Capaian Pembelajaran (CP) entry.
 */
export interface ProjectTransferCP {
  code: string;
  element: string;
  content: string;
}

/**
 * Portable representation of a Tujuan Pembelajaran (TP) entry.
 */
export interface ProjectTransferTP {
  code: string;
  cpCode?: string;
  statement: string;
  competence: string;
  materialScope: string;
}

/**
 * Portable representation of an Alur Tujuan Pembelajaran (ATP) entry.
 */
export interface ProjectTransferATP {
  order: number;
  semester?: 1 | 2;
  unit?: string;
  tpCode: string;
  material?: string;
  jp?: number;
}

/**
 * Complete canonical portable project transfer package (Contract v1).
 */
export interface ProjectTransferPackage {
  schemaVersion: string;
  curriculumType: CurriculumType;
  subject: string;
  level: string;
  grade: string;
  phase: string;
  academicYear: string;
  cp: ProjectTransferCP[];
  tp: ProjectTransferTP[];
  atp: ProjectTransferATP[];
}

/**
 * Flexible input type for unparsed/unnormalized raw imports before validation.
 */
export interface RawProjectTransferPackage {
  schemaVersion?: string | null;
  curriculumType?: string | null;
  subject?: string | null;
  level?: string | null;
  grade?: string | number | null;
  phase?: string | null;
  academicYear?: string | null;
  cp?: Array<{
    code?: string | number | null;
    element?: string | null;
    content?: string | null;
  }> | null;
  tp?: Array<{
    code?: string | number | null;
    cpCode?: string | number | null;
    statement?: string | null;
    competence?: string | null;
    materialScope?: string | null;
  }> | null;
  atp?: Array<{
    order?: number | string | null;
    semester?: number | string | null;
    unit?: string | number | null;
    tpCode?: string | number | null;
    material?: string | null;
    jp?: number | string | null;
  }> | null;
}

/**
 * Severity level for transfer issues.
 */
export type ProjectTransferIssueSeverity = 'ERROR' | 'WARNING';

/**
 * Individual validation finding for a project transfer package.
 */
export interface ProjectTransferIssue {
  severity: ProjectTransferIssueSeverity;
  code: string;
  message: string;
  field?: string;
  path?: string;
  itemCode?: string;
}

/**
 * Summary metrics of the validation result, intended for UI display.
 */
export interface ProjectTransferSummary {
  cpCount: number;
  tpCount: number;
  atpCount: number;
  atpWithoutJpCount: number;
  errorCount: number;
  warningCount: number;
  isValid: boolean;
}

/**
 * Comprehensive validation output.
 */
export interface ProjectTransferValidationResult {
  isValid: boolean;
  issues: ProjectTransferIssue[];
  errors: ProjectTransferIssue[];
  warnings: ProjectTransferIssue[];
  summary: ProjectTransferSummary;
  validatedPackage?: ProjectTransferPackage;
}

/**
 * Resolved TP with linked CP reference.
 */
export interface ResolvedProjectTransferTP extends ProjectTransferTP {
  cp?: ProjectTransferCP;
}

/**
 * Resolved ATP with linked TP reference and transitive CP reference.
 */
export interface ResolvedProjectTransferATP extends ProjectTransferATP {
  tp?: ResolvedProjectTransferTP;
  cp?: ProjectTransferCP;
}

/**
 * Fully resolved project package with portable code relations established.
 */
export interface ResolvedProjectTransferPackage extends ProjectTransferPackage {
  resolvedTp: ResolvedProjectTransferTP[];
  resolvedAtp: ResolvedProjectTransferATP[];
}
