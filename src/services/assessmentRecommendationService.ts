import {
  AcademicSetting,
  AssessmentPurpose,
  AssessmentTiming,
  AssessmentScopeType,
  AssessmentInstrumentRef,
  WrittenAssessmentItemType,
  CognitiveDemand,
  AssessmentDifficultyTarget,
} from '../types';
import { resolveGrade } from './assessmentGenerationProfileService';

export type GradeBracket =
  | 'SD_EARLY'   // Kelas 1-2 / Fase A
  | 'SD_MIDDLE'  // Kelas 3-4 / Fase B
  | 'SD_UPPER'   // Kelas 5-6 / Fase C
  | 'SMP'        // Kelas 7-9 / Fase D
  | 'SMA_SMK';   // Kelas 10-12 / Fase E-F

export interface AssessmentItemTypeRecommendation {
  type: WrittenAssessmentItemType;
  label: string;
  count: number;
  percentage: number;
}

export interface AssessmentCognitiveRecommendation {
  demand: CognitiveDemand;
  label: string;
  count: number;
  percentage: number;
}

export interface AssessmentDifficultyRecommendation {
  difficulty: AssessmentDifficultyTarget;
  label: string;
  count: number;
  percentage: number;
}

export interface AssessmentRecommendation {
  source: 'APP_RECOMMENDATION';
  version: 'v1';
  totalItems: number;
  gradeBracket: GradeBracket;
  itemTypeDistribution: Record<WrittenAssessmentItemType, number>;
  cognitiveDistribution: Record<CognitiveDemand, number>;
  difficultyDistribution: Record<AssessmentDifficultyTarget, number>;
  itemTypeRecommendations: AssessmentItemTypeRecommendation[];
  cognitiveRecommendations: AssessmentCognitiveRecommendation[];
  difficultyRecommendations: AssessmentDifficultyRecommendation[];
  rationale: string;
  additionalInstrumentRecommendations?: AssessmentInstrumentRef[];
  warnings?: string[];
}

export const ITEM_TYPE_LABELS: Record<WrittenAssessmentItemType, string> = {
  MULTIPLE_CHOICE: 'Pilihan Ganda',
  MULTIPLE_SELECT: 'Pilihan Ganda Kompleks',
  TRUE_FALSE: 'Benar / Salah',
  SHORT_ANSWER: 'Isian Singkat',
  ESSAY: 'Uraian / Esai',
  MATCHING: 'Menjodohkan',
  CATEGORY_RESPONSE: 'Kategori / Pilihan Majemuk',
};

export const COGNITIVE_LABELS: Record<CognitiveDemand, string> = {
  RECALL_UNDERSTAND: 'Knowing (Mengingat & Memahami)',
  APPLY: 'Applying (Menerapkan)',
  ANALYZE_REASON: 'Reasoning (Menalar & Menganalisis)',
  EVALUATE_CREATE: 'Evaluating & Creating (Mengevaluasi & Mencipta)',
};

export const DIFFICULTY_LABELS: Record<AssessmentDifficultyTarget, string> = {
  BASIC: 'Mudah (Basic)',
  MODERATE: 'Sedang (Moderate)',
  CHALLENGING: 'Sukar (Challenging)',
};

/**
 * Resolves school grade bracket deterministically.
 * Returns undefined if level/grade/phase cannot be resolved safely (Fail-Closed).
 */
export function resolveGradeBracket(setting?: AcademicSetting): GradeBracket | undefined {
  if (!setting) return undefined;

  const gradeNum = resolveGrade(setting);
  if (gradeNum !== undefined) {
    if (gradeNum === 1 || gradeNum === 2) return 'SD_EARLY';
    if (gradeNum === 3 || gradeNum === 4) return 'SD_MIDDLE';
    if (gradeNum === 5 || gradeNum === 6) return 'SD_UPPER';
    if (gradeNum >= 7 && gradeNum <= 9) return 'SMP';
    if (gradeNum >= 10 && gradeNum <= 12) return 'SMA_SMK';
  }

  const level = (setting.level || '').toUpperCase();
  const gradeStr = String(setting.grade || '').trim();
  const phase = (setting.phase || '').toUpperCase();

  if (level === 'SMP' || phase === 'D' || ['7', '8', '9', 'VII', 'VIII', 'IX'].some((g) => gradeStr.includes(g))) {
    return 'SMP';
  }

  if (
    level === 'SMA' ||
    level === 'SMK' ||
    phase === 'E' ||
    phase === 'F' ||
    ['10', '11', '12', 'X', 'XI', 'XII'].some((g) => gradeStr.includes(g))
  ) {
    return 'SMA_SMK';
  }

  // SD brackets
  if (phase === 'A' || gradeStr === '1' || gradeStr === '2' || gradeStr.includes('Kelas 1') || gradeStr.includes('Kelas 2')) {
    return 'SD_EARLY';
  }
  if (phase === 'C' || gradeStr === '5' || gradeStr === '6' || gradeStr.includes('Kelas 5') || gradeStr.includes('Kelas 6')) {
    return 'SD_UPPER';
  }
  if (phase === 'B' || gradeStr === '3' || gradeStr === '4' || gradeStr.includes('Kelas 3') || gradeStr.includes('Kelas 4')) {
    return 'SD_MIDDLE';
  }

  // If level is explicitly SD but no specific grade/phase, resolve to SD_MIDDLE
  if (level === 'SD') {
    return 'SD_MIDDLE';
  }

  // Fail-Closed: do not assume SD_MIDDLE when setting is unknown or empty
  return undefined;
}

/**
 * Largest Remainder Method (Hamilton/Hare method)
 * Allocates exact integer counts that sum to exact `total` without rounding drift.
 */
export function allocateIntegerDistribution<T extends string>(
  shares: Record<T, number>,
  total: number
): Record<T, number> {
  const keys = Object.keys(shares) as T[];
  const sumShares = keys.reduce((s, k) => s + (shares[k] || 0), 0);

  const result: Record<T, number> = {} as Record<T, number>;
  if (total <= 0 || sumShares <= 0) {
    keys.forEach((k) => {
      result[k] = 0;
    });
    return result;
  }

  const rawAllocations = keys.map((k) => {
    const raw = ((shares[k] || 0) / sumShares) * total;
    const integerPart = Math.floor(raw);
    const remainder = raw - integerPart;
    return { key: k, integerPart, remainder };
  });

  let currentSum = rawAllocations.reduce((sum, item) => sum + item.integerPart, 0);
  let deficit = total - currentSum;

  // Sort by remainder descending, then key ascending for deterministic tie-break
  rawAllocations.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return String(a.key).localeCompare(String(b.key));
  });

  for (const item of rawAllocations) {
    if (deficit > 0) {
      item.integerPart += 1;
      deficit -= 1;
    }
    result[item.key] = item.integerPart;
  }

  return result;
}

/**
 * Baseline recommended total questions for WRITTEN_TEST (Section 4).
 */
export function getBaselineWrittenTotalItems(params: {
  timing: AssessmentTiming;
  scopeType: AssessmentScopeType;
  purpose: AssessmentPurpose;
  gradeBracket: GradeBracket;
  title?: string;
}): number {
  const { timing, scopeType, purpose, gradeBracket, title } = params;
  const isQuiz = (title || '').toLowerCase().includes('kuis') || (title || '').toLowerCase().includes('quiz');

  // 1. PRE / Diagnostik Awal
  if (timing === 'PRE') {
    switch (gradeBracket) {
      case 'SD_EARLY':
        return 5;
      case 'SD_MIDDLE':
        return 8;
      case 'SD_UPPER':
        return 10;
      case 'SMP':
        return 10;
      case 'SMA_SMK':
        return 15;
    }
  }

  // 2. MID_SEMESTER / STS / UTS
  if (timing === 'MID_SEMESTER') {
    switch (gradeBracket) {
      case 'SD_EARLY':
        return 20;
      case 'SD_MIDDLE':
        return 25;
      case 'SD_UPPER':
        return 30;
      case 'SMP':
        return 30;
      case 'SMA_SMK':
        return 35;
    }
  }

  // 3. END_SEMESTER / SAS / UAS / END_YEAR / END_LEVEL
  if (timing === 'END_SEMESTER' || timing === 'END_YEAR' || timing === 'END_LEVEL') {
    switch (gradeBracket) {
      case 'SD_EARLY':
        return 25;
      case 'SD_MIDDLE':
        return 35;
      case 'SD_UPPER':
        return 40;
      case 'SMP':
        return 40;
      case 'SMA_SMK':
        return 45;
    }
  }

  // 4. Formatif / DURING
  if (purpose === 'FORMATIVE' || timing === 'DURING' || isQuiz) {
    switch (gradeBracket) {
      case 'SD_EARLY':
        return 5;
      case 'SD_MIDDLE':
        return 5;
      case 'SD_UPPER':
        return 10;
      case 'SMP':
        return 10;
      case 'SMA_SMK':
        return 10;
    }
  }

  // 5. POST + UNIT / Sumatif Unit/Bab (scopeType UNIT or MULTI_TP or title mentions sumatif unit/bab)
  if (scopeType === 'UNIT' || scopeType === 'MULTI_TP' || scopeType === 'SEMESTER') {
    switch (gradeBracket) {
      case 'SD_EARLY':
        return 10;
      case 'SD_MIDDLE':
        return 15;
      case 'SD_UPPER':
        return 20;
      case 'SMP':
        return 25;
      case 'SMA_SMK':
        return 30;
    }
  }

  // 6. Regular POST (Single TP / Formatif Akhir TP)
  switch (gradeBracket) {
    case 'SD_EARLY':
      return 8;
    case 'SD_MIDDLE':
      return 10;
    case 'SD_UPPER':
      return 10;
    case 'SMP':
      return 15;
    case 'SMA_SMK':
      return 15;
  }
}

/**
 * Recommended item type distribution (Section 5 & 6).
 */
export function getRecommendedItemTypeDistribution(params: {
  totalItems: number;
  timing: AssessmentTiming;
  purpose: AssessmentPurpose;
  scopeType: AssessmentScopeType;
  gradeBracket: GradeBracket;
  title?: string;
}): Record<WrittenAssessmentItemType, number> {
  const { totalItems, timing, purpose, scopeType, gradeBracket, title } = params;
  const isQuiz = (title || '').toLowerCase().includes('kuis') || (title || '').toLowerCase().includes('quiz');

  // Baseline templates
  const emptyDistribution: Record<WrittenAssessmentItemType, number> = {
    MULTIPLE_CHOICE: 0,
    MULTIPLE_SELECT: 0,
    TRUE_FALSE: 0,
    SHORT_ANSWER: 0,
    ESSAY: 0,
    MATCHING: 0,
    CATEGORY_RESPONSE: 0,
  };

  // Exact Presets for STS (MID_SEMESTER)
  if (timing === 'MID_SEMESTER') {
    if (gradeBracket === 'SD_EARLY' && totalItems === 20) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 14, SHORT_ANSWER: 4, ESSAY: 2 };
    }
    if (gradeBracket === 'SD_MIDDLE' && totalItems === 25) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 15, MULTIPLE_SELECT: 3, SHORT_ANSWER: 5, ESSAY: 2 };
    }
    if (gradeBracket === 'SD_UPPER' && totalItems === 30) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 18, MULTIPLE_SELECT: 4, SHORT_ANSWER: 5, ESSAY: 3 };
    }
    if (gradeBracket === 'SMP' && totalItems === 30) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 18, MULTIPLE_SELECT: 5, SHORT_ANSWER: 4, ESSAY: 3 };
    }
    if (gradeBracket === 'SMA_SMK' && totalItems === 35) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 20, MULTIPLE_SELECT: 6, SHORT_ANSWER: 4, ESSAY: 5 };
    }
  }

  // Exact Presets for SAS (END_SEMESTER / END_YEAR / END_LEVEL)
  if (timing === 'END_SEMESTER' || timing === 'END_YEAR' || timing === 'END_LEVEL') {
    if (gradeBracket === 'SD_EARLY' && totalItems === 25) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 17, SHORT_ANSWER: 5, ESSAY: 3 };
    }
    if (gradeBracket === 'SD_MIDDLE' && totalItems === 35) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 21, MULTIPLE_SELECT: 5, SHORT_ANSWER: 5, ESSAY: 4 };
    }
    if (gradeBracket === 'SD_UPPER' && totalItems === 40) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 22, MULTIPLE_SELECT: 6, SHORT_ANSWER: 6, ESSAY: 6 };
    }
    if (gradeBracket === 'SMP' && totalItems === 40) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 22, MULTIPLE_SELECT: 6, SHORT_ANSWER: 6, ESSAY: 6 };
    }
    if (gradeBracket === 'SMA_SMK' && totalItems === 45) {
      return { ...emptyDistribution, MULTIPLE_CHOICE: 24, MULTIPLE_SELECT: 7, SHORT_ANSWER: 6, ESSAY: 8 };
    }
  }

  // Share ratio calculation when not matching exact preset count
  const shares: Record<WrittenAssessmentItemType, number> = {
    MULTIPLE_CHOICE: 0,
    MULTIPLE_SELECT: 0,
    TRUE_FALSE: 0,
    SHORT_ANSWER: 0,
    ESSAY: 0,
    MATCHING: 0,
    CATEGORY_RESPONSE: 0,
  };

  if (timing === 'PRE') {
    shares.MULTIPLE_CHOICE = 60;
    shares.TRUE_FALSE = 20;
    shares.SHORT_ANSWER = 20;
  } else if (isQuiz) {
    shares.MULTIPLE_CHOICE = 70;
    if (gradeBracket === 'SD_EARLY') {
      shares.TRUE_FALSE = 20;
    } else {
      shares.MULTIPLE_SELECT = 20;
    }
    shares.SHORT_ANSWER = 10;
  } else if (purpose === 'FORMATIVE' || timing === 'DURING') {
    shares.MULTIPLE_CHOICE = 50;
    shares.SHORT_ANSWER = 25;
    shares.ESSAY = 25;
  } else if (scopeType === 'UNIT' || scopeType === 'MULTI_TP' || scopeType === 'SEMESTER' || timing === 'MID_SEMESTER' || timing === 'END_SEMESTER') {
    if (gradeBracket === 'SD_EARLY') {
      // Early grade avoids multiple select
      shares.MULTIPLE_CHOICE = 70;
      shares.SHORT_ANSWER = 20;
      shares.ESSAY = 10;
    } else {
      shares.MULTIPLE_CHOICE = 60;
      shares.MULTIPLE_SELECT = 15;
      shares.SHORT_ANSWER = 15;
      shares.ESSAY = 10;
    }
  } else {
    // Standard POST
    shares.MULTIPLE_CHOICE = 60;
    shares.SHORT_ANSWER = 20;
    shares.ESSAY = 20;
  }

  return allocateIntegerDistribution(shares, totalItems);
}

/**
 * Recommended cognitive demand distribution (Section 8).
 */
export function getRecommendedCognitiveDistribution(params: {
  totalItems: number;
  timing: AssessmentTiming;
  gradeBracket: GradeBracket;
  hasEvaluateCreateTp?: boolean;
}): Record<CognitiveDemand, number> {
  const { totalItems, timing, gradeBracket, hasEvaluateCreateTp } = params;

  const shares: Record<CognitiveDemand, number> = {
    RECALL_UNDERSTAND: 0,
    APPLY: 0,
    ANALYZE_REASON: 0,
    EVALUATE_CREATE: 0,
  };

  if (timing === 'PRE') {
    shares.RECALL_UNDERSTAND = 70;
    shares.APPLY = 30;
    shares.ANALYZE_REASON = 0;
  } else {
    switch (gradeBracket) {
      case 'SD_EARLY':
        shares.RECALL_UNDERSTAND = 50;
        shares.APPLY = 40;
        shares.ANALYZE_REASON = 10;
        break;
      case 'SD_MIDDLE':
        shares.RECALL_UNDERSTAND = 40;
        shares.APPLY = 40;
        shares.ANALYZE_REASON = 20;
        break;
      case 'SD_UPPER':
        shares.RECALL_UNDERSTAND = 30;
        shares.APPLY = 45;
        shares.ANALYZE_REASON = 25;
        break;
      case 'SMP':
        shares.RECALL_UNDERSTAND = 25;
        shares.APPLY = 45;
        shares.ANALYZE_REASON = 30;
        break;
      case 'SMA_SMK':
        shares.RECALL_UNDERSTAND = 20;
        shares.APPLY = 45;
        shares.ANALYZE_REASON = 35;
        break;
    }

    if (hasEvaluateCreateTp && totalItems >= 5) {
      shares.EVALUATE_CREATE = 10;
      shares.ANALYZE_REASON = Math.max(10, shares.ANALYZE_REASON - 10);
    }
  }

  return allocateIntegerDistribution(shares, totalItems);
}

/**
 * Recommended difficulty distribution (Section 9).
 */
export function getRecommendedDifficultyDistribution(params: {
  totalItems: number;
  timing: AssessmentTiming;
}): Record<AssessmentDifficultyTarget, number> {
  const { totalItems, timing } = params;

  const shares: Record<AssessmentDifficultyTarget, number> = {
    BASIC: 0,
    MODERATE: 0,
    CHALLENGING: 0,
  };

  if (timing === 'PRE') {
    shares.BASIC = 50;
    shares.MODERATE = 40;
    shares.CHALLENGING = 10;
  } else {
    shares.BASIC = 25;
    shares.MODERATE = 50;
    shares.CHALLENGING = 25;
  }

  return allocateIntegerDistribution(shares, totalItems);
}

/**
 * Main Assessment Recommendation Engine v1 orchestrator.
 */
export function generateAssessmentRecommendation(params: {
  academicSetting?: AcademicSetting;
  purpose?: AssessmentPurpose;
  timing?: AssessmentTiming;
  scopeType?: AssessmentScopeType;
  title?: string;
  tpIds?: string[];
  availableObjectives?: { id: string; competence?: string; statement?: string }[];
  instruments?: AssessmentInstrumentRef[];
  requestedTotalItems?: number;
}): AssessmentRecommendation | null {
  const instruments = params.instruments || [];
  const hasWritten = instruments.some((i) => i.type === 'WRITTEN_TEST');

  // If no WRITTEN_TEST, recommendation engine does not force written question counts (Section 13)
  if (!hasWritten) {
    return null;
  }

  const timing = params.timing || 'POST';
  const purpose = params.purpose || 'FORMATIVE';
  const scopeType = params.scopeType || 'TP';
  const gradeBracket = resolveGradeBracket(params.academicSetting);

  // If grade bracket cannot be resolved deterministically, fail closed and do not assume arbitrary SD values
  if (!gradeBracket) {
    return null;
  }

  // Baseline or teacher requested total
  const totalItems =
    params.requestedTotalItems && params.requestedTotalItems > 0
      ? params.requestedTotalItems
      : getBaselineWrittenTotalItems({
          timing,
          scopeType,
          purpose,
          gradeBracket,
          title: params.title,
        });

  // Check if any selected TP demands EVALUATE_CREATE
  const selectedObjectives = (params.availableObjectives || []).filter(
    (o) => (params.tpIds || []).includes(o.id)
  );

  const evaluateVerbs = ['mencipta', 'merancang', 'mengevaluasi', 'mengkreasi', 'membuat desain', 'mengembangkan'];
  const hasEvaluateCreateTp = selectedObjectives.some((o) => {
    const text = `${o.competence || ''} ${o.statement || ''}`.toLowerCase();
    return evaluateVerbs.some((v) => text.includes(v));
  });

  const itemTypeDistribution = getRecommendedItemTypeDistribution({
    totalItems,
    timing,
    purpose,
    scopeType,
    gradeBracket,
    title: params.title,
  });

  const cognitiveDistribution = getRecommendedCognitiveDistribution({
    totalItems,
    timing,
    gradeBracket,
    hasEvaluateCreateTp,
  });

  const difficultyDistribution = getRecommendedDifficultyDistribution({
    totalItems,
    timing,
  });

  // Detailed lists with percentages
  const itemTypeRecommendations: AssessmentItemTypeRecommendation[] = (
    Object.keys(itemTypeDistribution) as WrittenAssessmentItemType[]
  )
    .filter((type) => itemTypeDistribution[type] > 0)
    .map((type) => ({
      type,
      label: ITEM_TYPE_LABELS[type],
      count: itemTypeDistribution[type],
      percentage: Math.round((itemTypeDistribution[type] / totalItems) * 100),
    }));

  const cognitiveRecommendations: AssessmentCognitiveRecommendation[] = (
    Object.keys(cognitiveDistribution) as CognitiveDemand[]
  )
    .filter((demand) => cognitiveDistribution[demand] > 0)
    .map((demand) => ({
      demand,
      label: COGNITIVE_LABELS[demand],
      count: cognitiveDistribution[demand],
      percentage: Math.round((cognitiveDistribution[demand] / totalItems) * 100),
    }));

  const difficultyRecommendations: AssessmentDifficultyRecommendation[] = (
    Object.keys(difficultyDistribution) as AssessmentDifficultyTarget[]
  )
    .filter((diff) => difficultyDistribution[diff] > 0)
    .map((diff) => ({
      difficulty: diff,
      label: DIFFICULTY_LABELS[diff],
      count: difficultyDistribution[diff],
      percentage: Math.round((difficultyDistribution[diff] / totalItems) * 100),
    }));

  // Warnings / review notes
  const warnings: string[] = [];
  const tpCount = (params.tpIds || []).length;
  if (tpCount > 0 && totalItems < tpCount) {
    warnings.push(
      `Jumlah soal (${totalItems}) lebih sedikit daripada jumlah TP yang diukur (${tpCount}). Sebaiknya alokasikan minimal ${tpCount} butir agar setiap TP memiliki representasi penilaian.`
    );
  }

  // Compose Rationale
  let rationale = `Rekomendasi ${totalItems} butir soal disesuaikan untuk ${timing} (${gradeBracket}). `;
  if (timing === 'MID_SEMESTER' || timing === 'END_SEMESTER') {
    rationale += 'Menggunakan preset proporsional standar sumatif semester.';
  } else if (timing === 'PRE') {
    rationale += 'Menitikberatkan pada kemampuan prasyarat (knowing & applying) dengan format objektif sederhana.';
  } else {
    rationale += 'Kombinasi berimbang antara pilihan ganda, isian singkat, dan uraian.';
  }

  return {
    source: 'APP_RECOMMENDATION',
    version: 'v1',
    totalItems,
    gradeBracket,
    itemTypeDistribution,
    cognitiveDistribution,
    difficultyDistribution,
    itemTypeRecommendations,
    cognitiveRecommendations,
    difficultyRecommendations,
    rationale,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
