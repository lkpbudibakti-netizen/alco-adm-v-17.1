import {
  AssessmentAllocationSummary,
  AssessmentAllocationUnit,
  AssessmentCoverageUnit,
  AssessmentDifficultyTarget,
  AssessmentEvidenceType,
  AssessmentGenerationConstraints,
  AssessmentGenerationIssue,
  AssessmentGenerationPlan,
  AssessmentGenerationResolutionStatus,
  AssessmentGenerationRule,
  AssessmentGenerationSpec,
  AssessmentInstrumentType,
  AssessmentPlannedItem,
  AssessmentStimulusType,
  CognitiveDemand,
} from '../types';

export const PROV_MINIMUM_COVERAGE_ALLOCATION: AssessmentGenerationRule = {
  id: 'APP-DEFAULT-MINIMUM-COVERAGE',
  sourceType: 'APP_DEFAULT',
  description: 'Minimum satu unit bukti untuk setiap coverage unit yang dapat dihitung.',
};

export const PROV_PEDAGOGICAL_COGNITIVE_DEMAND: AssessmentGenerationRule = {
  id: 'PROV-PEDAGOGICAL-COGNITIVE-DEMAND',
  sourceType: 'PEDAGOGICAL_RULE',
  description: 'Kaidah pedagogis taksonomi kompetensi berdasarkan kata kerja operasional teks tujuan.',
};

const VALID_INSTRUMENT_TYPES: Set<AssessmentInstrumentType> = new Set([
  'WRITTEN_TEST',
  'ORAL_TEST',
  'PERFORMANCE',
  'OBSERVATION',
  'ASSIGNMENT',
  'PROJECT',
  'PRODUCT',
  'PORTFOLIO',
  'SELF_ASSESSMENT',
  'PEER_ASSESSMENT',
]);

/**
 * Deterministic ID Generator for Coverage Units
 */
export function createDeterministicCoverageId(
  objectiveRefId: string,
  criterionId?: string,
  instrumentType?: string
): string {
  const cleanObjId = (objectiveRefId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  const cleanCritId = criterionId
    ? criterionId.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    : 'objective';

  const baseId = `coverage:${cleanObjId}:${cleanCritId}`;

  // Backward-compatible helper behavior for legacy/two-argument callers.
  // Production B.1 coverage generation MUST always pass instrumentType.
  if (typeof instrumentType !== 'string' || instrumentType.trim() === '') {
    return baseId;
  }

  const cleanInstrumentType = instrumentType
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  return `${baseId}:${cleanInstrumentType}`;
}

/**
 * Map canonical instrument type to semantic allocation unit
 * Returns undefined if instrumentType is missing, unresolved, or unknown.
 */
export function mapInstrumentToAllocationUnit(
  instrumentType?: AssessmentInstrumentType
): AssessmentAllocationUnit | undefined {
  if (!instrumentType) return undefined;
  switch (instrumentType) {
    case 'WRITTEN_TEST':
    case 'ORAL_TEST':
    case 'SELF_ASSESSMENT':
    case 'PEER_ASSESSMENT':
      return 'ITEM';
    case 'PERFORMANCE':
    case 'ASSIGNMENT':
    case 'PROJECT':
    case 'PRODUCT':
      return 'TASK';
    case 'PORTFOLIO':
      return 'EVIDENCE';
    case 'OBSERVATION':
      return 'OBSERVATION';
    default:
      return undefined;
  }
}

/**
 * Conservative Indonesian text cognitive demand resolver
 * Returns undefined if ambiguous or no clear operational verb signal
 */
export function resolveConservativeCognitiveDemand(text?: string): CognitiveDemand | undefined {
  if (!text || typeof text !== 'string') return undefined;
  const lower = text.toLowerCase();

  const signals = {
    RECALL_UNDERSTAND:
      /\b(mengidentifikasi|menyebutkan|menjelaskan|mendeskripsikan|mengenal|mengingat|menunjukkan|menamai)\b/i.test(
        lower
      ),
    APPLY:
      /\b(menerapkan|menggunakan|mempraktikkan|mendemonstrasikan|menghitung|menjalankan|memperagakan|mengoperasikan)\b/i.test(
        lower
      ),
    ANALYZE_REASON:
      /\b(menganalisis|membandingkan|menelaah|menguraikan|menghubungkan|menyimpulkan|menginvestigasi|membedakan)\b/i.test(
        lower
      ),
    EVALUATE_CREATE:
      /\b(mengevaluasi|merancang|membuat|menciptakan|mengembangkan|menyusun|mengkreasi|menilai)\b/i.test(
        lower
      ),
  };

  const matched = (Object.keys(signals) as CognitiveDemand[]).filter((k) => signals[k]);
  if (matched.length === 1) {
    return matched[0];
  }
  return undefined;
}

export interface ResolveAssessmentGenerationPlanParams {
  generationSpec?: AssessmentGenerationSpec | null;
  constraints?: Partial<AssessmentGenerationConstraints> | null;
}

/**
 * Single Entry Point: resolveAssessmentGenerationPlan
 *
 * Mengubah AssessmentGenerationSpec (Audit 9C.2) menjadi rencana cakupan asesmen
 * dan perencanaan butir/tugas (AssessmentGenerationPlan) secara deterministik dan fail-closed.
 */
export function resolveAssessmentGenerationPlan(
  params: ResolveAssessmentGenerationPlanParams
): AssessmentGenerationPlan {
  const planIssues: AssessmentGenerationIssue[] = [];

  // 1. Validasi Keberadaan Input GenerationSpec
  if (!params || !params.generationSpec) {
    const blockingIssue: AssessmentGenerationIssue = {
      code: 'SPEC_MISSING',
      severity: 'BLOCKING',
      message: 'AssessmentGenerationSpec wajib disertakan dan tidak boleh null/undefined.',
    };
    return {
      generationSpec: undefined,
      constraints: {
        assemblyMode: params?.constraints?.assemblyMode || 'AUTO_RECOMMENDED',
        ...(params?.constraints?.durationMinutes !== undefined
          ? { durationMinutes: params.constraints.durationMinutes }
          : {}),
        ...(params?.constraints?.requestedTotalItems !== undefined
          ? { requestedTotalItems: params.constraints.requestedTotalItems }
          : {}),
      },
      coverageUnits: [],
      summary: {
        objectiveCount: 0,
        criterionCount: 0,
        coverageUnitCount: 0,
        allocatedCount: 0,
        allocationSummary: {
          itemCount: 0,
          taskCount: 0,
          evidenceCount: 0,
          observationCount: 0,
          unresolvedCount: 0,
        },
      },
      resolution: {
        status: 'BLOCKED',
        issues: [blockingIssue],
      },
    };
  }

  const spec = params.generationSpec;
  const isUpstreamBlocked = spec.resolution?.status === 'BLOCKED';
  const isUpstreamNeedsReview = spec.resolution?.status === 'NEEDS_REVIEW';

  if (isUpstreamBlocked) {
    planIssues.push({
      code: 'UPSTREAM_SPEC_BLOCKED',
      severity: 'BLOCKING',
      message: 'GenerationSpec hulu berada dalam status BLOCKED. Perencanaan tidak dapat dilanjutkan.',
    });
  }

  // 2. Validasi Constraints & Pertahankan Input Guru (Preserve Invalid Input)
  const requestedTotalItems = params.constraints?.requestedTotalItems !== undefined
    ? params.constraints.requestedTotalItems
    : spec.requestedTotalItems;

  const assemblyMode = params.constraints?.assemblyMode
    ? params.constraints.assemblyMode
    : requestedTotalItems !== undefined
    ? 'TEACHER_DEFINED'
    : 'AUTO_RECOMMENDED';

  const durationMinutes = params.constraints?.durationMinutes;
  if (durationMinutes !== undefined) {
    if (
      typeof durationMinutes !== 'number' ||
      !Number.isFinite(durationMinutes) ||
      durationMinutes <= 0
    ) {
      planIssues.push({
        code: 'CONSTRAINT_INVALID',
        severity: 'BLOCKING',
        message: 'durationMinutes harus berupa angka positif yang valid (> 0).',
      });
    }
  }

  if (requestedTotalItems !== undefined) {
    if (
      typeof requestedTotalItems !== 'number' ||
      !Number.isFinite(requestedTotalItems) ||
      !Number.isInteger(requestedTotalItems) ||
      requestedTotalItems <= 0
    ) {
      planIssues.push({
        code: 'CONSTRAINT_INVALID',
        severity: 'BLOCKING',
        message: 'requestedTotalItems harus berupa bilangan bulat positif yang valid (> 0).',
      });
    }
  }

  const itemTypeDistribution = params.constraints?.itemTypeDistribution !== undefined
    ? params.constraints.itemTypeDistribution
    : spec.itemTypeDistribution;

  const difficultyDistribution = params.constraints?.difficultyDistribution !== undefined
    ? params.constraints.difficultyDistribution
    : spec.difficultyDistribution;

  const cognitiveDistribution = params.constraints?.cognitiveDistribution !== undefined
    ? params.constraints.cognitiveDistribution
    : spec.cognitiveDistribution;

  const resolvedConstraints: AssessmentGenerationConstraints = {
    assemblyMode,
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(requestedTotalItems !== undefined ? { requestedTotalItems } : {}),
    ...(itemTypeDistribution ? { itemTypeDistribution } : {}),
    ...(difficultyDistribution ? { difficultyDistribution } : {}),
    ...(cognitiveDistribution ? { cognitiveDistribution } : {}),
  };

  // 3. Validasi Keberadaan Objectives
  const objectives = Array.isArray(spec.objectives) ? spec.objectives : [];
  if (objectives.length === 0) {
    planIssues.push({
      code: 'OBJECTIVES_EMPTY',
      severity: 'BLOCKING',
      message: 'Tujuan pembelajaran / kompetensi dasar belum tersedia pada GenerationSpec.',
    });
  }

  const plannedInstruments = Array.isArray(spec.plannedInstrumentTypes)
    ? spec.plannedInstrumentTypes
    : [];

  if (plannedInstruments.length === 0) {
    planIssues.push({
      code: 'PLANNED_INSTRUMENT_EMPTY',
      severity: 'BLOCKING',
      message: 'Tidak ada tipe instrumen yang direncanakan pada GenerationSpec.',
    });
  }

  // 4. Bangun Coverage Units untuk setiap Objective & Criteria
  const coverageUnits: AssessmentCoverageUnit[] = [];
  const specCriteria = Array.isArray(spec.criteria) ? spec.criteria : [];
  const evidenceRecs = Array.isArray(spec.evidenceRecommendations)
    ? spec.evidenceRecommendations
    : [];

  for (const obj of objectives) {
    const associatedCritIds: string[] = [];

    if (Array.isArray(obj.criterionIds) && obj.criterionIds.length > 0) {
      for (const critId of obj.criterionIds) {
        const foundCrit = specCriteria.find((c) => c.id === critId);
        if (!foundCrit) {
          planIssues.push({
            code: 'DANGLING_CRITERION_REF',
            severity: 'BLOCKING',
            message: `Criterion ID "${critId}" yang direferensikan oleh TP "${obj.id}" tidak ditemukan dalam daftar kriteria spesifikasi.`,
            objectiveRefId: obj.id,
            criterionId: critId,
          });
        }
        associatedCritIds.push(critId);
      }
    } else {
      // Periksa apakah ada kriteria dalam spec.criteria yang merujuk objective ini
      const matching = specCriteria.filter((c) => c.objectiveRefId === obj.id);
      for (const m of matching) {
        associatedCritIds.push(m.id);
      }
    }

    // Jika memiliki kriteria, buat satu coverage unit per kriteria
    // Jika tidak memiliki kriteria sama sekali, buat satu coverage unit dengan criterionId undefined
    const critTargets: (string | undefined)[] =
      associatedCritIds.length > 0 ? associatedCritIds : [undefined];

    for (const targetCritId of critTargets) {
      const baseUnitIssues: AssessmentGenerationIssue[] = [];
      const baseUnitProvenance: AssessmentGenerationRule[] = [];

      // A. Resolve Evidence Recommendation once for this objective/criterion.
      // Evidence recommendation remains advisory and MUST NOT remove
      // canonical instruments selected in AssessmentPlan.
      const matchingRec = evidenceRecs.find(
        (r) =>
          r.objectiveRefId === obj.id &&
          (targetCritId
            ? r.criterionId === targetCritId || !r.criterionId
            : true)
      );

      let resolvedEvidenceType: AssessmentEvidenceType | undefined = undefined;

      if (matchingRec) {
        if (matchingRec.evidenceTypes.length === 1) {
          resolvedEvidenceType = matchingRec.evidenceTypes[0];
        } else if (matchingRec.evidenceTypes.length > 1) {
          resolvedEvidenceType = undefined;

          baseUnitIssues.push({
            code: 'EVIDENCE_RECOMMENDATION_AMBIGUOUS',
            severity: 'REVIEW',
            message: `Terdapat beberapa tipe bukti yang direkomendasikan (${matchingRec.evidenceTypes.join(
              ', '
            )}). Diperlukan telaah guru untuk memilih bukti spesifik.`,
            objectiveRefId: obj.id,
            criterionId: targetCritId,
          });
        } else {
          resolvedEvidenceType = undefined;

          baseUnitIssues.push({
            code: 'EVIDENCE_RECOMMENDATION_EMPTY',
            severity: 'REVIEW',
            message: 'Tidak ada tipe bukti yang direkomendasikan untuk kompetensi ini.',
            objectiveRefId: obj.id,
            criterionId: targetCritId,
          });
        }

        if (matchingRec.confidence === 'NEEDS_TEACHER_REVIEW') {
          baseUnitIssues.push({
            code: 'EVIDENCE_CONFIDENCE_REVIEW',
            severity: 'REVIEW',
            message: 'Rekomendasi bukti memerlukan konfirmasi/telaah oleh guru.',
            objectiveRefId: obj.id,
            criterionId: targetCritId,
          });
        }
      } else {
        baseUnitIssues.push({
          code: 'EVIDENCE_RECOMMENDATION_NOT_FOUND',
          severity: 'REVIEW',
          message: `Rekomendasi bukti tidak ditemukan pada spesifikasi untuk kompetensi ID "${obj.id}".`,
          objectiveRefId: obj.id,
          criterionId: targetCritId,
        });
      }

      // B. Cognitive demand belongs to objective/criterion context,
      // therefore it is resolved once and reused for every confirmed instrument.
      const targetCritObj = targetCritId
        ? specCriteria.find((c) => c.id === targetCritId)
        : undefined;

      const textToAnalyze = targetCritObj
        ? `${obj.text} ${targetCritObj.name} ${targetCritObj.description || ''}`
        : obj.text;

      const cognitiveDemand =
        resolveConservativeCognitiveDemand(textToAnalyze);

      if (cognitiveDemand) {
        baseUnitProvenance.push(
          PROV_PEDAGOGICAL_COGNITIVE_DEMAND
        );
      }

      // C. Expand canonical teacher-confirmed instruments.
      //
      // B.1 CONTRACT:
      // Objective × Criterion × Planned Instrument = Coverage Unit.
      //
      // Recommendation MUST NOT collapse multiple canonical instruments
      // into one instrument.
      for (
        let instrumentIndex = 0;
        instrumentIndex < plannedInstruments.length;
        instrumentIndex++
      ) {
        const plannedInstrument = plannedInstruments[instrumentIndex];

        const unitIssues: AssessmentGenerationIssue[] = [
          ...baseUnitIssues,
        ];

        const unitProvenance: AssessmentGenerationRule[] = [
          ...baseUnitProvenance,
        ];

        const instrumentIdPart =
          typeof plannedInstrument === 'string' &&
          plannedInstrument.trim() !== ''
            ? plannedInstrument
            : `unknown_${instrumentIndex + 1}`;

        const unitId = createDeterministicCoverageId(
          obj.id,
          targetCritId,
          instrumentIdPart
        );

        let resolvedInstrumentType:
          | AssessmentInstrumentType
          | undefined = undefined;

        if (!VALID_INSTRUMENT_TYPES.has(plannedInstrument)) {
          unitIssues.push({
            code: 'UNKNOWN_INSTRUMENT_TYPE',
            severity: 'BLOCKING',
            message: `Tipe instrumen "${plannedInstrument}" tidak dikenal dalam sistem.`,
            objectiveRefId: obj.id,
            criterionId: targetCritId,
          });
        } else {
          resolvedInstrumentType = plannedInstrument;
        }

        // D. Allocation semantic follows each canonical instrument.
        // Never default unresolved/unknown instruments to ITEM.
        const allocationUnit =
          mapInstrumentToAllocationUnit(
            resolvedInstrumentType
          );

        // E. These fields remain unresolved unless real data exists.
        // NO DATA > FAKE DATA.
        const difficultyTarget:
          | AssessmentDifficultyTarget
          | undefined = undefined;

        const stimulusType:
          | AssessmentStimulusType
          | undefined = undefined;

        const assessmentIndicator:
          | string
          | undefined = undefined;

        const materialOrContext:
          | string
          | undefined = undefined;

        // F. Minimum one semantic unit for each resolved coverage unit.
        let recommendedCount:
          | number
          | undefined = undefined;

        if (allocationUnit !== undefined) {
          recommendedCount = 1;

          unitProvenance.push(
            PROV_MINIMUM_COVERAGE_ALLOCATION
          );
        }

        // G. Unit status
        let unitStatus:
          | 'RESOLVED'
          | 'NEEDS_REVIEW'
          | 'BLOCKED' = 'RESOLVED';

        if (
          unitIssues.some(
            (issue) => issue.severity === 'BLOCKING'
          )
        ) {
          unitStatus = 'BLOCKED';
        } else if (
          unitIssues.some(
            (issue) => issue.severity === 'REVIEW'
          )
        ) {
          unitStatus = 'NEEDS_REVIEW';
        }

        coverageUnits.push({
          id: unitId,
          objectiveRefId: obj.id,
          criterionId: targetCritId,
          evidenceType: resolvedEvidenceType,
          instrumentType: resolvedInstrumentType,
          allocationUnit,
          recommendedCount,
          cognitiveDemand,
          stimulusType,
          difficultyTarget,
          assessmentIndicator,
          materialOrContext,
          provenance: unitProvenance,
          status: unitStatus,
          issues: unitIssues,
        });
      }
    }
  }

  // 5. Hitung Alokasi Semantik & Evaluasi Alokasi Guru vs Minimum ITEM Coverage
  const itemUnits = coverageUnits.filter((u) => u.allocationUnit === 'ITEM');
  const minItemCoverageCount = itemUnits.length;
  let finalAllocatedCount = minItemCoverageCount;

  const isRequestedTotalItemsValid = requestedTotalItems !== undefined &&
    typeof requestedTotalItems === 'number' &&
    Number.isFinite(requestedTotalItems) &&
    Number.isInteger(requestedTotalItems) &&
    requestedTotalItems > 0;

  if (isRequestedTotalItemsValid && itemUnits.length > 0) {
    finalAllocatedCount = requestedTotalItems;
    const N = requestedTotalItems;
    const M = itemUnits.length;

    if (N < minItemCoverageCount) {
      planIssues.push({
        code: 'TEACHER_ITEM_COUNT_UNDER_COVERAGE',
        severity: 'REVIEW',
        message: `Jumlah butir yang diminta (${N}) lebih kecil dari jumlah cakupan minimal butir (${minItemCoverageCount}). Jumlah permintaan guru dipertahankan tanpa penaikan otomatis.`,
      });
      // Allocate 1 to first N units deterministically sorted by ID, 0 to remaining
      const sorted = [...itemUnits].sort((a, b) => a.id.localeCompare(b.id));
      sorted.forEach((u, idx) => {
        u.recommendedCount = idx < N ? 1 : 0;
      });
    } else {
      if (N > minItemCoverageCount) {
        planIssues.push({
          code: 'EXTRA_ITEM_ALLOCATION_REQUIRES_REVIEW',
          severity: 'REVIEW',
          message: `Alokasi tambahan (${N - minItemCoverageCount} butir) di atas cakupan minimal butir memerlukan telaah atau penentuan distribusi oleh guru.`,
        });
      }
      // Largest Remainder / Hamilton method for N >= M
      const exactShare = N / M;
      const baseQuota = Math.floor(exactShare);
      const remainder = exactShare - baseQuota;
      const sumBaseQuotas = baseQuota * M;
      const deficit = N - sumBaseQuotas;

      // Sort deterministically by remainder descending, tie-break by ID ascending
      const indexedUnits = itemUnits.map((u, idx) => ({ u, idx, id: u.id, remainder }));
      indexedUnits.sort((a, b) => {
        if (b.remainder !== a.remainder) return b.remainder - a.remainder;
        return a.id.localeCompare(b.id);
      });

      const bonusSet = new Set(indexedUnits.slice(0, deficit).map((item) => item.u.id));

      itemUnits.forEach((u) => {
        u.recommendedCount = baseQuota + (bonusSet.has(u.id) ? 1 : 0);
      });
    }
  }

  // 5a. Validate and Allocate Item-Level Target Distributions (Item Type, Difficulty & Cognitive Demand)
  const N_total = typeof finalAllocatedCount === 'number' && Number.isFinite(finalAllocatedCount) && Number.isInteger(finalAllocatedCount) && finalAllocatedCount >= 0
    ? finalAllocatedCount
    : 0;
  const plannedItems: AssessmentPlannedItem[] = [];

  if (resolvedConstraints.itemTypeDistribution && itemUnits.length > 0) {
    const itemTypeSum = Object.values(resolvedConstraints.itemTypeDistribution).reduce((sum, val) => sum + (val || 0), 0);
    if (itemTypeSum !== N_total) {
      planIssues.push({
        code: 'INVALID_ITEM_TYPE_DISTRIBUTION_SUM',
        severity: 'BLOCKING',
        message: `Total distribusi bentuk soal (${itemTypeSum}) tidak cocok dengan jumlah soal yang diminta/dialokasikan (${N_total}).`,
      });
    }
  }

  if (resolvedConstraints.difficultyDistribution && itemUnits.length > 0) {
    const diffSum = Object.values(resolvedConstraints.difficultyDistribution).reduce((sum, val) => sum + (val || 0), 0);
    if (diffSum !== N_total) {
      planIssues.push({
        code: 'INVALID_DIFFICULTY_DISTRIBUTION_SUM',
        severity: 'BLOCKING',
        message: `Total distribusi tingkat kesulitan (${diffSum}) tidak cocok dengan jumlah soal yang diminta/dialokasikan (${N_total}).`,
      });
    }
  }

  if (resolvedConstraints.cognitiveDistribution && itemUnits.length > 0) {
    const cogSum = Object.values(resolvedConstraints.cognitiveDistribution).reduce((sum, val) => sum + (val || 0), 0);
    if (cogSum !== N_total) {
      planIssues.push({
        code: 'INVALID_COGNITIVE_DISTRIBUTION_SUM',
        severity: 'BLOCKING',
        message: `Total distribusi tuntutan kognitif (${cogSum}) tidak cocok dengan jumlah soal yang diminta/dialokasikan (${N_total}).`,
      });
    }
  }

  if (itemUnits.length > 0 && N_total >= 0) {
    const plannedCoverageUnitIds: string[] = [];
    const sortedItemUnits = [...itemUnits].sort((a, b) => a.id.localeCompare(b.id));
    sortedItemUnits.forEach((u) => {
      const count = u.recommendedCount !== undefined ? u.recommendedCount : 1;
      for (let i = 0; i < count; i++) {
        plannedCoverageUnitIds.push(u.id);
      }
    });

    // Pad or trim to match exactly N_total
    while (plannedCoverageUnitIds.length < N_total) {
      plannedCoverageUnitIds.push(sortedItemUnits[0]?.id || 'unknown');
    }
    if (plannedCoverageUnitIds.length > N_total) {
      plannedCoverageUnitIds.length = N_total;
    }

    // Determine itemType targets for each individual item
    const plannedItemTypes: (import('../types').WrittenAssessmentItemType | undefined)[] = [];
    if (resolvedConstraints.itemTypeDistribution) {
      const typeKeys: import('../types').WrittenAssessmentItemType[] = [
        'MULTIPLE_CHOICE',
        'MULTIPLE_SELECT',
        'TRUE_FALSE',
        'MATCHING',
        'CATEGORY_RESPONSE',
        'SHORT_ANSWER',
        'ESSAY',
      ];
      typeKeys.forEach((key) => {
        const val = resolvedConstraints.itemTypeDistribution?.[key] || 0;
        for (let i = 0; i < val; i++) {
          plannedItemTypes.push(key);
        }
      });
      for (let i = plannedItemTypes.length; i < N_total; i++) {
        plannedItemTypes.push('MULTIPLE_CHOICE');
      }
    } else {
      for (let i = 0; i < N_total; i++) {
        plannedItemTypes.push('MULTIPLE_CHOICE');
      }
    }
    if (plannedItemTypes.length > N_total) {
      plannedItemTypes.length = N_total;
    }

    // Determine difficulty targets for each individual item
    const plannedDifficulties: (AssessmentDifficultyTarget | undefined)[] = [];
    if (resolvedConstraints.difficultyDistribution) {
      const keys: AssessmentDifficultyTarget[] = ['BASIC', 'MODERATE', 'CHALLENGING'];
      keys.forEach((key) => {
        const val = resolvedConstraints.difficultyDistribution?.[key] || 0;
        for (let i = 0; i < val; i++) {
          plannedDifficulties.push(key);
        }
      });
      for (let i = plannedDifficulties.length; i < N_total; i++) {
        plannedDifficulties.push(undefined);
      }
    } else {
      // If no explicit difficulty distribution requested, use whatever is on the coverage unit (no defaults!)
      for (let i = 0; i < N_total; i++) {
        const uId = plannedCoverageUnitIds[i];
        const u = itemUnits.find((unit) => unit.id === uId);
        plannedDifficulties.push(u?.difficultyTarget);
      }
    }
    if (plannedDifficulties.length > N_total) {
      plannedDifficulties.length = N_total;
    }

    // Determine cognitive demand targets for each individual item
    const plannedCognitives: (CognitiveDemand | undefined)[] = [];
    if (resolvedConstraints.cognitiveDistribution) {
      const keys: CognitiveDemand[] = ['RECALL_UNDERSTAND', 'APPLY', 'ANALYZE_REASON', 'EVALUATE_CREATE'];
      keys.forEach((key) => {
        const val = resolvedConstraints.cognitiveDistribution?.[key] || 0;
        for (let i = 0; i < val; i++) {
          plannedCognitives.push(key);
        }
      });
      for (let i = plannedCognitives.length; i < N_total; i++) {
        plannedCognitives.push(undefined);
      }
    } else {
      // If no explicit cognitive distribution requested, use whatever is on the coverage unit (no defaults!)
      for (let i = 0; i < N_total; i++) {
        const uId = plannedCoverageUnitIds[i];
        const u = itemUnits.find((unit) => unit.id === uId);
        plannedCognitives.push(u?.cognitiveDemand);
      }
    }
    if (plannedCognitives.length > N_total) {
      plannedCognitives.length = N_total;
    }

    // Combine deterministically into plannedItems
    for (let i = 0; i < N_total; i++) {
      plannedItems.push({
        id: `planned-item-${i + 1}`,
        sequence: i + 1,
        coverageUnitId: plannedCoverageUnitIds[i],
        itemType: plannedItemTypes[i],
        difficultyTarget: plannedDifficulties[i],
        cognitiveDemand: plannedCognitives[i],
      });
    }

    // Update u.difficultyTarget and u.cognitiveDemand with the first item's targets as representatives
    // ONLY update if they are defined (to preserve undefined status in Case T & Case U when no constraints requested)
    itemUnits.forEach((u) => {
      const firstItem = plannedItems.find((item) => item.coverageUnitId === u.id);
      if (firstItem) {
        if (firstItem.difficultyTarget !== undefined) {
          u.difficultyTarget = firstItem.difficultyTarget;
        }
        if (firstItem.cognitiveDemand !== undefined) {
          u.cognitiveDemand = firstItem.cognitiveDemand;
        }
      }
    });
  }

  let itemCount = 0;
  let taskCount = 0;
  let evidenceCount = 0;
  let observationCount = 0;
  let unresolvedCount = 0;

  for (const u of coverageUnits) {
    switch (u.allocationUnit) {
      case 'ITEM':
        itemCount += u.recommendedCount ?? 1;
        break;
      case 'TASK':
        taskCount += u.recommendedCount ?? 1;
        break;
      case 'EVIDENCE':
        evidenceCount += u.recommendedCount ?? 1;
        break;
      case 'OBSERVATION':
        observationCount += u.recommendedCount ?? 1;
        break;
      default:
        unresolvedCount += 1;
        break;
    }
  }

  // 6. Evaluasi Status Final Plan
  // Kumpulkan seluruh issues dari plan dan seluruh coverage units
  const allIssues: AssessmentGenerationIssue[] = [...planIssues];
  for (const u of coverageUnits) {
    for (const ui of u.issues) {
      allIssues.push(ui);
    }
  }

  let finalPlanStatus: AssessmentGenerationResolutionStatus = 'RESOLVED';
  const hasBlocking = allIssues.some((i) => i.severity === 'BLOCKING');
  const hasReview = allIssues.some((i) => i.severity === 'REVIEW');

  if (isUpstreamBlocked || hasBlocking) {
    finalPlanStatus = 'BLOCKED';
  } else if (isUpstreamNeedsReview || hasReview) {
    finalPlanStatus = 'NEEDS_REVIEW';
  } else {
    finalPlanStatus = 'RESOLVED';
  }

  return {
    academicSettingId: spec.academicSettingId,
    generationSpec: spec,
    constraints: resolvedConstraints,
    coverageUnits,
    plannedItems,
    summary: {
      objectiveCount: objectives.length,
      criterionCount: specCriteria.length,
      coverageUnitCount: coverageUnits.length,
      allocatedCount: finalAllocatedCount,
      allocationSummary: {
        itemCount,
        taskCount,
        evidenceCount,
        observationCount,
        unresolvedCount,
      },
    },
    resolution: {
      status: finalPlanStatus,
      issues: allIssues,
    },
  };
}
