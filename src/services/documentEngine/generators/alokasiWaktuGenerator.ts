import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  AlignmentType,
  WidthType,
} from 'docx';
import saveAs from 'file-saver';
import { DocumentGenerationContext, GeneratedDocumentResult } from '../types';
import {
  createDocumentHeader,
  createIdentityMetadataTable,
  createTableHeaderCell,
  createTableDataCell,
  createSignoffBlock,
  createSectionHeading,
  createDocxSectionProperties,
} from '../docxStyles';
import { getSubjectJP } from '../../jpEngine';
import { buildAlokasiWaktuProjection } from '../promesProjection';
import { buildK13AlokasiWaktuRows } from '../k13AlokasiWaktuHelper';

export async function generateAlokasiWaktu(context: DocumentGenerationContext): Promise<GeneratedDocumentResult> {
  const { school, profile, academicSetting, calendar, timeAllocations, k13Analysis } = context;

  const docChildren: (Paragraph | Table)[] = [];

  const isK13Curriculum = academicSetting.curriculumType === 'K13' || academicSetting.curriculum === 'Kurikulum 2013';

  // Look up verified official rule
  const officialRule = getSubjectJP({
    curriculum: academicSetting.curriculum,
    level: academicSetting.level,
    grade: academicSetting.grade,
    subject: academicSetting.subject,
  });

  // Projection for Kurikulum Merdeka
  const projection = buildAlokasiWaktuProjection(context);

  if (!isK13Curriculum && context.documentMode !== 'blank' && !projection.isReady) {
    throw new Error(
      projection.unreadyReason ||
        'Distribusi Alokasi Waktu belum dapat dibuat karena prasyarat semester aktif belum lengkap.'
    );
  }

  const weeklyJP = isK13Curriculum
    ? (academicSetting.subjectWeeklyJP || calendar?.jpPerWeek || academicSetting.totalHoursPerWeek || officialRule.weeklyJP || null)
    : projection.actualScheduledWeeklyJP;

  // Resolved rows for K13
  const k13Rows = isK13Curriculum ? buildK13AlokasiWaktuRows(k13Analysis?.items || [], timeAllocations) : [];

  // Compute total planned JP from recorded allocations or explicit unit JP
  let totalAllocatedJP = 0;
  if (isK13Curriculum) {
    totalAllocatedJP = k13Rows.reduce((sum, r) => sum + r.allocatedJP, 0);
  } else {
    totalAllocatedJP = projection.totalAllocatedJP;
  }

  // Header
  docChildren.push(
    ...createDocumentHeader(
      'RINCIAN DISTRIBUSI ALOKASI WAKTU PEMBELAJARAN',
      `${academicSetting.curriculum} — TP ${academicSetting.academicYear || '-'}`
    )
  );

  // Metadata Table
  if (isK13Curriculum) {
    docChildren.push(
      createIdentityMetadataTable(school, profile, academicSetting, [
        ['Tahun Ajaran / Semester', `: ${academicSetting.academicYear || '-'} / ${academicSetting.semester || '-'}`],
        ['Beban JP Intrakurikuler per Minggu', `: ${weeklyJP !== null ? `${weeklyJP} JP / Minggu` : 'Input Manual Diperlukan'}`],
        ['Total Alokasi Pembelajaran Terdata', `: ${totalAllocatedJP} Jam Pelajaran (JP)`],
        ['Dasar Regulasi Struktur', `: ${officialRule.regulation || 'Struktur Kustom Guru'}`],
      ])
    );
  } else {
    docChildren.push(
      createIdentityMetadataTable(school, profile, academicSetting, [
        ['Tahun Ajaran / Semester', `: ${academicSetting.academicYear || '-'} / ${academicSetting.semester || '-'}`],
        ['Beban JP Intrakurikuler per Minggu', `: ${weeklyJP !== null ? `${weeklyJP} JP / Minggu` : 'Input Manual Diperlukan'}`],
        ['Kapasitas JP Semester', `: ${projection.availableJP !== null ? `${projection.availableJP} Jam Pelajaran` : 'Belum Ditentukan'}`],
        ['Total Alokasi Pembelajaran Terdata', `: ${projection.totalAllocatedJP} Jam Pelajaran (JP)`],
        ['Sisa & Status Alokasi', `: ${projection.remainingJP !== null ? `${projection.remainingJP} JP` : '-'} (${projection.validationStatus})`],
        ['Dasar Regulasi Struktur', `: ${officialRule.regulation || 'Struktur Kustom Guru'}`],
      ])
    );
  }
  docChildren.push(new Paragraph({ spacing: { after: 180 } }));

  // Section
  docChildren.push(
    createSectionHeading(
      isK13Curriculum
        ? 'A. Pemetaan Waktu Berdasarkan Analisis Kompetensi Dasar (KD)'
        : 'A. Pemetaan Waktu Berdasarkan Alur Tujuan Pembelajaran (ATP)',
      1
    )
  );

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        createTableHeaderCell('No', 8, AlignmentType.CENTER),
        createTableHeaderCell(isK13Curriculum ? 'Kompetensi Dasar (KD)' : 'Kode / Jenis', 16, AlignmentType.CENTER),
        createTableHeaderCell(isK13Curriculum ? 'Materi Pokok & Kegiatan' : 'Tujuan Pembelajaran (TP) / Kegiatan', 48, AlignmentType.LEFT),
        createTableHeaderCell('Alokasi JP', 14, AlignmentType.CENTER),
        createTableHeaderCell('Distribusi Pekan Ke-', 14, AlignmentType.CENTER),
      ],
    }),
  ];

  if (isK13Curriculum) {
    if (k13Rows.length === 0) {
      rows.push(
        new TableRow({
          children: [
            createTableDataCell('1', 8, AlignmentType.CENTER),
            createTableDataCell('KD -', 16, AlignmentType.CENTER),
            createTableDataCell('Belum ada butir analisis KD yang disusun.', 48),
            createTableDataCell('-', 14, AlignmentType.CENTER),
            createTableDataCell('-', 14, AlignmentType.CENTER),
          ],
        })
      );
    } else {
      k13Rows.forEach((item, index) => {
        rows.push(
          new TableRow({
            children: [
              createTableDataCell((index + 1).toString(), 8, AlignmentType.CENTER),
              createTableDataCell(item.kdCode, 16, AlignmentType.LEFT, true),
              createTableDataCell(`${item.materi || '-'}${item.kegiatan ? `\n• Kegiatan: ${item.kegiatan}` : ''}`, 48),
              createTableDataCell(`${item.allocatedJP} JP`, 14, AlignmentType.CENTER, true),
              createTableDataCell(item.weekDisplay, 14, AlignmentType.CENTER),
            ],
          })
        );
      });
    }
  } else {
    const allMerdekaRows = [
      ...projection.rows,
      ...projection.assessmentRows,
      ...projection.reserveRows,
    ];

    if (allMerdekaRows.length === 0) {
      rows.push(
        new TableRow({
          children: [
            createTableDataCell('1', 8, AlignmentType.CENTER),
            createTableDataCell('TP -', 16, AlignmentType.CENTER),
            createTableDataCell('Belum ada alokasi waktu yang disusun pada semester ini.', 48),
            createTableDataCell('-', 14, AlignmentType.CENTER),
            createTableDataCell('-', 14, AlignmentType.CENTER),
          ],
        })
      );
    } else {
      allMerdekaRows.forEach((item, index) => {
        const weekDisplay =
          item.startWeek === item.endWeek
            ? `Pekan ${item.startWeek}`
            : `Pekan ${item.startWeek}–${item.endWeek}`;

        rows.push(
          new TableRow({
            children: [
              createTableDataCell((index + 1).toString(), 8, AlignmentType.CENTER),
              createTableDataCell(item.tpCode || `TP.${index + 1}`, 16, AlignmentType.CENTER),
              createTableDataCell(
                `${item.tpStatement || '-'}\n• Ruang Lingkup Materi: ${item.materialScope || '-'}`,
                48
              ),
              createTableDataCell(`${item.allocatedJP} JP`, 14, AlignmentType.CENTER, true),
              createTableDataCell(weekDisplay, 14, AlignmentType.CENTER),
            ],
          })
        );
      });
    }
  }

  // Summary row
  rows.push(
    new TableRow({
      children: [
        createTableHeaderCell('', 8, AlignmentType.CENTER),
        createTableHeaderCell('TOTAL', 16, AlignmentType.CENTER),
        createTableHeaderCell('Total Alokasi Waktu Pembelajaran Terjadwal', 48, AlignmentType.LEFT),
        createTableHeaderCell(`${totalAllocatedJP} JP`, 14, AlignmentType.CENTER),
        createTableHeaderCell(isK13Curriculum ? '-' : projection.validationStatus, 14, AlignmentType.CENTER),
      ],
    })
  );

  docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
  docChildren.push(new Paragraph({ spacing: { after: 240 } }));

  // Signatures
  docChildren.push(...createSignoffBlock(school, profile, context.documentMode === 'blank', context.documentDate));

  // Build Document (Portrait A4)
  const doc = new Document({
    sections: [
      {
        properties: createDocxSectionProperties('portrait'),
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeSubject = (academicSetting.subject || 'Mapel').replace(/[^a-zA-Z0-9]/g, '_');
  const safeGrade = (academicSetting.grade || 'Kelas').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Alokasi_Waktu_${safeSubject}_${safeGrade}.docx`;

  if (!context.skipDownload) {
    saveAs(blob, fileName);
  }

  return {
    success: true,
    type: 'ALOKASI_WAKTU',
    title: `Alokasi Waktu - ${academicSetting.subject} ${academicSetting.grade}`,
    fileName,
    blob,
    record: {
      id: `doc-alokasi-${Date.now()}`,
      type: 'ALOKASI_WAKTU',
      title: `Alokasi Waktu - ${academicSetting.subject} ${academicSetting.grade}`,
      status: 'completed',
      lastGenerated: new Date().toISOString(),
      fileName,
      academicSettingId: academicSetting.id,
      workspaceId: context.workspace?.id,
    },
  };
}
