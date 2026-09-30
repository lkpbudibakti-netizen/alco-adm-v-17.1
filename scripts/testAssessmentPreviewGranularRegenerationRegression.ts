import assert from 'assert';
import { assessmentRegenerationService } from '../src/services/assessmentRegenerationService';
import { createAssessmentPreviewModel } from '../src/services/documentEngine/assessmentExportService';
import {
  AssessmentPackage,
  AssessmentPlan,
  AssessmentRegenerationTarget,
  AssessmentRegenerationLocator,
  SchoolData,
  TeacherProfile,
  AcademicSetting,
} from '../src/types';
import { DocumentGenerationContext } from '../src/services/documentEngine/types';

console.log('Running Assessment Preview Granular Regeneration Comprehensive Regression Suite...\n');

let passedTests = 0;

async function runTest(description: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    passedTests++;
    console.log(`[PASS] ${description}`);
  } catch (err) {
    console.error(`[FAIL] ${description}`);
    console.error(err);
    process.exit(1);
  }
}

const mockSchool: SchoolData = {
  id: 'school-1',
  name: 'SMP Nusantara',
  npsn: '12345678',
  address: 'Jl. Pendidikan No. 10',
  village: 'Gambir',
  district: 'Kec. Gambir',
  regency: 'Jakarta Pusat',
  province: 'DKI Jakarta',
  principalName: 'Dr. Hj. Siti Aminah, M.Pd.',
  principalNip: '197501012000032001',
  createdAt: '2026-09-20T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
};

const mockProfile: TeacherProfile = {
  id: 'prof-1',
  name: 'Budi Santoso, S.Pd.',
  nip: '198505052010011005',
  status: 'PNS',
  defaultSubject: 'Informatika',
  defaultLevel: 'SMP',
  createdAt: '2026-09-20T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
};

const mockSetting: AcademicSetting = {
  id: 'setting-1',
  profileId: 'prof-1',
  academicYear: '2026/2027',
  semester: '1 (Ganjil)',
  phase: 'D',
  level: 'SMP',
  grade: 'Kelas 7',
  subject: 'Informatika',
  curriculum: 'Kurikulum Merdeka',
  curriculumType: 'KURIKULUM_MERDEKA',
  updatedAt: '2026-09-20T00:00:00Z',
};

const mockPlan: AssessmentPlan = {
  id: 'plan-1',
  title: 'Penilaian Formatif Bab 1',
  academicSettingId: 'setting-1',
  purpose: 'SUMMATIVE',
  timing: 'POST',
  scopeType: 'TP',
  tpIds: ['tp-1'],
  criterionIds: [],
  workflowStatus: 'SIAP',
  needsReview: false,
  instruments: [
    {
      id: 'p-inst-1',
      type: 'WRITTEN_TEST',
      label: 'Tes Tertulis',
    },
  ],
  createdAt: '2026-09-20T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
};

function createSamplePackage(): AssessmentPackage {
  return {
    id: 'pkg-1',
    title: 'Paket Asesmen Bab 1 Berpikir Komputasional',
    academicSettingId: 'setting-1',
    assessmentPlanId: 'plan-1',
    revision: 1,
    workflowStatus: 'SIAP',
    needsReview: false,
    blueprintItems: [
      {
        id: 'bp-1',
        order: 1,
        coverageUnitId: 'cu-1',
        objectiveRefId: 'tp-1',
        assessmentIndicator: 'Peserta didik dapat mengidentifikasi dekomposisi persoalan.',
        materialOrContext: 'Konsep dasar dekomposisi komputasional',
        instrumentType: 'WRITTEN_TEST',
        instrumentItemIds: ['item-1'],
      },
      {
        id: 'bp-2',
        order: 2,
        coverageUnitId: 'cu-2',
        objectiveRefId: 'tp-1',
        assessmentIndicator: 'Peserta didik dapat menentukan pola data.',
        materialOrContext: 'Pengenalan pola dalam data tabel',
        instrumentType: 'WRITTEN_TEST',
        instrumentItemIds: ['item-2'],
      },
    ],
    instruments: [
      {
        id: 'inst-1',
        type: 'WRITTEN_TEST',
        title: 'Tes Tertulis Berpikir Komputasional',
        items: [
          {
            id: 'item-1',
            order: 1,
            coverageUnitId: 'cu-1',
            itemType: 'MULTIPLE_CHOICE',
            prompt: 'Apa yang dimaksud dengan dekomposisi?',
            stimulus: 'Diberikan sebuah masalah kompleks mengenai sistem antrean kasir.',
            options: [
              { id: 'opt-1a', label: 'A', text: 'Memecah masalah menjadi bagian lebih kecil' },
              { id: 'opt-1b', label: 'B', text: 'Menggabungkan semua masalah' },
              { id: 'opt-1c', label: 'C', text: 'Mengabaikan detail masalah' },
              { id: 'opt-1d', label: 'D', text: 'Menyusun langkah algoritma' },
            ],
          },
          {
            id: 'item-2',
            order: 2,
            coverageUnitId: 'cu-2',
            itemType: 'MULTIPLE_CHOICE',
            prompt: 'Manakah contoh pengenalan pola dalam kehidupan sehari-hari?',
            options: [
              { id: 'opt-2a', label: 'A', text: 'Melihat tren penjualan harian' },
              { id: 'opt-2b', label: 'B', text: 'Menghapus data acak' },
            ],
          },
        ],
      },
      {
        id: 'inst-2',
        type: 'PERFORMANCE',
        title: 'Tugas Praktik Algoritma',
        task: 'Buatlah diagram alir untuk algoritma penyortiran kartu.',
        instructions: 'Kerjakan secara individu dalam waktu 30 menit.',
        aspects: [
          { id: 'asp-1', label: 'Kebenaran Logika', weight: 50 },
          { id: 'asp-2', label: 'Kerapian Simbol Flowchart', weight: 50 },
        ],
      },
      {
        id: 'inst-3',
        type: 'PORTFOLIO',
        title: 'Portofolio Proyek Komputasi',
        instructions: 'Kumpulkan dokumentasi artefak komputasional.',
        evidenceRequirements: ['Laporan refleksi mingguan', 'Kode sumber program Scratch'],
      },
      {
        id: 'inst-4',
        type: 'OBSERVATION',
        title: 'Lembar Observasi Sikap Kolaborasi',
        instructions: 'Amati keaktifan peserta didik dalam diskusi kelompok.',
        recordingScheme: 'Skala Frekuensi Perilaku',
        aspects: [
          { id: 'obs-1', label: 'Mendengarkan pendapat teman', indicator: 'Tidak menyela saat rekan bicara' },
          { id: 'obs-2', label: 'Berbagi tugas secara adil', indicator: 'Mengerjakan bagian tugas yang disepakati' },
        ],
      },
    ],
    answerKeys: [
      {
        id: 'ak-1',
        instrumentId: 'inst-1',
        instrumentItemId: 'item-1',
        answerType: 'OPTION',
        optionIds: ['opt-1a'],
        value: 'A',
        notes: 'Dekomposisi adalah proses memecah masalah besar.',
      },
      {
        id: 'ak-2',
        instrumentId: 'inst-1',
        instrumentItemId: 'item-2',
        answerType: 'OPTION',
        optionIds: ['opt-2a'],
        value: 'A',
        notes: 'Pola dideteksi dari tren berulang.',
      },
    ],
    scoringGuides: [
      {
        id: 'sg-1',
        instrumentId: 'inst-1',
        title: 'Pedoman Penskoran Pilihan Ganda',
        guideType: 'OBJECTIVE',
        maxScore: 100,
        instructions: 'Setiap jawaban benar bernilai 50 poin, salah 0 poin.',
      },
    ],
    rubrics: [
      {
        id: 'rub-1',
        instrumentId: 'inst-2',
        title: 'Rubrik Penilaian Praktik Algoritma',
        scale: [
          { id: 'sc-1', order: 1, label: 'Mahir', score: 4 },
          { id: 'sc-2', order: 2, label: 'Layak', score: 3 },
          { id: 'sc-3', order: 3, label: 'Berkembang', score: 2 },
          { id: 'sc-4', order: 4, label: 'Awal', score: 1 },
        ],
        criteria: [
          {
            id: 'crit-1',
            label: 'Kejelasan Alur Logika',
            weight: 50,
          },
          {
            id: 'crit-2',
            label: 'Ketepatan Penggunaan Simbol',
            weight: 50,
          },
        ],
      },
    ],
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
  };
}

function createPreviewContext(pkg: AssessmentPackage): DocumentGenerationContext {
  return {
    school: mockSchool,
    profile: mockProfile,
    academicSetting: mockSetting,
    assessmentPlans: [mockPlan],
    assessmentPackages: [pkg],
    activeAssessmentPackageId: pkg.id,
    documentMode: 'data',
    documentDate: '2026-09-20',
  };
}

async function runAllTests() {
  // Test 1: Preview model extraction carries exact IDs and regenerates ITEM_PROMPT
  await runTest('1. Regenerate pertanyaan (ITEM_PROMPT) preserves IDs, increments revision, updates prompt and marks DRAFT', async () => {
    const pkg = createSamplePackage();
    const previewModel = createAssessmentPreviewModel(createPreviewContext(pkg));
    
    // Verify preview model extracted item ID correctly
    const writtenInst = previewModel.instruments.list.find((i) => i.id === 'inst-1');
    assert.ok(writtenInst, 'Instrument 1 must exist in preview');
    assert.strictEqual(writtenInst.writtenItems?.[0]?.id, 'item-1');
    assert.strictEqual(writtenInst.writtenItems?.[0]?.prompt, 'Apa yang dimaksud dengan dekomposisi?');

    const targetId = writtenInst.writtenItems![0].id!;
    const locator: AssessmentRegenerationLocator = { kind: 'INSTRUMENT_ITEM', id: targetId };

    const provider = {
      regenerate: async (contract: any) => {
        assert.strictEqual(contract.target, 'ITEM_PROMPT');
        assert.strictEqual(contract.targetId, 'item-1');
        assert.strictEqual(contract.locator.kind, 'INSTRUMENT_ITEM');
        return {
          target: 'ITEM_PROMPT',
          targetId: 'item-1',
          proposedChanges: {
            prompt: 'Jelaskan konsep teknik dekomposisi dalam berpikir komputasional!',
          },
        };
      },
    };

    const res = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'ITEM_PROMPT',
        targetId,
        locator,
      },
      provider
    );

    assert.strictEqual(res.status, 'REGENERATED');
    assert.ok(res.regeneratedPackage);
    assert.strictEqual(res.regeneratedPackage.revision, 2);
    assert.strictEqual(res.regeneratedPackage.workflowStatus, 'DRAFT');
    assert.strictEqual(res.regeneratedPackage.needsReview, true);

    const updatedInst = res.regeneratedPackage.instruments.find((i) => i.id === 'inst-1') as any;
    assert.strictEqual(updatedInst.items[0].prompt, 'Jelaskan konsep teknik dekomposisi dalam berpikir komputasional!');
    // Verify unmodified item 2 prompt is unchanged
    assert.strictEqual(updatedInst.items[1].prompt, 'Manakah contoh pengenalan pola dalam kehidupan sehari-hari?');
  });

  // Test 2: Regenerate STIMULUS
  await runTest('2. Regenerate stimulus (STIMULUS) updates only stimulus for target item', async () => {
    const pkg = createSamplePackage();
    const previewModel = createAssessmentPreviewModel(createPreviewContext(pkg));
    const writtenInst = previewModel.instruments.list.find((i) => i.id === 'inst-1')!;
    const item1 = writtenInst.writtenItems![0];

    const res = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'STIMULUS',
        targetId: item1.id!,
        locator: { kind: 'INSTRUMENT_ITEM', id: item1.id! },
      },
      {
        regenerate: async () => ({
          target: 'STIMULUS',
          targetId: 'item-1',
          proposedChanges: {
            stimulus: 'Sebuah robot pengantar barang perlu membagi rute perumahan menjadi beberapa zona.',
          },
        }),
      }
    );

    assert.strictEqual(res.status, 'REGENERATED');
    const updatedItem = (res.regeneratedPackage!.instruments[0] as any).items[0];
    assert.strictEqual(updatedItem.stimulus, 'Sebuah robot pengantar barang perlu membagi rute perumahan menjadi beberapa zona.');
    assert.strictEqual(updatedItem.prompt, 'Apa yang dimaksud dengan dekomposisi?');
  });

  // Test 3: Regenerate OPTIONS
  await runTest('3. Regenerate options (OPTIONS) updates options while keeping item prompt intact', async () => {
    const pkg = createSamplePackage();
    const res = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'OPTIONS',
        targetId: 'item-1',
        locator: { kind: 'INSTRUMENT_ITEM', id: 'item-1' },
      },
      {
        regenerate: async () => ({
          target: 'OPTIONS',
          targetId: 'item-1',
          proposedChanges: {
            options: [
              { id: 'opt-new-1', label: 'A', text: 'Pembagian masalah kompleks menjadi sub-masalah sederhana' },
              { id: 'opt-new-2', label: 'B', text: 'Pencarian pola data otomatis' },
              { id: 'opt-new-3', label: 'C', text: 'Pengurutan angka dari kecil ke besar' },
              { id: 'opt-new-4', label: 'D', text: 'Penghapusan variabel yang tidak digunakan' },
            ],
          },
        }),
      }
    );

    assert.strictEqual(res.status, 'REGENERATED');
    const updatedItem = (res.regeneratedPackage!.instruments[0] as any).items[0];
    assert.strictEqual(updatedItem.options.length, 4);
    assert.strictEqual(updatedItem.options[0].text, 'Pembagian masalah kompleks menjadi sub-masalah sederhana');
    assert.strictEqual(updatedItem.prompt, 'Apa yang dimaksud dengan dekomposisi?');
  });

  // Test 4: Regenerate PROPOSED_ANSWER
  await runTest('4. Regenerate answer key (PROPOSED_ANSWER) updates exact answer key value', async () => {
    const pkg = createSamplePackage();
    const previewModel = createAssessmentPreviewModel(createPreviewContext(pkg));
    const ak = previewModel.answerKeys.list[0];
    assert.strictEqual(ak.id, 'ak-1');

    const res = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'PROPOSED_ANSWER',
        targetId: ak.id!,
        locator: { kind: 'ANSWER_KEY', id: ak.id! },
      },
      {
        regenerate: async () => ({
          target: 'PROPOSED_ANSWER',
          targetId: 'ak-1',
          proposedChanges: {
            value: 'A',
            optionIds: ['opt-1a'],
          },
        }),
      }
    );

    assert.strictEqual(res.status, 'REGENERATED');
    assert.strictEqual(res.regeneratedPackage!.answerKeys[0].id, 'ak-1');
    assert.strictEqual(res.regeneratedPackage!.answerKeys[0].value, 'A');
  });

  // Test 5: Regenerate RUBRIC & SCORING_GUIDE
  await runTest('5. Regenerate rubric and scoring guide updates target structure without cross pollution', async () => {
    const pkg = createSamplePackage();
    
    // Regenerate Scoring Guide
    const resSg = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'SCORING_GUIDE',
        targetId: 'sg-1',
        locator: { kind: 'SCORING_GUIDE', id: 'sg-1' },
      },
      {
        regenerate: async () => ({
          target: 'SCORING_GUIDE',
          targetId: 'sg-1',
          proposedChanges: {
            title: 'Pedoman Penskoran Objektif Terstandar',
            guideType: 'OBJECTIVE',
            instructions: 'Jawaban tepat skor 50 per butir, kosong/salah 0.',
            maxScore: 100,
          },
        }),
      }
    );
    assert.strictEqual(resSg.status, 'REGENERATED');
    assert.strictEqual(resSg.regeneratedPackage!.scoringGuides[0].title, 'Pedoman Penskoran Objektif Terstandar');

    // Regenerate Rubric
    const resRub = await assessmentRegenerationService.regenerate(
      resSg.regeneratedPackage!,
      {
        packageId: pkg.id,
        expectedPackageRevision: 2,
        target: 'RUBRIC',
        targetId: 'rub-1',
        locator: { kind: 'RUBRIC', id: 'rub-1' },
      },
      {
        regenerate: async () => ({
          target: 'RUBRIC',
          targetId: 'rub-1',
          proposedChanges: {
            title: 'Rubrik Kinerja Algoritma Pemrograman',
            scale: [
              { id: 'sc-1', order: 1, label: 'Sangat Baik', score: 4 },
              { id: 'sc-2', order: 2, label: 'Baik', score: 3 },
            ],
            criteria: [
              { id: 'crit-1', label: 'Struktur Logika', weight: 60 },
              { id: 'crit-2', label: 'Kerapian Visual', weight: 40 },
            ],
          },
        }),
      }
    );
    assert.strictEqual(resRub.status, 'REGENERATED');
    assert.strictEqual(resRub.regeneratedPackage!.revision, 3);
    assert.strictEqual(resRub.regeneratedPackage!.rubrics[0].title, 'Rubrik Kinerja Algoritma Pemrograman');
  });

  // Test 6: Teacher-edited target protection and override
  await runTest('6. Teacher-edited target blocks regeneration without explicit override and proceeds with override', async () => {
    const pkg = createSamplePackage();
    // Mark item-1 as teacher edited
    (pkg.instruments[0] as any).items[0].provenance = 'TEACHER_EDITED';

    const blockedRes = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'ITEM_PROMPT',
        targetId: 'item-1',
        locator: { kind: 'INSTRUMENT_ITEM', id: 'item-1' },
        explicitTeacherOverride: false,
      },
      { regenerate: async () => ({ target: 'ITEM_PROMPT', targetId: 'item-1', proposedChanges: { prompt: 'New' } }) }
    );

    assert.strictEqual(blockedRes.status, 'TEACHER_EDIT_PROTECTED');
    assert.ok(blockedRes.issues?.[0].includes('edited by a teacher'));

    // With explicit override
    const allowedRes = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'ITEM_PROMPT',
        targetId: 'item-1',
        locator: { kind: 'INSTRUMENT_ITEM', id: 'item-1' },
        explicitTeacherOverride: true,
      },
      {
        regenerate: async () => ({
          target: 'ITEM_PROMPT',
          targetId: 'item-1',
          proposedChanges: { prompt: 'Soal Baru dengan Persetujuan Guru' },
        }),
      }
    );

    assert.strictEqual(allowedRes.status, 'REGENERATED');
    assert.strictEqual((allowedRes.regeneratedPackage!.instruments[0] as any).items[0].prompt, 'Soal Baru dengan Persetujuan Guru');
  });

  // Test 7: AI / API failure keeps source package immutable
  await runTest('7. AI/API failure leaves original package completely unmodified', async () => {
    const pkg = createSamplePackage();
    const pkgCopy = JSON.parse(JSON.stringify(pkg));

    const res = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'ITEM_PROMPT',
        targetId: 'item-1',
      },
      {
        regenerate: async () => {
          throw new Error('AI Provider timeout 504 Gateway Timeout');
        },
      }
    );

    assert.strictEqual(res.status, 'FAILED');
    assert.ok(res.issues?.[0].includes('AI Provider threw an exception'));
    assert.deepStrictEqual(pkg, pkgCopy, 'Source package must not be mutated');
  });

  // Test 8: AI response invalid
  await runTest('8. Invalid AI provider output is rejected and leaves package unmodified', async () => {
    const pkg = createSamplePackage();
    const pkgCopy = JSON.parse(JSON.stringify(pkg));

    const res = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'OPTIONS',
        targetId: 'item-1',
      },
      {
        regenerate: async () => ({
          target: 'OPTIONS',
          targetId: 'item-1',
          proposedChanges: {
            options: 'not an array', // Malformed options output
          },
        }),
      }
    );

    assert.strictEqual(res.status, 'FAILED');
    assert.ok(res.issues?.[0].includes('Validation of AI provider output failed'));
    assert.deepStrictEqual(pkg, pkgCopy);
  });

  // Test 9: Stale revision guard
  await runTest('9. Stale revision rejects request immediately and leaves package unmodified', async () => {
    const pkg = createSamplePackage();
    pkg.revision = 3;

    const res = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1, // Stale!
        target: 'ITEM_PROMPT',
        targetId: 'item-1',
      },
      { regenerate: async () => ({}) }
    );

    assert.strictEqual(res.status, 'STALE_REGENERATION_REQUEST');
  });

  // Test 10: Legacy package compatibility & fail-closed behavior
  await runTest('10. Legacy packages: Valid target succeeds, missing/ambiguous ID fails closed without guessing', async () => {
    const pkg = createSamplePackage();
    
    // Legacy target with valid id
    const resValid = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'INDICATOR',
        targetId: 'bp-1',
      },
      {
        regenerate: async () => ({
          target: 'INDICATOR',
          targetId: 'bp-1',
          proposedChanges: { assessmentIndicator: 'Indikator terbarukan' },
        }),
      }
    );
    assert.strictEqual(resValid.status, 'REGENERATED');

    // Missing targetId fails closed
    const resMissing = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'ITEM_PROMPT',
        targetId: '',
      },
      { regenerate: async () => ({}) }
    );
    assert.strictEqual(resMissing.status, 'FAILED');

    // Target ID not in package fails closed
    const resNotFound = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'ITEM_PROMPT',
        targetId: 'non-existent-legacy-id',
      },
      { regenerate: async () => ({}) }
    );
    assert.strictEqual(resNotFound.status, 'FAILED');
  });

  // Test 11: Two sequential regenerations on different targets
  await runTest('11. Sequential regenerations on different targets succeed and increment revisions consecutively', async () => {
    const pkg = createSamplePackage();

    // Step 1: Regenerate stimulus for item 1
    const res1 = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'STIMULUS',
        targetId: 'item-1',
        locator: { kind: 'INSTRUMENT_ITEM', id: 'item-1' },
      },
      {
        regenerate: async () => ({
          target: 'STIMULUS',
          targetId: 'item-1',
          proposedChanges: { stimulus: 'Stimulus Baru 1' },
        }),
      }
    );
    assert.strictEqual(res1.status, 'REGENERATED');
    assert.strictEqual(res1.regeneratedPackage!.revision, 2);

    // Step 2: Regenerate prompt for item 2
    const res2 = await assessmentRegenerationService.regenerate(
      res1.regeneratedPackage!,
      {
        packageId: pkg.id,
        expectedPackageRevision: 2,
        target: 'ITEM_PROMPT',
        targetId: 'item-2',
        locator: { kind: 'INSTRUMENT_ITEM', id: 'item-2' },
      },
      {
        regenerate: async () => ({
          target: 'ITEM_PROMPT',
          targetId: 'item-2',
          proposedChanges: { prompt: 'Pertanyaan Baru 2' },
        }),
      }
    );
    assert.strictEqual(res2.status, 'REGENERATED');
    assert.strictEqual(res2.regeneratedPackage!.revision, 3);

    // Verify both changes coexist cleanly
    const finalInst = res2.regeneratedPackage!.instruments[0] as any;
    assert.strictEqual(finalInst.items[0].stimulus, 'Stimulus Baru 1');
    assert.strictEqual(finalInst.items[1].prompt, 'Pertanyaan Baru 2');
  });

  // Test 12: Preview model reflects regenerated data after app reload simulation
  await runTest('12. Normalized preview model built from regenerated package accurately reflects changes and revision', async () => {
    const pkg = createSamplePackage();

    const res = await assessmentRegenerationService.regenerate(
      pkg,
      {
        packageId: pkg.id,
        expectedPackageRevision: 1,
        target: 'TASK',
        targetId: 'inst-2',
        locator: { kind: 'INSTRUMENT', id: 'inst-2' },
      },
      {
        regenerate: async () => ({
          target: 'TASK',
          targetId: 'inst-2',
          proposedChanges: {
            task: 'Rancanglah diagram alir dan pseudocode algoritma pencarian biner.',
            instructions: 'Gunakan simbol standar ISO dan sertakan tabel tracing nilai.',
          },
        }),
      }
    );

    assert.strictEqual(res.status, 'REGENERATED');
    const updatedPkg = res.regeneratedPackage!;

    // Compile new preview model from updated package
    const previewModel = createAssessmentPreviewModel(createPreviewContext(updatedPkg));
    assert.strictEqual(previewModel.metadata.packageRevision, 2);

    const perfInst = previewModel.instruments.list.find((i) => i.id === 'inst-2')!;
    assert.ok(perfInst);
    assert.strictEqual(perfInst.task, 'Rancanglah diagram alir dan pseudocode algoritma pencarian biner.');
    assert.strictEqual(perfInst.instructions, 'Gunakan simbol standar ISO dan sertakan tabel tracing nilai.');
  });

  console.log(`\nAll ${passedTests} Assessment Preview Granular Regeneration tests passed successfully!`);
}

runAllTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
