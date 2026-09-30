import { DocumentGenerationContext } from './types';
import { EffectiveWeekInfo, TimeAllocation } from '../../types';
import {
  calculateEffectiveDays,
  calculateEffectiveWeeks,
  getEffectiveWeeksList,
  calculateAvailableJP,
  validateTimeAllocations,
} from '../jpEngine';
import { isK13 as isK13Check } from '../curriculumRouter';

export interface PromesMonthHeader {
  monthKey: string;
  monthName: string;
  monthNumber: number; // 1..12
  year?: number;
  weeks: Array<{
    weekIndex: number;
    startDate?: string;
    endDate?: string;
  }>;
}

export interface PromesRow {
  id: string;
  atpItemId?: string;
  sourceType: 'ATP_ITEM' | 'ASSESSMENT' | 'RESERVE' | 'KD' | 'OTHER';
  tpCode: string;
  tpStatement: string;
  materialScope: string;
  allocatedJP: number;
  startWeek: number;
  endWeek: number;
  monthlyJP: Record<string, number>; // monthName or monthKey -> JP
  weekAllocations: Record<number, number>; // weekIndex -> JP
  notes?: string;
}

export interface PromesProjection {
  semester: '1' | '2';
  curriculumType: 'KURIKULUM_MERDEKA' | 'K13';
  actualScheduledWeeklyJP: number | null;
  effectiveLearningDays: number | null;
  effectiveWeeksEquivalent: number | null;
  effectiveWeekSlots: number | null;
  availableJP: number | null;
  monthHeaders: PromesMonthHeader[];
  rows: PromesRow[];
  assessmentRows: PromesRow[];
  reserveRows: PromesRow[];
  totalAllocatedJP: number;
  remainingJP: number;
  validationStatus: 'BALANCED' | 'UNDER_ALLOCATED' | 'OVER_ALLOCATED';
  isReady: boolean;
  unreadyReason?: string;
}

const INDONESIAN_MONTH_NAMES: Record<number, string> = {
  1: 'Januari',
  2: 'Februari',
  3: 'Maret',
  4: 'April',
  5: 'Mei',
  6: 'Juni',
  7: 'Juli',
  8: 'Agustus',
  9: 'September',
  10: 'Oktober',
  11: 'November',
  12: 'Desember',
};

/**
 * Pure Canonical PROMES Projection Builder
 */
export function buildAlokasiWaktuProjection(context: DocumentGenerationContext): PromesProjection {
  return buildPromesProjection(context);
}

export function buildPromesProjection(context: DocumentGenerationContext): PromesProjection {
  const { academicSetting, calendar, calendarDays = [], timeAllocations = [], atp, k13Analysis, semesterJPSetting, documentMode } = context;

  const isK13 = isK13Check(academicSetting);
  const curriculumType: 'KURIKULUM_MERDEKA' | 'K13' = isK13 ? 'K13' : 'KURIKULUM_MERDEKA';

  const isSemesterGanjil =
    academicSetting?.semester?.includes('1') ||
    academicSetting?.semester?.toLowerCase().includes('ganjil');
  const semester: '1' | '2' = isSemesterGanjil ? '1' : '2';

  const defaultMonthNames = isSemesterGanjil
    ? ['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    : ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'];

  const activeSettingPlanId = academicSetting?.id;

  // Defensive Semester Isolation for TimeAllocations
  const scopedTimeAllocations = activeSettingPlanId
    ? timeAllocations.filter((a) => !a.academicSettingId || a.academicSettingId === activeSettingPlanId)
    : timeAllocations;

  // Actual Weekly JP Source with SemesterJPSetting Scope Validation
  let actualScheduledWeeklyJP: number | null = null;
  const isJpSettingScopeValid =
    Boolean(semesterJPSetting) &&
    (!semesterJPSetting?.semesterPlanId ||
      !activeSettingPlanId ||
      semesterJPSetting.semesterPlanId === activeSettingPlanId);

  if (isJpSettingScopeValid && semesterJPSetting?.actualScheduledWeeklyJP && semesterJPSetting.actualScheduledWeeklyJP > 0) {
    actualScheduledWeeklyJP = semesterJPSetting.actualScheduledWeeklyJP;
  } else if (isK13) {
    actualScheduledWeeklyJP = academicSetting?.subjectWeeklyJP || academicSetting?.totalHoursPerWeek || null;
  }

  // Calendar Capacity Analysis
  const hasCalendar = Boolean(calendar?.startDate && calendar?.endDate);
  const isCalendarConfirmed = calendar?.workflowStatus === 'CONFIRMED';

  let effectiveLearningDays: number | null = null;
  let effectiveWeeksEquivalent: number | null = null;
  let effectiveWeekSlots: number | null = null;
  let availableJP: number | null = null;
  let effectiveWeeksList: EffectiveWeekInfo[] = [];

  if (hasCalendar && calendar) {
    const effDaysRes = calculateEffectiveDays(calendar, calendarDays);
    effectiveLearningDays = effDaysRes.effectiveLearningDays;

    const schoolDaysPerWeek = calendar.schoolDaysPerWeek === 6 ? 6 : 5;
    const effWeeksRes = calculateEffectiveWeeks(effectiveLearningDays, schoolDaysPerWeek);
    if (effWeeksRes.status === 'RESOLVED') {
      effectiveWeeksEquivalent = effWeeksRes.effectiveWeeksRounded;
    }

    effectiveWeeksList = getEffectiveWeeksList(calendar, calendarDays);
    effectiveWeekSlots =
      effectiveWeeksList.length > 0
        ? effectiveWeeksList.length
        : effWeeksRes.status === 'RESOLVED' && effWeeksRes.effectiveWeeksEquivalent
        ? Math.ceil(effWeeksRes.effectiveWeeksEquivalent)
        : 18;

    if (actualScheduledWeeklyJP && actualScheduledWeeklyJP > 0) {
      const availRes = calculateAvailableJP({
        subjectWeeklyJP: actualScheduledWeeklyJP,
        effectiveLearningDays,
        schoolDaysPerWeek,
        weeklyJPSource: 'ACTUAL_SCHEDULE',
        calendarStatus: 'RESOLVED',
        effectiveDayStatus: 'RESOLVED',
      });
      if (availRes.status === 'RESOLVED') {
        availableJP = availRes.availableJP;
      }
    }
  }

  // Data Mode Readiness Validation
  let isReady = true;
  let unreadyReason: string | undefined = undefined;

  if (documentMode !== 'blank') {
    if (!hasCalendar || !isCalendarConfirmed) {
      isReady = false;
      unreadyReason = 'Program Semester belum dapat dibuat karena kalender pendidikan semester aktif belum dikonfirmasi.';
    } else if (!actualScheduledWeeklyJP || actualScheduledWeeklyJP <= 0) {
      isReady = false;
      unreadyReason = 'Program Semester belum dapat dibuat karena Jam Pelajaran (JP) aktual semester aktif belum ditetapkan.';
    } else if (!isK13) {
      const hasAtpItems = Boolean(atp?.items && atp.items.length > 0);
      const atpAllocs = scopedTimeAllocations.filter(
        (a) => a.sourceType === 'ATP_ITEM' || Boolean(a.atpItemId)
      );

      if (!hasAtpItems) {
        isReady = false;
        unreadyReason = 'Program Semester belum dapat dibuat karena tidak ada item ATP.';
      } else if (atpAllocs.length === 0) {
        isReady = false;
        unreadyReason = 'Program Semester belum dapat dibuat karena alokasi ATP semester aktif belum disusun.';
      }
    }
  }

  // Build Month Headers
  const monthHeaders: PromesMonthHeader[] = [];
  const totalSlots = effectiveWeekSlots || 18;

  if (effectiveWeeksList.length > 0) {
    const monthGroupMap = new Map<string, { monthKey: string; monthName: string; monthNumber: number; year?: number; weeks: Array<{ weekIndex: number; startDate?: string; endDate?: string }> }>();

    for (const info of effectiveWeeksList) {
      const mName = INDONESIAN_MONTH_NAMES[info.month] || `Bulan ${info.month}`;
      const mKey = `${mName}`;

      if (!monthGroupMap.has(mKey)) {
        monthGroupMap.set(mKey, {
          monthKey: mKey,
          monthName: mName,
          monthNumber: info.month,
          year: info.year,
          weeks: [],
        });
      }
      monthGroupMap.get(mKey)!.weeks.push({
        weekIndex: info.weekIndex,
        startDate: info.startDate,
        endDate: info.endDate,
      });
    }

    // Ensure standard semester months are present in correct order
    for (const name of defaultMonthNames) {
      const existing = Array.from(monthGroupMap.values()).find((m) => m.monthName.toLowerCase() === name.toLowerCase());
      if (existing) {
        monthHeaders.push({
          monthKey: existing.monthName,
          monthName: existing.monthName,
          monthNumber: existing.monthNumber,
          year: existing.year,
          weeks: existing.weeks,
        });
      } else {
        monthHeaders.push({
          monthKey: name,
          monthName: name,
          monthNumber: 0,
          weeks: [],
        });
      }
    }
  } else {
    // Fallback default 6 month headers with equal week distribution
    const weeksPerMonth = Math.ceil(totalSlots / 6);
    let curWeek = 1;

    for (let i = 0; i < 6; i++) {
      const mName = defaultMonthNames[i] || `Bulan ${i + 1}`;
      const monthWeeks: Array<{ weekIndex: number }> = [];

      for (let w = 0; w < weeksPerMonth && curWeek <= totalSlots; w++) {
        monthWeeks.push({ weekIndex: curWeek++ });
      }

      monthHeaders.push({
        monthKey: mName,
        monthName: mName,
        monthNumber: i + 1,
        weeks: monthWeeks,
      });
    }
  }

  // Map Week Index -> Month Name
  const weekToMonthNameMap = new Map<number, string>();
  monthHeaders.forEach((mh) => {
    mh.weeks.forEach((w) => {
      weekToMonthNameMap.set(w.weekIndex, mh.monthName);
    });
  });

  // Helper for Row Distribution
  const buildRowFromAllocation = (
    id: string,
    sourceType: PromesRow['sourceType'],
    tpCode: string,
    tpStatement: string,
    materialScope: string,
    allocatedJP: number,
    rawStartWeek: number,
    rawEndWeek: number,
    atpItemId?: string,
    notes?: string
  ): PromesRow => {
    const startWeek = Math.max(1, Math.min(rawStartWeek || 1, totalSlots));
    const endWeek = Math.max(startWeek, Math.min(rawEndWeek || startWeek, totalSlots));

    const activeWeeks: number[] = [];
    for (let w = startWeek; w <= endWeek; w++) {
      activeWeeks.push(w);
    }

    const nWeeks = activeWeeks.length;
    const baseJP = Math.floor(allocatedJP / (nWeeks || 1));
    const remainder = allocatedJP % (nWeeks || 1);

    const weekAllocations: Record<number, number> = {};
    const monthlyJP: Record<string, number> = {};

    // Initialize all month headers with 0
    monthHeaders.forEach((mh) => {
      monthlyJP[mh.monthName] = 0;
    });

    for (let i = 0; i < nWeeks; i++) {
      const w = activeWeeks[i];
      const wJP = baseJP + (i < remainder ? 1 : 0);
      weekAllocations[w] = wJP;

      const mName = weekToMonthNameMap.get(w) || defaultMonthNames[Math.min(Math.floor((w - 1) / 3), 5)];
      monthlyJP[mName] = (monthlyJP[mName] || 0) + wJP;
    }

    return {
      id,
      atpItemId,
      sourceType,
      tpCode,
      tpStatement,
      materialScope,
      allocatedJP,
      startWeek,
      endWeek,
      monthlyJP,
      weekAllocations,
      notes,
    };
  };

  const rows: PromesRow[] = [];
  const assessmentRows: PromesRow[] = [];
  const reserveRows: PromesRow[] = [];

  if (!isK13) {
    // KURIKULUM MERDEKA
    const atpItems = atp?.items || [];
    const atpItemMap = new Map(atpItems.map((item) => [item.id, item]));

    for (const alloc of scopedTimeAllocations) {
      const isAtp = alloc.sourceType === 'ATP_ITEM' || Boolean(alloc.atpItemId);
      const isAssessment = alloc.sourceType === 'ASSESSMENT';
      const isReserve = alloc.sourceType === 'RESERVE';

      const jp = Number(alloc.allocatedJP ?? alloc.jp ?? 0);
      const startW = alloc.startWeek || alloc.weekNumber || 1;
      const endW = alloc.endWeek || startW;

      if (isAtp) {
        const atpId = alloc.atpItemId || alloc.sourceId;
        const matchingItem = atpItemMap.get(atpId) || atpItems.find((i) => i.id === atpId || i.tpCode === atpId);

        if (matchingItem) {
          rows.push(
            buildRowFromAllocation(
              alloc.id,
              'ATP_ITEM',
              matchingItem.tpCode || `TP.${rows.length + 1}`,
              matchingItem.tpStatement || '-',
              matchingItem.materialScope || '-',
              jp,
              startW,
              endW,
              matchingItem.id,
              alloc.notes
            )
          );
        }
      } else if (isAssessment) {
        assessmentRows.push(
          buildRowFromAllocation(
            alloc.id,
            'ASSESSMENT',
            'ASESMEN',
            alloc.notes || 'Asesmen Sumatif / Evaluasi Pembelajaran',
            'Evaluasi Pembelajaran',
            jp,
            startW,
            endW,
            undefined,
            alloc.notes
          )
        );
      } else if (isReserve) {
        reserveRows.push(
          buildRowFromAllocation(
            alloc.id,
            'RESERVE',
            'CADANGAN',
            alloc.notes || 'Pekan Cadangan / Penguatan Pembelajaran',
            'Cadangan',
            jp,
            startW,
            endW,
            undefined,
            alloc.notes
          )
        );
      }
    }
  } else {
    // KURIKULUM 2013 (K13)
    const k13Items = k13Analysis?.items || [];

    if (scopedTimeAllocations.length > 0) {
      for (const alloc of scopedTimeAllocations) {
        const jp = Number(alloc.allocatedJP ?? alloc.jp ?? 0);
        const startW = alloc.startWeek || alloc.weekNumber || 1;
        const endW = alloc.endWeek || startW;

        if (alloc.sourceType === 'KD' || alloc.sourceId) {
          const k13Match = k13Items.find((i) => i.id === alloc.sourceId || i.kd === alloc.sourceId);
          rows.push(
            buildRowFromAllocation(
              alloc.id,
              'KD',
              k13Match?.kd || alloc.sourceId || `KD.${rows.length + 1}`,
              k13Match?.indikator || k13Match?.tujuanPembelajaran || alloc.notes || '-',
              k13Match?.materi || '-',
              jp,
              startW,
              endW,
              undefined,
              alloc.notes
            )
          );
        } else if (alloc.sourceType === 'ASSESSMENT') {
          assessmentRows.push(
            buildRowFromAllocation(
              alloc.id,
              'ASSESSMENT',
              'ASESMEN',
              alloc.notes || 'Asesmen Sumatif / UH / PTS / PAS',
              'Asesmen K13',
              jp,
              startW,
              endW,
              undefined,
              alloc.notes
            )
          );
        } else if (alloc.sourceType === 'RESERVE') {
          reserveRows.push(
            buildRowFromAllocation(
              alloc.id,
              'RESERVE',
              'CADANGAN',
              alloc.notes || 'Alokasi Cadangan K13',
              'Cadangan',
              jp,
              startW,
              endW,
              undefined,
              alloc.notes
            )
          );
        }
      }
    } else {
      // Fallback K13 directly from analysis items if timeAllocations not set
      k13Items.forEach((item, idx) => {
        const jp = Number(item.alokasiJp || 4);
        const startW = Math.min(idx + 1, totalSlots);
        rows.push(
          buildRowFromAllocation(
            item.id || `k13-${idx}`,
            'KD',
            item.kd || `KD.${idx + 1}`,
            item.indikator || item.tujuanPembelajaran || '-',
            item.materi || '-',
            jp,
            startW,
            startW,
            undefined,
            undefined
          )
        );
      });
    }
  }

  // Calculate Totals & Validation Status via validateTimeAllocations
  const avail = availableJP ?? 0;
  const validationRes = validateTimeAllocations(scopedTimeAllocations, avail);

  const totalAllocatedJP = validationRes.totalAllocatedJP;
  const remainingJP = validationRes.remainingJP;
  const validationStatus: PromesProjection['validationStatus'] = validationRes.status;

  return {
    semester,
    curriculumType,
    actualScheduledWeeklyJP,
    effectiveLearningDays,
    effectiveWeeksEquivalent,
    effectiveWeekSlots,
    availableJP,
    monthHeaders,
    rows,
    assessmentRows,
    reserveRows,
    totalAllocatedJP,
    remainingJP,
    validationStatus,
    isReady,
    unreadyReason,
  };
}
