import {
  OFFICIAL_NATIONAL_HOLIDAYS,
  OFFICIAL_NATIONAL_HOLIDAY_SOURCES,
} from '../data/calendar/nationalHolidays';

export type CalendarSourceAuthorityType =
  | 'OFFICIAL'
  | 'NON_OFFICIAL';

/**
 * Canonical hierarchy for calendar provenance level.
 * Single canonical vocabulary representing governance scopes.
 */
export type CalendarSourceLevel =
  | 'REGENCY'
  | 'PROVINCE'
  | 'NATIONAL';

/**
 * Calendar verification state for external candidates.
 */
export type CalendarVerificationStatus =
  | 'VERIFIED'
  | 'PARTIAL'
  | 'UNVERIFIED';

/**
 * Search criteria for calendar resolution.
 */
export interface CalendarSearchRequest {
  academicYear: string;
  province?: string;
  regency?: string;
}

export interface CalendarSourceEvent {
  name: string;
  startDate: string;
  endDate?: string;
  category?:
    | 'HOLIDAY'
    | 'SEMESTER_BREAK'
    | 'MID_SEMESTER_BREAK'
    | 'ASSESSMENT'
    | 'SCHOOL_EVENT'
    | 'OTHER';
}

/**
 * Data contract for a discovered or referenced calendar source candidate.
 */
export interface CalendarSourceCandidate {
  sourceLevel: CalendarSourceLevel;
  authorityType?: CalendarSourceAuthorityType;
  confidence?: 'HIGH' | 'MEDIUM';

  province?: string;
  regency?: string;

  academicYear: string;

  authority: string;
  documentTitle: string;
  documentNumber?: string;

  sourceUrl: string;

  publicationDate?: string;
  effectiveDate?: string;

  // Annual semester boundaries
  semester1StartDate?: string;
  semester1EndDate?: string;
  semester2StartDate?: string;
  semester2EndDate?: string;

  // Legacy / fallback semester boundaries
  semesterStartDate?: string;
  semesterEndDate?: string;

  // Extracted structured events / agenda / holidays from verified source
  events?: CalendarSourceEvent[];

  verificationStatus: CalendarVerificationStatus;

  retrievedAt: string;
}

/**
 * Standardized diagnostic reason categories for calendar search observability.
 */
export type CalendarSearchDiagnosticReason =
  | 'SUCCESS'
  | 'NO_API_KEY'
  | 'MODEL_FAILURE'
  | 'EMPTY_RESPONSE'
  | 'NO_GROUNDING'
  | 'GROUNDING_RESOLUTION_FAILED'
  | 'CANDIDATE_REJECTED'
  | 'NO_OFFICIAL_SOURCE';

export interface CalendarModelAttemptDiagnostic {
  model: string;
  status: 'SUCCESS' | 'ERROR';
  errorCategory?: string;
}

export interface CalendarStageDiagnostic {
  level: CalendarSourceLevel;
  modelAttempts: CalendarModelAttemptDiagnostic[];
  responseReceived: boolean;
  textPresent: boolean;
  rawCandidateCount: number;
  groundingSourceCount: number;
  resolvedGroundingCount: number;
  acceptedCandidateCount: number;
  discoveredUrlCount?: number;
  fetchedUrlCount?: number;
}

export interface CalendarSearchDiagnostic {
  aiConfigured: boolean;
  reason: CalendarSearchDiagnosticReason;
  stages: CalendarStageDiagnostic[];
}

export interface CalendarSearchResultWithDiagnostics {
  candidates: CalendarSourceCandidate[];
  diagnostic: CalendarSearchDiagnostic;
}

/**
 * Resolution status representing completeness and reliability of resolved calendar.
 */
export type CalendarProviderStatus =
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'UNRESOLVED';

/**
 * Complete outcome of a calendar provider search or resolution process.
 */
export interface CalendarProviderResolution {
  status: CalendarProviderStatus;
  selectedSource?: CalendarSourceCandidate;
  candidates: CalendarSourceCandidate[];
  resolvedLevel?: CalendarSourceLevel;
  message?: string;
  diagnostic?: CalendarSearchDiagnostic;
}

/**
 * Pure interface for calendar data provider services.
 * Real search/network engines must implement this interface without modifying domain caller contracts.
 */
export interface CalendarDataProvider {
  search(
    request: CalendarSearchRequest
  ): Promise<CalendarSourceCandidate[]>;

  searchWithDiagnostics?(
    request: CalendarSearchRequest
  ): Promise<CalendarSearchResultWithDiagnostics>;
}

/**
 * Canonical ordering priority for calendar source levels.
 * Smaller value = higher priority.
 * REGENCY (1) > PROVINCE (2) > NATIONAL (3)
 */
export function getCalendarSourcePriority(
  level: CalendarSourceLevel
): number {
  switch (level) {
    case 'REGENCY':
      return 1;
    case 'PROVINCE':
      return 2;
    case 'NATIONAL':
      return 3;
    default:
      return 999;
  }
}

/**
 * Normalizes administrative region names for tolerant string matching.
 * Preserves the distinction between 'kabupaten' and 'kota' while standardizing abbreviation variants.
 * Removes 'provinsi' prefix for province names.
 */
export function normalizeRegionName(value?: string): string {
  if (!value) return '';
  let str = value.trim().toLowerCase().replace(/\s+/g, ' ');

  // Standardize province prefixes: remove 'provinsi', 'prov.', 'prov '
  str = str
    .replace(/^provinsi\s+/i, '')
    .replace(/^prov\.\s*/i, '')
    .replace(/^prov\s+/i, '');

  // Standardize regency prefixes to canonical 'kabupaten '
  if (/^kabupaten\s+/i.test(str)) {
    str = 'kabupaten ' + str.replace(/^kabupaten\s+/i, '');
  } else if (/^kab\.\s*/i.test(str)) {
    str = 'kabupaten ' + str.replace(/^kab\.\s*/i, '');
  } else if (/^kab\s+/i.test(str)) {
    str = 'kabupaten ' + str.replace(/^kab\s+/i, '');
  }

  // Standardize city prefixes
  if (/^kota\.\s*/i.test(str)) {
    str = 'kota ' + str.replace(/^kota\.\s*/i, '');
  }

  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Classifies whether a calendar source URL is OFFICIAL (*.go.id) or NON_OFFICIAL.
 */
export function classifyCalendarSourceAuthority(
  sourceUrl?: string
): CalendarSourceAuthorityType {
  if (!sourceUrl || typeof sourceUrl !== 'string') return 'NON_OFFICIAL';
  try {
    const parsed = new URL(sourceUrl.trim());
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.endsWith('.go.id') || hostname === 'go.id') {
      return 'OFFICIAL';
    }
  } catch {
    // ignore
  }
  return 'NON_OFFICIAL';
}

/**
 * Validates whether a calendar source URL is safe to fetch:
 * HTTPS, valid URL, not private IP/localhost/loopback, not javascript/data.
 */
export function isSafeCalendarSourceUrl(sourceUrl?: string): boolean {
  if (!sourceUrl || typeof sourceUrl !== 'string') return false;
  const trimmed = sourceUrl.trim();
  if (!trimmed.startsWith('https://')) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname.includes(' ') || !hostname.includes('.')) return false;

    // Reject localhost, local domain, or private/loopback IPs
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    if (trimmed.includes('javascript:') || trimmed.includes('data:') || trimmed.includes('vbscript:')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a candidate possesses basic validity and required provenance.
 * Source URL, authority, academicYear are mandatory; UNVERIFIED status is discarded.
 */
export function isUsableCalendarCandidate(
  candidate: CalendarSourceCandidate
): boolean {
  if (!candidate) return false;
  if (!candidate.sourceUrl || candidate.sourceUrl.trim() === '') return false;
  if (!candidate.authority || candidate.authority.trim() === '') return false;
  if (!candidate.academicYear || candidate.academicYear.trim() === '') return false;
  if (candidate.verificationStatus === 'UNVERIFIED') return false;
  return true;
}

/**
 * Builds deterministic verified National Base candidate from repository SSOT.
 * Guarantees that the calendar never ends completely empty.
 */
export function buildNationalBaseCandidate(academicYear?: string): CalendarSourceCandidate {
  const cleanYear = (academicYear || '2026/2027').trim();
  const startYear = parseInt(cleanYear.slice(0, 4), 10) || 2026;
  const endYear = cleanYear.includes('/') ? (parseInt(cleanYear.split('/')[1], 10) || startYear + 1) : startYear + 1;

  const startDateStr = `${startYear}-07-01`;
  const endDateStr = `${endYear}-06-30`;

  const nationalEvents: CalendarSourceEvent[] = OFFICIAL_NATIONAL_HOLIDAYS
    .filter((h) => h.date >= startDateStr && h.date <= endDateStr)
    .map((h) => ({
      name: h.name,
      startDate: h.date,
      category: (h.type === 'CUTI_BERSAMA' ? 'OTHER' : 'HOLIDAY') as CalendarSourceEvent['category'],
    }));

  const sourceMetadata = OFFICIAL_NATIONAL_HOLIDAY_SOURCES[startYear] || OFFICIAL_NATIONAL_HOLIDAY_SOURCES[2026];

  return {
    sourceLevel: 'NATIONAL',
    authorityType: 'OFFICIAL',
    confidence: 'HIGH',
    academicYear: cleanYear,
    authority: sourceMetadata?.authority || 'Kementerian Agama, Kementerian Ketenagakerjaan, Kementerian Pendayagunaan Aparatur Negara dan Reformasi Birokrasi RI',
    documentTitle: sourceMetadata?.documentTitle || `Pedoman Hari Libur Nasional & Cuti Bersama ${cleanYear}`,
    documentNumber: sourceMetadata?.documentNumber || 'SKB 3 Menteri',
    sourceUrl: sourceMetadata?.sourceUrl || 'https://setkab.go.id',
    publicationDate: sourceMetadata?.publicationDate,
    effectiveDate: sourceMetadata?.signedDate,
    semester1StartDate: undefined,
    semester1EndDate: undefined,
    semester2StartDate: undefined,
    semester2EndDate: undefined,
    semesterStartDate: undefined,
    semesterEndDate: undefined,
    events: nationalEvents,
    verificationStatus: 'PARTIAL',
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Selects the best calendar candidate according to geographic & authority hierarchy:
 * 1. REGENCY OFFICIAL
 * 2. REGENCY NON_OFFICIAL
 * 3. PROVINCE OFFICIAL
 * 4. PROVINCE NON_OFFICIAL
 * 5. NATIONAL (OFFICIAL > NON_OFFICIAL)
 * 6. NATIONAL_BASE (Never empty)
 */
export function selectBestCalendarSource(
  candidates: CalendarSourceCandidate[],
  request: CalendarSearchRequest
): CalendarSourceCandidate | null {
  if (!request) {
    return null;
  }

  const reqYear = (request.academicYear || '').trim();
  const reqProvince = normalizeRegionName(request.province);
  const reqRegency = normalizeRegionName(request.regency);

  const usable = Array.isArray(candidates)
    ? candidates.filter((c) => {
        if (!isUsableCalendarCandidate(c)) return false;
        return c.academicYear.trim() === reqYear;
      })
    : [];

  // Sort candidates within a scope: OFFICIAL beats NON_OFFICIAL, VERIFIED beats PARTIAL
  const sortCandidates = (items: CalendarSourceCandidate[]): CalendarSourceCandidate[] => {
    return [...items].sort((a, b) => {
      const aAuth = (a.authorityType || classifyCalendarSourceAuthority(a.sourceUrl)) === 'NON_OFFICIAL' ? 1 : 0;
      const bAuth = (b.authorityType || classifyCalendarSourceAuthority(b.sourceUrl)) === 'NON_OFFICIAL' ? 1 : 0;
      if (aAuth !== bAuth) return aAuth - bAuth;

      const aVer = a.verificationStatus === 'VERIFIED' ? 0 : 1;
      const bVer = b.verificationStatus === 'VERIFIED' ? 0 : 1;
      return aVer - bVer;
    });
  };

  // 1. REGENCY check (REGENCY OFFICIAL > REGENCY NON_OFFICIAL)
  if (reqRegency) {
    const regencyCandidates = usable.filter((c) => {
      if (c.sourceLevel !== 'REGENCY') return false;
      const cRegency = normalizeRegionName(c.regency);
      if (!cRegency || cRegency !== reqRegency) return false;

      if (reqProvince) {
        const cProvince = normalizeRegionName(c.province);
        if (cProvince && cProvince !== reqProvince) return false;
      }
      return true;
    });

    if (regencyCandidates.length > 0) {
      const sorted = sortCandidates(regencyCandidates);
      return sorted[0];
    }
  }

  // 2. PROVINCE check (PROVINCE OFFICIAL > PROVINCE NON_OFFICIAL)
  if (reqProvince) {
    const provinceCandidates = usable.filter((c) => {
      if (c.sourceLevel !== 'PROVINCE') return false;
      const cProvince = normalizeRegionName(c.province);
      return !cProvince || cProvince === reqProvince;
    });

    if (provinceCandidates.length > 0) {
      const sorted = sortCandidates(provinceCandidates);
      return sorted[0];
    }
  }

  // 3. NATIONAL check (NATIONAL OFFICIAL > NATIONAL NON_OFFICIAL)
  const nationalCandidates = usable.filter((c) => c.sourceLevel === 'NATIONAL');
  if (nationalCandidates.length > 0) {
    const sorted = sortCandidates(nationalCandidates);
    return sorted[0];
  }

  // 4. Default fallback: NATIONAL_BASE
  return buildNationalBaseCandidate(request.academicYear);
}

/**
 * Evaluates candidate completeness into canonical resolution status.
 * Complete with boundaries -> RESOLVED
 * Valid but incomplete boundaries -> PARTIALLY_RESOLVED
 * Missing provenance / unverified -> UNRESOLVED
 */
export function evaluateCalendarCandidate(
  candidate: CalendarSourceCandidate
): CalendarProviderStatus {
  if (!isUsableCalendarCandidate(candidate)) {
    return 'UNRESOLVED';
  }

  if (
    candidate.verificationStatus === 'VERIFIED' &&
    candidate.semesterStartDate &&
    candidate.semesterStartDate.trim() !== '' &&
    candidate.semesterEndDate &&
    candidate.semesterEndDate.trim() !== ''
  ) {
    return 'RESOLVED';
  }

  return 'PARTIALLY_RESOLVED';
}
