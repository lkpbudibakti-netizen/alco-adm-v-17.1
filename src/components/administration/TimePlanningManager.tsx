import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  SchoolData,
  TeacherProfile,
  AcademicSetting,
  AcademicCalendar,
  CalendarDay,
  TimeAllocation,
  SemesterJPSetting,
  ATPData,
  K13Analysis,
  CalendarSourceType,
  CalendarWorkflowStatus,
  CalendarResolutionStatus,
} from '../../types';
import {
  calculateEffectiveDays,
  calculateEffectiveWeeks,
  calculateAvailableJP,
  getSubjectJP,
  resolveSemester,
  validateTimeAllocations,
  normalizeWeekRange,
  buildAutomaticSemesterAllocations,
  resolveSemesterCapacityV5,
} from '../../services/jpEngine';
import { loadStorageV5 } from '../../services/storageV5';
import {
  resolveOfficialCalendar,
  applyManualCalendarOverride,
  confirmCalendarWorkflow,
  resetCalendarToOfficial,
  projectCandidateEventsToCalendarDays,
  projectNationalBaseToSemesterDraft,
  generateEffectiveCalendarDays,
} from '../../services/calendarResolver';
import { resolvePlanningBaseline } from '../../data/calendar/planningBaselines';
import {
  generateKalenderAkademik,
  generateAlokasiWaktu,
} from '../../services/documentEngine';
import { resolveCalendarOnline } from '../../services/calendarProviderClient';
import {
  CalendarSourceCandidate,
  CalendarSearchDiagnostic,
  CalendarSearchDiagnosticReason,
  CalendarSourceLevel,
  buildNationalBaseCandidate,
} from '../../services/calendarProvider';

/**
 * Maps calendar search diagnostic reasons to mutually exclusive AI search status.
 */
export function mapDiagnosticToSearchStatus(
  reason?: CalendarSearchDiagnosticReason
): 'NOT_FOUND' | 'ERROR' {
  if (
    reason === 'NO_API_KEY' ||
    reason === 'MODEL_FAILURE' ||
    reason === 'EMPTY_RESPONSE' ||
    reason === 'NO_GROUNDING' ||
    reason === 'GROUNDING_RESOLUTION_FAILED'
  ) {
    return 'ERROR';
  }
  return 'NOT_FOUND';
}
import {
  Clock,
  Calendar as CalendarIcon,
  CalendarCheck,
  CalendarDays,
  Layers,
  Plus,
  Trash2,
  Save,
  FileDown,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Info,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Check,
  Edit3,
  ExternalLink,
} from 'lucide-react';

export interface TimePlanningManagerProps {
  school: SchoolData;
  profile: TeacherProfile;
  academicSetting: AcademicSetting;
  atp?: ATPData;
  k13Analysis?: K13Analysis;
  calendar?: AcademicCalendar;
  calendarDays: CalendarDay[];
  timeAllocations: TimeAllocation[];
  semesterJPSetting?: SemesterJPSetting;
  onSaveCalendar: (calendar: AcademicCalendar, days: CalendarDay[]) => void;
  onSaveSemesterJPSetting?: (actualWeeklyJP: number | null) => void;
  onSaveTimeAllocations: (allocations: TimeAllocation[]) => void;
}

export const TimePlanningManager: React.FC<TimePlanningManagerProps> = ({
  school,
  profile,
  academicSetting,
  atp,
  k13Analysis,
  calendar,
  calendarDays = [],
  timeAllocations = [],
  semesterJPSetting,
  onSaveCalendar,
  onSaveSemesterJPSetting,
  onSaveTimeAllocations,
}) => {
  const isK13Curriculum =
    academicSetting.curriculumType === 'K13' || academicSetting.curriculum?.includes('2013');

  // Official JP lookup based on verified curriculum database
  const officialRule = useMemo(() => {
    return getSubjectJP({
      curriculum: academicSetting.curriculum,
      level: academicSetting.level,
      grade: academicSetting.grade,
      subject: academicSetting.subject,
    });
  }, [academicSetting]);

  // Derived active semester authority strictly from academicSetting.id and academicSetting.semester matched with V5
  const activeSemester: '1' | '2' = useMemo(() => {
    try {
      const v5State = loadStorageV5();
      const matchedSp = v5State.semesterPlans.find((sp) => sp.id === academicSetting.id);
      if (matchedSp) {
        return matchedSp.semester === 2 ? '2' : '1';
      }
    } catch {
      // fallback
    }
    const res = resolveSemester(academicSetting.semester);
    return res === '2' ? '2' : '1';
  }, [academicSetting.id, academicSetting.semester]);

  const semester = activeSemester;

  // Workflow State
  const [workflowStatus, setWorkflowStatus] = useState<CalendarWorkflowStatus>(
    calendar?.workflowStatus || (calendar?.startDate && calendar?.endDate ? 'AUTO_RESOLVED' : 'UNRESOLVED')
  );
  const [resolutionStatus, setResolutionStatus] = useState<CalendarResolutionStatus>(
    calendar?.resolutionStatus || (calendar?.startDate && calendar?.endDate ? 'RESOLVED' : 'UNRESOLVED')
  );

  // Region & Academic Settings for Auto-Resolution
  const [searchRegency, setSearchRegency] = useState<string>(
    calendar?.sourceRegion && school.regency ? school.regency : (school.regency || '')
  );
  const [searchProvince, setSearchProvince] = useState<string>(
    calendar?.sourceRegion || school.province || ''
  );
  const [selectedProvince, setSelectedProvince] = useState<string>(
    calendar?.sourceRegion || school.province || ''
  );
  const [academicYear, setAcademicYear] = useState<string>(
    calendar?.academicYear || academicSetting.academicYear || ''
  );

  // Calendar dates & structure
  const [startDate, setStartDate] = useState<string>(calendar?.startDate || '');
  const [endDate, setEndDate] = useState<string>(calendar?.endDate || '');
  const [schoolDaysPerWeek, setSchoolDaysPerWeek] = useState<number | null>(
    calendar?.schoolDaysPerWeek === 5 || calendar?.schoolDaysPerWeek === 6
      ? calendar.schoolDaysPerWeek
      : null
  );

  // Provenance & Authority
  const [sourceType, setSourceType] = useState<CalendarSourceType>(
    calendar?.sourceType || 'REGIONAL_EDUCATION_CALENDAR'
  );
  const [sourceName, setSourceName] = useState<string>(calendar?.sourceName || '');
  const [sourceAuthority, setSourceAuthority] = useState<string>(calendar?.sourceAuthority || '');
  const [sourceDocumentNumber, setSourceDocumentNumber] = useState<string>(calendar?.sourceDocumentNumber || '');
  const [sourceUrl, setSourceUrl] = useState<string>(calendar?.sourceUrl || '');
  const [isOverridden, setIsOverridden] = useState<boolean>(calendar?.isOverridden || false);
  const [overrideReason, setOverrideReason] = useState<string>(calendar?.overrideReason || '');

  // JP per week - SSOT: semesterJPSetting.actualScheduledWeeklyJP (null if unresolved)
  const initialJP =
    semesterJPSetting?.actualScheduledWeeklyJP !== undefined && semesterJPSetting?.actualScheduledWeeklyJP !== null
      ? semesterJPSetting.actualScheduledWeeklyJP
      : calendar?.jpPerWeek !== undefined && calendar?.jpPerWeek !== null
      ? calendar.jpPerWeek
      : null;

  const [jpPerWeek, setJpPerWeek] = useState<number | null>(initialJP);

  // Track if user manually modified JP
  const isCustomJP =
    officialRule.isOfficial &&
    officialRule.weeklyJP !== null &&
    jpPerWeek !== null &&
    jpPerWeek !== officialRule.weeklyJP;

  // Track if local calendar draft is dirty (modified/generated by user)
  const [calendarDraftDirty, setCalendarDraftDirty] = useState<boolean>(false);
  const lastPersistedCalendarVersionRef = useRef<string | undefined>(calendar?.updatedAt || calendar?.id);
  const currentSemesterPlanIdRef = useRef<string>(academicSetting.id);

  // Calendar days / events
  const [days, setDays] = useState<CalendarDay[]>(calendarDays || []);
  const [newDayDate, setNewDayDate] = useState('');
  const [newDayStatus, setNewDayStatus] = useState<CalendarDay['status']>('holiday');
  const [newDayNotes, setNewDayNotes] = useState('');

  // Time allocations
  const [allocations, setAllocations] = useState<TimeAllocation[]>(timeAllocations || []);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [resolutionMessage, setResolutionMessage] = useState<string | null>(null);

  // Reset all semester-scoped state when academicSetting.id changes
  useEffect(() => {
    currentSemesterPlanIdRef.current = academicSetting.id;
    lastPersistedCalendarVersionRef.current = calendar?.updatedAt || calendar?.id;
    setCalendarDraftDirty(false);

    if (calendar) {
      setWorkflowStatus(calendar.workflowStatus || (calendar.startDate && calendar.endDate ? 'AUTO_RESOLVED' : 'UNRESOLVED'));
      setResolutionStatus(calendar.resolutionStatus || (calendar.startDate && calendar.endDate ? 'RESOLVED' : 'UNRESOLVED'));
      setStartDate(calendar.startDate || '');
      setEndDate(calendar.endDate || '');
      setSchoolDaysPerWeek(
        calendar.schoolDaysPerWeek === 5 || calendar.schoolDaysPerWeek === 6
          ? calendar.schoolDaysPerWeek
          : null
      );
      setSourceType(calendar.sourceType || 'REGIONAL_EDUCATION_CALENDAR');
      setSourceName(calendar.sourceName || '');
      setSourceAuthority(calendar.sourceAuthority || '');
      setSourceDocumentNumber(calendar.sourceDocumentNumber || '');
      setSourceUrl(calendar.sourceUrl || '');
      setIsOverridden(calendar.isOverridden || false);
      setOverrideReason(calendar.overrideReason || '');
    } else {
      setStartDate('');
      setEndDate('');
      setSchoolDaysPerWeek(null);
      setWorkflowStatus('UNRESOLVED');
      setResolutionStatus('UNRESOLVED');
      setSourceType('REGIONAL_EDUCATION_CALENDAR');
      setSourceName('');
      setSourceAuthority('');
      setSourceDocumentNumber('');
      setSourceUrl('');
      setIsOverridden(false);
      setOverrideReason('');
    }

    setDays(calendarDays || []);
    setAllocations(timeAllocations || []);

    const resolvedJP =
      semesterJPSetting?.actualScheduledWeeklyJP !== undefined && semesterJPSetting?.actualScheduledWeeklyJP !== null
        ? semesterJPSetting.actualScheduledWeeklyJP
        : calendar?.jpPerWeek !== undefined && calendar?.jpPerWeek !== null
        ? calendar.jpPerWeek
        : null;
    setJpPerWeek(resolvedJP);

    setOnlineDiscovery(null);
    setResolutionMessage(null);
    setOnlineSearchError(null);
    setOnlineDiagnostic(null);
    setAiSearchStatus('IDLE');
    setIsLocalFallbackUsed(false);
    setSaveNotification(null);
    setNewDayDate('');
    setNewDayNotes('');
  }, [academicSetting.id]);

  // Sync time allocations when props change within active semester
  useEffect(() => {
    setAllocations(timeAllocations || []);
  }, [timeAllocations]);

  // Sync calendar and days props: preserve draft if dirty, sync only when clean or when newly persisted canonical version arrives
  useEffect(() => {
    // If active semester plan ID changed, the primary reset effect handles it.
    if (currentSemesterPlanIdRef.current !== academicSetting.id) {
      return;
    }

    const isNewlyPersistedCanonicalCalendar = Boolean(
      calendar &&
      calendar.workflowStatus === 'CONFIRMED' &&
      calendar.updatedAt &&
      calendar.updatedAt !== lastPersistedCalendarVersionRef.current
    );

    if (isNewlyPersistedCanonicalCalendar) {
      lastPersistedCalendarVersionRef.current = calendar?.updatedAt || calendar?.id;
      setCalendarDraftDirty(false);
      setDays(calendarDays || []);
      setWorkflowStatus(calendar.workflowStatus);
      setResolutionStatus(calendar.resolutionStatus || 'RESOLVED');
      setStartDate(calendar.startDate || '');
      setEndDate(calendar.endDate || '');
      setSchoolDaysPerWeek(
        calendar.schoolDaysPerWeek === 5 || calendar.schoolDaysPerWeek === 6
          ? calendar.schoolDaysPerWeek
          : null
      );
      setSourceType(calendar.sourceType || 'REGIONAL_EDUCATION_CALENDAR');
      setSourceName(calendar.sourceName || '');
      setSourceAuthority(calendar.sourceAuthority || '');
      setSourceDocumentNumber(calendar.sourceDocumentNumber || '');
      setSourceUrl(calendar.sourceUrl || '');
      setIsOverridden(calendar.isOverridden || false);
      setOverrideReason(calendar.overrideReason || '');
      return;
    }

    // If local calendar draft is dirty, DO NOT overwrite with empty/stale calendarDays from unrelated V5 refreshes
    if (calendarDraftDirty) {
      return;
    }

    // If clean, sync with incoming canonical props
    if (calendar) {
      setWorkflowStatus(calendar.workflowStatus || (calendar.startDate && calendar.endDate ? 'AUTO_RESOLVED' : 'UNRESOLVED'));
      setResolutionStatus(calendar.resolutionStatus || (calendar.startDate && calendar.endDate ? 'RESOLVED' : 'UNRESOLVED'));
      setStartDate(calendar.startDate || '');
      setEndDate(calendar.endDate || '');
      setSchoolDaysPerWeek(
        calendar.schoolDaysPerWeek === 5 || calendar.schoolDaysPerWeek === 6
          ? calendar.schoolDaysPerWeek
          : null
      );
      setSourceType(calendar.sourceType || 'REGIONAL_EDUCATION_CALENDAR');
      setSourceName(calendar.sourceName || '');
      setSourceAuthority(calendar.sourceAuthority || '');
      setSourceDocumentNumber(calendar.sourceDocumentNumber || '');
      setSourceUrl(calendar.sourceUrl || '');
      setIsOverridden(calendar.isOverridden || false);
      setOverrideReason(calendar.overrideReason || '');
    }
    setDays(calendarDays || []);
  }, [calendar, calendarDays, calendarDraftDirty, academicSetting.id]);

  useEffect(() => {
    if (semesterJPSetting?.actualScheduledWeeklyJP !== undefined && semesterJPSetting?.actualScheduledWeeklyJP !== null) {
      setJpPerWeek(semesterJPSetting.actualScheduledWeeklyJP);
    } else if (calendar?.jpPerWeek !== undefined && calendar?.jpPerWeek !== null) {
      setJpPerWeek(calendar.jpPerWeek);
    } else {
      setJpPerWeek(null);
    }
  }, [semesterJPSetting?.actualScheduledWeeklyJP, calendar?.jpPerWeek]);

  // Derived calculations for JP & Calendar completeness
  const isCalendarConfigComplete = Boolean(
    startDate && endDate && schoolDaysPerWeek && (schoolDaysPerWeek === 5 || schoolDaysPerWeek === 6)
  );

  const hasGeneratedEffectiveCalendar = useMemo(
    () => days.some((d) => d.sourceLayer === 'GENERATED_EFFECTIVE_BASELINE'),
    [days]
  );

  const isEffectiveCalendarReady =
    isCalendarConfigComplete && hasGeneratedEffectiveCalendar;

  const effectiveResult = useMemo(() => {
    if (!startDate || !endDate || !schoolDaysPerWeek) {
      return { status: 'UNRESOLVED' as const, effectiveLearningDays: 0, holidayDays: 0, effectiveWeeks: 0 };
    }
    return calculateEffectiveDays(
      { startDate, endDate, schoolDaysPerWeek },
      days
    );
  }, [startDate, endDate, days, schoolDaysPerWeek]);

  const effectiveWeeks = useMemo(() => {
    if (!startDate || !endDate || !schoolDaysPerWeek) return null;
    const res = calculateEffectiveWeeks(effectiveResult.effectiveLearningDays, schoolDaysPerWeek);
    return res.effectiveWeeksRounded;
  }, [effectiveResult, schoolDaysPerWeek, startDate, endDate]);

  const totalAvailableJP = useMemo(() => {
    if (effectiveWeeks === null || jpPerWeek === null || !schoolDaysPerWeek) return null;
    const res = calculateAvailableJP({
      subjectWeeklyJP: jpPerWeek,
      effectiveLearningDays: effectiveResult.effectiveLearningDays,
      schoolDaysPerWeek,
    });
    return res.availableJP;
  }, [effectiveResult, jpPerWeek, schoolDaysPerWeek, effectiveWeeks]);

  const totalPlannedJP = useMemo(() => {
    if (isK13Curriculum) {
      if (!k13Analysis?.items) return 0;
      return k13Analysis.items.reduce((acc, item) => acc + (Number(item.targetHours) || 0), 0);
    } else {
      if (!allocations || allocations.length === 0) return null;
      return allocations.reduce(
        (sum, item) => sum + (Number(item.allocatedJP ?? item.jp) || 0),
        0
      );
    }
  }, [isK13Curriculum, k13Analysis, allocations]);

  const jpDifference = useMemo(() => {
    if (totalAvailableJP === null || totalPlannedJP === null) return null;
    return totalAvailableJP - totalPlannedJP;
  }, [totalAvailableJP, totalPlannedJP]);

  // Canonical Semester Capacity from V5 Storage Authority
  const canonicalCapacity = useMemo(() => {
    try {
      const v5State = loadStorageV5();
      if (!academicSetting.id) return null;
      return resolveSemesterCapacityV5(academicSetting.id, v5State);
    } catch {
      return null;
    }
  }, [academicSetting.id, calendar, semesterJPSetting]);

  const isCapacityCanonical = Boolean(
    canonicalCapacity?.isReady &&
    workflowStatus === 'CONFIRMED' &&
    jpPerWeek === semesterJPSetting?.actualScheduledWeeklyJP &&
    calendar?.workflowStatus === 'CONFIRMED'
  );

  const activeSemesterCalendarStatus = useMemo(() => {
    if (calendar?.workflowStatus === 'CONFIRMED' && canonicalCapacity?.isReady) {
      return 'Tersimpan';
    }
    if (hasGeneratedEffectiveCalendar && workflowStatus !== 'CONFIRMED') {
      return 'Draf — belum ditetapkan';
    }
    return 'Belum dibuat';
  }, [calendar?.workflowStatus, canonicalCapacity?.isReady, hasGeneratedEffectiveCalendar, workflowStatus]);

  const isSaveTimeAllocationEnabled = isK13Curriculum || Boolean(canonicalCapacity?.isReady);

  const handleSaveJP = () => {
    if (onSaveSemesterJPSetting) {
      onSaveSemesterJPSetting(jpPerWeek);
    }
    const semLabel = activeSemester === '1' ? '1' : '2';
    setSaveNotification(`JP aktual tersimpan untuk Semester ${semLabel}.`);
    setTimeout(() => setSaveNotification(null), 3500);
  };

  // Online Discovery & Resolution State
  type CalendarAISearchStatus =
    | 'IDLE'
    | 'SEARCHING'
    | 'SUCCESS'
    | 'NOT_FOUND'
    | 'ERROR';

  const [onlineDiscovery, setOnlineDiscovery] = useState<CalendarSourceCandidate | null>(null);

  // Active Semester & Projection from Annual Source Candidate
  const activeSem = semester === '2' ? 2 : 1;

  const activeSemProjection = useMemo(() => {
    if (!onlineDiscovery) return { startDate: undefined, endDate: undefined, hasDates: false };

    let start = activeSem === 1
      ? (onlineDiscovery.semester1StartDate || onlineDiscovery.semesterStartDate)
      : (onlineDiscovery.semester2StartDate || onlineDiscovery.semesterStartDate);

    let end = activeSem === 1
      ? (onlineDiscovery.semester1EndDate || onlineDiscovery.semesterEndDate)
      : (onlineDiscovery.semester2EndDate || onlineDiscovery.semesterEndDate);

    return {
      startDate: start,
      endDate: end,
      hasDates: Boolean(start && end),
    };
  }, [onlineDiscovery, activeSem]);
  const [isOnlineSearching, setIsOnlineSearching] = useState<boolean>(false);
  const [onlineSearchError, setOnlineSearchError] = useState<string | null>(null);
  const [onlineDiagnostic, setOnlineDiagnostic] = useState<CalendarSearchDiagnostic | null>(null);
  const [copiedDiagnostic, setCopiedDiagnostic] = useState<boolean>(false);
  const [aiSearchStatus, setAiSearchStatus] = useState<CalendarAISearchStatus>('IDLE');
  const [isLocalFallbackUsed, setIsLocalFallbackUsed] = useState<boolean>(false);

  const formatDiagnosticCopyText = (diag: CalendarSearchDiagnostic): string => {
    const lines: string[] = [];
    lines.push('=== DIAGNOSTIK PENCARIAN KALENDER ONLINE ===');
    lines.push(`Reason: ${diag.reason}`);
    lines.push(`AI Configured: ${diag.aiConfigured ? 'true' : 'false'}`);
    lines.push(`Wilayah Kriteria: ${searchRegency || '-'}, ${searchProvince || '-'} (${academicYear || '-'})`);
    lines.push('');

    for (const st of diag.stages) {
      lines.push(`[Tahap ${st.level}]`);
      if (st.modelAttempts && st.modelAttempts.length > 0) {
        const attemptsStr = st.modelAttempts
          .map(a => `${a.model} (${a.status}${a.errorCategory ? `: ${a.errorCategory}` : ''})`)
          .join(', ');
        lines.push(`  Model Attempts: ${attemptsStr}`);
      } else {
        lines.push(`  Model Attempts: none`);
      }
      lines.push(`  Response Received: ${st.responseReceived ? 'ya' : 'tidak'}`);
      lines.push(`  Text Present: ${st.textPresent ? 'ya' : 'tidak'}`);
      lines.push(`  Grounding Sources: ${st.groundingSourceCount}`);
      lines.push(`  Resolved Grounding: ${st.resolvedGroundingCount}`);
      lines.push(`  Accepted Candidates: ${st.acceptedCandidateCount}`);
      lines.push('');
    }

    return lines.join('\n');
  };

  const handleCopyDiagnostic = () => {
    if (!onlineDiagnostic) return;
    const text = formatDiagnosticCopyText(onlineDiagnostic);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDiagnostic(true);
      setTimeout(() => setCopiedDiagnostic(false), 2500);
    });
  };

  // Step 1: SEARCH CALENDAR WITH AI (ANNUAL SCOPE)
  const handleAutoResolve = async (showNotification: boolean = true) => {
    const prov = searchProvince || selectedProvince || school.province;
    const regency = searchRegency || school.regency;

    // Validation guard: academicYear and province required
    if (!academicYear || !prov) {
      setOnlineDiscovery(null);
      setWorkflowStatus('UNRESOLVED');
      setResolutionStatus('REGION_REQUIRED');
      setResolutionMessage('Pilih Wilayah Provinsi dan Kabupaten/Kota terlebih dahulu.');
      if (showNotification) {
        setSaveNotification('Pilih Wilayah Provinsi dan Kabupaten/Kota terlebih dahulu.');
        setTimeout(() => setSaveNotification(null), 3500);
      }
      return;
    }

    // 1. ONLINE SEARCH FIRST (YEAR SCOPED)
    setIsOnlineSearching(true);
    setAiSearchStatus('SEARCHING');
    setOnlineSearchError(null);
    setIsLocalFallbackUsed(false);

    let onlineSuccess = false;
    let candidateLevel: CalendarSourceLevel | null = null;

    try {
      const onlineRes = await resolveCalendarOnline({
        academicYear,
        province: prov,
        regency: regency || undefined,
      });

      if (onlineRes.diagnostic) {
        setOnlineDiagnostic(onlineRes.diagnostic);
      }

      if (onlineRes.selectedSource) {
        setOnlineDiscovery(onlineRes.selectedSource);
        candidateLevel = onlineRes.selectedSource.sourceLevel;
        onlineSuccess = true;
        setAiSearchStatus('SUCCESS');
        setOnlineSearchError(null);

        if (candidateLevel === 'NATIONAL') {
          const activeSem = semester === '2' ? 2 : 1;
          const baseline = resolvePlanningBaseline({
            academicYear: academicSetting.academicYear || academicYear,
            semester: semester || '1',
            province: searchProvince || selectedProvince || school?.province,
          });

          let targetStart = startDate;
          if (!targetStart) {
            targetStart = baseline.startDate;
            setStartDate(baseline.startDate);
          }

          let targetEnd = endDate;
          if (!targetEnd) {
            targetEnd = baseline.endDate;
            setEndDate(baseline.endDate);
          }

          let targetDays = schoolDaysPerWeek;
          if (!targetDays || (targetDays !== 5 && targetDays !== 6)) {
            targetDays = baseline.schoolDaysPerWeek;
            setSchoolDaysPerWeek(baseline.schoolDaysPerWeek);
          }

          setSourceType('NATIONAL_HOLIDAY_OVERLAY');
          setSourceName('Acuan Nasional (SKB 3 Menteri)');
          setSourceAuthority(onlineRes.selectedSource.authority);
          setSourceDocumentNumber(onlineRes.selectedSource.documentNumber || '');
          setSourceUrl(onlineRes.selectedSource.sourceUrl);

          const projectedDays = projectNationalBaseToSemesterDraft({
            candidate: onlineRes.selectedSource,
            academicYear: academicSetting.academicYear || academicYear || onlineRes.selectedSource.academicYear,
            semester: semester || '1',
            calendarId: calendar?.id || `cal-${academicSetting.id}`,
            existingDays: days,
          });
          setDays(projectedDays);

          setWorkflowStatus('AUTO_RESOLVED');
          setResolutionStatus('PARTIALLY_RESOLVED');
          setResolutionMessage(`Kalender pendidikan Kabupaten/Kota dan Provinsi belum ditemukan. Data resmi nasional telah diterapkan otomatis sebagai data awal Semester ${activeSem}.`);

          if (showNotification) {
            setSaveNotification(`Acuan Nasional diterapkan sebagai data awal Semester ${activeSem}. Tinjau konfigurasi lalu Generate Kalender & Hitung Efektif.`);
            setTimeout(() => setSaveNotification(null), 4000);
          }
        } else {
          setWorkflowStatus('UNRESOLVED');
          setResolutionMessage(`Sumber acuan ${candidateLevel === 'REGENCY' ? 'Kabupaten/Kota' : 'Provinsi'} ditemukan — tinjau sebelum digunakan.`);
          if (showNotification) {
            setSaveNotification('Sumber acuan ditemukan online — klik "Gunakan sebagai Acuan" untuk menerapkan.');
            setTimeout(() => setSaveNotification(null), 4000);
          }
        }
        return;
      } else {
        const diagReason = onlineRes.diagnostic?.reason;
        const status = mapDiagnosticToSearchStatus(diagReason);
        setAiSearchStatus(status);
        if (status === 'ERROR') {
          setOnlineSearchError(
            onlineRes.message || 'Layanan pencarian tidak berhasil menyelesaikan pencarian. Data kalender belum diubah.'
          );
        } else {
          setOnlineSearchError(null);
        }
      }
    } catch (err: any) {
      setAiSearchStatus('ERROR');
      setOnlineSearchError(
        err?.message || 'Layanan pencarian tidak berhasil menyelesaikan pencarian. Data kalender belum diubah.'
      );
    } finally {
      setIsOnlineSearching(false);
    }

    // 2. VERIFIED LOCAL CACHE FALLBACK (if online search produces no regional candidate)
    if (!onlineSuccess) {
      const res = resolveOfficialCalendar({
        province: prov,
        academicYear,
        semester: semester || undefined,
        academicSettingId: academicSetting.id,
        calendarId: calendar?.id,
        schoolDaysPerWeek: schoolDaysPerWeek || undefined,
        subjectWeeklyJP: jpPerWeek,
      });

      if (res.isResolved && res.calendar) {
        setIsLocalFallbackUsed(true);
        setStartDate(res.calendar.startDate);
        setEndDate(res.calendar.endDate);
        if (res.calendar.schoolDaysPerWeek === 5 || res.calendar.schoolDaysPerWeek === 6) {
          setSchoolDaysPerWeek(res.calendar.schoolDaysPerWeek);
        }
        setSourceType('REGIONAL_EDUCATION_CALENDAR');
        setSourceName(res.calendar.sourceName || '');
        setSourceAuthority(res.calendar.sourceAuthority || '');
        setSourceDocumentNumber(res.calendar.sourceDocumentNumber || '');
        setSourceUrl(res.calendar.sourceUrl || '');
        setDays(res.days);
        setIsOverridden(false);
        setWorkflowStatus('AUTO_RESOLVED');
        setResolutionStatus('RESOLVED');
        setResolutionMessage(res.diagnostic);

        if (showNotification) {
          setSaveNotification('Kalender Pendidikan berhasil di-resolusi dari Sumber Resmi Daerah (Lokal)!');
          setTimeout(() => setSaveNotification(null), 3500);
        }
      } else {
        // 3. NATIONAL BASE DETERMINISTIC FALLBACK (when both online search and local regional cache fail)
        const natCandidate = buildNationalBaseCandidate(academicYear);
        const activeSem = semester === '2' ? 2 : 1;
        const baseline = resolvePlanningBaseline({
          academicYear: academicSetting.academicYear || academicYear,
          semester: semester || '1',
          province: searchProvince || selectedProvince || school?.province,
        });

        let targetStart = startDate;
        if (!targetStart) {
          targetStart = baseline.startDate;
          setStartDate(baseline.startDate);
        }

        let targetEnd = endDate;
        if (!targetEnd) {
          targetEnd = baseline.endDate;
          setEndDate(baseline.endDate);
        }

        let targetDays = schoolDaysPerWeek;
        if (!targetDays || (targetDays !== 5 && targetDays !== 6)) {
          targetDays = baseline.schoolDaysPerWeek;
          setSchoolDaysPerWeek(baseline.schoolDaysPerWeek);
        }

        setOnlineDiscovery(natCandidate);
        setSourceType('NATIONAL_HOLIDAY_OVERLAY');
        setSourceName('Acuan Nasional (SKB 3 Menteri)');
        setSourceAuthority(natCandidate.authority);
        setSourceDocumentNumber(natCandidate.documentNumber || '');
        setSourceUrl(natCandidate.sourceUrl);

        const projectedDays = projectNationalBaseToSemesterDraft({
          candidate: natCandidate,
          academicYear: academicSetting.academicYear || academicYear || natCandidate.academicYear,
          semester: semester || '1',
          calendarId: calendar?.id || `cal-${academicSetting.id}`,
          existingDays: days,
        });
        setDays(projectedDays);

        setWorkflowStatus('AUTO_RESOLVED');
        setResolutionStatus('PARTIALLY_RESOLVED');
        const natMessage = `Kalender pendidikan Kabupaten/Kota dan Provinsi belum ditemukan. Data resmi nasional telah diterapkan otomatis sebagai data awal Semester ${activeSem}.`;
        setResolutionMessage(natMessage);

        if (showNotification) {
          setSaveNotification(`Acuan Nasional diterapkan sebagai data awal Semester ${activeSem}. Tinjau konfigurasi lalu Generate Kalender & Hitung Efektif.`);
          setTimeout(() => setSaveNotification(null), 4000);
        }
      }
    }
  };

  const handleApplyOnlineCandidate = (candidate: CalendarSourceCandidate) => {
    // Project active semester boundaries from annual candidate
    const activeSem = semester === '2' ? 2 : 1;

    let targetStart = activeSem === 1
      ? (candidate.semester1StartDate || candidate.semesterStartDate)
      : (candidate.semester2StartDate || candidate.semesterStartDate);

    let targetEnd = activeSem === 1
      ? (candidate.semester1EndDate || candidate.semesterEndDate)
      : (candidate.semester2EndDate || candidate.semesterEndDate);

    setSelectedProvince(candidate.province || searchProvince || school.province || '');
    setSourceType('REGIONAL_EDUCATION_CALENDAR');
    setSourceAuthority(candidate.authority);
    setSourceName(candidate.documentTitle);
    setSourceDocumentNumber(candidate.documentNumber || '');
    setSourceUrl(candidate.sourceUrl);

    if (!targetStart || !targetEnd) {
      setWorkflowStatus('REVIEWED');
      setResolutionStatus('PARTIALLY_RESOLVED');
      setResolutionMessage(`Sumber acuan ${candidate.authority} ditemukan, tetapi batas tanggal semester tidak dapat ditentukan secara terverifikasi. Silakan lengkapi tanggal secara manual.`);
      setSaveNotification(`Sumber acuan ditemukan — lengkapi tanggal Semester ${activeSem} secara manual di panel Tinjau.`);
      setTimeout(() => setSaveNotification(null), 4000);
      return;
    }

    setStartDate(targetStart);
    setEndDate(targetEnd);

    // Project structured events from candidate to CalendarDay[] with manual override precedence and national holiday overlay
    const candidateForProjection = candidate.sourceLevel === 'NATIONAL'
      ? { ...candidate, events: undefined }
      : candidate;

    const projectedDays = projectCandidateEventsToCalendarDays({
      candidate: candidateForProjection,
      startDate: targetStart,
      endDate: targetEnd,
      calendarId: calendar?.id || `cal-${academicSetting.id}`,
      existingDays: days,
      academicYear: academicSetting.academicYear || academicYear || candidate.academicYear,
    });
    setDays(projectedDays);

    const isComplete = schoolDaysPerWeek === 5 || schoolDaysPerWeek === 6;
    setWorkflowStatus('REVIEWED');
    setResolutionStatus(isComplete ? 'RESOLVED' : 'PARTIALLY_RESOLVED');
    setCalendarDraftDirty(true);

    setResolutionMessage(`Acuan kalender diambil dari ${candidate.authority} (${candidate.documentTitle}) - Semester ${activeSem}`);
    setSaveNotification(`Tanggal & agenda Semester ${activeSem} diisi dari acuan online — klik "Konfirmasi Kalender" untuk menetapkan.`);
    setTimeout(() => setSaveNotification(null), 4000);
  };

  // Step 3: MANUAL OVERRIDE
  const handleApplyOverride = (overrideUpdates?: Partial<AcademicCalendar>, updatedDays?: CalendarDay[]) => {
    const currentCal: AcademicCalendar = {
      id: calendar?.id || `cal-${academicSetting.id}`,
      academicSettingId: academicSetting.id,
      academicYear,
      semester: semester ? (semester === '1' ? '1 (Ganjil)' : '2 (Genap)') : '',
      startDate,
      endDate,
      schoolDaysPerWeek,
      sourceType: 'SCHOOL_OVERRIDE',
      sourceName: sourceName.trim() || undefined,
      sourceAuthority: sourceAuthority.trim() || undefined,
      sourceDocumentNumber: sourceDocumentNumber.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      sourceRegion: selectedProvince,
      workflowStatus: 'MANUAL_OVERRIDE',
      isOverridden: true,
      overrideReason: overrideReason.trim() || 'Penyesuaian tanggal / agenda oleh satuan pendidikan',
      jpPerWeek,
      updatedAt: new Date().toISOString(),
    };

    const targetDays = updatedDays || days;
    const res = applyManualCalendarOverride(
      currentCal,
      targetDays,
      overrideUpdates || {},
      targetDays
    );

    setIsOverridden(true);
    setWorkflowStatus('MANUAL_OVERRIDE');
    setCalendarDraftDirty(true);

    setSaveNotification('Penyesuaian diterapkan sebagai draf. Klik "Konfirmasi Kalender" untuk menyimpan.');
    setTimeout(() => setSaveNotification(null), 3000);
  };

  const handleGenerateEffectiveCalendar = () => {
    if (!startDate || !endDate || !(schoolDaysPerWeek === 5 || schoolDaysPerWeek === 6)) return;

    const generatedDays = generateEffectiveCalendarDays({
      startDate,
      endDate,
      schoolDaysPerWeek,
      calendarId: calendar?.id || `cal-${academicSetting.id}`,
      academicYear: academicSetting.academicYear || academicYear,
      existingDays: days,
      candidate: onlineDiscovery || undefined,
    });

    setDays(generatedDays);
    setCalendarDraftDirty(true);

    if (!onlineDiscovery || onlineDiscovery.sourceLevel === 'NATIONAL') {
      setWorkflowStatus('REVIEWED');
      setResolutionStatus('PARTIALLY_RESOLVED');
      setResolutionMessage(
        'Kalender kerja berhasil dibuat dari Default Perencanaan 2026/2027 dan Acuan Nasional. Silakan sesuaikan jika sekolah memiliki Kalender Pendidikan daerah yang lebih spesifik.'
      );
    } else {
      setWorkflowStatus('REVIEWED');
      setResolutionStatus('RESOLVED');
      setResolutionMessage('Kalender kerja berhasil dibuat dari sumber terverifikasi.');
    }

    setSaveNotification('Kalender kerja berhasil digenerate dan Hari/Minggu Efektif telah dihitung!');
    setTimeout(() => setSaveNotification(null), 3500);
  };

  // Step 4: CONFIRM
  const handleConfirmCalendar = () => {
    if (!startDate || !endDate || !schoolDaysPerWeek || (schoolDaysPerWeek !== 5 && schoolDaysPerWeek !== 6)) {
      setSaveNotification('Kalender belum dapat ditetapkan. Lengkapi tanggal mulai, tanggal akhir, dan hari sekolah per pekan.');
      setTimeout(() => setSaveNotification(null), 3500);
      return;
    }

    if (!hasGeneratedEffectiveCalendar) {
      setSaveNotification('Generate kalender dan hitung hari efektif terlebih dahulu.');
      setTimeout(() => setSaveNotification(null), 3500);
      return;
    }

    const currentCal: AcademicCalendar = {
      id: calendar?.id || `cal-${academicSetting.id}`,
      academicSettingId: academicSetting.id,
      academicYear,
      semester: semester ? (semester === '1' ? '1 (Ganjil)' : '2 (Genap)') : '',
      startDate,
      endDate,
      schoolDaysPerWeek,
      sourceType,
      sourceName: sourceName.trim() || undefined,
      sourceAuthority: sourceAuthority.trim() || undefined,
      sourceDocumentNumber: sourceDocumentNumber.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      sourceRegion: selectedProvince,
      workflowStatus: 'CONFIRMED',
      isOverridden,
      overrideReason: isOverridden ? overrideReason : undefined,
      jpPerWeek,
      updatedAt: new Date().toISOString(),
    };

    const finalDays = days;
    setDays(finalDays);

    const res = confirmCalendarWorkflow(currentCal, finalDays);
    setWorkflowStatus('CONFIRMED');
    onSaveCalendar(res.calendar, res.days);

    setSaveNotification('Kalender Pendidikan berhasil disimpan & ditetapkan untuk semester ini!');
    setTimeout(() => setSaveNotification(null), 3500);
  };

  // Reset to Official
  const handleResetToOfficial = () => {
    if (confirm('Kembalikan semua tanggal dan agenda ke Kalender Pendidikan Resmi Daerah? Modifikasi manual sekolah akan digantikan.')) {
      setCalendarDraftDirty(true);
      handleAutoResolve(true);
    }
  };

  // Day add/remove (Local draft state only)
  const handleAddDay = () => {
    if (!newDayDate) return;
    const newDay: CalendarDay = {
      id: `day-${Date.now()}`,
      academicCalendarId: calendar?.id || `cal-${academicSetting.id}`,
      date: newDayDate,
      status: newDayStatus,
      notes: newDayNotes || (newDayStatus === 'holiday' ? 'Hari Libur Sekolah' : 'Kegiatan Khusus Sekolah'),
      sourceType: 'SCHOOL_OVERRIDE',
      sourceName: school.name || 'Satuan Pendidikan',
      isOverridden: true,
      category: newDayStatus === 'holiday' ? 'OTHER' : 'SCHOOL_EVENT',
    };
    const cleanedDays = days.filter((d) => d.sourceLayer !== 'GENERATED_EFFECTIVE_BASELINE');
    const updatedDays = [...cleanedDays, newDay].sort((a, b) => a.date.localeCompare(b.date));
    setDays(updatedDays);
    setCalendarDraftDirty(true);
    setNewDayDate('');
    setNewDayNotes('');
    setIsOverridden(true);
    setWorkflowStatus('MANUAL_OVERRIDE');
  };

  const handleRemoveDay = (id: string) => {
    const cleanedDays = days.filter((d) => d.id !== id && d.sourceLayer !== 'GENERATED_EFFECTIVE_BASELINE');
    setDays(cleanedDays);
    setCalendarDraftDirty(true);
    setIsOverridden(true);
    setWorkflowStatus('MANUAL_OVERRIDE');
  };

  const handleResetToOfficialJP = () => {
    if (officialRule.weeklyJP) {
      setJpPerWeek(officialRule.weeklyJP);
    }
  };

  const handleUpdateAtpAllocation = (
    itemId: string,
    field: 'allocatedJP' | 'startWeek' | 'endWeek',
    value: number | null
  ) => {
    setAllocations((prev) => {
      const existingIndex = prev.findIndex(
        (a) =>
          (a.sourceType === 'ATP_ITEM' && a.sourceId === itemId) ||
          a.atpItemId === itemId ||
          a.sourceId === itemId
      );
      const existing = existingIndex >= 0 ? prev[existingIndex] : undefined;

      // Updating allocatedJP
      if (field === 'allocatedJP') {
        if (value === null || value === undefined || isNaN(value) || value <= 0) {
          // If JP is empty, 0, or invalid: remove allocation (unallocated)
          if (existingIndex >= 0) {
            return prev.filter((_, idx) => idx !== existingIndex);
          }
          return prev;
        }

        const defaultStart = existing?.startWeek ?? existing?.weekNumber ?? 1;
        const defaultEnd = existing?.endWeek ?? defaultStart;
        const newAlloc: TimeAllocation = {
          id: existing?.id || `alloc-${Date.now()}-${itemId}`,
          academicSettingId: academicSetting.id,
          sourceType: 'ATP_ITEM',
          sourceId: itemId,
          atpItemId: itemId,
          semester: semester ? (semester === '1' ? '1 (Ganjil)' : '2 (Genap)') : undefined,
          startWeek: defaultStart,
          endWeek: defaultEnd,
          weekNumber: defaultStart,
          jp: value,
          allocatedJP: value,
        };

        if (existingIndex >= 0) {
          const copy = [...prev];
          copy[existingIndex] = newAlloc;
          return copy;
        } else {
          return [...prev, newAlloc];
        }
      }

      // Updating startWeek
      if (field === 'startWeek') {
        if (!existing) {
          // Do not create allocation until JP is entered
          return prev;
        }
        const normalized = normalizeWeekRange(value, existing.endWeek, effectiveWeeks);

        const copy = [...prev];
        copy[existingIndex] = {
          ...existing,
          startWeek: normalized.startWeek,
          endWeek: normalized.endWeek,
          weekNumber: normalized.startWeek,
        };
        return copy;
      }

      // Updating endWeek
      if (field === 'endWeek') {
        if (!existing) {
          // Do not create allocation until JP is entered
          return prev;
        }
        const currentStart = existing.startWeek ?? existing.weekNumber ?? 1;
        const normalized = normalizeWeekRange(currentStart, value, effectiveWeeks);

        const copy = [...prev];
        copy[existingIndex] = {
          ...existing,
          endWeek: normalized.endWeek,
        };
        return copy;
      }

      return prev;
    });
  };

  const handleRemoveAtpAllocation = (itemId: string) => {
    setAllocations((prev) =>
      prev.filter(
        (a) =>
          !(
            (a.sourceType === 'ATP_ITEM' && a.sourceId === itemId) ||
            a.atpItemId === itemId ||
            a.sourceId === itemId
          )
      )
    );
  };

  const handleWeekChange = (itemId: string, week: number) => {
    setAllocations((prev) => {
      const existingIndex = prev.findIndex(
        (a) =>
          (a.sourceType === 'KD' && a.sourceId === itemId) ||
          a.sourceId === itemId ||
          a.atpItemId === itemId ||
          a.tpId === itemId
      );
      const defaultJP = jpPerWeek || 0;

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          weekNumber: week,
          startWeek: week,
          endWeek: week,
        };
        return updated;
      } else {
        const newAlloc: TimeAllocation = {
          id: `alloc-${Date.now()}-${itemId}`,
          academicSettingId: academicSetting.id,
          sourceType: 'KD',
          sourceId: itemId,
          semester: semester ? (semester === '1' ? '1 (Ganjil)' : '2 (Genap)') : undefined,
          weekNumber: week,
          startWeek: week,
          endWeek: week,
          jp: defaultJP,
          allocatedJP: defaultJP,
        };
        return [...prev, newAlloc];
      }
    });
  };

  const handleSaveAllocations = () => {
    if (!isK13Curriculum && !canonicalCapacity?.isReady) {
      setSaveNotification('Kalender semester dan JP Aktual harus disimpan terlebih dahulu sebelum pemetaan waktu disimpan.');
      setTimeout(() => setSaveNotification(null), 4000);
      return;
    }
    onSaveTimeAllocations(allocations);
    setSaveNotification('Pemetaan Alokasi Waktu Pembelajaran berhasil disimpan!');
    setTimeout(() => setSaveNotification(null), 3000);
  };

  // Readiness for automatic ATP allocation across Semester 1 & 2
  const autoAllocationReadiness = useMemo(() => {
    const hasAtpItems = Boolean(atp?.items && atp.items.length > 0);
    const atpCount = atp?.items?.length || 0;

    if (isK13Curriculum || !hasAtpItems) {
      return {
        isReady: false,
        s1Capacity: null,
        s2Capacity: null,
        sem1PlanId: null,
        sem2PlanId: null,
        s1CalReady: false,
        s1JPReady: false,
        s2CalReady: false,
        s2JPReady: false,
        hasAtpItems,
        atpCount,
        guidance: isK13Curriculum
          ? 'Kurikulum 2013 menggunakan pemetaan KD per pekan.'
          : 'Susun Alur Tujuan Pembelajaran (ATP) tahunan terlebih dahulu di Step 05.',
        disabledReason: isK13Curriculum
          ? 'Bukan Kurikulum Merdeka.'
          : 'Belum ada item ATP tahunan yang disusun.',
      };
    }

    try {
      const v5State = loadStorageV5();
      const yearPlanId = academicSetting.id
        ? (v5State.semesterPlans.find((sp) => sp.id === academicSetting.id)?.yearPlanId ||
            v5State.activeYearPlanId)
        : v5State.activeYearPlanId;

      const semesterPlans = yearPlanId
        ? v5State.semesterPlans.filter((sp) => sp.yearPlanId === yearPlanId)
        : v5State.semesterPlans;

      const sem1Plan = semesterPlans.find((sp) => sp.semester === 1);
      const sem2Plan = semesterPlans.find((sp) => sp.semester === 2);

      if (!sem1Plan || !sem2Plan) {
        return {
          isReady: false,
          s1Capacity: null,
          s2Capacity: null,
          sem1PlanId: null,
          sem2PlanId: null,
          s1CalReady: false,
          s1JPReady: false,
          s2CalReady: false,
          s2JPReady: false,
          hasAtpItems,
          atpCount,
          guidance: 'Lengkapi rencana Semester 1 dan Semester 2 pada struktur Tahun Ajaran aktif.',
          disabledReason: 'Rencana Semester 1 dan 2 belum lengkap pada Tahun Ajaran aktif.',
        };
      }

      // STRICTLY CANONICAL V5: No local unsaved overrides injected!
      const s1Cap = resolveSemesterCapacityV5(sem1Plan.id, v5State);
      const s2Cap = resolveSemesterCapacityV5(sem2Plan.id, v5State);

      const s1CalReady = Boolean(
        s1Cap?.isCalendarConfirmed &&
        s1Cap.effectiveLearningDays &&
        s1Cap.effectiveLearningDays > 0 &&
        s1Cap.effectiveWeekSlots &&
        s1Cap.effectiveWeekSlots > 0
      );
      const s1JPReady = Boolean(
        s1Cap?.actualScheduledWeeklyJP && s1Cap.actualScheduledWeeklyJP > 0
      );
      const s2CalReady = Boolean(
        s2Cap?.isCalendarConfirmed &&
        s2Cap.effectiveLearningDays &&
        s2Cap.effectiveLearningDays > 0 &&
        s2Cap.effectiveWeekSlots &&
        s2Cap.effectiveWeekSlots > 0
      );
      const s2JPReady = Boolean(
        s2Cap?.actualScheduledWeeklyJP && s2Cap.actualScheduledWeeklyJP > 0
      );

      let guidance = '';
      if (!s1CalReady) {
        guidance = 'Lengkapi dan tetapkan Kalender Semester 1 agar alokasi tahunan dapat dipartisi secara proporsional.';
      } else if (!s1JPReady) {
        guidance = 'Simpan JP Aktual Mapel untuk Semester 1.';
      } else if (!s2CalReady) {
        guidance = 'Lengkapi Kalender Semester 2 agar alokasi tahunan dapat dipartisi secara proporsional.';
      } else if (!s2JPReady) {
        guidance = 'Simpan JP Aktual Mapel untuk Semester 2.';
      } else {
        guidance = 'Semua prasyarat terpenuhi. Alokasi ATP tahunan siap dipartisi otomatis ke semester ini.';
      }

      const isReady = Boolean(
        hasAtpItems &&
        s1CalReady &&
        s1JPReady &&
        s2CalReady &&
        s2JPReady &&
        s1Cap.isReady &&
        s2Cap.isReady
      );

      return {
        isReady,
        s1Capacity: s1Cap,
        s2Capacity: s2Cap,
        sem1PlanId: sem1Plan.id,
        sem2PlanId: sem2Plan.id,
        s1CalReady,
        s1JPReady,
        s2CalReady,
        s2JPReady,
        hasAtpItems,
        atpCount,
        guidance,
        disabledReason: !isReady ? guidance : undefined,
      };
    } catch {
      return {
        isReady: false,
        s1Capacity: null,
        s2Capacity: null,
        sem1PlanId: null,
        sem2PlanId: null,
        s1CalReady: false,
        s1JPReady: false,
        s2CalReady: false,
        s2JPReady: false,
        hasAtpItems,
        atpCount,
        guidance: 'Lengkapi kalender dan JP aktual Semester 1 & 2 agar pembagian ATP tahunan dapat dihitung secara konsisten.',
        disabledReason:
          'Lengkapi kalender dan JP aktual Semester 1 & 2 agar pembagian ATP tahunan dapat dihitung secara konsisten.',
      };
    }
  }, [
    isK13Curriculum,
    atp,
    academicSetting.id,
    calendar,
    semesterJPSetting,
  ]);

  const handleAutoAllocate = () => {
    if (
      !autoAllocationReadiness.isReady ||
      !autoAllocationReadiness.s1Capacity ||
      !autoAllocationReadiness.s2Capacity ||
      !autoAllocationReadiness.sem1PlanId ||
      !autoAllocationReadiness.sem2PlanId
    ) {
      return;
    }

    // Determine target semester and exact semesterPlanId strictly from academicSetting.id and SemesterPlan
    let targetSem: '1' | '2' | null = null;
    let planId: string | null = null;

    if (academicSetting.id === autoAllocationReadiness.sem1PlanId) {
      targetSem = '1';
      planId = autoAllocationReadiness.sem1PlanId;
    } else if (academicSetting.id === autoAllocationReadiness.sem2PlanId) {
      targetSem = '2';
      planId = autoAllocationReadiness.sem2PlanId;
    } else {
      setSaveNotification('Gagal menyusun alokasi: identitas SemesterPlan tidak cocok dengan Semester 1 maupun Semester 2.');
      setTimeout(() => setSaveNotification(null), 3500);
      return;
    }

    // Fail closed guard: targetSem and planId MUST match consistently
    if (!targetSem || !planId) {
      setSaveNotification('Gagal menyusun alokasi: identitas SemesterPlan tidak konsisten.');
      setTimeout(() => setSaveNotification(null), 3500);
      return;
    }
    if (targetSem === '1' && planId !== autoAllocationReadiness.sem1PlanId) {
      setSaveNotification('Gagal menyusun alokasi: target semester 1 tidak cocok dengan semesterPlanId.');
      setTimeout(() => setSaveNotification(null), 3500);
      return;
    }
    if (targetSem === '2' && planId !== autoAllocationReadiness.sem2PlanId) {
      setSaveNotification('Gagal menyusun alokasi: target semester 2 tidak cocok dengan semesterPlanId.');
      setTimeout(() => setSaveNotification(null), 3500);
      return;
    }

    // Preserve non-ATP allocations (e.g. ASSESSMENT, RESERVE, etc.)
    const preservedNonAtpAllocations = allocations.filter(
      (a) => a.sourceType !== 'ATP_ITEM' && !a.atpItemId && a.sourceType !== 'KD'
    );
    const reservedNonAtpJP = preservedNonAtpAllocations.reduce(
      (sum, item) => sum + (Number(item.allocatedJP ?? item.jp) || 0),
      0
    );

    // Check if existing allocations already have ATP_ITEM allocations strictly by ATP identity
    const hasExistingAtp = allocations.some(
      (a) => a.sourceType === 'ATP_ITEM' || Boolean(a.atpItemId)
    );

    if (hasExistingAtp) {
      const confirmReplace =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(
              'Alokasi semester ini sudah memiliki perubahan. Susun ulang otomatis akan mengganti alokasi ATP semester ini. Lanjutkan?'
            )
          : true;
      if (!confirmReplace) {
        return;
      }
    }

    const autoResult = buildAutomaticSemesterAllocations({
      annualATPItems: atp?.items || [],
      targetSemester: targetSem,
      semesterPlanId: planId,
      reservedNonAtpJP,
      s1Capacity: autoAllocationReadiness.s1Capacity,
      s2Capacity: autoAllocationReadiness.s2Capacity,
    });

    if (autoResult.status === 'SUCCESS') {
      const updatedAllocations = [
        ...preservedNonAtpAllocations,
        ...autoResult.allocations,
      ];

      const targetCap =
        targetSem === '1'
          ? autoAllocationReadiness.s1Capacity
          : autoAllocationReadiness.s2Capacity;
      const canonicalAvailable = targetCap.availableJP ?? 0;
      const combinedValidation = validateTimeAllocations(updatedAllocations, canonicalAvailable);

      if (combinedValidation.status === 'OVER_ALLOCATED') {
        setSaveNotification(
          `Gagal menyusun alokasi otomatis: Total alokasi (${combinedValidation.totalAllocatedJP} JP) melebihi kapasitas tersedia (${canonicalAvailable} JP).`
        );
        setTimeout(() => setSaveNotification(null), 4000);
        return;
      }

      setAllocations(updatedAllocations);
      setSaveNotification(
        `Alokasi ATP Semester ${targetSem} berhasil disusun otomatis (${autoResult.allocations.length} materi, status: ${combinedValidation.statusLabel}). Periksa dan klik "Simpan Pemetaan Waktu" untuk menyimpan.`
      );
      setTimeout(() => setSaveNotification(null), 4500);
    } else {
      setSaveNotification(
        `Gagal menyusun alokasi otomatis: ${autoResult.message || 'Kapasitas tidak mencukupi'}`
      );
      setTimeout(() => setSaveNotification(null), 4000);
    }
  };

  const handleExportKalender = async () => {
    if (!semester) {
      alert('Semester belum ditetapkan. Pilih semester sebelum melanjutkan ekspor kalender.');
      return;
    }
    if (!startDate || !endDate || !schoolDaysPerWeek) {
      alert(
        'Kalender pendidikan belum lengkap. Lengkapi tanggal mulai, tanggal selesai, dan hari sekolah per pekan sebelum ekspor.'
      );
      return;
    }
    if (!hasGeneratedEffectiveCalendar) {
      alert('Generate kalender dan hitung hari efektif terlebih dahulu.');
      return;
    }
    setIsExporting('kalender');
    try {
      await generateKalenderAkademik({
        school,
        profile,
        academicSetting: {
          ...academicSetting,
          subjectWeeklyJP: jpPerWeek ?? undefined,
          hoursSourceType: isCustomJP ? 'USER_OVERRIDE' : 'REGULATION_STANDARDIZED',
        },
        calendar: {
          id: calendar?.id || `cal-${academicSetting.id}`,
          academicSettingId: academicSetting.id,
          academicYear,
          semester: semester === '1' ? '1 (Ganjil)' : '2 (Genap)',
          startDate,
          endDate,
          schoolDaysPerWeek,
          sourceType,
          sourceName: sourceName.trim() || undefined,
          sourceRegion: selectedProvince,
          jpPerWeek,
          workflowStatus,
          updatedAt: new Date().toISOString(),
        },
        calendarDays: days,
      });
    } catch (e: any) {
      alert(`Gagal mengekspor kalender: ${e.message}`);
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportAlokasi = async () => {
    if (!semester) {
      alert('Semester belum ditetapkan. Pilih semester sebelum melanjutkan ekspor alokasi waktu.');
      return;
    }
    if (!startDate || !endDate || !schoolDaysPerWeek) {
      alert('Kalender pendidikan belum lengkap. Lengkapi konfigurasi waktu sebelum ekspor alokasi waktu.');
      return;
    }
    if (!hasGeneratedEffectiveCalendar) {
      alert('Generate kalender dan hitung hari efektif terlebih dahulu.');
      return;
    }
    setIsExporting('alokasi');
    try {
      await generateAlokasiWaktu({
        school,
        profile,
        academicSetting: {
          ...academicSetting,
          subjectWeeklyJP: jpPerWeek ?? undefined,
          hoursSourceType: isCustomJP ? 'USER_OVERRIDE' : 'REGULATION_STANDARDIZED',
        },
        atp,
        calendar: {
          id: calendar?.id || `cal-${academicSetting.id}`,
          academicSettingId: academicSetting.id,
          academicYear,
          semester: semester === '1' ? '1 (Ganjil)' : '2 (Genap)',
          startDate,
          endDate,
          schoolDaysPerWeek,
          sourceType,
          sourceName: sourceName.trim() || undefined,
          sourceRegion: selectedProvince,
          jpPerWeek,
          workflowStatus,
          updatedAt: new Date().toISOString(),
        },
        timeAllocations: allocations,
      });
    } catch (e: any) {
      alert(`Gagal mengekspor alokasi waktu: ${e.message}`);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-6" id="time-planning-container">
      {saveNotification && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-3 animate-in fade-in duration-150">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">{saveNotification}</p>
        </div>
      )}

      {/* Top Banner & Context Info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2 text-indigo-700 font-semibold text-xs tracking-wider uppercase">
              <Clock className="w-4 h-4" />
              <span>Modul Perencanaan Waktu Pembelajaran Resmi</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              Kalender Pendidikan, Hari/Minggu Efektif, &amp; Alokasi JP
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Alur Kerja Terintegrasi: <strong>Auto Resolve → Review → Manual Override → Confirm</strong> untuk {academicSetting.subject} ({academicSetting.grade} - {academicSetting.level})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-export-kalender"
              type="button"
              onClick={handleExportKalender}
              disabled={isExporting === 'kalender' || !isEffectiveCalendarReady}
              title={!isEffectiveCalendarReady ? 'Generate kalender dan hitung hari efektif terlebih dahulu.' : 'Ekspor Kalender (.docx)'}
              className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                isEffectiveCalendarReady
                  ? 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-300'
                  : 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed'
              }`}
            >
              <FileDown className="w-4 h-4 text-indigo-600" />
              <span>{isExporting === 'kalender' ? 'Mengekspor...' : 'Ekspor Kalender (.docx)'}</span>
            </button>
            <button
              id="btn-export-alokasi"
              type="button"
              onClick={handleExportAlokasi}
              disabled={isExporting === 'alokasi' || !isEffectiveCalendarReady}
              title={!isEffectiveCalendarReady ? 'Generate kalender dan hitung hari efektif terlebih dahulu.' : 'Ekspor Alokasi Waktu (.docx)'}
              className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                isEffectiveCalendarReady
                  ? 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-300'
                  : 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed'
              }`}
            >
              <FileDown className="w-4 h-4 text-emerald-600" />
              <span>{isExporting === 'alokasi' ? 'Mengekspor...' : 'Ekspor Alokasi Waktu (.docx)'}</span>
            </button>
          </div>
        </div>

        {/* 4-STEP WORKFLOW STEPPER BAR */}
        <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-xl" id="calendar-workflow-stepper">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Status Alur Kalender:
            </span>
            <div className="flex items-center gap-2">
              {activeSemesterCalendarStatus === 'Tersimpan' && (
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Tersimpan (Kalender Terkonfirmasi &amp; Sah)
                </span>
              )}
              {activeSemesterCalendarStatus === 'Draf — belum ditetapkan' && (
                <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-bold flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                  Draf — belum ditetapkan
                </span>
              )}
              {activeSemesterCalendarStatus === 'Belum dibuat' && (
                <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Belum dibuat
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            {/* Step 1: CARI KALENDER */}
            <div
              className={`p-3 rounded-lg border transition-all ${
                workflowStatus === 'AUTO_RESOLVED' || workflowStatus === 'MANUAL_OVERRIDE' || workflowStatus === 'CONFIRMED'
                  ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px]">
                  1
                </span>
                <span>CARI KALENDER</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Pencarian AI Kaldik Wilayah (Kabupaten/Kota &amp; Provinsi)
              </p>
            </div>

            {/* Step 2: GENERATE EFEKTIF */}
            <div
              className={`p-3 rounded-lg border transition-all ${
                hasGeneratedEffectiveCalendar
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-bold'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[10px]">
                  2
                </span>
                <span>GENERATE EFEKTIF</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Hitung {effectiveWeeks ?? '-'} pekan &amp; {effectiveResult.effectiveLearningDays ?? '-'} hari efektif
              </p>
            </div>

            {/* Step 3: SESUAIKAN JIKA PERLU */}
            <div
              className={`p-3 rounded-lg border transition-all ${
                isCalendarConfigComplete
                  ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px]">
                  3
                </span>
                <span>SESUAIKAN JIKA PERLU</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Edit tanggal, hari sekolah &amp; agenda
              </p>
            </div>

            {/* Step 4: TETAPKAN */}
            <div
              className={`p-3 rounded-lg border transition-all ${
                workflowStatus === 'CONFIRMED'
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[10px]">
                  4
                </span>
                <span>TETAPKAN</span>
              </div>
              <p className="text-[11px] text-slate-600">
                {workflowStatus === 'CONFIRMED' ? 'Telah ditetapkan' : 'Simpan & tetapkan kalender semester'}
              </p>
            </div>
          </div>
        </div>

        {/* PROVENANCE & RESOLUTION TOOLBAR */}
        <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-indigo-950">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-800">Sumber Kaldik Wilayah:</span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-semibold text-[11px]">
                  {sourceAuthority || `Provinsi ${selectedProvince}`}
                </span>
                {sourceDocumentNumber && (
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-mono text-[10px]">
                    {sourceDocumentNumber}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[11px]">
                  Overlay SKB 3 Menteri
                </span>
              </div>
              <p className="text-slate-600 text-[11px]">
                {resolutionMessage || `Kalender tersinkronisasi berdasarkan wilayah sekolah (${selectedProvince}) dan tahun ajaran (${academicYear}).`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOverridden && (
              <button
                type="button"
                onClick={handleResetToOfficial}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-medium text-xs shadow-2xs transition-colors"
                title="Kembalikan ke Kalender Pendidikan Resmi Daerah"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Kembalikan ke Resmi</span>
              </button>
            )}

            <button
              id="btn-re-resolve-calendar"
              type="button"
              onClick={() => handleAutoResolve(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs shadow-2xs transition-colors"
              title="Jalankan Ulang Resolusi Otomatis"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Resolusi Otomatis</span>
            </button>

            {workflowStatus !== 'CONFIRMED' && (
              <button
                id="btn-confirm-calendar-workflow"
                type="button"
                onClick={handleConfirmCalendar}
                disabled={!isEffectiveCalendarReady}
                title={!isEffectiveCalendarReady ? 'Generate kalender dan hitung hari efektif terlebih dahulu.' : 'Simpan & Tetapkan Kalender'}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs shadow-2xs transition-colors ${
                  isEffectiveCalendarReady
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Simpan &amp; Tetapkan Kalender</span>
              </button>
            )}
          </div>
        </div>

        {/* EXPLICIT AI SEARCH STATUS BANNERS */}
        {isOnlineSearching && (
          <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2 text-xs text-indigo-800 animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
            <div>
              <p className="font-bold">Pencarian AI sedang berjalan</p>
              <p className="text-[11px] text-indigo-700">
                Mencari Kalender Pendidikan: {searchRegency || 'Kabupaten/Kota'} → {searchProvince || 'Provinsi'} → Acuan Nasional
              </p>
            </div>
          </div>
        )}

        {!isOnlineSearching && aiSearchStatus === 'SUCCESS' && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-lg flex items-center gap-2 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold">Pencarian AI berhasil</p>
              <p className="text-[11px] text-emerald-800">
                Sumber kalender ditemukan. Silakan tinjau sebelum digunakan.
              </p>
            </div>
          </div>
        )}

        {!isOnlineSearching && aiSearchStatus === 'NOT_FOUND' && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-2 text-xs text-amber-900">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <p className="font-bold">Pencarian selesai</p>
              <p className="text-[11px] text-amber-800">
                {onlineDiscovery?.sourceLevel === 'NATIONAL'
                  ? 'Sumber nasional ditemukan sebagai referensi, tetapi Kalender Pendidikan daerah belum ditemukan.'
                  : 'Sumber kalender yang dapat digunakan belum ditemukan.'}
              </p>
            </div>
          </div>
        )}

        {!isOnlineSearching && aiSearchStatus === 'ERROR' && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold">Pencarian AI gagal</p>
              <p className="text-[11px] text-rose-800">
                {onlineSearchError || 'Layanan pencarian tidak berhasil menyelesaikan pencarian. Data kalender belum diubah.'}
              </p>
            </div>
          </div>
        )}

        {/* ONLINE DISCOVERY CARD */}
        {onlineDiscovery && workflowStatus !== 'CONFIRMED' && (
          <div
            id="online-calendar-discovery-card"
            className="mt-4 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3 text-xs text-amber-950"
          >
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-900">
                    {onlineDiscovery.sourceLevel === 'NATIONAL'
                      ? 'Acuan Nasional — Diterapkan Otomatis'
                      : 'Hasil Pencarian — Sumber Acuan Ditemukan'}
                  </span>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-semibold text-[10px]">
                    {onlineDiscovery.sourceLevel}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-semibold text-[10px] border ${
                      onlineDiscovery.authorityType === 'OFFICIAL'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}
                  >
                    {onlineDiscovery.authorityType === 'OFFICIAL' ? 'Resmi' : 'Nonresmi — Harap Ditinjau'}
                  </span>
                </div>
                {onlineDiscovery.sourceLevel === 'NATIONAL' ? (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 border border-blue-300 font-bold rounded text-xs inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    Diterapkan Otomatis
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApplyOnlineCandidate(onlineDiscovery)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-xs transition-colors cursor-pointer"
                  >
                    Gunakan sebagai Acuan
                  </button>
                )}
              </div>

              {onlineDiscovery.sourceLevel === 'NATIONAL' && (
                <div className="p-2.5 bg-blue-50/90 border border-blue-200 rounded text-[11px] text-blue-950 font-medium space-y-0.5">
                  <p>Kalender pendidikan Kabupaten/Kota dan Provinsi belum ditemukan.</p>
                  <p>Data resmi nasional telah diterapkan otomatis sebagai data awal Semester {activeSem}.</p>
                </div>
              )}

              {onlineDiscovery.authorityType === 'NON_OFFICIAL' && (
                <div className="p-2 bg-amber-100/70 border border-amber-300 rounded text-[11px] text-amber-900 font-medium">
                  Sumber ini bukan situs resmi pemerintah. Data telah dicocokkan dengan wilayah dan tahun ajaran. Tinjau sumber sebelum mengonfirmasi kalender.
                </div>
              )}

              <div className="text-slate-700 text-[11px] space-y-0.5">
                <p>
                  <strong>Level Sumber:</strong> {onlineDiscovery.sourceLevel === 'REGENCY' ? 'KABUPATEN/KOTA' : onlineDiscovery.sourceLevel === 'PROVINCE' ? 'PROVINSI' : 'NASIONAL'}
                </p>
                <p>
                  <strong>Otoritas:</strong> {onlineDiscovery.authority}
                </p>
                <p>
                  <strong>Dokumen:</strong> {onlineDiscovery.documentTitle}
                  {onlineDiscovery.documentNumber ? ` (${onlineDiscovery.documentNumber})` : ''}
                </p>
                <p>
                  <strong>Semester Aktif:</strong> Semester {activeSem} ({activeSem === 1 ? 'Ganjil' : 'Genap'})
                </p>
                {onlineDiscovery.sourceLevel === 'NATIONAL' ? (
                  <p className="text-slate-600 italic">
                    Batas awal/akhir semester daerah belum tersedia dari sumber yang ditemukan. Agenda nasional tetap dapat digunakan sebagai acuan awal.
                  </p>
                ) : activeSemProjection.hasDates ? (
                  <p>
                    <strong>Batas Semester {activeSem}:</strong> {activeSemProjection.startDate} s/d {activeSemProjection.endDate}
                  </p>
                ) : (
                  <p className="text-amber-800 italic">
                    Sumber acuan ditemukan, tetapi batas tanggal semester tidak dapat ditentukan secara terverifikasi.
                    Silakan tinjau dokumen dan lengkapi tanggal secara manual.
                  </p>
                )}
                <p className="flex items-center gap-1">
                  <strong>Sumber Acuan:</strong>{' '}
                  <a
                    href={onlineDiscovery.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-700 underline font-mono inline-flex items-center gap-1 hover:text-indigo-900"
                  >
                    {onlineDiscovery.sourceUrl}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}

        {onlineDiagnostic && (
          <div className="mt-3 p-3.5 bg-slate-800 text-slate-100 rounded-xl text-xs space-y-2.5 font-mono shadow-xs border border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="font-bold text-indigo-200 font-sans">Diagnostik Pencarian Online</span>
              </div>
              <button
                type="button"
                onClick={handleCopyDiagnostic}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-sans text-[11px] font-semibold transition-colors"
              >
                {copiedDiagnostic ? 'Tersalin!' : 'Salin Diagnostik Kalender'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 block font-sans">Status / Reason:</span>
                <span className="font-bold text-amber-300">{onlineDiagnostic.reason}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">AI Configured:</span>
                <span className="font-semibold text-emerald-400">{onlineDiagnostic.aiConfigured ? 'YES' : 'NO'}</span>
              </div>
            </div>

            {onlineDiagnostic.stages && onlineDiagnostic.stages.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-slate-700 text-[11px]">
                <span className="text-slate-400 font-bold font-sans block">Rincian Tahap Pencarian:</span>
                {onlineDiagnostic.stages.map((st) => (
                  <div key={st.level} className="p-2 bg-slate-900/80 rounded border border-slate-700/60 font-mono text-[10px] space-y-1">
                    <div className="flex justify-between font-bold text-slate-200">
                      <span>[{st.level}]</span>
                      <span className="text-emerald-400">Accepted: {st.acceptedCandidateCount}</span>
                    </div>
                    <div className="text-slate-300">
                      Response: {st.responseReceived ? 'YES' : 'NO'} | Text: {st.textPresent ? 'YES' : 'NO'} | Grounding: {st.groundingSourceCount} | Resolved: {st.resolvedGroundingCount}
                    </div>
                    {st.modelAttempts && st.modelAttempts.length > 0 && (
                      <div className="text-slate-400 text-[9px] truncate">
                        Models: {st.modelAttempts.map(a => `${a.model} (${a.status}${a.errorCategory ? `:${a.errorCategory}` : ''})`).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <span className="text-xs font-medium text-slate-500 block">Minggu Efektif Semester</span>
            <span className="text-2xl font-bold text-slate-800 mt-1 block">
              {effectiveWeeks !== null ? `${effectiveWeeks} Pekan` : '-'}
            </span>
            <span className="text-xs text-slate-500">
              {effectiveResult.status === 'RESOLVED'
                ? `${effectiveResult.effectiveLearningDays} hari efektif (${effectiveResult.holidayDays} hari libur)`
                : 'Kalender belum dikonfigurasi'}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total JP Efektif Tersedia</span>
              {canonicalCapacity?.isReady ? (
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                  Tersimpan
                </span>
              ) : (
                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[10px]">
                  Draf
                </span>
              )}
            </div>
            <span className="text-2xl font-bold text-indigo-600 mt-1 block">
              {canonicalCapacity?.isReady
                ? `${canonicalCapacity.availableJP} JP`
                : totalAvailableJP !== null
                ? `${totalAvailableJP} JP (Draf)`
                : '-'}
            </span>
            <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
              {canonicalCapacity?.isReady
                ? `${canonicalCapacity.effectiveWeeks} pekan × ${canonicalCapacity.actualScheduledWeeklyJP} JP/pekan (Tersimpan)`
                : totalAvailableJP !== null
                ? `${effectiveWeeks} pekan × ${jpPerWeek} JP/pekan (Belum tersimpan)`
                : 'Menunggu pengaturan JP/minggu aktual.'}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <span className="text-xs font-medium text-slate-500 block">
              {isK13Curriculum ? 'Total Jam Materi (KD)' : 'Total Jam Materi (Semester)'}
            </span>
            <span className={`text-2xl font-bold mt-1 block ${totalPlannedJP !== null ? 'text-emerald-700' : 'text-slate-500 text-lg'}`}>
              {isK13Curriculum
                ? `${totalPlannedJP ?? 0} JP`
                : totalPlannedJP !== null
                ? `${totalPlannedJP} JP`
                : 'Belum dialokasikan'}
            </span>
            <span className="text-xs text-slate-500">
              {isK13Curriculum
                ? `Dari ${k13Analysis?.items?.length || 0} KD K13`
                : totalPlannedJP !== null
                ? `Dari ${allocations.length} Alokasi Waktu TP Semester`
                : 'Belum ada alokasi TP di semester ini'}
            </span>
          </div>

          <div
            className={`border rounded-xl p-4 ${
              !isK13Curriculum || jpDifference === null
                ? 'bg-slate-50 border-slate-200'
                : jpDifference < 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <span className="text-xs font-medium text-slate-600 block">Analisis Selisih Jam</span>
            <span
              className={`text-xl font-bold mt-1 block ${
                !isK13Curriculum || jpDifference === null
                  ? 'text-slate-500'
                  : jpDifference < 0
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }`}
            >
              {isK13Curriculum
                ? (jpDifference === null
                    ? 'Belum Dihitung'
                    : jpDifference === 0
                    ? 'Tepat Sesuai (0 JP)'
                    : jpDifference > 0
                    ? `+${jpDifference} JP Fleksibel`
                    : `${jpDifference} JP Defisit`)
                : 'Belum Dihitung'}
            </span>
            <span className="text-xs text-slate-500">
              {isK13Curriculum
                ? (jpDifference === null
                    ? 'Lengkapi konfigurasi kalender & JP'
                    : jpDifference === 0
                    ? 'Alokasi waktu pas dan terdistribusi'
                    : jpDifference > 0
                    ? 'Tersedia jam untuk penguatan / cadangan'
                    : 'Jam materi melebihi waktu efektif')
                : 'Alokasi ATP ke semester belum disusun.'}
            </span>
          </div>
        </div>

        {/* Detailed Explanation / Warning if discrepancy exists (K13 only) */}
        {isK13Curriculum && jpDifference !== null && jpDifference < 0 && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3 text-amber-900 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-950">Perhatian Alokasi Waktu: </span>
              Total Jam Pelajaran pada rancangan materi ({totalPlannedJP} JP) melebihi ketersediaan Jam
              Pembelajaran Efektif ({totalAvailableJP} JP) sebanyak {Math.abs(jpDifference)} JP. Saran:
              Rampingkan alokasi waktu per unit materi atau sesuaikan perkiraan pekan efektif pada
              kalender.
            </div>
          </div>
        )}

        {isK13Curriculum && jpDifference !== null && jpDifference > 0 && (
          <div className="mt-4 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-900 text-xs">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-emerald-950">
                Optimalisasi Selisih Waktu (+{jpDifference} JP):{' '}
              </span>
              Sisa jam efektif ini dapat dialokasikan untuk: (1) Asesmen Sumatif Akhir Semester, (2)
              Kegiatan Remedial &amp; Pengayaan terstruktur, (3) Penguatan Proyek/P5, atau (4) Cadangan
              waktu fleksibilitas agenda sekolah.
            </div>
          </div>
        )}
      </div>

      {/* Grid: Calendar Configuration & Days List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Search & Review Panels */}
        <div className="lg:col-span-5 space-y-6">
          {/* Panel 1: Cari Kalender Pendidikan */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-800 text-base">Cari Kalender Pendidikan</h3>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Kabupaten / Kota</label>
                  <input
                    type="text"
                    value={searchRegency}
                    placeholder="e.g. Kota Tangerang"
                    onChange={(e) => setSearchRegency(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Provinsi</label>
                  <input
                    type="text"
                    value={searchProvince}
                    placeholder="e.g. Banten"
                    onChange={(e) => {
                      setSearchProvince(e.target.value);
                      setSelectedProvince(e.target.value);
                    }}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Tahun Ajaran</label>
                <input
                  type="text"
                  readOnly
                  value={academicSetting.academicYear || academicYear}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded bg-slate-100 font-semibold text-slate-700 cursor-not-allowed"
                />
              </div>

              <button
                id="btn-ai-calendar-search-main"
                type="button"
                disabled={isOnlineSearching}
                onClick={() => handleAutoResolve(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isOnlineSearching ? 'animate-spin' : ''}`} />
                <span>{isOnlineSearching ? 'Mencari Kalender...' : (onlineDiscovery ? 'Cari Ulang dengan AI' : 'Cari Kalender dengan AI')}</span>
              </button>

              <p className="text-[11px] text-slate-500 italic text-center">
                AI akan mencari: {searchRegency || 'Kota Tangerang'} → {searchProvince || 'Banten'} → sumber nasional
              </p>
            </div>
          </div>

          {/* Panel 2: Tinjau Kalender Semester Aktif */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-base">Tinjau Kalender Semester Aktif</h3>
              </div>
              <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-semibold text-xs">
                Semester {academicSetting.semester || semester || '1'}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hari Sekolah / Pekan</label>
                <select
                  value={schoolDaysPerWeek ?? ''}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setSchoolDaysPerWeek(val);
                    const cleanedDays = days.filter((d) => d.sourceLayer !== 'GENERATED_EFFECTIVE_BASELINE');
                    setDays(cleanedDays);
                    setCalendarDraftDirty(true);
                    setIsOverridden(true);
                    setWorkflowStatus('MANUAL_OVERRIDE');
                  }}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
                >
                  <option value="">-- Pilih Hari Kerja --</option>
                  <option value={5}>5 Hari (Senin - Jumat)</option>
                  <option value={6}>6 Hari (Senin - Sabtu)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Mulai Semester</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStartDate(val);
                      const cleanedDays = days.filter((d) => d.sourceLayer !== 'GENERATED_EFFECTIVE_BASELINE');
                      setDays(cleanedDays);
                      setCalendarDraftDirty(true);
                      setIsOverridden(true);
                      setWorkflowStatus('MANUAL_OVERRIDE');
                    }}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Akhir Semester</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEndDate(val);
                      const cleanedDays = days.filter((d) => d.sourceLayer !== 'GENERATED_EFFECTIVE_BASELINE');
                      setDays(cleanedDays);
                      setCalendarDraftDirty(true);
                      setIsOverridden(true);
                      setWorkflowStatus('MANUAL_OVERRIDE');
                    }}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {(() => {
                const currentBaseline = resolvePlanningBaseline({
                  academicYear: academicSetting.academicYear || academicYear,
                  semester: semester || '1',
                  province: selectedProvince || school?.province,
                });
                return (
                  <p className="text-[11px] text-slate-500 italic mt-1">
                    {currentBaseline.isBaselineAvailable
                      ? `${currentBaseline.label} — dapat disesuaikan dengan Kalender Pendidikan daerah/sekolah.`
                      : currentBaseline.label}
                  </p>
                );
              })()}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">JP Aktual Mapel / Pekan</label>
                  {officialRule.isOfficial && officialRule.weeklyJP !== null && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      Acuan kurikulum: {officialRule.weeklyJP} JP/pekan
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Isi sesuai jadwal nyata mapel pada semester ini.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    id="input-actual-weekly-jp"
                    type="number"
                    min={1}
                    max={20}
                    value={jpPerWeek ?? ''}
                    placeholder="Masukkan JP"
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setJpPerWeek(val);
                    }}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-semibold text-indigo-900"
                  />
                  <button
                    id="btn-save-semester-jp"
                    type="button"
                    onClick={handleSaveJP}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                    title="Simpan JP Aktual"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan JP Aktual</span>
                  </button>
                </div>
              </div>

              {/* Monthly Breakdown Preview */}
              {effectiveResult?.monthlyBreakdown && effectiveResult.monthlyBreakdown.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                    Rincian Hari Efektif Bulanan (Review):
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    {effectiveResult.monthlyBreakdown.map((m) => (
                      <div key={m.monthName} className="p-2 bg-slate-50 rounded border border-slate-200">
                        <div className="font-semibold text-slate-800">{m.monthName}</div>
                        <div className="text-slate-500 text-[10px]">
                          {m.effectiveDays} HE / {m.effectiveWeeks} ME
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                id="btn-generate-effective-calendar"
                type="button"
                disabled={!startDate || !endDate || !(schoolDaysPerWeek === 5 || schoolDaysPerWeek === 6)}
                onClick={handleGenerateEffectiveCalendar}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Generate Kalender &amp; Hitung Efektif</span>
              </button>

              {hasGeneratedEffectiveCalendar && workflowStatus !== 'CONFIRMED' && (
                <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-emerald-950 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-900 block">Hari efektif berhasil dihitung.</span>
                      <span className="text-[11px] text-emerald-800">
                        Langkah berikutnya: <strong>Simpan &amp; Tetapkan Kalender</strong>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmCalendar}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs transition-colors shrink-0 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan &amp; Tetapkan Kalender</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Days & Special Events Manager (Manual Override & Provenance) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-800 text-base">Agenda Libur, Ujian, &amp; Penyesuaian Sekolah</h3>
                <p className="text-xs text-slate-500">
                  Kaldik Daerah + Overlay Libur SKB 3 Menteri + Override Satuan Pendidikan
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-500 font-medium">{days.length} entri tercatat</span>
          </div>

          {/* Add Day Input (Manual Override) */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 space-y-2">
            <span className="text-xs font-semibold text-slate-700 block">
              Tambah Penyesuaian Tanggal Libur / Agenda Sekolah:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="date"
                value={newDayDate}
                onChange={(e) => setNewDayDate(e.target.value)}
                className="sm:col-span-4 text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              />
              <select
                value={newDayStatus}
                onChange={(e) => setNewDayStatus(e.target.value as CalendarDay['status'])}
                className="sm:col-span-3 text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white font-medium"
              >
                <option value="holiday">Hari Libur</option>
                <option value="schoolEvent">Kegiatan Sekolah</option>
                <option value="effective">Hari Efektif</option>
              </select>
              <input
                type="text"
                value={newDayNotes}
                onChange={(e) => setNewDayNotes(e.target.value)}
                placeholder="Keterangan (cth: PTS / Libur Khusus Sekolah)"
                className="sm:col-span-4 text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              />
              <button
                type="button"
                onClick={handleAddDay}
                className="sm:col-span-1 inline-flex items-center justify-center p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                title="Tambah"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Days Table List */}
          <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Tanggal</th>
                  <th className="py-2 px-3">Jenis</th>
                  <th className="py-2 px-3">Keterangan</th>
                  <th className="py-2 px-3">Sumber</th>
                  <th className="py-2 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {days.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      Belum ada tanggal libur atau agenda khusus ditambahkan. Klik <em>Resolusi Otomatis</em> di atas untuk mengisi kalender resmi.
                    </td>
                  </tr>
                ) : (
                  days.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">{d.date}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            d.status === 'holiday'
                              ? 'bg-rose-100 text-rose-700'
                              : d.status === 'schoolEvent'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {d.status === 'holiday'
                            ? 'Libur'
                            : d.status === 'schoolEvent'
                            ? 'Kegiatan'
                            : 'Efektif'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700 font-medium">{d.notes || '-'}</td>
                      <td className="py-2 px-3 text-[10px] text-slate-500 whitespace-nowrap">
                        {d.sourceType === 'NATIONAL_HOLIDAY_OVERLAY' ? (
                          <span className="text-blue-600 font-medium">SKB 3 Menteri</span>
                        ) : d.sourceType === 'SCHOOL_OVERRIDE' || d.isOverridden ? (
                          <span className="text-amber-700 font-medium">Sekolah (Override)</span>
                        ) : (
                          <span className="text-indigo-600 font-medium">Kaldik Disdik</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveDay(d.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom: Weekly Time Allocations mapped to ATP / K13 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                {isK13Curriculum
                  ? 'Pemetaan Pekan Pembelajaran per Kompetensi Dasar (K13)'
                  : 'Pemetaan Pekan Pembelajaran per TP (Alur Tujuan Pembelajaran)'}
              </h3>
              <p className="text-xs text-slate-500">
                Distribusikan urutan pekan mengajar efektif (
                {effectiveWeeks !== null ? `${effectiveWeeks} pekan` : 'belum ditentukan'}) untuk setiap
                unit materi
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isK13Curriculum && (
              <div className="relative group">
                <button
                  id="btn-auto-allocate-time"
                  type="button"
                  disabled={!autoAllocationReadiness.isReady}
                  onClick={handleAutoAllocate}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    autoAllocationReadiness.isReady
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 cursor-pointer shadow-xs active:scale-95'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span>Susun Alokasi Semester {activeSemester} dari ATP Tahunan</span>
                </button>

                {!autoAllocationReadiness.isReady && autoAllocationReadiness.disabledReason && (
                  <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-2.5 bg-slate-900 text-white text-[11px] leading-relaxed rounded-lg shadow-xl z-50 pointer-events-none">
                    <div className="font-semibold text-amber-300 mb-0.5">Syarat Susun Alokasi Otomatis:</div>
                    {autoAllocationReadiness.disabledReason}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col items-end">
              <button
                id="btn-save-time-allocations"
                type="button"
                disabled={!isSaveTimeAllocationEnabled}
                onClick={handleSaveAllocations}
                title={
                  !isSaveTimeAllocationEnabled
                    ? 'Kalender semester dan JP Aktual harus disimpan terlebih dahulu sebelum pemetaan waktu disimpan.'
                    : 'Simpan Pemetaan Waktu'
                }
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
                  isSaveTimeAllocationEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>Simpan Pemetaan Waktu</span>
              </button>
              {!isSaveTimeAllocationEnabled && !isK13Curriculum && (
                <span className="text-[11px] text-amber-700 font-medium mt-1 text-right">
                  Kalender semester dan JP Aktual harus disimpan terlebih dahulu sebelum pemetaan waktu disimpan.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Kurikulum Merdeka: Auto-Allocation Readiness Checklist Card */}
        {!isK13Curriculum && (
          <div className="mb-5 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="font-bold text-slate-800">
                  Status Kesiapan Partisi ATP Tahunan (S1 &amp; S2):
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded text-[11px] font-bold border ${
                  autoAllocationReadiness.isReady
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}
              >
                {autoAllocationReadiness.isReady ? 'Siap Dipartisi' : 'Prasyarat Belum Lengkap'}
              </span>
            </div>

            {/* Status Checklist: S1 Calendar, S1 JP, S2 Calendar, S2 JP, ATP items */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                {autoAllocationReadiness.s1CalReady ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div className="truncate">
                  <span className="text-slate-500 block text-[10px]">Kalender S1</span>
                  <span className="font-semibold text-slate-800">
                    {autoAllocationReadiness.s1CalReady ? 'Tersimpan' : (activeSemester === '1' && hasGeneratedEffectiveCalendar ? 'Draf' : 'Belum dibuat')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                {autoAllocationReadiness.s1JPReady ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div className="truncate">
                  <span className="text-slate-500 block text-[10px]">JP S1</span>
                  <span className="font-semibold text-slate-800">{autoAllocationReadiness.s1JPReady ? 'Siap' : 'Belum'}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                {autoAllocationReadiness.s2CalReady ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div className="truncate">
                  <span className="text-slate-500 block text-[10px]">Kalender S2</span>
                  <span className="font-semibold text-slate-800">
                    {autoAllocationReadiness.s2CalReady ? 'Tersimpan' : (activeSemester === '2' && hasGeneratedEffectiveCalendar ? 'Draf' : 'Belum dibuat')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                {autoAllocationReadiness.s2JPReady ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div className="truncate">
                  <span className="text-slate-500 block text-[10px]">JP S2</span>
                  <span className="font-semibold text-slate-800">{autoAllocationReadiness.s2JPReady ? 'Siap' : 'Belum'}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                {autoAllocationReadiness.hasAtpItems ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div className="truncate">
                  <span className="text-slate-500 block text-[10px]">Total TP/ATP</span>
                  <span className="font-semibold text-slate-800">{autoAllocationReadiness.hasAtpItems ? `${autoAllocationReadiness.atpCount} TP` : 'Kosong'}</span>
                </div>
              </div>
            </div>

            {/* Canonical Capacity Display for Semester 1 & Semester 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-200/80 text-[11px]">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Semester 1</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${autoAllocationReadiness.s1CalReady && autoAllocationReadiness.s1JPReady ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {autoAllocationReadiness.s1CalReady && autoAllocationReadiness.s1JPReady ? 'Tersimpan' : 'Belum Lengkap'}
                  </span>
                </div>
                <div className="text-slate-600 space-y-0.5">
                  <p>Kalender: <strong className={autoAllocationReadiness.s1CalReady ? 'text-emerald-700' : (activeSemester === '1' && hasGeneratedEffectiveCalendar ? 'text-amber-700' : 'text-slate-500')}>{activeSemester === '1' ? activeSemesterCalendarStatus : (autoAllocationReadiness.s1CalReady ? 'Tersimpan' : 'Belum dibuat')}</strong></p>
                  <p>JP Tersimpan: <strong className={autoAllocationReadiness.s1JPReady ? 'text-emerald-700' : 'text-slate-500'}>{autoAllocationReadiness.s1JPReady && autoAllocationReadiness.s1Capacity?.actualScheduledWeeklyJP ? `${autoAllocationReadiness.s1Capacity.actualScheduledWeeklyJP} JP/pekan` : 'Belum disimpan'}</strong></p>
                  <p>Kapasitas: <strong className={autoAllocationReadiness.s1Capacity?.availableJP ? 'text-indigo-700' : 'text-slate-400'}>{autoAllocationReadiness.s1Capacity?.availableJP ? `${autoAllocationReadiness.s1Capacity.availableJP} JP` : 'Belum tersedia'}</strong></p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Semester 2</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${autoAllocationReadiness.s2CalReady && autoAllocationReadiness.s2JPReady ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {autoAllocationReadiness.s2CalReady && autoAllocationReadiness.s2JPReady ? 'Tersimpan' : 'Belum Lengkap'}
                  </span>
                </div>
                <div className="text-slate-600 space-y-0.5">
                  <p>Kalender: <strong className={autoAllocationReadiness.s2CalReady ? 'text-emerald-700' : (activeSemester === '2' && hasGeneratedEffectiveCalendar ? 'text-amber-700' : 'text-slate-500')}>{activeSemester === '2' ? activeSemesterCalendarStatus : (autoAllocationReadiness.s2CalReady ? 'Tersimpan' : 'Belum dibuat')}</strong></p>
                  <p>JP Tersimpan: <strong className={autoAllocationReadiness.s2JPReady ? 'text-emerald-700' : 'text-slate-500'}>{autoAllocationReadiness.s2JPReady && autoAllocationReadiness.s2Capacity?.actualScheduledWeeklyJP ? `${autoAllocationReadiness.s2Capacity.actualScheduledWeeklyJP} JP/pekan` : 'Belum disimpan'}</strong></p>
                  <p>Kapasitas: <strong className={autoAllocationReadiness.s2Capacity?.availableJP ? 'text-indigo-700' : 'text-slate-400'}>{autoAllocationReadiness.s2Capacity?.availableJP ? `${autoAllocationReadiness.s2Capacity.availableJP} JP` : 'Belum tersedia'}</strong></p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 font-medium">
              Pembagian ATP tahunan menggunakan kapasitas tersimpan Semester 1 dan Semester 2.
            </p>

            {/* Direct guidance */}
            {autoAllocationReadiness.guidance && (
              <p className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-0.5">
                <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span><strong>Petunjuk:</strong> {autoAllocationReadiness.guidance}</span>
              </p>
            )}
          </div>
        )}

        {isK13Curriculum ? (
          /* K13 Table Mapping */
          !k13Analysis?.items || k13Analysis.items.length === 0 ? (
            <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <p className="text-sm">Belum ada Analisis KD K13 yang disusun pada alur K13.</p>
              <p className="text-xs text-slate-400 mt-1">
                Silakan susun Analisis KD K13 terlebih dahulu agar materi otomatis terhubung di sini.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">No</th>
                    <th className="py-2.5 px-3 w-28">Kompetensi Dasar (KD)</th>
                    <th className="py-2.5 px-3">Indikator &amp; Ruang Lingkup Materi</th>
                    <th className="py-2.5 px-3 w-24 text-center">Alokasi JP</th>
                    <th className="py-2.5 px-3 w-40 text-center">Penempatan Pekan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {k13Analysis.items.map((item, index) => {
                    const matchedAlloc = allocations.find(
                      (a) =>
                        (a.sourceType === 'KD' && a.sourceId === item.id) ||
                        a.sourceId === item.id ||
                        a.atpItemId === item.id ||
                        a.tpId === item.id
                    );
                    const defaultWeek = effectiveWeeks
                      ? Math.min(effectiveWeeks, index + 1)
                      : index + 1;
                    const currentWeek = matchedAlloc?.weekNumber || defaultWeek;
                    const displayJP =
                      matchedAlloc?.allocatedJP ??
                      matchedAlloc?.jp ??
                      (item.alokasiJp ? Number(item.alokasiJp) : null);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 text-center font-medium text-slate-500">
                          {index + 1}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-indigo-700">{item.kd}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-800">
                            {item.indikator || item.materi}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Materi Pokok: {item.materi || '-'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                          {displayJP !== null ? `${displayJP} JP` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <select
                            value={currentWeek}
                            onChange={(e) => handleWeekChange(item.id, Number(e.target.value))}
                            className="text-xs px-2 py-1.5 border border-slate-300 rounded bg-white text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          >
                            {effectiveWeeks && effectiveWeeks > 0 ? (
                              Array.from({ length: effectiveWeeks }, (_, i) => i + 1).map((w) => (
                                <option key={w} value={w}>
                                  Pekan ke-{w}
                                </option>
                              ))
                            ) : (
                              <option value={currentWeek}>Pekan ke-{currentWeek}</option>
                            )}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Kurikulum Merdeka ATP Table Mapping */
          !atp?.items || atp.items.length === 0 ? (
            <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <p className="text-sm">
                Belum ada Alur Tujuan Pembelajaran (ATP) yang dibuat pada Step 05.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Silakan susun ATP terlebih dahulu agar materi otomatis terhubung di sini.
              </p>
            </div>
          ) : (
            <div>
              {/* Capacity Validation Summary Card */}
              {(() => {
                const available = totalAvailableJP ?? 0;
                const validation = validateTimeAllocations(allocations, available);
                const hasAvailableJP = totalAvailableJP !== null && totalAvailableJP > 0;
                const totalAllocated = validation.totalAllocatedJP;
                const isOverAllocated = hasAvailableJP && totalAllocated > available;
                const isBalanced = hasAvailableJP && totalAllocated === available && totalAllocated > 0;
                const isUnderAllocated = hasAvailableJP && totalAllocated > 0 && totalAllocated < available;
                const isUnallocated = totalAllocated === 0;

                let statusBadgeText = 'Belum Dialokasikan';
                let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-300';

                if (!hasAvailableJP) {
                  statusBadgeText =
                    totalAllocated > 0
                      ? `${totalAllocated} JP Dialokasikan`
                      : 'Belum Dialokasikan';
                  statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
                } else if (isUnallocated) {
                  statusBadgeText = 'Belum Dialokasikan';
                  statusBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                } else if (isBalanced) {
                  statusBadgeText = 'Seimbang';
                  statusBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                } else if (isOverAllocated) {
                  statusBadgeText = 'Melebihi Kapasitas';
                  statusBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
                } else if (isUnderAllocated) {
                  statusBadgeText = 'Tersedia Cadangan';
                  statusBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
                }

                return (
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium block">JP Tersedia:</span>
                        <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                          {hasAvailableJP ? `${available} JP` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block">JP Dialokasikan:</span>
                        <span
                          className={`font-bold text-sm mt-0.5 block ${
                            totalAllocated > 0 ? 'text-indigo-700' : 'text-slate-500'
                          }`}
                        >
                          {totalAllocated > 0 ? `${totalAllocated} JP` : '0 JP'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block">Sisa:</span>
                        <span
                          className={`font-bold text-sm mt-0.5 block ${
                            !hasAvailableJP
                              ? 'text-slate-400'
                              : isOverAllocated
                              ? 'text-rose-600'
                              : isBalanced
                              ? 'text-emerald-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {hasAvailableJP
                            ? `${validation.remainingJP > 0 ? `+${validation.remainingJP}` : validation.remainingJP} JP`
                            : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block">Status:</span>
                        <span
                          className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${statusBadgeClass}`}
                        >
                          {statusBadgeText}
                        </span>
                      </div>
                    </div>

                    {isOverAllocated && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-900">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-rose-950">Peringatan Kapasitas Waktu: </span>
                          Total alokasi waktu ({totalAllocated} JP) melebihi kapasitas jam efektif tersedia ({available} JP) sebesar {Math.abs(validation.remainingJP)} JP.
                          Silakan sesuaikan alokasi JP pada baris materi di bawah agar seimbang sebelum menyimpan.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-3 w-24">Kode TP</th>
                      <th className="py-2.5 px-3">Tujuan Pembelajaran &amp; Ruang Lingkup Materi</th>
                      <th className="py-2.5 px-3 w-28 text-center">Alokasi JP</th>
                      <th className="py-2.5 px-3 w-28 text-center">Pekan Mulai</th>
                      <th className="py-2.5 px-3 w-28 text-center">Pekan Selesai</th>
                      <th className="py-2.5 px-3 w-36 text-center">Status Alokasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(atp.items || []).map((item, index) => {
                      const matchedAlloc = allocations.find(
                        (a) =>
                          (a.sourceType === 'ATP_ITEM' && a.sourceId === item.id) ||
                          a.atpItemId === item.id ||
                          a.sourceId === item.id
                      );
                      const isAllocated = Boolean(
                        matchedAlloc &&
                          matchedAlloc.allocatedJP !== undefined &&
                          matchedAlloc.allocatedJP !== null &&
                          matchedAlloc.allocatedJP > 0
                      );
                      const currentJP = isAllocated
                        ? (matchedAlloc?.allocatedJP ?? matchedAlloc?.jp ?? '')
                        : '';
                      const startW = matchedAlloc?.startWeek ?? matchedAlloc?.weekNumber ?? 1;
                      const endW = matchedAlloc?.endWeek ?? startW;
                      const maxWeeks = effectiveWeeks && effectiveWeeks > 0 ? effectiveWeeks : 18;

                      return (
                        <tr
                          key={item.id}
                          className={
                            isAllocated ? 'hover:bg-slate-50/80 bg-emerald-50/20' : 'hover:bg-slate-50/80'
                          }
                        >
                          <td className="py-2.5 px-3 text-center font-medium text-slate-500">
                            {index + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-indigo-700">
                            {item.tpCode || `TP.${index + 1}`}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-800">
                              {item.tpStatement || item.competency}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Lingkup Materi: {item.materialScope || item.contentScope || item.subMaterial || '-'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={currentJP}
                                placeholder="0"
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : null;
                                  handleUpdateAtpAllocation(item.id, 'allocatedJP', val);
                                }}
                                className={`w-16 text-xs px-2 py-1 border rounded text-center font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                  isAllocated
                                    ? 'border-indigo-400 bg-white text-indigo-900 ring-1 ring-indigo-200'
                                    : 'border-slate-300 bg-slate-50 text-slate-500'
                                }`}
                              />
                              <span className="text-[11px] text-slate-500 font-medium">JP</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <select
                              disabled={!isAllocated}
                              value={startW}
                              onChange={(e) =>
                                handleUpdateAtpAllocation(item.id, 'startWeek', Number(e.target.value))
                              }
                              className={`text-xs px-2 py-1.5 border rounded font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                isAllocated
                                  ? 'border-slate-300 bg-white text-slate-800 cursor-pointer'
                                  : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              {Array.from({ length: maxWeeks }, (_, i) => i + 1).map((w) => (
                                <option key={w} value={w}>
                                  Pekan {w}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <select
                              disabled={!isAllocated}
                              value={endW}
                              onChange={(e) =>
                                handleUpdateAtpAllocation(item.id, 'endWeek', Number(e.target.value))
                              }
                              className={`text-xs px-2 py-1.5 border rounded font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                isAllocated
                                  ? 'border-slate-300 bg-white text-slate-800 cursor-pointer'
                                  : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              {Array.from({ length: maxWeeks }, (_, i) => i + 1)
                                .filter((w) => w >= startW)
                                .map((w) => (
                                  <option key={w} value={w}>
                                    Pekan {w}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isAllocated ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded font-semibold text-[10px]">
                                  {startW === endW ? `Pekan ${startW}` : `Pekan ${startW}-${endW}`} ({matchedAlloc.allocatedJP} JP)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAtpAllocation(item.id)}
                                  title="Hapus Alokasi TP ini"
                                  className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-medium">
                                Belum dialokasikan
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
