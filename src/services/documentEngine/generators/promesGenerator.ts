import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
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
  createProseParagraph,
  createDocxSectionProperties,
  DOCX_FONT,
  DOCX_COLOR_BLACK,
} from '../docxStyles';
import { buildPromesProjection } from '../promesProjection';

export async function generatePROMES(context: DocumentGenerationContext): Promise<GeneratedDocumentResult> {
  const { school, profile, academicSetting } = context;

  const projection = buildPromesProjection(context);

  if (context.documentMode !== 'blank' && !projection.isReady) {
    throw new Error(
      projection.unreadyReason ||
        'Program Semester belum dapat dibuat karena prasyarat semester aktif belum lengkap.'
    );
  }

  const docChildren: (Paragraph | Table)[] = [];

  const semesterLabel = projection.semester === '1' ? 'Semester 1 (Ganjil)' : 'Semester 2 (Genap)';
  const months = projection.monthHeaders.map((m) => m.monthName);

  // 1. Header
  docChildren.push(
    ...createDocumentHeader(
      'PROGRAM SEMESTER (PROMES)',
      `${academicSetting.curriculum} — ${semesterLabel.toUpperCase()} TP ${academicSetting.academicYear || '2026/2027'}`
    )
  );

  // 2. Identity Box
  const weeklyJpText =
    projection.actualScheduledWeeklyJP !== null
      ? `${projection.actualScheduledWeeklyJP} JP / Minggu`
      : 'Input Manual Diperlukan';

  const weeksText =
    projection.effectiveWeeksEquivalent !== null
      ? `${projection.effectiveWeeksEquivalent} Minggu (${projection.effectiveLearningDays || 0} Hari Efektif)`
      : 'Data kalender belum dikonfigurasi pada sistem';

  const availableJpText =
    projection.availableJP !== null ? `${projection.availableJP} JP` : '-';

  docChildren.push(
    createIdentityMetadataTable(school, profile, academicSetting, [
      ['Alokasi Intrakurikuler per Minggu', `: ${weeklyJpText}`],
      ['Minggu Efektif Semester', `: ${weeksText}`],
      ['Total Kapasitas JP Tersedia', `: ${availableJpText}`],
      ['Status Alokasi Waktu', `: ${projection.validationStatus}`],
    ])
  );
  docChildren.push(new Paragraph({ spacing: { after: 180 } }));

  // 3. Matrix Table
  docChildren.push(
    createSectionHeading('Matriks Distribusi Alokasi Waktu Pembelajaran Bulanan', 1)
  );

  const isK13Curriculum = projection.curriculumType === 'K13';
  const monthHeaderCells = months.map((m) => createTableHeaderCell(m, 7));

  const tableHeaderRow1 = new TableRow({
    tableHeader: true,
    children: [
      createTableHeaderCell('No', 5),
      createTableHeaderCell(isK13Curriculum ? 'Kompetensi Dasar (KD)' : 'Kode TP', isK13Curriculum ? 15 : 10),
      createTableHeaderCell(
        isK13Curriculum ? 'Indikator & Materi Pembelajaran' : 'Tujuan Pembelajaran & Ruang Lingkup Materi',
        isK13Curriculum ? 28 : 33,
        AlignmentType.LEFT
      ),
      createTableHeaderCell('Alokasi JP', 10),
      ...monthHeaderCells,
    ],
  });

  const allRows = [...projection.rows, ...projection.assessmentRows, ...projection.reserveRows];

  const dataRows: TableRow[] = allRows.map((row, idx) => {
    const monthDistributionCells = months.map((mName) => {
      const jp = row.monthlyJP[mName];
      return createTableDataCell(jp && jp > 0 ? `${jp}` : '-', 7, AlignmentType.CENTER);
    });

    return new TableRow({
      children: [
        createTableDataCell(`${idx + 1}`, 5, AlignmentType.CENTER),
        createTableDataCell(row.tpCode || `TP.${idx + 1}`, isK13Curriculum ? 15 : 10, AlignmentType.CENTER, true),
        new TableCell({
          width: { size: isK13Curriculum ? 28 : 33, type: WidthType.PERCENTAGE },
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: [
            new Paragraph({
              spacing: { line: 240, after: 0 },
              children: [
                new TextRun({ text: row.tpStatement, size: 20, font: DOCX_FONT, color: DOCX_COLOR_BLACK }),
                row.materialScope && row.materialScope !== '-'
                  ? new TextRun({ text: `\nMateri: ${row.materialScope}`, italics: true, size: 20, font: DOCX_FONT, color: DOCX_COLOR_BLACK })
                  : new TextRun({ text: '' }),
              ],
            }),
          ],
        }),
        createTableDataCell(`${row.allocatedJP} JP`, 10, AlignmentType.CENTER, true),
        ...monthDistributionCells,
      ],
    });
  });

  // Total Summary Row
  const totalMonthCells = months.map(() => createTableDataCell('-', 7, AlignmentType.CENTER));
  const totalRow = new TableRow({
    children: [
      new TableCell({
        width: { size: 48, type: WidthType.PERCENTAGE },
        columnSpan: 3,
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { line: 240, after: 0 },
            children: [
              new TextRun({
                text: 'TOTAL ALOKASI JP TERCATAT: ',
                bold: true,
                size: 20,
                font: DOCX_FONT,
                color: DOCX_COLOR_BLACK,
              }),
            ],
          }),
        ],
      }),
      createTableDataCell(`${projection.totalAllocatedJP} JP`, 10, AlignmentType.CENTER, true),
      ...totalMonthCells,
    ],
  });

  const promesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [tableHeaderRow1, ...dataRows, totalRow],
  });

  docChildren.push(promesTable);

  // Keterangan Pelaksanaan & Status Alokasi
  let allocationStatusText = 'Belum dilakukan verifikasi kalender.';
  if (projection.availableJP !== null) {
    if (projection.validationStatus === 'UNDER_ALLOCATED') {
      allocationStatusText = `Sisa JP Belum Dialokasikan: ${projection.remainingJP} JP dari kapasitas ${projection.availableJP} JP.`;
    } else if (projection.validationStatus === 'BALANCED') {
      allocationStatusText = `Alokasi Seimbang: Tepat ${projection.totalAllocatedJP} JP sesuai kapasitas tersedia.`;
    } else if (projection.validationStatus === 'OVER_ALLOCATED') {
      allocationStatusText = `Defisit JP: Alokasi (${projection.totalAllocatedJP} JP) melebihi kapasitas tersedia (${projection.availableJP} JP) sebesar ${Math.abs(projection.remainingJP)} JP.`;
    }
  }

  docChildren.push(
    createSectionHeading('Status & Catatan Pelaksanaan', 2),
    createProseParagraph(
      `• Status Alokasi Waktu: ${allocationStatusText}\n• Angka pada kolom bulan menunjukkan Jam Pelajaran (JP) intrakurikuler tatap muka yang telah dijadwalkan guru.\n• Item tanpa alokasi bulan diberi tanda strip (-) yang berarti belum dijadwalkan pada kalender aktif.`,
      { firstLineIndent: false, italics: true }
    )
  );

  // 4. Signoff Block
  docChildren.push(...createSignoffBlock(school, profile, context.documentMode === 'blank', context.documentDate));

  // Build Document (Landscape A4)
  const doc = new Document({
    sections: [
      {
        properties: createDocxSectionProperties('landscape'),
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const cleanSubject = (academicSetting.subject || 'Mapel').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanGrade = (academicSetting.grade || 'Kelas').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `PROMES_${cleanSubject}_${cleanGrade}_${new Date().toISOString().slice(0, 10)}.docx`;

  if (!context.skipDownload) {
    saveAs(blob, fileName);
  }

  return {
    success: true,
    type: 'PROMES',
    title: 'Program Semester (PROMES)',
    fileName,
    blob,
    record: {
      id: `doc-promes-${Date.now()}`,
      type: 'PROMES',
      title: 'Program Semester (PROMES)',
      status: 'completed',
      lastGenerated: new Date().toISOString(),
      fileName,
      academicSettingId: academicSetting.id,
      workspaceId: context.workspace?.id,
    },
  };
}
