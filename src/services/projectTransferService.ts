import { CurriculumType } from '../types';
import {
  PROJECT_TRANSFER_SCHEMA_VERSION_V1,
  ProjectTransferPackage,
  ProjectTransferCP,
  ProjectTransferTP,
  ProjectTransferATP,
  RawProjectTransferPackage,
  ProjectTransferIssue,
  ProjectTransferSummary,
  ProjectTransferValidationResult,
  ResolvedProjectTransferPackage,
  ResolvedProjectTransferTP,
  ResolvedProjectTransferATP,
} from '../types/projectTransfer';

/**
 * Normalizes string by trimming whitespace and collapsing internal whitespace runs.
 */
export function normalizeTransferText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Normalizes single-line fields (e.g. codes, subjects, titles) by collapsing consecutive spaces.
 */
export function normalizeSingleLineText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes portable item code (e.g. CP-01, TP-1) to an uppercase trimmed string.
 */
export function normalizeTransferCode(val: unknown): string {
  return normalizeSingleLineText(val).toUpperCase();
}

/**
 * Validates and normalizes schema version.
 * Accepts only supported v1 versions: '1.0' and alias 'v1'.
 * Returns canonical '1.0' or null if unsupported.
 */
export function normalizeSchemaVersion(val: unknown): typeof PROJECT_TRANSFER_SCHEMA_VERSION_V1 | null {
  const norm = normalizeSingleLineText(val).toLowerCase();
  if (norm === '1.0' || norm === 'v1') {
    return PROJECT_TRANSFER_SCHEMA_VERSION_V1;
  }
  return null;
}

export const VALID_TRANSFER_EDUCATION_LEVELS = ['SD', 'SMP', 'SMA', 'SMK'] as const;
export type TransferEducationLevel = (typeof VALID_TRANSFER_EDUCATION_LEVELS)[number];

/**
 * Validates and normalizes education level.
 * Accepts only 'SD', 'SMP', 'SMA', 'SMK' (case-insensitive).
 * Returns uppercase canonical string or null if invalid.
 */
export function normalizeEducationLevel(val: unknown): TransferEducationLevel | null {
  const norm = normalizeSingleLineText(val).toUpperCase();
  if (norm === 'SD' || norm === 'SMP' || norm === 'SMA' || norm === 'SMK') {
    return norm;
  }
  return null;
}

/**
 * Validates and normalizes curriculum type.
 * Returns canonical CurriculumType or null if invalid.
 */
export function normalizeCurriculumType(val: unknown): CurriculumType | null {
  const norm = normalizeSingleLineText(val).toLowerCase();
  if (!norm) return null;

  if (norm.includes('merdeka')) {
    return 'KURIKULUM_MERDEKA';
  }
  if (norm.includes('k13') || norm.includes('2013') || norm.includes('k-13')) {
    return 'K13';
  }
  return null;
}

/**
 * Normalizes semester input. Returns 1 or 2, undefined if omitted/empty, or null if invalid.
 */
export function normalizeSemester(val: unknown): 1 | 2 | undefined | null {
  if (val === null || val === undefined) return undefined;
  const str = normalizeSingleLineText(val).toLowerCase();
  if (str === '') return undefined;

  if (str === '1' || str.includes('ganjil') || str === 'semester 1' || str === 's1') {
    return 1;
  }
  if (str === '2' || str.includes('genap') || str === 'semester 2' || str === 's2') {
    return 2;
  }
  return null;
}

/**
 * Normalizes JP (Jam Pelajaran).
 * Returns positive number, undefined if empty/omitted, or null if invalid (<= 0 or not a number).
 */
export function normalizeJP(val: unknown): number | undefined | null {
  if (val === null || val === undefined) return undefined;
  const str = normalizeSingleLineText(val);
  if (str === '') return undefined;

  const num = Number(str);
  if (isNaN(num) || !isFinite(num) || num <= 0) {
    return null;
  }
  return num;
}

/**
 * Normalizes order number.
 * Returns positive integer >= 1, or null if invalid.
 */
export function normalizeOrder(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = normalizeSingleLineText(val);
  if (str === '') return null;

  const num = Number(str);
  if (isNaN(num) || !isFinite(num) || !Number.isInteger(num) || num < 1) {
    return null;
  }
  return num;
}

/**
 * Pure function to validate a project transfer package or raw unparsed input.
 * Does NOT mutate external state or storage.
 */
export function validateProjectTransfer(
  rawInput: RawProjectTransferPackage | ProjectTransferPackage | unknown
): ProjectTransferValidationResult {
  const issues: ProjectTransferIssue[] = [];

  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    const errorIssue: ProjectTransferIssue = {
      severity: 'ERROR',
      code: 'INVALID_PACKAGE_FORMAT',
      message: 'Format data project tidak valid. Data harus berupa objek transfer terstruktur.',
      path: 'root',
    };
    return {
      isValid: false,
      issues: [errorIssue],
      errors: [errorIssue],
      warnings: [],
      summary: {
        cpCount: 0,
        tpCount: 0,
        atpCount: 0,
        atpWithoutJpCount: 0,
        errorCount: 1,
        warningCount: 0,
        isValid: false,
      },
    };
  }

  const raw = rawInput as RawProjectTransferPackage;

  // 1. PROJECT Header Validation
  const rawSchemaVersion = raw.schemaVersion;
  const schemaVersionNorm = normalizeSingleLineText(rawSchemaVersion);
  const validatedSchemaVersion = normalizeSchemaVersion(rawSchemaVersion);

  if (!rawSchemaVersion || schemaVersionNorm === '') {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_PROJECT_SCHEMA_VERSION',
      message: 'Field schemaVersion wajib diisi.',
      field: 'schemaVersion',
      path: 'project.schemaVersion',
    });
  } else if (!validatedSchemaVersion) {
    issues.push({
      severity: 'ERROR',
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `Versi schema "${schemaVersionNorm}" tidak didukung. Contract saat ini hanya mendukung versi 1.0 (atau alias v1).`,
      field: 'schemaVersion',
      path: 'project.schemaVersion',
    });
  }

  const rawCurriculum = raw.curriculumType;
  const curriculumType = normalizeCurriculumType(rawCurriculum);

  if (!rawCurriculum || normalizeSingleLineText(rawCurriculum) === '') {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_CURRICULUM_TYPE',
      message: 'Field curriculumType wajib diisi.',
      field: 'curriculumType',
      path: 'project.curriculumType',
    });
  } else if (!curriculumType) {
    issues.push({
      severity: 'ERROR',
      code: 'UNKNOWN_CURRICULUM_TYPE',
      message: `Tipe kurikulum "${String(rawCurriculum)}" tidak dikenal. Hanya mendukung KURIKULUM_MERDEKA atau K13.`,
      field: 'curriculumType',
      path: 'project.curriculumType',
    });
  }

  const subject = normalizeSingleLineText(raw.subject);
  if (!subject) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_SUBJECT',
      message: 'Field subject (Mata Pelajaran) wajib diisi.',
      field: 'subject',
      path: 'project.subject',
    });
  }

  const rawLevel = raw.level;
  const levelNorm = normalizeSingleLineText(rawLevel).toUpperCase();
  const validatedLevel = normalizeEducationLevel(rawLevel);

  if (!rawLevel || levelNorm === '') {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_LEVEL',
      message: 'Field level (Jenjang Pendidikan) wajib diisi.',
      field: 'level',
      path: 'project.level',
    });
  } else if (!validatedLevel) {
    issues.push({
      severity: 'ERROR',
      code: 'INVALID_EDUCATION_LEVEL',
      message: `Jenjang pendidikan "${levelNorm}" tidak valid. Hanya mendukung SD, SMP, SMA, atau SMK.`,
      field: 'level',
      path: 'project.level',
    });
  }

  const grade = normalizeSingleLineText(raw.grade);
  if (!grade) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_GRADE',
      message: 'Field grade (Kelas) wajib diisi.',
      field: 'grade',
      path: 'project.grade',
    });
  }

  const phase = normalizeSingleLineText(raw.phase);
  if (!phase) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_PHASE',
      message: 'Field phase (Fase) wajib diisi.',
      field: 'phase',
      path: 'project.phase',
    });
  }

  const academicYear = normalizeSingleLineText(raw.academicYear);
  if (!academicYear) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_ACADEMIC_YEAR',
      message: 'Field academicYear (Tahun Ajaran) wajib diisi.',
      field: 'academicYear',
      path: 'project.academicYear',
    });
  }

  // 2. CP (Capaian Pembelajaran) Validation
  const validatedCP: ProjectTransferCP[] = [];
  const cpCodeSet = new Set<string>();

  if (!raw.cp || !Array.isArray(raw.cp)) {
    issues.push({
      severity: 'WARNING',
      code: 'EMPTY_CP_LIST',
      message: 'Daftar Capaian Pembelajaran (CP) kosong.',
      path: 'cp',
    });
  } else {
    raw.cp.forEach((item, index) => {
      const path = `cp[${index}]`;
      const code = normalizeTransferCode(item?.code);
      const element = normalizeSingleLineText(item?.element);
      const content = normalizeTransferText(item?.content);

      if (!code) {
        issues.push({
          severity: 'ERROR',
          code: 'EMPTY_CP_CODE',
          message: `Baris CP ke-${index + 1} tidak memiliki kode unik.`,
          field: 'code',
          path: `${path}.code`,
        });
      } else if (cpCodeSet.has(code)) {
        issues.push({
          severity: 'ERROR',
          code: 'DUPLICATE_CP_CODE',
          message: `Kode CP "${code}" pada baris ke-${index + 1} duplikat. Setiap CP harus memiliki kode unik.`,
          field: 'code',
          path: `${path}.code`,
          itemCode: code,
        });
      } else {
        cpCodeSet.add(code);
      }

      if (!element) {
        issues.push({
          severity: 'WARNING',
          code: 'EMPTY_CP_ELEMENT',
          message: `Elemen CP "${code || index + 1}" belum diisi.`,
          field: 'element',
          path: `${path}.element`,
          itemCode: code,
        });
      }

      if (!content) {
        issues.push({
          severity: 'ERROR',
          code: 'EMPTY_CP_CONTENT',
          message: `Uraian konten CP "${code || index + 1}" tidak boleh kosong.`,
          field: 'content',
          path: `${path}.content`,
          itemCode: code,
        });
      }

      validatedCP.push({
        code: code || `CP-${index + 1}`,
        element,
        content,
      });
    });
  }

  // 3. TP (Tujuan Pembelajaran) Validation
  const validatedTP: ProjectTransferTP[] = [];
  const tpCodeSet = new Set<string>();

  if (!raw.tp || !Array.isArray(raw.tp)) {
    issues.push({
      severity: 'WARNING',
      code: 'EMPTY_TP_LIST',
      message: 'Daftar Tujuan Pembelajaran (TP) kosong.',
      path: 'tp',
    });
  } else {
    raw.tp.forEach((item, index) => {
      const path = `tp[${index}]`;
      const code = normalizeTransferCode(item?.code);
      const rawCpCode = item?.cpCode !== undefined && item?.cpCode !== null ? normalizeTransferCode(item.cpCode) : undefined;
      const cpCode = rawCpCode && rawCpCode.length > 0 ? rawCpCode : undefined;
      const statement = normalizeTransferText(item?.statement);
      const competence = normalizeSingleLineText(item?.competence);
      const materialScope = normalizeTransferText(item?.materialScope);

      if (!code) {
        issues.push({
          severity: 'ERROR',
          code: 'EMPTY_TP_CODE',
          message: `Baris TP ke-${index + 1} tidak memiliki kode unik.`,
          field: 'code',
          path: `${path}.code`,
        });
      } else if (tpCodeSet.has(code)) {
        issues.push({
          severity: 'ERROR',
          code: 'DUPLICATE_TP_CODE',
          message: `Kode TP "${code}" pada baris ke-${index + 1} duplikat. Setiap TP harus memiliki kode unik.`,
          field: 'code',
          path: `${path}.code`,
          itemCode: code,
        });
      } else {
        tpCodeSet.add(code);
      }

      if (!statement) {
        issues.push({
          severity: 'ERROR',
          code: 'EMPTY_TP_STATEMENT',
          message: `Uraian tujuan pembelajaran (statement) pada TP "${code || index + 1}" tidak boleh kosong.`,
          field: 'statement',
          path: `${path}.statement`,
          itemCode: code,
        });
      }

      // Check cpCode reference if provided
      if (cpCode) {
        if (!cpCodeSet.has(cpCode)) {
          issues.push({
            severity: 'ERROR',
            code: 'DANGLING_TP_CP_REF',
            message: `Rujukan kode CP "${cpCode}" pada TP "${code || index + 1}" tidak ditemukan dalam daftar CP.`,
            field: 'cpCode',
            path: `${path}.cpCode`,
            itemCode: code,
          });
        }
      }

      if (!competence) {
        issues.push({
          severity: 'WARNING',
          code: 'EMPTY_TP_COMPETENCE',
          message: `Kompetensi pada TP "${code || index + 1}" belum terisi.`,
          field: 'competence',
          path: `${path}.competence`,
          itemCode: code,
        });
      }

      if (!materialScope) {
        issues.push({
          severity: 'WARNING',
          code: 'EMPTY_TP_MATERIAL_SCOPE',
          message: `Lingkup materi pada TP "${code || index + 1}" belum terisi.`,
          field: 'materialScope',
          path: `${path}.materialScope`,
          itemCode: code,
        });
      }

      validatedTP.push({
        code: code || `TP-${index + 1}`,
        cpCode,
        statement,
        competence,
        materialScope,
      });
    });
  }

  // 4. ATP (Alur Tujuan Pembelajaran) Validation
  const validatedATP: ProjectTransferATP[] = [];
  const atpOrderSet = new Set<number>();
  let atpWithoutJpCount = 0;

  if (!raw.atp || !Array.isArray(raw.atp)) {
    issues.push({
      severity: 'WARNING',
      code: 'EMPTY_ATP_LIST',
      message: 'Daftar Alur Tujuan Pembelajaran (ATP) kosong.',
      path: 'atp',
    });
  } else {
    raw.atp.forEach((item, index) => {
      const path = `atp[${index}]`;
      const order = normalizeOrder(item?.order);
      const semester = normalizeSemester(item?.semester);
      const unit = item?.unit !== undefined && item?.unit !== null ? normalizeSingleLineText(item.unit) : undefined;
      const tpCode = normalizeTransferCode(item?.tpCode);
      const material = item?.material !== undefined && item?.material !== null ? normalizeTransferText(item.material) : undefined;
      const jp = normalizeJP(item?.jp);

      // Order validation
      if (order === null) {
        issues.push({
          severity: 'ERROR',
          code: 'INVALID_ATP_ORDER',
          message: `Urutan ATP pada baris ke-${index + 1} ("${String(item?.order ?? '')}") tidak valid. Harus berupa bilangan bulat positif >= 1.`,
          field: 'order',
          path: `${path}.order`,
        });
      } else {
        if (atpOrderSet.has(order)) {
          issues.push({
            severity: 'WARNING',
            code: 'DUPLICATE_ATP_ORDER',
            message: `Nomor urut ATP ${order} muncul lebih dari satu kali. Disarankan nomor urut unik dan berurutan.`,
            field: 'order',
            path: `${path}.order`,
          });
        }
        atpOrderSet.add(order);
      }

      // TP Code linkage validation
      if (!tpCode) {
        issues.push({
          severity: 'ERROR',
          code: 'EMPTY_ATP_TP_CODE',
          message: `ATP urutan ke-${order ?? index + 1} tidak memiliki referensi kode TP.`,
          field: 'tpCode',
          path: `${path}.tpCode`,
        });
      } else if (!tpCodeSet.has(tpCode)) {
        issues.push({
          severity: 'ERROR',
          code: 'DANGLING_ATP_TP_REF',
          message: `Kode TP "${tpCode}" pada ATP urutan ke-${order ?? index + 1} tidak ditemukan dalam daftar TP.`,
          field: 'tpCode',
          path: `${path}.tpCode`,
          itemCode: tpCode,
        });
      }

      // Semester validation (optional, but if filled must be 1 or 2)
      if (semester === null) {
        issues.push({
          severity: 'ERROR',
          code: 'INVALID_ATP_SEMESTER',
          message: `Nilai semester "${String(item?.semester)}" pada ATP urutan ke-${order ?? index + 1} tidak valid. Harus bernilai 1 atau 2.`,
          field: 'semester',
          path: `${path}.semester`,
        });
      }

      // JP validation (optional, but if filled must be > 0)
      if (jp === null) {
        issues.push({
          severity: 'ERROR',
          code: 'INVALID_ATP_JP',
          message: `Alokasi JP "${String(item?.jp)}" pada ATP urutan ke-${order ?? index + 1} tidak valid. Jika diisi harus berupa angka > 0.`,
          field: 'jp',
          path: `${path}.jp`,
        });
      } else if (jp === undefined) {
        atpWithoutJpCount++;
        issues.push({
          severity: 'WARNING',
          code: 'ATP_MISSING_JP',
          message: `ATP urutan ke-${order ?? index + 1} (TP: ${tpCode || '-'}) belum memiliki alokasi JP.`,
          field: 'jp',
          path: `${path}.jp`,
          itemCode: tpCode,
        });
      }

      validatedATP.push({
        order: order ?? index + 1,
        semester: semester === null ? undefined : semester,
        unit: unit && unit.length > 0 ? unit : undefined,
        tpCode: tpCode || '',
        material: material && material.length > 0 ? material : undefined,
        jp: jp === null ? undefined : jp,
      });
    });
  }

  const errors = issues.filter((i) => i.severity === 'ERROR');
  const warnings = issues.filter((i) => i.severity === 'WARNING');
  const isValid = errors.length === 0;

  const summary: ProjectTransferSummary = {
    cpCount: validatedCP.length,
    tpCount: validatedTP.length,
    atpCount: validatedATP.length,
    atpWithoutJpCount,
    errorCount: errors.length,
    warningCount: warnings.length,
    isValid,
  };

  const validatedPackage: ProjectTransferPackage | undefined = isValid
    ? {
        schemaVersion: validatedSchemaVersion || PROJECT_TRANSFER_SCHEMA_VERSION_V1,
        curriculumType: curriculumType!,
        subject,
        level: validatedLevel || 'SD',
        grade,
        phase,
        academicYear,
        cp: validatedCP,
        tp: validatedTP,
        atp: validatedATP.sort((a, b) => a.order - b.order),
      }
    : undefined;

  return {
    isValid,
    issues,
    errors,
    warnings,
    summary,
    validatedPackage,
  };
}

/**
 * Pure mapping and resolution function.
 * Connects CP ↔ TP ↔ ATP based on portable code references without using internal storage IDs.
 * Does not mutate input or storage.
 */
export function resolveProjectTransfer(
  pkg: ProjectTransferPackage
): ResolvedProjectTransferPackage {
  const cpMap = new Map<string, ProjectTransferCP>();
  pkg.cp.forEach((item) => {
    cpMap.set(item.code.toUpperCase(), item);
  });

  const resolvedTp: ResolvedProjectTransferTP[] = pkg.tp.map((tp) => {
    const cp = tp.cpCode ? cpMap.get(tp.cpCode.toUpperCase()) : undefined;
    return {
      ...tp,
      cp,
    };
  });

  const tpMap = new Map<string, ResolvedProjectTransferTP>();
  resolvedTp.forEach((item) => {
    tpMap.set(item.code.toUpperCase(), item);
  });

  const resolvedAtp: ResolvedProjectTransferATP[] = pkg.atp.map((atp) => {
    const tp = tpMap.get(atp.tpCode.toUpperCase());
    const cp = tp?.cp;
    return {
      ...atp,
      tp,
      cp,
    };
  });

  return {
    ...pkg,
    resolvedTp,
    resolvedAtp,
  };
}

/**
 * Creates an empty portable project transfer package template.
 */
export function createEmptyProjectTransferPackage(
  initial?: Partial<ProjectTransferPackage>
): ProjectTransferPackage {
  return {
    schemaVersion: initial?.schemaVersion || PROJECT_TRANSFER_SCHEMA_VERSION_V1,
    curriculumType: initial?.curriculumType || 'KURIKULUM_MERDEKA',
    subject: initial?.subject || '',
    level: initial?.level || 'SD',
    grade: initial?.grade || '',
    phase: initial?.phase || '',
    academicYear: initial?.academicYear || '',
    cp: initial?.cp ? [...initial.cp] : [],
    tp: initial?.tp ? [...initial.tp] : [],
    atp: initial?.atp ? [...initial.atp] : [],
  };
}

/**
 * Serializes a validated ProjectTransferPackage into formatted JSON string.
 */
export function serializeProjectTransferPackage(pkg: ProjectTransferPackage): string {
  return JSON.stringify(pkg, null, 2);
}

/**
 * Parses and validates a JSON string representing a project transfer package.
 */
export function parseProjectTransferPackage(jsonStr: string): ProjectTransferValidationResult {
  try {
    const parsed = JSON.parse(jsonStr);
    return validateProjectTransfer(parsed);
  } catch (err: any) {
    const errorIssue: ProjectTransferIssue = {
      severity: 'ERROR',
      code: 'JSON_PARSE_ERROR',
      message: `Gagal membaca format JSON: ${err?.message || 'Sintaks tidak valid'}`,
      path: 'root',
    };
    return {
      isValid: false,
      issues: [errorIssue],
      errors: [errorIssue],
      warnings: [],
      summary: {
        cpCount: 0,
        tpCount: 0,
        atpCount: 0,
        atpWithoutJpCount: 0,
        errorCount: 1,
        warningCount: 0,
        isValid: false,
      },
    };
  }
}
