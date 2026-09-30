import { LearningPlan, DocumentGenerationContext } from './types';
import { validateLearningPlan, LearningPlanValidationResult } from '../learningPlanService';

export interface ModulAjarProjection {
  isReady: boolean;
  error?: string;

  plan?: LearningPlan;

  resolvedTPs: Array<{
    id: string;
    code?: string;
    statement: string;
    materialScope?: string;
  }>;

  resolvedAllocatedJP?: number;

  jpResolutionSource:
    | 'EXPLICIT_PLAN'
    | 'LINKED_TIME_ALLOCATION'
    | 'UNRESOLVED';

  validation?: LearningPlanValidationResult;
}

export function buildModulAjarProjection(context: DocumentGenerationContext): ModulAjarProjection {
  const isBlankMode = context.documentMode === 'blank';

  if (isBlankMode) {
    return {
      isReady: true,
      resolvedTPs: [],
      resolvedAllocatedJP: undefined,
      jpResolutionSource: 'UNRESOLVED',
    };
  }

  const learningPlans = context.learningPlans || [];
  const activePlanId = context.activeLearningPlanId;

  let selectedPlan: LearningPlan | undefined;

  if (activePlanId) {
    const plan = learningPlans.find((p) => p.id === activePlanId);
    if (!plan) {
      return {
        isReady: false,
        error: `Rencana pembelajaran terpilih dengan ID "${activePlanId}" tidak ditemukan.`,
        resolvedTPs: [],
        resolvedAllocatedJP: undefined,
        jpResolutionSource: 'UNRESOLVED',
      };
    }
    if (plan.status !== 'SIAP') {
      return {
        isReady: false,
        error: `Rencana pembelajaran "${plan.topic || plan.id}" terpilih belum diubah statusnya menjadi SIAP.`,
        resolvedTPs: [],
        resolvedAllocatedJP: undefined,
        jpResolutionSource: 'UNRESOLVED',
      };
    }
    selectedPlan = plan;
  } else {
    const siapPlans = learningPlans.filter((p) => p.status === 'SIAP');
    if (siapPlans.length === 0) {
      return {
        isReady: false,
        error: 'Belum ada rencana pembelajaran (Modul Ajar) dengan status SIAP.',
        resolvedTPs: [],
        resolvedAllocatedJP: undefined,
        jpResolutionSource: 'UNRESOLVED',
      };
    }
    if (siapPlans.length > 1) {
      return {
        isReady: false,
        error: 'Terdapat lebih dari satu rencana pembelajaran (Modul Ajar) dengan status SIAP. Silakan pilih salah satu rencana secara eksplisit.',
        resolvedTPs: [],
        resolvedAllocatedJP: undefined,
        jpResolutionSource: 'UNRESOLVED',
      };
    }
    selectedPlan = siapPlans[0];
  }

  const validation = validateLearningPlan(selectedPlan, {
    academicSetting: context.academicSetting,
    tp: context.tp,
    atp: context.atp,
    k13Analysis: context.k13Analysis,
    timeAllocations: context.timeAllocations,
    assessmentCriteria: context.assessmentCriteria,
  });

  if (!validation.valid) {
    return {
      isReady: false,
      error: validation.errors.join('; '),
      resolvedTPs: [],
      resolvedAllocatedJP: undefined,
      jpResolutionSource: 'UNRESOLVED',
      validation,
    };
  }

  const jpResolutionSource = validation.jpResolutionSource === 'CANONICAL_ATP'
    ? 'UNRESOLVED'
    : (validation.jpResolutionSource || 'UNRESOLVED');

  return {
    isReady: true,
    plan: selectedPlan,
    resolvedTPs: validation.resolvedTPs || [],
    resolvedAllocatedJP: validation.resolvedAllocatedJP,
    jpResolutionSource,
    validation,
  };
}

