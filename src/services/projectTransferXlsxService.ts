import * as XLSX from 'xlsx';
import {
  ProjectTransferPackage,
  RawProjectTransferPackage,
  ProjectTransferValidationResult,
  PROJECT_TRANSFER_SCHEMA_VERSION_V1,
} from '../types/projectTransfer';
import { validateProjectTransfer } from './projectTransferService';

export const PROJECT_TRANSFER_XLSX_SHEETS = {
  PROJECT: '01_PROJECT',
  CP: '02_CP',
  TP: '03_TP',
  ATP: '04_ATP',
} as const;

/**
 * Normalizes header string for fuzzy matching (lowercase, alphanumeric only).
 */
function normalizeHeaderKey(header: unknown): string {
  if (header === null || header === undefined) return '';
  return String(header)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Cleans individual cell value: returns undefined if blank/whitespace-only.
 */
function cleanCellVal(val: unknown): string | number | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') {
    return isNaN(val) ? undefined : val;
  }
  const s = String(val).trim();
  return s === '' ? undefined : s;
}

/**
 * Finds a worksheet in the workbook by exact sheet name, then fallback by keywords.
 */
function findSheet(
  workbook: XLSX.WorkBook,
  exactName: string,
  keywords: string[]
): XLSX.WorkSheet | undefined {
  // 1. Exact match
  if (workbook.Sheets[exactName]) {
    return workbook.Sheets[exactName];
  }

  // 2. Case-insensitive match
  const lowerExact = exactName.toLowerCase();
  const matchedSheetName = workbook.SheetNames.find(
    (name) => name.trim().toLowerCase() === lowerExact
  );
  if (matchedSheetName && workbook.Sheets[matchedSheetName]) {
    return workbook.Sheets[matchedSheetName];
  }

  // 3. Keyword-based fallback
  for (const name of workbook.SheetNames) {
    const lowerName = name.toLowerCase();
    if (keywords.some((kw) => lowerName.includes(kw))) {
      return workbook.Sheets[name];
    }
  }

  return undefined;
}

/**
 * Reads 01_PROJECT sheet into raw project header fields.
 * Supports both row-based header format and key-value column format.
 */
function parseProjectSheet(sheet?: XLSX.WorkSheet): {
  schemaVersion?: string | null;
  curriculumType?: string | null;
  subject?: string | null;
  level?: string | null;
  grade?: string | number | null;
  phase?: string | null;
  academicYear?: string | null;
} {
  if (!sheet) return {};

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (!rows || rows.length === 0) return {};

  const headerAliases: Record<string, string[]> = {
    schemaVersion: ['schemaversion', 'version', 'versischema'],
    curriculumType: ['curriculumtype', 'kurikulum', 'tipekurikulum'],
    subject: ['subject', 'matapelajaran', 'mapel'],
    level: ['level', 'jenjang', 'jenjangpendidikan'],
    grade: ['grade', 'kelas'],
    phase: ['phase', 'fase'],
    academicYear: ['academicyear', 'tahunajaran', 'tahunpelajaran'],
  };

  const projectData: Record<string, string | number | undefined> = {};

  // Check if row 0 has column headers (row-based format)
  const row0 = (rows[0] || []).map(normalizeHeaderKey);
  const matchedColumns: Record<string, number> = {};

  for (const [field, aliases] of Object.entries(headerAliases)) {
    const colIdx = row0.findIndex((h) => aliases.includes(h) || h === field.toLowerCase());
    if (colIdx !== -1) {
      matchedColumns[field] = colIdx;
    }
  }

  const isRowBased = Object.keys(matchedColumns).length >= 2;

  if (isRowBased && rows.length > 1) {
    const dataRow = rows[1] || [];
    for (const [field, colIdx] of Object.entries(matchedColumns)) {
      projectData[field] = cleanCellVal(dataRow[colIdx]);
    }
  } else {
    // Key-Value format (Column A = Key, Column B = Value)
    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) continue;
      const keyNorm = normalizeHeaderKey(row[0]);
      if (!keyNorm) continue;

      for (const [field, aliases] of Object.entries(headerAliases)) {
        if (aliases.includes(keyNorm) || keyNorm === field.toLowerCase()) {
          projectData[field] = cleanCellVal(row[1]);
          break;
        }
      }
    }
  }

  return {
    schemaVersion: (projectData.schemaVersion as string) ?? undefined,
    curriculumType: (projectData.curriculumType as string) ?? undefined,
    subject: (projectData.subject as string) ?? undefined,
    level: (projectData.level as string) ?? undefined,
    grade: projectData.grade ?? undefined,
    phase: (projectData.phase as string) ?? undefined,
    academicYear: (projectData.academicYear as string) ?? undefined,
  };
}

/**
 * Reads 02_CP sheet into raw CP list.
 */
function parseCPSheet(sheet?: XLSX.WorkSheet): RawProjectTransferPackage['cp'] {
  if (!sheet) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (!rows || rows.length < 2) return [];

  const headerRow = (rows[0] || []).map(normalizeHeaderKey);
  const colCode = headerRow.findIndex((h) => ['code', 'kode', 'kodecp', 'id'].includes(h));
  const colElement = headerRow.findIndex((h) => ['element', 'elemen'].includes(h));
  const colContent = headerRow.findIndex((h) =>
    ['content', 'konten', 'capaianpembelajaran', 'deskripsi', 'uraian'].includes(h)
  );

  const result: NonNullable<RawProjectTransferPackage['cp']> = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const code = cleanCellVal(colCode !== -1 ? row[colCode] : row[0]);
    const element = cleanCellVal(colElement !== -1 ? row[colElement] : row[1]);
    const content = cleanCellVal(colContent !== -1 ? row[colContent] : row[2]);

    // Skip row if completely empty
    if (code === undefined && element === undefined && content === undefined) {
      continue;
    }

    result.push({
      code: code ?? undefined,
      element: element !== undefined ? String(element) : undefined,
      content: content !== undefined ? String(content) : undefined,
    });
  }

  return result;
}

/**
 * Reads 03_TP sheet into raw TP list.
 */
function parseTPSheet(sheet?: XLSX.WorkSheet): RawProjectTransferPackage['tp'] {
  if (!sheet) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (!rows || rows.length < 2) return [];

  const headerRow = (rows[0] || []).map(normalizeHeaderKey);
  const colCode = headerRow.findIndex((h) => ['code', 'kode', 'kodetp', 'id'].includes(h));
  const colCpCode = headerRow.findIndex((h) =>
    ['cpcode', 'kodecp', 'rujukancp', 'cpref', 'cp'].includes(h)
  );
  const colStatement = headerRow.findIndex((h) =>
    ['statement', 'tujuanpembelajaran', 'uraiantp', 'deskripsi', 'tp'].includes(h)
  );
  const colCompetence = headerRow.findIndex((h) => ['competence', 'kompetensi'].includes(h));
  const colMaterialScope = headerRow.findIndex((h) =>
    ['materialscope', 'lingkupmateri', 'materi', 'materipokok'].includes(h)
  );

  const result: NonNullable<RawProjectTransferPackage['tp']> = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const code = cleanCellVal(colCode !== -1 ? row[colCode] : row[0]);
    const cpCode = cleanCellVal(colCpCode !== -1 ? row[colCpCode] : row[1]);
    const statement = cleanCellVal(colStatement !== -1 ? row[colStatement] : row[2]);
    const competence = cleanCellVal(colCompetence !== -1 ? row[colCompetence] : row[3]);
    const materialScope = cleanCellVal(colMaterialScope !== -1 ? row[colMaterialScope] : row[4]);

    // Skip row if completely empty
    if (
      code === undefined &&
      cpCode === undefined &&
      statement === undefined &&
      competence === undefined &&
      materialScope === undefined
    ) {
      continue;
    }

    result.push({
      code: code ?? undefined,
      cpCode: cpCode ?? undefined,
      statement: statement !== undefined ? String(statement) : undefined,
      competence: competence !== undefined ? String(competence) : undefined,
      materialScope: materialScope !== undefined ? String(materialScope) : undefined,
    });
  }

  return result;
}

/**
 * Reads 04_ATP sheet into raw ATP list.
 */
function parseATPSheet(sheet?: XLSX.WorkSheet): RawProjectTransferPackage['atp'] {
  if (!sheet) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (!rows || rows.length < 2) return [];

  const headerRow = (rows[0] || []).map(normalizeHeaderKey);
  const colOrder = headerRow.findIndex((h) =>
    ['order', 'urutan', 'no', 'nomor', 'nomorurut'].includes(h)
  );
  const colSemester = headerRow.findIndex((h) => ['semester', 'smt'].includes(h));
  const colUnit = headerRow.findIndex((h) => ['unit', 'bab', 'unitpembelajaran'].includes(h));
  const colTpCode = headerRow.findIndex((h) =>
    ['tpcode', 'kodetp', 'rujukantp', 'tpref', 'tp'].includes(h)
  );
  const colMaterial = headerRow.findIndex((h) =>
    ['material', 'materi', 'topik', 'lingkupmateri'].includes(h)
  );
  const colJp = headerRow.findIndex((h) =>
    ['jp', 'jampelajaran', 'alokasijp', 'alokasiwaktu'].includes(h)
  );

  const result: NonNullable<RawProjectTransferPackage['atp']> = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const order = cleanCellVal(colOrder !== -1 ? row[colOrder] : row[0]);
    const semester = cleanCellVal(colSemester !== -1 ? row[colSemester] : row[1]);
    const unit = cleanCellVal(colUnit !== -1 ? row[colUnit] : row[2]);
    const tpCode = cleanCellVal(colTpCode !== -1 ? row[colTpCode] : row[3]);
    const material = cleanCellVal(colMaterial !== -1 ? row[colMaterial] : row[4]);
    const jp = cleanCellVal(colJp !== -1 ? row[colJp] : row[5]);

    // Skip row if completely empty
    if (
      order === undefined &&
      semester === undefined &&
      unit === undefined &&
      tpCode === undefined &&
      material === undefined &&
      jp === undefined
    ) {
      continue;
    }

    result.push({
      order: order ?? undefined,
      semester: semester ?? undefined,
      unit: unit ?? undefined,
      tpCode: tpCode ?? undefined,
      material: material !== undefined ? String(material) : undefined,
      jp: jp ?? undefined,
    });
  }

  return result;
}

/**
 * Parses an XLSX workbook into a RawProjectTransferPackage.
 */
export function parseWorkbookToRawProjectTransfer(
  workbook: XLSX.WorkBook
): RawProjectTransferPackage {
  const sheetProject = findSheet(
    workbook,
    PROJECT_TRANSFER_XLSX_SHEETS.PROJECT,
    ['project', '01']
  );
  const sheetCP = findSheet(workbook, PROJECT_TRANSFER_XLSX_SHEETS.CP, ['cp', '02']);
  const sheetTP = findSheet(workbook, PROJECT_TRANSFER_XLSX_SHEETS.TP, ['tp', '03']);
  const sheetATP = findSheet(workbook, PROJECT_TRANSFER_XLSX_SHEETS.ATP, ['atp', '04']);

  const projectHeader = parseProjectSheet(sheetProject);
  const cp = parseCPSheet(sheetCP);
  const tp = parseTPSheet(sheetTP);
  const atp = parseATPSheet(sheetATP);

  return {
    ...projectHeader,
    cp,
    tp,
    atp,
  };
}

/**
 * Reads binary XLSX data (ArrayBuffer | Uint8Array | Buffer) or workbook into RawProjectTransferPackage.
 */
export function readXlsxToRawProjectTransferPackage(
  data: ArrayBuffer | Uint8Array | unknown
): RawProjectTransferPackage {
  if (data && typeof data === 'object' && 'SheetNames' in (data as any)) {
    return parseWorkbookToRawProjectTransfer(data as XLSX.WorkBook);
  }

  const workbook = XLSX.read(data, {
    type: 'array',
    cellDates: false,
    raw: false,
  });

  return parseWorkbookToRawProjectTransfer(workbook);
}

/**
 * Full import adapter: reads XLSX binary or workbook and validates it using projectTransferService validator.
 * Pure adapter: does NOT write to storage.
 */
export function importProjectTransferFromXlsx(
  data: ArrayBuffer | Uint8Array | unknown
): ProjectTransferValidationResult {
  const rawPackage = readXlsxToRawProjectTransferPackage(data);
  return validateProjectTransfer(rawPackage);
}

/**
 * Creates an XLSX workbook from a ProjectTransferPackage with 4 canonical sheets.
 */
export function createProjectTransferXlsxWorkbook(
  pkg: ProjectTransferPackage
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  // 1. 01_PROJECT
  const projectHeaders = [
    'schemaVersion',
    'curriculumType',
    'subject',
    'level',
    'grade',
    'phase',
    'academicYear',
  ];
  const projectData = [
    projectHeaders,
    [
      pkg.schemaVersion || PROJECT_TRANSFER_SCHEMA_VERSION_V1,
      pkg.curriculumType || 'KURIKULUM_MERDEKA',
      pkg.subject || '',
      pkg.level || 'SD',
      pkg.grade || '',
      pkg.phase || '',
      pkg.academicYear || '',
    ],
  ];
  const wsProject = XLSX.utils.aoa_to_sheet(projectData);
  wsProject['!cols'] = [
    { wch: 16 },
    { wch: 22 },
    { wch: 30 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, wsProject, PROJECT_TRANSFER_XLSX_SHEETS.PROJECT);

  // 2. 02_CP
  const cpHeaders = ['code', 'element', 'content'];
  const cpData = [
    cpHeaders,
    ...(pkg.cp || []).map((c) => [c.code || '', c.element || '', c.content || '']),
  ];
  const wsCP = XLSX.utils.aoa_to_sheet(cpData);
  wsCP['!cols'] = [{ wch: 14 }, { wch: 25 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(workbook, wsCP, PROJECT_TRANSFER_XLSX_SHEETS.CP);

  // 3. 03_TP
  const tpHeaders = ['code', 'cpCode', 'statement', 'competence', 'materialScope'];
  const tpData = [
    tpHeaders,
    ...(pkg.tp || []).map((t) => [
      t.code || '',
      t.cpCode || '',
      t.statement || '',
      t.competence || '',
      t.materialScope || '',
    ]),
  ];
  const wsTP = XLSX.utils.aoa_to_sheet(tpData);
  wsTP['!cols'] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 60 },
    { wch: 25 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(workbook, wsTP, PROJECT_TRANSFER_XLSX_SHEETS.TP);

  // 4. 04_ATP
  const atpHeaders = ['order', 'semester', 'unit', 'tpCode', 'material', 'jp'];
  const atpData = [
    atpHeaders,
    ...(pkg.atp || []).map((a) => [
      a.order ?? '',
      a.semester ?? '',
      a.unit ?? '',
      a.tpCode || '',
      a.material ?? '',
      a.jp ?? '',
    ]),
  ];
  const wsATP = XLSX.utils.aoa_to_sheet(atpData);
  wsATP['!cols'] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 18 },
    { wch: 14 },
    { wch: 35 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(workbook, wsATP, PROJECT_TRANSFER_XLSX_SHEETS.ATP);

  return workbook;
}

/**
 * Creates an empty template workbook with canonical sheets and headers.
 */
export function createEmptyProjectTransferXlsxTemplate(
  initial?: Partial<ProjectTransferPackage>
): XLSX.WorkBook {
  const emptyPackage: ProjectTransferPackage = {
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

  return createProjectTransferXlsxWorkbook(emptyPackage);
}

/**
 * Serializes ProjectTransferPackage directly into a Uint8Array containing XLSX binary data.
 */
export function exportProjectTransferToXlsxBuffer(
  pkg: ProjectTransferPackage
): Uint8Array {
  const workbook = createProjectTransferXlsxWorkbook(pkg);
  const out = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });
  return new Uint8Array(out);
}

/**
 * Serializes empty ProjectTransfer template directly into a Uint8Array containing XLSX binary data.
 */
export function createEmptyProjectTransferXlsxTemplateBuffer(
  initial?: Partial<ProjectTransferPackage>
): Uint8Array {
  const workbook = createEmptyProjectTransferXlsxTemplate(initial);
  const out = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });
  return new Uint8Array(out);
}
