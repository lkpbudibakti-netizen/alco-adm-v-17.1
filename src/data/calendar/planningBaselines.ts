export interface CalendarPlanningBaseline {
  academicYear: string;
  province?: string;
  semester1: {
    startDate: string;
    endDate: string;
  };
  semester2: {
    startDate: string;
    endDate: string;
  };
  defaultSchoolDaysPerWeek: 5 | 6;
  label: string;
  sourceType: 'MVP_PLANNING_BASELINE';
}

export const CALENDAR_PLANNING_BASELINES: Record<string, CalendarPlanningBaseline> = {
  '2026/2027': {
    academicYear: '2026/2027',
    semester1: {
      startDate: '2026-07-13',
      endDate: '2026-12-18',
    },
    semester2: {
      startDate: '2027-01-04',
      endDate: '2027-06-18',
    },
    defaultSchoolDaysPerWeek: 5,
    label: 'Default Perencanaan 2026/2027 — dapat disesuaikan',
    sourceType: 'MVP_PLANNING_BASELINE',
  },
};

export interface ResolvePlanningBaselineParams {
  academicYear?: string;
  semester?: '1' | '2' | string;
  province?: string;
}

export interface PlanningBaselineResult {
  startDate: string;
  endDate: string;
  schoolDaysPerWeek: 5 | 6;
  label: string;
  isBaselineAvailable: boolean;
}

export function resolvePlanningBaseline(params: ResolvePlanningBaselineParams): PlanningBaselineResult {
  const normYear = (params.academicYear || '2026/2027').trim();
  const baseline = CALENDAR_PLANNING_BASELINES[normYear];

  if (!baseline) {
    return {
      startDate: '',
      endDate: '',
      schoolDaysPerWeek: 5,
      label: 'Default tanggal belum tersedia untuk tahun ajaran ini. Silakan gunakan sumber daerah atau masukkan tanggal perencanaan.',
      isBaselineAvailable: false,
    };
  }

  const semStr = String(params.semester || '1').toLowerCase();
  const isSem2 = semStr === '2' || semStr.includes('genap') || semStr.startsWith('2');

  const semData = isSem2 ? baseline.semester2 : baseline.semester1;

  return {
    startDate: semData.startDate,
    endDate: semData.endDate,
    schoolDaysPerWeek: baseline.defaultSchoolDaysPerWeek,
    label: baseline.label,
    isBaselineAvailable: true,
  };
}
