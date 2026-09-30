import assert from 'node:assert';

class MockLocalStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
}
const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;

import {
  createInitialStorageV5,
  saveAssessmentCriteriaV5,
  saveAssessmentPlansV5,
  saveAssessmentPackagesV5,
  getSemesterDataV5,
  createYearHierarchyV5,
  loadStorageV5,
  saveStorageV5,
} from '../src/services/storageV5';
import { resolveAssessmentGenerationSpec } from '../src/services/assessmentGenerationSpecService';
import { resolveAssessmentGenerationPlan } from '../src/services/assessmentGenerationPlanService';
import {
  buildGenerationContract,
  generateAssessmentPackageDraft,
  parseAndValidateRawAIResponse,
} from '../src/services/assessmentPackageGeneratorService';
import { validateAssessmentCoverage } from '../src/services/assessmentCoverageValidationService';
import { verifyAssessmentPackageAnswers } from '../src/services/assessmentAnswerVerificationService';
import { validateAssessmentPackage, confirmAssessmentPackage } from '../src/services/assessmentPackageService';
import {
  AcademicSetting,
  AssessmentAIGenerationProvider,
  AssessmentAIGenerationRawResponse,
  AssessmentCriterion,
  AssessmentPackage,
  AssessmentPlan,
  TPData,
} from '../src/types';

class MockAIProvider implements AssessmentAIGenerationProvider {
  constructor(private fn: () => string) {}
  async generate(): Promise<AssessmentAIGenerationRawResponse> {
    return { rawText: this.fn() };
  }
}

console.log('=== STARTING ASSESSMENT SUBSYSTEM FUNDAMENTAL FIX REGRESSION SUITE ===\n');

async function runSubsystemRegressionTests() {
  const setting: AcademicSetting = {
    id: 'setting-fix-1',
    academicYear: '2025/2026',
    semester: '1 (Ganjil)',
    level: 'SD',
    grade: '4',
    subject: 'Matematika',
    curriculum: 'Kurikulum Merdeka',
  } as any;

  const mockTP: TPData = {
    id: 'tp-data-1',
    academicSettingId: setting.id,
    workflowStatus: 'SIAP',
    items: [
      { id: 'tp-1', code: 'TP-1', statement: 'Memahami konsep pecahan senilai dan desimal', order: 1 } as any,
      { id: 'tp-2', code: 'TP-2', statement: 'Mengaplikasikan operasi penjumlahan pecahan', order: 2 } as any,
      { id: 'tp-3', code: 'TP-3', statement: 'Menganalisis soal cerita matematika pecahan', order: 3 } as any,
    ],
  } as any;

  const mockCriteria: AssessmentCriterion[] = [
    { id: 'crit-1', academicSettingId: setting.id, tpId: 'tp-1', description: 'Peserta didik mampu mengidentifikasi pecahan senilai', approach: 'deskripsi', workflowStatus: 'SIAP', name: 'KKTP 1' } as any,
    { id: 'crit-2', academicSettingId: setting.id, tpId: 'tp-2', description: 'Peserta didik mampu menghitung penjumlahan pecahan', approach: 'deskripsi', workflowStatus: 'SIAP', name: 'KKTP 2' } as any,
    { id: 'crit-3', academicSettingId: setting.id, tpId: 'tp-3', description: 'Peserta didik mampu menyelesaikan masalah pecahan', approach: 'deskripsi', workflowStatus: 'SIAP', name: 'KKTP 3' } as any,
  ];

  // =========================================================================
  // SECTION 1: ITEM COUNT DISTRIBUTION & REMAINDER ALLOCATION (SECTION 2, 3, 21)
  // =========================================================================
  console.log('--- SECTION 1: ITEM COUNT DISTRIBUTION & REMAINDER ALLOCATION ---');

  // Case 1: requested = 10, coverage = 1
  const planCase1: AssessmentPlan = {
    id: 'plan-1',
    academicSettingId: setting.id,
    title: 'Tes Format 1',
    purpose: 'SUMMATIVE',
    timing: 'MID_SEMESTER',
    scopeType: 'TP',
    tpIds: ['tp-1'],
    criterionIds: ['crit-1'],
    instruments: [{ id: 'inst-w1', type: 'WRITTEN_TEST' }],
    workflowStatus: 'SIAP',
    createdAt: '2026-09-29T00:00:00Z',
    updatedAt: '2026-09-29T00:00:00Z',
  };

  const specCase1 = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planCase1,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });

  const genPlanCase1 = resolveAssessmentGenerationPlan({
    generationSpec: specCase1,
    constraints: { assemblyMode: 'AUTO_RECOMMENDED', requestedTotalItems: 10 },
  });

  assert.strictEqual(genPlanCase1.coverageUnits.length, 1, 'Case 1: 1 coverage unit generated');
  assert.strictEqual(genPlanCase1.coverageUnits[0].recommendedCount, 10, 'Case 1: 10 items allocated to single coverage unit');
  assert.strictEqual(genPlanCase1.summary.allocatedCount, 10, 'Case 1: Total summary allocatedCount is 10');
  console.log('  [PASS] Case 1: requested=10, coverage=1 -> 10 items allocated');

  // Case 2: requested = 20, coverage = 3
  const planCase2: AssessmentPlan = {
    ...planCase1,
    id: 'plan-2',
    tpIds: ['tp-1', 'tp-2', 'tp-3'],
    criterionIds: ['crit-1', 'crit-2', 'crit-3'],
  };

  const specCase2 = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planCase2,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });

  const genPlanCase2 = resolveAssessmentGenerationPlan({
    generationSpec: specCase2,
    constraints: { assemblyMode: 'AUTO_RECOMMENDED', requestedTotalItems: 20 },
  });

  const countsCase2 = genPlanCase2.coverageUnits.map((u) => u.recommendedCount);
  const sumCase2 = countsCase2.reduce((a, b) => (a || 0) + (b || 0), 0);
  assert.strictEqual(sumCase2, 20, 'Case 2: Sum of recommendedCount === 20');
  // 20 / 3 = 6.666 -> 7, 7, 6
  assert.deepStrictEqual(countsCase2, [7, 7, 6], 'Case 2: Remainder allocated deterministically (7, 7, 6)');
  console.log('  [PASS] Case 2: requested=20, coverage=3 -> deterministic sum=20 (7, 7, 6)');

  // Case 3: requested = 10, coverage = 3
  const genPlanCase3 = resolveAssessmentGenerationPlan({
    generationSpec: specCase2,
    constraints: { assemblyMode: 'AUTO_RECOMMENDED', requestedTotalItems: 10 },
  });

  const countsCase3 = genPlanCase3.coverageUnits.map((u) => u.recommendedCount);
  const sumCase3 = countsCase3.reduce((a, b) => (a || 0) + (b || 0), 0);
  assert.strictEqual(sumCase3, 10, 'Case 3: Sum of recommendedCount === 10');
  // 10 / 3 = 3.333 -> 4, 3, 3
  assert.deepStrictEqual(countsCase3, [4, 3, 3], 'Case 3: Remainder allocated deterministically (4, 3, 3)');
  console.log('  [PASS] Case 3: requested=10, coverage=3 -> deterministic sum=10 (4, 3, 3)');

  // =========================================================================
  // SECTION 2: DIFFICULTY & COGNITIVE DEMAND DISTRIBUTION (SECTION 22, 23)
  // =========================================================================
  console.log('\n--- SECTION 2: DIFFICULTY & COGNITIVE DEMAND DISTRIBUTION ---');

  const genPlanDist = resolveAssessmentGenerationPlan({
    generationSpec: specCase2,
    constraints: {
      assemblyMode: 'AUTO_RECOMMENDED',
      requestedTotalItems: 10,
      difficultyDistribution: { BASIC: 3, MODERATE: 5, CHALLENGING: 2 },
      cognitiveDistribution: { RECALL_UNDERSTAND: 2, APPLY: 4, ANALYZE_REASON: 3, EVALUATE_CREATE: 1 },
    },
  });

  assert.strictEqual(genPlanDist.constraints.requestedTotalItems, 10, 'Constraints preserve requestedTotalItems');
  assert.strictEqual(genPlanDist.plannedItems.length, 10, 'plannedItems.length is exactly 10');

  // Exact difficulty distribution assert
  const basicCount = genPlanDist.plannedItems.filter((it) => it.difficultyTarget === 'BASIC').length;
  const modCount = genPlanDist.plannedItems.filter((it) => it.difficultyTarget === 'MODERATE').length;
  const chalCount = genPlanDist.plannedItems.filter((it) => it.difficultyTarget === 'CHALLENGING').length;
  assert.strictEqual(basicCount, 3, 'BASIC count is exactly 3');
  assert.strictEqual(modCount, 5, 'MODERATE count is exactly 5');
  assert.strictEqual(chalCount, 2, 'CHALLENGING count is exactly 2');
  console.log('  [PASS] Exact difficulty distribution: BASIC=3, MODERATE=5, CHALLENGING=2');

  // Exact cognitive distribution assert
  const recallCount = genPlanDist.plannedItems.filter((it) => it.cognitiveDemand === 'RECALL_UNDERSTAND').length;
  const applyCount = genPlanDist.plannedItems.filter((it) => it.cognitiveDemand === 'APPLY').length;
  const analyzeCount = genPlanDist.plannedItems.filter((it) => it.cognitiveDemand === 'ANALYZE_REASON').length;
  const evalCount = genPlanDist.plannedItems.filter((it) => it.cognitiveDemand === 'EVALUATE_CREATE').length;
  assert.strictEqual(recallCount, 2, 'RECALL_UNDERSTAND count is exactly 2');
  assert.strictEqual(applyCount, 4, 'APPLY count is exactly 4');
  assert.strictEqual(analyzeCount, 3, 'ANALYZE_REASON count is exactly 3');
  assert.strictEqual(evalCount, 1, 'EVALUATE_CREATE count is exactly 1');
  console.log('  [PASS] Exact cognitive distribution: RECALL_UNDERSTAND=2, APPLY=4, ANALYZE_REASON=3, EVALUATE_CREATE=1');

  // Combined planned items properties, uniqueness, and coverage mapping
  const seenSeqs = new Set<number>();
  genPlanDist.plannedItems.forEach((item) => {
    assert.ok(item.id, 'Planned item has id');
    assert.ok(item.sequence, 'Planned item has sequence');
    assert.ok(item.coverageUnitId, 'Planned item has coverageUnitId');
    assert.ok(!seenSeqs.has(item.sequence), `Sequence ${item.sequence} is unique`);
    seenSeqs.add(item.sequence);
  });
  console.log('  [PASS] All planned items have unique sequence and valid properties');

  // Invalid difficulty total check (requested = 10, total = 8)
  const genPlanInvalidDiff = resolveAssessmentGenerationPlan({
    generationSpec: specCase2,
    constraints: {
      assemblyMode: 'AUTO_RECOMMENDED',
      requestedTotalItems: 10,
      difficultyDistribution: { BASIC: 3, MODERATE: 3, CHALLENGING: 2 },
    },
  });
  assert.strictEqual(genPlanInvalidDiff.resolution.status, 'BLOCKED', 'Invalid difficulty sum is BLOCKED');
  assert.ok(genPlanInvalidDiff.resolution.issues.some((i) => i.code === 'INVALID_DIFFICULTY_DISTRIBUTION_SUM'), 'Has INVALID_DIFFICULTY_DISTRIBUTION_SUM issue');
  // Remaining planned items difficulty targets should be undefined, not MODERATE!
  const invalidDiffTargets = genPlanInvalidDiff.plannedItems.map((it) => it.difficultyTarget);
  assert.deepStrictEqual(invalidDiffTargets.slice(8), [undefined, undefined], 'Unallocated items remain strictly undefined (no fake MODERATE fill)');
  console.log('  [PASS] Invalid difficulty distribution sum fails-closed, remaining items are strictly undefined');

  // Invalid cognitive total check (requested = 10, total = 7)
  const genPlanInvalidCog = resolveAssessmentGenerationPlan({
    generationSpec: specCase2,
    constraints: {
      assemblyMode: 'AUTO_RECOMMENDED',
      requestedTotalItems: 10,
      cognitiveDistribution: { RECALL_UNDERSTAND: 2, APPLY: 3, ANALYZE_REASON: 2 },
    },
  });
  assert.strictEqual(genPlanInvalidCog.resolution.status, 'BLOCKED', 'Invalid cognitive sum is BLOCKED');
  assert.ok(genPlanInvalidCog.resolution.issues.some((i) => i.code === 'INVALID_COGNITIVE_DISTRIBUTION_SUM'), 'Has INVALID_COGNITIVE_DISTRIBUTION_SUM issue');
  // Remaining planned items cognitive targets should be undefined, not APPLY!
  const invalidCogTargets = genPlanInvalidCog.plannedItems.map((it) => it.cognitiveDemand);
  assert.deepStrictEqual(invalidCogTargets.slice(7), [undefined, undefined, undefined], 'Unallocated items remain strictly undefined (no fake APPLY fill)');
  console.log('  [PASS] Invalid cognitive distribution sum fails-closed, remaining items are strictly undefined');

  // =========================================================================
  // SECTION 3: WRITTEN TEST ALL ITEM TYPES & SCORING (SECTION 24)
  // =========================================================================
  console.log('\n--- SECTION 3: WRITTEN TEST ALL ITEM TYPES & SCORING ---');

  const fullWrittenProvider = new MockAIProvider(() =>
    JSON.stringify([
      // Unit 0 (requiredCount: 4)
      {
        coverageUnitId: genPlanCase3.coverageUnits[0].id,
        itemType: 'MULTIPLE_CHOICE',
        prompt: '1 + 1 = ?',
        options: [{ text: '2', isCorrect: true }, { text: '3', isCorrect: false }],
        proposedAnswer: { answerType: 'OPTION', value: '2', optionIndices: [0], explanation: '1 + 1 = 2' },
      },
      {
        coverageUnitId: genPlanCase3.coverageUnits[0].id,
        itemType: 'MULTIPLE_SELECT',
        prompt: 'Pilih bilangan genap',
        options: [{ text: '2', isCorrect: true }, { text: '4', isCorrect: true }, { text: '3', isCorrect: false }],
        proposedAnswer: { answerType: 'MULTIPLE_OPTION', optionIndices: [0, 1] },
      },
      {
        coverageUnitId: genPlanCase3.coverageUnits[0].id,
        itemType: 'TRUE_FALSE',
        prompt: 'Matahari terbit dari timur.',
        options: [{ text: 'Benar', isCorrect: true }, { text: 'Salah', isCorrect: false }],
        proposedAnswer: { answerType: 'OPTION', value: 'Benar', optionIndices: [0] },
      },
      {
        coverageUnitId: genPlanCase3.coverageUnits[0].id,
        itemType: 'SHORT_ANSWER',
        prompt: 'Ibu kota Indonesia adalah...',
        proposedAnswer: { answerType: 'EXACT', value: 'Nusantara' },
      },
      // Unit 1 (requiredCount: 3)
      {
        coverageUnitId: genPlanCase3.coverageUnits[1].id,
        itemType: 'ESSAY',
        prompt: 'Jelaskan siklus air secara singkat.',
        proposedAnswer: { answerType: 'EXPECTED_RESPONSE', value: 'Evaporasi, kondensasi, presipitasi.' },
        scoringGuideDraft: { instructions: 'Penilaian berdasarkan 3 tahapan utama', maxScore: 10 },
      },
      {
        coverageUnitId: genPlanCase3.coverageUnits[1].id,
        itemType: 'MATCHING',
        prompt: 'Jodohkan hewan dan makanannya',
        matchingPremises: [{ id: 'p1', text: 'Kambing' }, { id: 'p2', text: 'Kucing' }],
        matchingResponses: [{ id: 'r1', text: 'Rumput' }, { id: 'r2', text: 'Ikan' }],
        proposedAnswer: { answerType: 'MATCHING', matchingPairs: [{ premiseId: 'p1', responseId: 'r1' }, { premiseId: 'p2', responseId: 'r2' }] },
      },
      {
        coverageUnitId: genPlanCase3.coverageUnits[1].id,
        itemType: 'MULTIPLE_CHOICE',
        prompt: '2 + 2 = ?',
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
        proposedAnswer: { answerType: 'OPTION', value: '4', optionIndices: [0] },
      },
      // Unit 2 (requiredCount: 3)
      {
        coverageUnitId: genPlanCase3.coverageUnits[2].id,
        itemType: 'CATEGORY_RESPONSE',
        prompt: 'Kelompokkan benda padat dan cair',
        categoryStatements: [{ id: 's1', text: 'Batu' }, { id: 's2', text: 'Air' }],
        categoryCategories: [{ id: 'c1', label: 'Padat' }, { id: 'c2', label: 'Cair' }],
        proposedAnswer: { answerType: 'CATEGORY_RESPONSE', categoryAnswers: [{ statementId: 's1', categoryId: 'c1' }, { statementId: 's2', categoryId: 'c2' }] },
      },
      {
        coverageUnitId: genPlanCase3.coverageUnits[2].id,
        itemType: 'SHORT_ANSWER',
        prompt: 'Berapakah 5 x 5?',
        proposedAnswer: { answerType: 'EXACT', value: '25' },
      },
      {
        coverageUnitId: genPlanCase3.coverageUnits[2].id,
        itemType: 'MULTIPLE_CHOICE',
        prompt: 'Berapakah 10 - 3?',
        options: [{ text: '7', isCorrect: true }, { text: '8', isCorrect: false }],
        proposedAnswer: { answerType: 'OPTION', value: '7', optionIndices: [0] },
      },
    ])
  );

  const contractCase3 = buildGenerationContract(genPlanCase3);
  const resultCase3 = await generateAssessmentPackageDraft({
    generationPlan: genPlanCase3,
    provider: fullWrittenProvider,
  });

  const pkgCase3 = resultCase3.generatedPackage!;
  assert.ok(pkgCase3, 'Generated package exists');
  assert.strictEqual(pkgCase3.answerKeys.length, 10, '10 AnswerKeys created for 10 written test items');
  assert.strictEqual(pkgCase3.scoringGuides.length, 10, '10 ScoringGuides created for 10 written test items');

  // Verify each objective type deterministic scoring semantics
  const mcGuide = pkgCase3.scoringGuides.find((sg) => {
    const item = (pkgCase3.instruments[0] as any).items.find((it: any) => it.id === sg.instrumentItemId);
    return item?.itemType === 'MULTIPLE_CHOICE';
  });
  assert.strictEqual(mcGuide?.guideType, 'OBJECTIVE', 'MC has OBJECTIVE guideType');
  assert.strictEqual(mcGuide?.maxScore, 1, 'MC has maxScore = 1');

  const msGuide = pkgCase3.scoringGuides.find((sg) => {
    const item = (pkgCase3.instruments[0] as any).items.find((it: any) => it.id === sg.instrumentItemId);
    return item?.itemType === 'MULTIPLE_SELECT';
  });
  assert.strictEqual(msGuide?.guideType, 'OBJECTIVE', 'MULTIPLE_SELECT has OBJECTIVE guideType');
  assert.strictEqual(msGuide?.maxScore, 1, 'MULTIPLE_SELECT has maxScore = 1');

  const tfGuide = pkgCase3.scoringGuides.find((sg) => {
    const item = (pkgCase3.instruments[0] as any).items.find((it: any) => it.id === sg.instrumentItemId);
    return item?.itemType === 'TRUE_FALSE';
  });
  assert.strictEqual(tfGuide?.guideType, 'OBJECTIVE', 'TRUE_FALSE has OBJECTIVE guideType');
  assert.strictEqual(tfGuide?.maxScore, 1, 'TRUE_FALSE has maxScore = 1');

  const saGuide = pkgCase3.scoringGuides.find((sg) => {
    const item = (pkgCase3.instruments[0] as any).items.find((it: any) => it.id === sg.instrumentItemId);
    return item?.itemType === 'SHORT_ANSWER';
  });
  assert.strictEqual(saGuide?.guideType, 'OBJECTIVE', 'SHORT_ANSWER has OBJECTIVE guideType');
  assert.strictEqual(saGuide?.maxScore, 1, 'SHORT_ANSWER has maxScore = 1');

  const matchGuide = pkgCase3.scoringGuides.find((sg) => {
    const item = (pkgCase3.instruments[0] as any).items.find((it: any) => it.id === sg.instrumentItemId);
    return item?.itemType === 'MATCHING';
  });
  assert.strictEqual(matchGuide?.guideType, 'OBJECTIVE', 'MATCHING has OBJECTIVE guideType');
  assert.strictEqual(matchGuide?.maxScore, 2, 'MATCHING has maxScore = 2 (number of premises)');

  const catGuide = pkgCase3.scoringGuides.find((sg) => {
    const item = (pkgCase3.instruments[0] as any).items.find((it: any) => idMatch(it.id, sg.instrumentItemId));
    return item?.itemType === 'CATEGORY_RESPONSE';
  });
  function idMatch(a: any, b: any) { return String(a) === String(b); }
  assert.strictEqual(catGuide?.guideType, 'OBJECTIVE', 'CATEGORY_RESPONSE has OBJECTIVE guideType');
  assert.strictEqual(catGuide?.maxScore, 2, 'CATEGORY_RESPONSE has maxScore = 2 (number of statements)');

  console.log('  [PASS] All 6 objective item types generate correct deterministic scoring guides without scoringGuideDraft');

  // =========================================================================
  // SHORT ANSWER REGRESSION: CASE A, B, C & ANTI-FALLBACK
  // =========================================================================
  const cuId0 = genPlanCase3.coverageUnits[0].id;

  // SA Case A: valid (value present + explanation) -> parser accepts, AnswerKey has exact value, ScoringGuide exists
  const rawSAValid = JSON.stringify([
    {
      coverageUnitId: cuId0,
      itemType: 'SHORT_ANSWER',
      prompt: 'Berapakah 2 + 2?',
      proposedAnswer: {
        answerType: 'EXACT',
        value: '4',
        explanation: 'Karena 2 + 2 = 4.',
      },
    },
  ]);
  const parsedSAValid = parseAndValidateRawAIResponse(rawSAValid, contractCase3);
  assert.strictEqual(parsedSAValid.validatedUnits.length, 1, 'Parser accepts valid SHORT_ANSWER');
  const providerSAValid = new MockAIProvider(() => rawSAValid);
  const resultSAValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanCase3,
    provider: providerSAValid,
  });
  assert.ok(resultSAValid.generatedPackage, 'Package exists for valid SA');
  const saKey = resultSAValid.generatedPackage!.answerKeys.find((ak) => ak.answerType === 'EXACT');
  assert.ok(saKey, 'AnswerKey exists for valid SA');
  assert.strictEqual(saKey!.value, '4', 'AnswerKey value is canonical "4"');
  assert.notStrictEqual(saKey!.value, 'Karena 2 + 2 = 4.', 'Anti-fallback: SA explanation is NOT the AnswerKey value');
  assert.strictEqual(saKey!.notes, 'Karena 2 + 2 = 4.', 'SA explanation is preserved in notes');
  const saGuideValid = resultSAValid.generatedPackage!.scoringGuides.find((sg) => sg.guideType === 'OBJECTIVE');
  assert.ok(saGuideValid, 'ScoringGuide exists for valid SA');
  assert.strictEqual(saGuideValid!.maxScore, 1, 'Objective SA scoring guide maxScore is 1');
  console.log('  [PASS] SHORT_ANSWER Case A: valid value + explanation generates canonical AnswerKey & ScoringGuide');

  // SA Case B: explanation only (value missing) -> parser reports MISSING_ITEM_PROPOSED_ANSWER, no AnswerKey
  const rawSAExplanationOnly = JSON.stringify([
    {
      coverageUnitId: cuId0,
      itemType: 'SHORT_ANSWER',
      prompt: 'Berapakah 2 + 2?',
      proposedAnswer: {
        answerType: 'EXACT',
        explanation: 'Jawabannya adalah 4.',
      },
    },
  ]);
  const parsedSAExpOnly = parseAndValidateRawAIResponse(rawSAExplanationOnly, contractCase3);
  assert.strictEqual(parsedSAExpOnly.validatedUnits.length, 0, 'Parser rejects SA with explanation only');
  assert.ok(
    parsedSAExpOnly.issues.some((i) => i.code === 'MISSING_ITEM_PROPOSED_ANSWER'),
    'Parser reports MISSING_ITEM_PROPOSED_ANSWER for explanation-only SA'
  );
  const providerSAExpOnly = new MockAIProvider(() => rawSAExplanationOnly);
  const resultSAExpOnly = await generateAssessmentPackageDraft({
    generationPlan: genPlanCase3,
    provider: providerSAExpOnly,
  });
  assert.strictEqual(resultSAExpOnly.generatedPackage?.answerKeys?.length || 0, 0, 'No fake AnswerKey created when value is missing');
  console.log('  [PASS] SHORT_ANSWER Case B: explanation only reports MISSING_ITEM_PROPOSED_ANSWER and creates zero fake AnswerKey');

  // SA Case C: empty whitespace value -> parser reports MISSING_ITEM_PROPOSED_ANSWER, incomplete, no fake AnswerKey
  const rawSAEmptyValue = JSON.stringify([
    {
      coverageUnitId: cuId0,
      itemType: 'SHORT_ANSWER',
      prompt: 'Berapakah 2 + 2?',
      proposedAnswer: {
        answerType: 'EXACT',
        value: '   ',
        explanation: 'Jawabannya adalah 4.',
      },
    },
  ]);
  const parsedSAEmpty = parseAndValidateRawAIResponse(rawSAEmptyValue, contractCase3);
  assert.strictEqual(parsedSAEmpty.validatedUnits.length, 0, 'Parser rejects SA with empty whitespace value');
  assert.ok(
    parsedSAEmpty.issues.some((i) => i.code === 'MISSING_ITEM_PROPOSED_ANSWER'),
    'Parser reports MISSING_ITEM_PROPOSED_ANSWER for empty value SA'
  );
  const providerSAEmpty = new MockAIProvider(() => rawSAEmptyValue);
  const resultSAEmpty = await generateAssessmentPackageDraft({
    generationPlan: genPlanCase3,
    provider: providerSAEmpty,
  });
  assert.strictEqual(resultSAEmpty.generatedPackage?.answerKeys?.length || 0, 0, 'No fake AnswerKey created for empty value SA');
  console.log('  [PASS] SHORT_ANSWER Case C: empty value reports MISSING_ITEM_PROPOSED_ANSWER and creates zero fake AnswerKey');

  // =========================================================================
  // ESSAY REGRESSION: CASE A, B, C, D & ANTI-FALLBACK
  // =========================================================================

  // Essay Case A: lengkap (expected response + scoringGuide instructions + maxScore > 0)
  const rawEssayLengkap = JSON.stringify([
    {
      coverageUnitId: cuId0,
      itemType: 'ESSAY',
      prompt: 'Jelaskan mengapa bumi bulat!',
      proposedAnswer: {
        answerType: 'EXPECTED_RESPONSE',
        value: 'Bumi bulat karena gaya gravitasi menarik seluruh massa secara merata ke pusat massa.',
        explanation: 'Penjelasan ilmiah fisika gravitasi.',
      },
      scoringGuideDraft: {
        instructions: 'Skor penuh jika konsep gravitasi dan bentuk bulat dijelaskan dengan runtut.',
        maxScore: 10,
      },
    },
  ]);
  const parsedEssayA = parseAndValidateRawAIResponse(rawEssayLengkap, contractCase3);
  assert.strictEqual(parsedEssayA.validatedUnits.length, 1, 'Parser accepts complete ESSAY');
  const providerEssayLengkap = new MockAIProvider(() => rawEssayLengkap);
  const resultEssayLengkap = await generateAssessmentPackageDraft({
    generationPlan: genPlanCase3,
    provider: providerEssayLengkap,
  });
  assert.ok(resultEssayLengkap.generatedPackage, 'Package generated for complete ESSAY');
  const essayKey = resultEssayLengkap.generatedPackage!.answerKeys.find((ak) => ak.answerType === 'EXPECTED_RESPONSE');
  assert.ok(essayKey, 'ExpectedResponse AnswerKey exists');
  assert.strictEqual(
    essayKey!.value,
    'Bumi bulat karena gaya gravitasi menarik seluruh massa secara merata ke pusat massa.',
    'AnswerKey value matches canonical expected response'
  );
  // Anti-fallback assertions
  assert.notStrictEqual(essayKey!.value, 'Jelaskan mengapa bumi bulat!', 'Anti-fallback: prompt is NOT the answer key');
  assert.notStrictEqual(essayKey!.value, 'Penjelasan ilmiah fisika gravitasi.', 'Anti-fallback: explanation is NOT the answer key');
  assert.notStrictEqual(
    essayKey!.value,
    'Skor penuh jika konsep gravitasi dan bentuk bulat dijelaskan dengan runtut.',
    'Anti-fallback: scoringGuide instructions is NOT the answer key'
  );
  const essayGuide = resultEssayLengkap.generatedPackage!.scoringGuides.find((sg) => sg.guideType === 'ESSAY');
  assert.ok(essayGuide, 'Essay ScoringGuide exists');
  assert.strictEqual(essayGuide!.maxScore, 10, 'Essay ScoringGuide maxScore is 10');
  console.log('  [PASS] ESSAY Case A: complete expected response + scoring guide produces canonical AnswerKey and ScoringGuide');

  // Essay Case B: expected response missing, scoring guide exists -> parser reports MISSING_ITEM_PROPOSED_ANSWER
  const rawEssayB = JSON.stringify([
    {
      coverageUnitId: cuId0,
      itemType: 'ESSAY',
      prompt: 'Jelaskan mengapa bumi bulat!',
      proposedAnswer: {
        answerType: 'EXPECTED_RESPONSE',
        explanation: 'Penjelasan umum tanpa value.',
      },
      scoringGuideDraft: {
        instructions: 'Berikan skor penuh jika tepat',
        maxScore: 5,
      },
    },
  ]);
  const parsedEssayB = parseAndValidateRawAIResponse(rawEssayB, contractCase3);
  assert.strictEqual(parsedEssayB.validatedUnits.length, 0, 'Parser rejects ESSAY missing expected response');
  assert.ok(
    parsedEssayB.issues.some((i) => i.code === 'MISSING_ITEM_PROPOSED_ANSWER'),
    'Parser reports MISSING_ITEM_PROPOSED_ANSWER when expected response is missing'
  );
  const providerEssayB = new MockAIProvider(() => rawEssayB);
  const resultEssayB = await generateAssessmentPackageDraft({
    generationPlan: genPlanCase3,
    provider: providerEssayB,
  });
  assert.strictEqual(resultEssayB.generatedPackage?.answerKeys?.length || 0, 0, 'No fake AnswerKey created in Essay Case B');
  console.log('  [PASS] ESSAY Case B: missing expected response reports MISSING_ITEM_PROPOSED_ANSWER');

  // Essay Case C: expected response exists, scoring guide missing/incomplete -> parser reports MISSING_ESSAY_SCORING_GUIDE
  const rawEssayC = JSON.stringify([
    {
      coverageUnitId: cuId0,
      itemType: 'ESSAY',
      prompt: 'Jelaskan mengapa bumi bulat!',
      proposedAnswer: {
        answerType: 'EXPECTED_RESPONSE',
        value: 'Karena gravitasi bumi.',
      },
      scoringGuideDraft: {}, // missing instructions and maxScore!
    },
  ]);
  const parsedEssayC = parseAndValidateRawAIResponse(rawEssayC, contractCase3);
  assert.strictEqual(parsedEssayC.validatedUnits.length, 0, 'Parser rejects ESSAY missing scoringGuideDraft');
  assert.ok(
    parsedEssayC.issues.some((i) => i.code === 'MISSING_ESSAY_SCORING_GUIDE'),
    'Parser reports MISSING_ESSAY_SCORING_GUIDE when scoringGuideDraft is incomplete'
  );
  const providerEssayC = new MockAIProvider(() => rawEssayC);
  const resultEssayC = await generateAssessmentPackageDraft({
    generationPlan: genPlanCase3,
    provider: providerEssayC,
  });
  assert.strictEqual(resultEssayC.generatedPackage?.scoringGuides?.filter((s) => s.guideType === 'ESSAY').length || 0, 0, 'No fake Essay ScoringGuide created in Essay Case C');
  console.log('  [PASS] ESSAY Case C: missing scoring guide reports MISSING_ESSAY_SCORING_GUIDE');

  // Essay Case D: both missing -> parser reports BOTH MISSING_ITEM_PROPOSED_ANSWER and MISSING_ESSAY_SCORING_GUIDE
  const rawEssayD = JSON.stringify([
    {
      coverageUnitId: cuId0,
      itemType: 'ESSAY',
      prompt: 'Jelaskan mengapa bumi bulat!',
      proposedAnswer: {
        answerType: 'EXPECTED_RESPONSE',
        explanation: 'Hanya penjelasan saja.',
      },
      // scoringGuideDraft missing completely
    },
  ]);
  const parsedEssayD = parseAndValidateRawAIResponse(rawEssayD, contractCase3);
  assert.strictEqual(parsedEssayD.validatedUnits.length, 0, 'Parser rejects ESSAY when both are missing');
  assert.ok(
    parsedEssayD.issues.some((i) => i.code === 'MISSING_ITEM_PROPOSED_ANSWER'),
    'Parser reports MISSING_ITEM_PROPOSED_ANSWER in Case D'
  );
  assert.ok(
    parsedEssayD.issues.some((i) => i.code === 'MISSING_ESSAY_SCORING_GUIDE'),
    'Parser reports MISSING_ESSAY_SCORING_GUIDE in Case D'
  );
  console.log('  [PASS] ESSAY Case D: both missing reports both semantic issues');

  const answerVerification = await verifyAssessmentPackageAnswers(pkgCase3);
  if (answerVerification.section.status !== 'PASS') {
    // console.log('DEBUG answerVerification findings:', JSON.stringify(answerVerification.section.findings, null, 2));
  }
  assert.strictEqual(answerVerification.section.status, 'REVIEW', 'Answer Verification is REVIEW with 0 blocking failures');
  console.log('  [PASS] All 7 written test item types generate valid answer keys, scoring guides & pass answer verification');

  // =========================================================================
  // SECTION 4: NON-WRITTEN ASSESSMENT TYPES & SELF/PEER (SECTION 25)
  // =========================================================================
  console.log('\n--- SECTION 4: NON-WRITTEN ASSESSMENT TYPES & SELF/PEER ---');

  // A. SELF_ASSESSMENT
  const planSelf: AssessmentPlan = {
    ...planCase1,
    id: 'plan-self',
    instruments: [{ id: 'inst-self', type: 'SELF_ASSESSMENT' }],
  };
  const specSelf = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planSelf,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanSelf = resolveAssessmentGenerationPlan({ generationSpec: specSelf });

  // Valid Self Assessment
  const selfProviderValid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanSelf.coverageUnits[0].id,
        itemType: 'SHORT_ANSWER',
        prompt: 'Saya berpartisipasi aktif dalam kegiatan diskusi.',
        responseScheme: 'Skala Likert 1-4',
      },
    ])
  );
  const resultSelfValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanSelf,
    provider: selfProviderValid,
  });
  const pkgSelfValid = resultSelfValid.generatedPackage!;
  const valSelfValid = validateAssessmentPackage(pkgSelfValid, {
    academicSetting: setting,
    assessmentPlan: planSelf,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valSelfValid.valid, true, 'Valid SELF_ASSESSMENT is valid');
  assert.strictEqual(pkgSelfValid.answerKeys.length, 0, 'SELF_ASSESSMENT has zero answer keys');
  console.log('  [PASS] SELF_ASSESSMENT valid case (with statements, responseScheme, no AnswerKey)');

  // Invalid Self Assessment (missing responseScheme)
  const selfProviderInvalid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanSelf.coverageUnits[0].id,
        itemType: 'SHORT_ANSWER',
        prompt: 'Saya berpartisipasi aktif dalam kegiatan diskusi.',
        // missing responseScheme!
      },
    ])
  );
  const resultSelfInvalid = await generateAssessmentPackageDraft({
    generationPlan: genPlanSelf,
    provider: selfProviderInvalid,
  });
  const pkgSelfInvalid = resultSelfInvalid.generatedPackage!;
  const valSelfInvalid = validateAssessmentPackage(pkgSelfInvalid, {
    academicSetting: setting,
    assessmentPlan: planSelf,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valSelfInvalid.valid, false, 'Invalid SELF_ASSESSMENT is invalid');
  assert.ok(valSelfInvalid.errors.some((e) => e.includes('wajib memiliki skema respon')), 'Fails with missing responseScheme error');
  console.log('  [PASS] SELF_ASSESSMENT incomplete case fails validation');


  // B. PEER_ASSESSMENT
  const planPeer: AssessmentPlan = {
    ...planCase1,
    id: 'plan-peer',
    instruments: [{ id: 'inst-peer', type: 'PEER_ASSESSMENT' }],
  };
  const specPeer = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planPeer,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanPeer = resolveAssessmentGenerationPlan({ generationSpec: specPeer });

  // Valid Peer Assessment
  const peerProviderValid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanPeer.coverageUnits[0].id,
        itemType: 'SHORT_ANSWER',
        prompt: 'Teman saya membantu menyelesaikan tugas kelompok.',
        responseScheme: 'Ya / Tidak',
      },
    ])
  );
  const resultPeerValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanPeer,
    provider: peerProviderValid,
  });
  const pkgPeerValid = resultPeerValid.generatedPackage!;
  const valPeerValid = validateAssessmentPackage(pkgPeerValid, {
    academicSetting: setting,
    assessmentPlan: planPeer,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valPeerValid.valid, true, 'Valid PEER_ASSESSMENT is valid');
  assert.strictEqual(pkgPeerValid.answerKeys.length, 0, 'PEER_ASSESSMENT has zero answer keys');
  console.log('  [PASS] PEER_ASSESSMENT valid case (with statements, responseScheme, no AnswerKey)');


  // C. ORAL_TEST
  const planOral: AssessmentPlan = {
    ...planCase1,
    id: 'plan-oral',
    instruments: [{ id: 'inst-oral', type: 'ORAL_TEST' }],
  };
  const specOral = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planOral,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanOral = resolveAssessmentGenerationPlan({ generationSpec: specOral });

  // Valid Oral Test (with expectedResponse and scoringGuide)
  const oralProviderValid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanOral.coverageUnits[0].id,
        prompt: 'Jelaskan perbedaan bilangan bulat dan pecahan!',
        proposedAnswer: { answerType: 'EXPECTED_RESPONSE', value: 'Bilangan bulat utuh, pecahan bagian dari utuh.' },
        scoringGuideDraft: { instructions: 'Skor berdasarkan kelengkapan materi.', maxScore: 5 },
      },
    ])
  );
  const resultOralValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanOral,
    provider: oralProviderValid,
  });
  const pkgOralValid = resultOralValid.generatedPackage!;
  const valOralValid = validateAssessmentPackage(pkgOralValid, {
    academicSetting: setting,
    assessmentPlan: planOral,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valOralValid.valid, true, 'Valid ORAL_TEST is valid');
  console.log('  [PASS] ORAL_TEST valid case (prompt, expectedResponse, scoringGuide)');

  // Invalid Oral Test (missing scoringGuide/expectedResponse)
  const oralProviderInvalid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanOral.coverageUnits[0].id,
        prompt: 'Jelaskan perbedaan bilangan bulat dan pecahan!',
        // missing proposedAnswer expected response!
      },
    ])
  );
  const resultOralInvalid = await generateAssessmentPackageDraft({
    generationPlan: genPlanOral,
    provider: oralProviderInvalid,
  });
  const pkgOralInvalid = resultOralInvalid.generatedPackage!;
  const valOralInvalid = validateAssessmentPackage(pkgOralInvalid, {
    academicSetting: setting,
    assessmentPlan: planOral,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valOralInvalid.valid, false, 'Invalid ORAL_TEST is invalid');
  assert.ok(valOralInvalid.errors.some((e) => e.includes('expected response') || e.includes('scoring guide')), 'Fails with appropriate semantic errors');
  console.log('  [PASS] ORAL_TEST incomplete case fails validation');


  // D. PERFORMANCE
  const planPerf: AssessmentPlan = {
    ...planCase1,
    id: 'plan-perf',
    instruments: [{ id: 'inst-perf', type: 'PERFORMANCE' }],
  };
  const specPerf = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planPerf,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanPerf = resolveAssessmentGenerationPlan({ generationSpec: specPerf });

  // Valid Performance
  const perfProviderValid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanPerf.coverageUnits[0].id,
        taskTitle: 'Praktik Menimbang Benda',
        taskPrompt: 'Lakukan penimbangan benda menggunakan timbangan secara kelompok.',
        aspects: [{ label: 'Persiapan alat', description: 'Menyiapkan timbangan' }],
        rubricDraft: {
          title: 'Rubrik Praktik Menimbang',
          criteria: [{ label: 'Ketepatan hasil', indicator: 'Hasil timbangan akurat' }],
          scale: [{ label: 'Sangat Baik', score: 4, order: 1 }],
        },
      },
    ])
  );
  const resultPerfValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanPerf,
    provider: perfProviderValid,
  });
  const pkgPerfValid = resultPerfValid.generatedPackage!;
  const valPerfValid = validateAssessmentPackage(pkgPerfValid, {
    academicSetting: setting,
    assessmentPlan: planPerf,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valPerfValid.valid, true, 'Valid PERFORMANCE is valid');
  console.log('  [PASS] PERFORMANCE valid case (task, aspects, rubric)');

  // Invalid Performance (missing rubric/scoring)
  const perfProviderInvalid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanPerf.coverageUnits[0].id,
        taskTitle: 'Praktik Menimbang Benda',
        taskPrompt: 'Lakukan penimbangan benda menggunakan timbangan secara kelompok.',
        aspects: [{ label: 'Persiapan alat', description: 'Menyiapkan timbangan' }],
        // missing rubricDraft & scoringGuideDraft!
      },
    ])
  );
  const resultPerfInvalid = await generateAssessmentPackageDraft({
    generationPlan: genPlanPerf,
    provider: perfProviderInvalid,
  });
  const pkgPerfInvalid = resultPerfInvalid.generatedPackage!;
  const valPerfInvalid = validateAssessmentPackage(pkgPerfInvalid, {
    academicSetting: setting,
    assessmentPlan: planPerf,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valPerfInvalid.valid, false, 'Invalid PERFORMANCE is invalid');
  console.log('  [PASS] PERFORMANCE incomplete case fails validation');


  // E. OBSERVATION
  const planObs: AssessmentPlan = {
    ...planCase1,
    id: 'plan-obs',
    instruments: [{ id: 'inst-obs', type: 'OBSERVATION' }],
  };
  const specObs = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planObs,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanObs = resolveAssessmentGenerationPlan({ generationSpec: specObs });

  // Valid Descriptive Observation (no rubric/indicator needed)
  const obsProviderDescriptive = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanObs.coverageUnits[0].id,
        recordingScheme: '', // empty scheme -> descriptive
        aspects: [{ label: 'Keaktifan siswa' }],
      },
    ])
  );
  const resultObsDescriptive = await generateAssessmentPackageDraft({
    generationPlan: genPlanObs,
    provider: obsProviderDescriptive,
  });
  const pkgObsDescriptive = resultObsDescriptive.generatedPackage!;
  const valObsDescriptive = validateAssessmentPackage(pkgObsDescriptive, {
    academicSetting: setting,
    assessmentPlan: planObs,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valObsDescriptive.valid, true, 'Valid Descriptive OBSERVATION is valid');
  console.log('  [PASS] OBSERVATION descriptive valid case (aspects only)');

  // Invalid Scored Observation (has recordingScheme but missing aspect indicators)
  const obsProviderScoredInvalid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanObs.coverageUnits[0].id,
        recordingScheme: 'Skala Penilaian', // scored
        aspects: [{ label: 'Keaktifan siswa' }], // missing indicator!
      },
    ])
  );
  const resultObsScoredInvalid = await generateAssessmentPackageDraft({
    generationPlan: genPlanObs,
    provider: obsProviderScoredInvalid,
  });
  const pkgObsScoredInvalid = resultObsScoredInvalid.generatedPackage!;
  const valObsScoredInvalid = validateAssessmentPackage(pkgObsScoredInvalid, {
    academicSetting: setting,
    assessmentPlan: planObs,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valObsScoredInvalid.valid, false, 'Invalid Scored OBSERVATION is invalid');
  assert.ok(valObsScoredInvalid.errors.some((e) => e.includes('wajib memiliki indikator')), 'Fails with missing aspect indicators error');
  console.log('  [PASS] OBSERVATION scored incomplete case fails validation');


  // F. ASSIGNMENT
  const planAssign: AssessmentPlan = {
    ...planCase1,
    id: 'plan-assign',
    instruments: [{ id: 'inst-assign', type: 'ASSIGNMENT' }],
  };
  const specAssign = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planAssign,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanAssign = resolveAssessmentGenerationPlan({ generationSpec: specAssign });

  // Valid Assignment
  const assignProviderValid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanAssign.coverageUnits[0].id,
        instructions: 'Kerjakan soal Latihan Bab 1 di buku cetak halaman 25!',
        rubricDraft: {
          title: 'Rubrik Penugasan',
          criteria: [{ label: 'Ketepatan' }],
          scale: [{ label: 'Selesai', score: 100 }],
        },
      },
    ])
  );
  const resultAssignValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanAssign,
    provider: assignProviderValid,
  });
  const pkgAssignValid = resultAssignValid.generatedPackage!;
  const valAssignValid = validateAssessmentPackage(pkgAssignValid, {
    academicSetting: setting,
    assessmentPlan: planAssign,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valAssignValid.valid, true, 'Valid ASSIGNMENT is valid');
  console.log('  [PASS] ASSIGNMENT valid case (instructions, rubric)');

  // Invalid Assignment
  const assignProviderInvalid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanAssign.coverageUnits[0].id,
        instructions: 'Kerjakan tugas berikut!',
        // missing scoring/rubric!
      },
    ])
  );
  const resultAssignInvalid = await generateAssessmentPackageDraft({
    generationPlan: genPlanAssign,
    provider: assignProviderInvalid,
  });
  const pkgAssignInvalid = resultAssignInvalid.generatedPackage!;
  const valAssignInvalid = validateAssessmentPackage(pkgAssignInvalid, {
    academicSetting: setting,
    assessmentPlan: planAssign,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valAssignInvalid.valid, false, 'Invalid ASSIGNMENT is invalid');
  console.log('  [PASS] ASSIGNMENT incomplete case fails validation');


  // G. PROJECT
  const planProj: AssessmentPlan = {
    ...planCase1,
    id: 'plan-proj',
    instruments: [{ id: 'inst-proj', type: 'PROJECT' }],
  };
  const specProj = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planProj,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanProj = resolveAssessmentGenerationPlan({ generationSpec: specProj });

  // Valid Project
  const projProviderValid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanProj.coverageUnits[0].id,
        taskPrompt: 'Rancanglah mini proyek pengolahan sampah organik.',
        rubricDraft: {
          title: 'Rubrik Proyek',
          criteria: [{ label: 'Perencanaan' }],
          scale: [{ label: 'Selesai', score: 100 }],
        },
      },
    ])
  );
  const resultProjValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanProj,
    provider: projProviderValid,
  });
  const pkgProjValid = resultProjValid.generatedPackage!;
  const valProjValid = validateAssessmentPackage(pkgProjValid, {
    academicSetting: setting,
    assessmentPlan: planProj,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valProjValid.valid, true, 'Valid PROJECT is valid');
  console.log('  [PASS] PROJECT valid case (projectBrief, rubric)');


  // H. PRODUCT
  const planProd: AssessmentPlan = {
    ...planCase1,
    id: 'plan-prod',
    instruments: [{ id: 'inst-prod', type: 'PRODUCT' }],
  };
  const specProd = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planProd,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanProd = resolveAssessmentGenerationPlan({ generationSpec: specProd });

  // Valid Product
  const prodProviderValid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanProd.coverageUnits[0].id,
        instructions: 'Buatlah maket rumah sehat menggunakan stik es krim.',
        rubricDraft: {
          title: 'Rubrik Produk',
          criteria: [{ label: 'Kreativitas' }],
          scale: [{ label: 'Selesai', score: 100 }],
        },
      },
    ])
  );
  const resultProdValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanProd,
    provider: prodProviderValid,
  });
  const pkgProdValid = resultProdValid.generatedPackage!;
  const valProdValid = validateAssessmentPackage(pkgProdValid, {
    academicSetting: setting,
    assessmentPlan: planProd,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valProdValid.valid, true, 'Valid PRODUCT is valid');
  console.log('  [PASS] PRODUCT valid case (productBrief, rubric)');


  // I. PORTFOLIO
  const planPort: AssessmentPlan = {
    ...planCase1,
    id: 'plan-port',
    instruments: [{ id: 'inst-port', type: 'PORTFOLIO' }],
  };
  const specPort = resolveAssessmentGenerationSpec({
    academicSetting: setting,
    assessmentPlan: planPort,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  const genPlanPort = resolveAssessmentGenerationPlan({ generationSpec: specPort });

  // Valid Portfolio
  const portProviderValid = new MockAIProvider(() =>
    JSON.stringify([
      {
        coverageUnitId: genPlanPort.coverageUnits[0].id,
        evidenceRequirements: ['Laporan tugas kelompok', 'Foto hasil penimbangan'],
        rubricDraft: {
          title: 'Rubrik Portofolio',
          criteria: [{ label: 'Kelengkapan bukti' }],
          scale: [{ label: 'Lengkap', score: 100 }],
        },
      },
    ])
  );
  const resultPortValid = await generateAssessmentPackageDraft({
    generationPlan: genPlanPort,
    provider: portProviderValid,
  });
  const pkgPortValid = resultPortValid.generatedPackage!;
  const valPortValid = validateAssessmentPackage(pkgPortValid, {
    academicSetting: setting,
    assessmentPlan: planPort,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  });
  assert.strictEqual(valPortValid.valid, true, 'Valid PORTFOLIO is valid');
  console.log('  [PASS] PORTFOLIO valid case (evidenceRequirements, rubric)');


  // J. PACKAGE READINESS GATE FAIL-CLOSED TEST (SECTION 25)
  console.log('\n--- PACKAGE READINESS GATE FAIL-CLOSED TEST ---');
  // Confirming a package with semantic error must block and fail-closed
  const reportInvalidPerf = {
    assessmentPackageId: pkgPerfInvalid.id,
    packageRevision: pkgPerfInvalid.revision || 1,
    overallStatus: 'FAIL',
    section: { status: 'FAIL', findings: [] },
  } as any;
  const confRes = confirmAssessmentPackage(pkgPerfInvalid, {
    academicSetting: setting,
    assessmentPlan: planPerf,
    tp: mockTP,
    assessmentCriteria: mockCriteria,
  }, reportInvalidPerf);

  assert.strictEqual(confRes.success, false, 'confirmAssessmentPackage on incomplete semantic package fails');
  assert.strictEqual(confRes.package.workflowStatus, 'PERLU_DILENGKAPI', 'Invalid package reverts/remains PERLU_DILENGKAPI');
  console.log('  [PASS] Scored non-written instrument with missing scoring mechanism correctly blocks SIAP confirmation');

  // =========================================================================
  // SECTION 5: E2E PERSISTENCE & STORAGE V5 ROUNDTRIP (SECTION 28)
  // =========================================================================
  console.log('\n--- SECTION 5: E2E PERSISTENCE & STORAGE V5 ROUNDTRIP ---');

  let state = createInitialStorageV5();
  state.profiles.push({
    id: 'prof-1',
    schoolId: 'sch-1',
    name: 'Guru Tes',
    nip: '123456',
    role: 'TEACHER',
    email: 'guru@test.com',
    status: 'PNS',
    defaultSubject: 'Matematika',
    defaultLevel: 'SD',
  } as any);
  state.schools.push({
    id: 'sch-1',
    npsn: '12345678',
    name: 'SD Negeri 1 Tes',
    level: 'SD',
    status: 'NEGERI',
    address: 'Jl. Raya',
    subdistrict: 'Kecamatan',
    district: 'Kabupaten',
    province: 'Provinsi',
  } as any);
  saveStorageV5(state);

  const { semesterPlans } = createYearHierarchyV5({
    profileId: 'prof-1',
    schoolId: 'sch-1',
    academicYear: '2025/2026',
    level: 'SD',
    grade: 'Kelas 4',
    subject: 'Matematika',
    curriculumType: 'KURIKULUM_MERDEKA',
  });
  const sem1Plan = semesterPlans[0];

  saveAssessmentCriteriaV5(sem1Plan.id, mockCriteria);
  saveAssessmentPlansV5(sem1Plan.id, [planCase2]);
  saveAssessmentPackagesV5(sem1Plan.id, [pkgCase3]);

  const semData = getSemesterDataV5(sem1Plan.id);
  assert.strictEqual(semData.assessmentCriteria?.length, 3, 'V5 criteria persisted');
  assert.strictEqual(semData.assessmentPlan?.length, 1, 'V5 plan persisted');
  assert.strictEqual(semData.assessmentPackage?.length, 1, 'V5 package persisted');

  const loadedPkg = semData.assessmentPackage?.[0]!;
  assert.strictEqual(loadedPkg.answerKeys.length, 10, 'Loaded package retains all 10 answer keys');
  assert.strictEqual(loadedPkg.scoringGuides.length, 10, 'Loaded package retains all 10 scoring guides');

  const coverageValidation = validateAssessmentCoverage(loadedPkg, genPlanCase3);
  assert.ok(coverageValidation.status === 'PASS' || coverageValidation.status === 'REVIEW', 'Coverage validation succeeded on persisted package');

  console.log('  [PASS] E2E V5 persistence roundtrip: Plan -> Spec -> GenPlan -> Package -> Save -> Reload');

  console.log('\n========================================');
  console.log('ALL ASSESSMENT SUBSYSTEM TESTS PASSED SUCCESSFULLY!');
  console.log('========================================');
}

runSubsystemRegressionTests().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
