import { DocumentGenerationContext, ProtaSemesterAllocationBundle } from './types';
import { TimeAllocation, ATPItem, K13AnalysisItem } from '../../types';

export interface ProtaProjectionRow {
  id: string;
  sourceType: 'ATP_ITEM' | 'ASSESSMENT' | 'RESERVE';
  atpItemId?: string;
  tpCode: string;
  tpStatement: string;
  materialScope: string;
  semester: 1 | 2;
  allocatedJP: number;
}

export interface ProtaProjection {
  isReady: boolean;
  unreadyReason?: string;
  academicYear: string;
  rows: ProtaProjectionRow[];
  assessmentRows: ProtaProjectionRow[];
  reserveRows: ProtaProjectionRow[];
  semester1AllocatedJP: number;
  semester2AllocatedJP: number;
  totalAllocatedJP: number;
  officialAnnualJP: number | null;
  referenceWeeklyEquivalentJP: number | null;
  regulationReference?: string;
  remainingAnnualJP: number | null;
  validationStatus:
    | 'BALANCED'
    | 'UNDER_ALLOCATED'
    | 'OVER_ALLOCATED'
    | 'UNVERIFIED_CAPACITY'
    | 'INCOMPLETE'
    | 'CONFLICT';
}

export interface K13ProtaProjectionRow {
  id: string;
  kd: string;
  materi: string;
  kegiatan: string;
  allocatedJP: number;
  semester: 1 | 2 | null;
}

export interface K13ProtaProjection {
  isReady: boolean;
  unreadyReason?: string;
  academicYear: string;
  rows: K13ProtaProjectionRow[];
  totalAllocatedJP: number;
}

export function buildProtaProjection(context: DocumentGenerationContext): ProtaProjection {
  const academicYear = context.academicSetting?.academicYear || '-';
  const isBlankMode = context.documentMode === 'blank';

  const officialAnnualJP = context.annualJPReference?.officialAnnualJP ?? null;
  const referenceWeeklyEquivalentJP = context.annualJPReference?.referenceWeeklyEquivalentJP ?? null;
  const regulationReference = context.annualJPReference?.regulationReference;

  if (isBlankMode) {
    return {
      isReady: true,
      academicYear,
      rows: [],
      assessmentRows: [],
      reserveRows: [],
      semester1AllocatedJP: 0,
      semester2AllocatedJP: 0,
      totalAllocatedJP: 0,
      officialAnnualJP,
      referenceWeeklyEquivalentJP,
      regulationReference,
      remainingAnnualJP: null,
      validationStatus: 'BALANCED',
    };
  }

  const atpItems = context.atp?.items || [];
  const bundles = context.protaSemesterAllocations || [];

  // Check for missing prerequisites
  if (!context.atp || atpItems.length === 0 || bundles.length === 0) {
    return {
      isReady: false,
      unreadyReason: 'Program Tahunan belum dapat dibuat karena alur tujuan pembelajaran atau data distribusi semester belum tersedia.',
      academicYear,
      rows: [],
      assessmentRows: [],
      reserveRows: [],
      semester1AllocatedJP: 0,
      semester2AllocatedJP: 0,
      totalAllocatedJP: 0,
      officialAnnualJP,
      referenceWeeklyEquivalentJP,
      regulationReference,
      remainingAnnualJP: null,
      validationStatus: 'INCOMPLETE',
    };
  }

  // 1. Bundle validations
  const s1Bundles = bundles.filter((b) => b.semester === 1);
  const s2Bundles = bundles.filter((b) => b.semester === 2);

  const hasBundleConflict = s1Bundles.length > 1 || s2Bundles.length > 1;
  const hasS1Bundle = s1Bundles.length > 0;
  const hasS2Bundle = s2Bundles.length > 0;

  if (hasBundleConflict) {
    return {
      isReady: false,
      unreadyReason: 'Terdapat konflik alokasi: Duplikasi data distribusi Semester 1 atau Semester 2.',
      academicYear,
      rows: [],
      assessmentRows: [],
      reserveRows: [],
      semester1AllocatedJP: 0,
      semester2AllocatedJP: 0,
      totalAllocatedJP: 0,
      officialAnnualJP,
      referenceWeeklyEquivalentJP,
      regulationReference,
      remainingAnnualJP: null,
      validationStatus: 'CONFLICT',
    };
  }

  if (!hasS1Bundle || !hasS2Bundle) {
    return {
      isReady: false,
      unreadyReason: 'Program Tahunan belum dapat dibuat karena data distribusi Semester 1 dan Semester 2 belum lengkap.',
      academicYear,
      rows: [],
      assessmentRows: [],
      reserveRows: [],
      semester1AllocatedJP: 0,
      semester2AllocatedJP: 0,
      totalAllocatedJP: 0,
      officialAnnualJP,
      referenceWeeklyEquivalentJP,
      regulationReference,
      remainingAnnualJP: null,
      validationStatus: 'INCOMPLETE',
    };
  }

  const rows: ProtaProjectionRow[] = [];
  const assessmentRows: ProtaProjectionRow[] = [];
  const reserveRows: ProtaProjectionRow[] = [];

  let hasConflict = false;
  let hasIncomplete = false;

  // Track allocation per ATP Item ID
  for (const item of atpItems) {
    const s1Matches: TimeAllocation[] = [];
    const s2Matches: TimeAllocation[] = [];

    for (const bundle of bundles) {
      const matches = bundle.allocations.filter(
        (alloc) =>
          alloc.sourceType === 'ATP_ITEM' &&
          (alloc.sourceId === item.id || alloc.atpItemId === item.id)
      );
      if (bundle.semester === 1) {
        s1Matches.push(...matches);
      } else if (bundle.semester === 2) {
        s2Matches.push(...matches);
      }
    }

    const totalMatches = s1Matches.length + s2Matches.length;

    if (totalMatches === 0) {
      hasIncomplete = true;
      continue;
    } else if (totalMatches > 1) {
      hasConflict = true;
      continue;
    }

    const match = s1Matches.length === 1 ? s1Matches[0] : s2Matches[0];
    const sem = s1Matches.length === 1 ? 1 : 2;

    rows.push({
      id: match.id,
      sourceType: 'ATP_ITEM',
      atpItemId: item.id,
      tpCode: item.tpCode || '-',
      tpStatement: item.tpStatement || '-',
      materialScope: item.materialScope || '-',
      semester: sem,
      allocatedJP: match.allocatedJP ?? match.jp ?? 0,
    });
  }

  // Gather non-ATP allocations (ASSESSMENT & RESERVE)
  for (const bundle of bundles) {
    for (const alloc of bundle.allocations) {
      if (alloc.sourceType === 'ASSESSMENT') {
        assessmentRows.push({
          id: alloc.id,
          sourceType: 'ASSESSMENT',
          tpCode: 'ASESMEN',
          tpStatement: alloc.notes || 'Asesmen Sumatif',
          materialScope: '-',
          semester: bundle.semester as 1 | 2,
          allocatedJP: alloc.allocatedJP ?? alloc.jp ?? 0,
        });
      } else if (alloc.sourceType === 'RESERVE') {
        reserveRows.push({
          id: alloc.id,
          sourceType: 'RESERVE',
          tpCode: 'CADANGAN',
          tpStatement: alloc.notes || 'Cadangan / Pekan Sunyi',
          materialScope: '-',
          semester: bundle.semester as 1 | 2,
          allocatedJP: alloc.allocatedJP ?? alloc.jp ?? 0,
        });
      }
    }
  }

  // Calculate allocated JP sums
  const getSum = (arr: ProtaProjectionRow[]) => arr.reduce((sum, r) => sum + r.allocatedJP, 0);

  const s1AtpSum = getSum(rows.filter((r) => r.semester === 1));
  const s2AtpSum = getSum(rows.filter((r) => r.semester === 2));

  const s1AssessSum = getSum(assessmentRows.filter((r) => r.semester === 1));
  const s2AssessSum = getSum(assessmentRows.filter((r) => r.semester === 2));

  const s1ReserveSum = getSum(reserveRows.filter((r) => r.semester === 1));
  const s2ReserveSum = getSum(reserveRows.filter((r) => r.semester === 2));

  const semester1AllocatedJP = s1AtpSum + s1AssessSum + s1ReserveSum;
  const semester2AllocatedJP = s2AtpSum + s2AssessSum + s2ReserveSum;
  const totalAllocatedJP = semester1AllocatedJP + semester2AllocatedJP;

  const remainingAnnualJP = officialAnnualJP !== null ? officialAnnualJP - totalAllocatedJP : null;

  // Validation Status Priority
  let validationStatus: ProtaProjection['validationStatus'] = 'BALANCED';
  let isReady = true;
  let unreadyReason: string | undefined;

  if (hasConflict) {
    validationStatus = 'CONFLICT';
    isReady = false;
    unreadyReason = 'Terdapat konflik alokasi: Tujuan Pembelajaran dialokasikan di Semester 1 sekaligus Semester 2.';
  } else if (hasIncomplete) {
    validationStatus = 'INCOMPLETE';
    isReady = false;
    unreadyReason = 'Distribusi ATP belum lengkap: Terdapat Tujuan Pembelajaran yang belum memiliki alokasi waktu.';
  } else if (officialAnnualJP === null) {
    validationStatus = 'UNVERIFIED_CAPACITY';
    isReady = true;
  } else {
    if (totalAllocatedJP < officialAnnualJP) {
      validationStatus = 'UNDER_ALLOCATED';
    } else if (totalAllocatedJP === officialAnnualJP) {
      validationStatus = 'BALANCED';
    } else {
      validationStatus = 'OVER_ALLOCATED';
    }
    isReady = true;
  }

  return {
    isReady,
    unreadyReason,
    academicYear,
    rows,
    assessmentRows,
    reserveRows,
    semester1AllocatedJP,
    semester2AllocatedJP,
    totalAllocatedJP,
    officialAnnualJP,
    referenceWeeklyEquivalentJP,
    regulationReference,
    remainingAnnualJP,
    validationStatus,
  };
}

export function buildK13ProtaProjection(context: DocumentGenerationContext): K13ProtaProjection {
  const academicYear = context.academicSetting?.academicYear || '-';
  const isBlankMode = context.documentMode === 'blank';

  if (isBlankMode) {
    return {
      isReady: true,
      academicYear,
      rows: [],
      totalAllocatedJP: 0,
    };
  }

  const k13Items = context.k13Analysis?.items || [];
  const bundles = context.protaSemesterAllocations || [];

  const rows: K13ProtaProjectionRow[] = [];

  for (const item of k13Items) {
    // Find matching time allocation across bundles
    let matchAlloc: TimeAllocation | undefined;
    let semesterAlloc: 1 | 2 | null = null;

    for (const bundle of bundles) {
      const found = bundle.allocations.find(
        (alloc) => alloc.sourceType === 'KD' && (alloc.sourceId === item.id || alloc.sourceId === item.kd)
      );
      if (found) {
        matchAlloc = found;
        semesterAlloc = bundle.semester as 1 | 2;
        break;
      }
    }

    // fallback directly to context.timeAllocations if bundles are empty (backward-compatibility / simple context)
    if (!matchAlloc && context.timeAllocations) {
      const found = context.timeAllocations.find(
        (alloc) => alloc.sourceType === 'KD' && (alloc.sourceId === item.id || alloc.sourceId === item.kd)
      );
      if (found) {
        matchAlloc = found;
        semesterAlloc = (found.semester as 1 | 2) || null;
      }
    }

    const allocatedJP = matchAlloc?.allocatedJP ?? matchAlloc?.jp ?? (item.alokasiJp ? Number(item.alokasiJp) : 0);
    const resolvedSemester = matchAlloc?.semester 
      ? (Number(matchAlloc.semester) as 1 | 2) 
      : semesterAlloc;

    rows.push({
      id: item.id,
      kd: item.kd,
      materi: item.materi,
      kegiatan: item.kegiatan || '-',
      allocatedJP,
      semester: resolvedSemester,
    });
  }

  const totalAllocatedJP = rows.reduce((sum, r) => sum + r.allocatedJP, 0);
  const isReady = k13Items.length > 0;

  return {
    isReady,
    unreadyReason: isReady ? undefined : 'Data analisis KD Kurikulum 2013 belum tersedia.',
    academicYear,
    rows,
    totalAllocatedJP,
  };
}
