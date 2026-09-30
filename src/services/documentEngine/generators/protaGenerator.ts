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
import { buildProtaProjection, buildK13ProtaProjection, ProtaProjectionRow, K13ProtaProjectionRow } from '../protaProjection';

export async function generatePROTA(context: DocumentGenerationContext): Promise<GeneratedDocumentResult> {
  const { school, profile, academicSetting } = context;
  const isK13Curriculum = academicSetting.curriculumType === 'K13' || academicSetting.curriculum === 'Kurikulum 2013';
  const isBlankMode = context.documentMode === 'blank';

  const docChildren: (Paragraph | Table)[] = [];

  // Build appropriate pure projection
  const projection = buildProtaProjection(context);
  const k13Projection = buildK13ProtaProjection(context);

  if (isK13Curriculum) {
    if (context.documentMode === 'data' && !k13Projection.isReady) {
      throw new Error(
        k13Projection.unreadyReason ||
          'Program Tahunan belum dapat dibuat karena data analisis KD Kurikulum 2013 belum tersedia.'
      );
    }
  } else {
    if (context.documentMode === 'data' && !projection.isReady) {
      throw new Error(
        projection.unreadyReason ||
          'Program Tahunan belum dapat dibuat karena distribusi ATP tahunan ke Semester 1 dan Semester 2 belum lengkap.'
      );
    }
  }

  // 1. Header
  docChildren.push(
    ...createDocumentHeader(
      'PROGRAM TAHUNAN (PROTA)',
      `${academicSetting.curriculum} — TAHUN AJARAN ${academicSetting.academicYear || '2026/2027'}`
    )
  );

  // 2. Identity Box with Projection Metadata
  const metadataRows: [string, string][] = [];

  if (isK13Curriculum) {
    metadataRows.push(
      ['Total Alokasi Pembelajaran', `: ${isBlankMode ? '—' : `${k13Projection.totalAllocatedJP} JP`}`]
    );
  } else {
    metadataRows.push(
      ['Alokasi Semester 1', `: ${isBlankMode ? '—' : `${projection.semester1AllocatedJP} JP`}`],
      ['Alokasi Semester 2', `: ${isBlankMode ? '—' : `${projection.semester2AllocatedJP} JP`}`],
      ['Total Alokasi Tahunan', `: ${isBlankMode ? '—' : `${projection.totalAllocatedJP} JP`}`],
      ['Kapasitas JP Tahunan Resmi', `: ${projection.officialAnnualJP !== null ? `${projection.officialAnnualJP} JP` : 'Belum Diverifikasi'}`],
      ['Sisa / Selisih JP', `: ${projection.remainingAnnualJP !== null ? `${projection.remainingAnnualJP} JP` : '—'}`],
      ['Status Alokasi', `: ${isBlankMode ? '—' : projection.validationStatus}`]
    );
    if (projection.referenceWeeklyEquivalentJP !== null) {
      metadataRows.push(['Referensi Ekuivalen JP per Minggu', `: ${projection.referenceWeeklyEquivalentJP} JP / Minggu`]);
    }
  }

  docChildren.push(
    createIdentityMetadataTable(
      school,
      profile,
      academicSetting,
      metadataRows,
      { scope: 'YEAR' }
    )
  );
  docChildren.push(new Paragraph({ spacing: { after: 180 } }));

  // 3. Capaian Pembelajaran (CP) / SKL Singkat
  if (isK13Curriculum) {
    if (context.k13Analysis?.items && context.k13Analysis.items.length > 0) {
      const sklText = context.k13Analysis.items[0].skl || 'Memiliki perilaku yang mencerminkan sikap orang beriman, berakhlak mulia, dan bertanggung jawab sesuai standar kompetensi lulusan.';
      docChildren.push(
        createSectionHeading('A. Standar Kompetensi Lulusan (SKL) & Kompetensi Inti (KI)', 1),
        createProseParagraph(sklText)
      );
    }
  } else if (context.cp?.generalDescription) {
    docChildren.push(
      createSectionHeading('A. Capaian Pembelajaran (CP) Fase', 1),
      createProseParagraph(context.cp.generalDescription, { italics: true })
    );
  }

  // 4. Tabel Pemetaan Program Tahunan
  docChildren.push(
    createSectionHeading('B. Distribusi Alokasi Waktu Pembelajaran Tahunan', 1)
  );

  const tableHeaderRow = isK13Curriculum
    ? new TableRow({
        tableHeader: true,
        children: [
          createTableHeaderCell('No', 6),
          createTableHeaderCell('Kompetensi Dasar (KD)', 14, AlignmentType.CENTER),
          createTableHeaderCell('Materi Pokok & Kegiatan Pembelajaran', 55, AlignmentType.LEFT),
          createTableHeaderCell('Alokasi JP', 12),
          createTableHeaderCell('Semester', 13),
        ],
      })
    : new TableRow({
        tableHeader: true,
        children: [
          createTableHeaderCell('No', 6),
          createTableHeaderCell('Kode / Jenis', 14, AlignmentType.CENTER),
          createTableHeaderCell('Tujuan Pembelajaran / Kegiatan', 35, AlignmentType.LEFT),
          createTableHeaderCell('Lingkup Materi', 20, AlignmentType.LEFT),
          createTableHeaderCell('Alokasi JP', 12),
          createTableHeaderCell('Semester', 13),
        ],
      });

  const tableDataRows: TableRow[] = [];

  if (isK13Curriculum) {
    if (isBlankMode) {
      // Placeholder blank rows
      for (let i = 1; i <= 3; i++) {
        tableDataRows.push(
          new TableRow({
            children: [
              createTableDataCell(`${i}`, 6, AlignmentType.CENTER),
              createTableDataCell('', 14, AlignmentType.CENTER),
              createTableDataCell('', 55, AlignmentType.LEFT),
              createTableDataCell('', 12, AlignmentType.CENTER),
              createTableDataCell('', 13, AlignmentType.CENTER),
            ],
          })
        );
      }
    } else {
      k13Projection.rows.forEach((r, idx) => {
        tableDataRows.push(
          new TableRow({
            children: [
              createTableDataCell(`${idx + 1}`, 6, AlignmentType.CENTER),
              createTableDataCell(r.kd, 14, AlignmentType.CENTER, true),
              createTableDataCell(`${r.materi}\nKegiatan: ${r.kegiatan}`, 55, AlignmentType.LEFT),
              createTableDataCell(`${r.allocatedJP} JP`, 12, AlignmentType.CENTER, true),
              createTableDataCell(r.semester ? `Semester ${r.semester}` : '-', 13, AlignmentType.CENTER),
            ],
          })
        );
      });
    }
  } else {
    if (isBlankMode) {
      // Placeholder blank rows
      for (let i = 1; i <= 3; i++) {
        tableDataRows.push(
          new TableRow({
            children: [
              createTableDataCell(`${i}`, 6, AlignmentType.CENTER),
              createTableDataCell('', 14, AlignmentType.CENTER),
              createTableDataCell('', 35, AlignmentType.LEFT),
              createTableDataCell('', 20, AlignmentType.LEFT),
              createTableDataCell('', 12, AlignmentType.CENTER),
              createTableDataCell('', 13, AlignmentType.CENTER),
            ],
          })
        );
      }
    } else {
      // S1 rows
      const s1Atp = projection.rows.filter((r) => r.semester === 1);
      const s1Assess = projection.assessmentRows.filter((r) => r.semester === 1);
      const s1Reserve = projection.reserveRows.filter((r) => r.semester === 1);

      // S2 rows
      const s2Atp = projection.rows.filter((r) => r.semester === 2);
      const s2Assess = projection.assessmentRows.filter((r) => r.semester === 2);
      const s2Reserve = projection.reserveRows.filter((r) => r.semester === 2);

      const allOrderedRows = [
        ...s1Atp,
        ...s1Assess,
        ...s1Reserve,
        ...s2Atp,
        ...s2Assess,
        ...s2Reserve,
      ];

      allOrderedRows.forEach((r, idx) => {
        tableDataRows.push(
          new TableRow({
            children: [
              createTableDataCell(`${idx + 1}`, 6, AlignmentType.CENTER),
              createTableDataCell(r.tpCode, 14, AlignmentType.CENTER, true),
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                margins: { top: 100, bottom: 100, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    spacing: { line: 240, after: 0 },
                    children: [
                      new TextRun({ text: r.tpStatement, size: 20, font: DOCX_FONT, color: DOCX_COLOR_BLACK }),
                    ],
                  }),
                ],
              }),
              createTableDataCell(r.materialScope, 20, AlignmentType.LEFT),
              createTableDataCell(`${r.allocatedJP} JP`, 12, AlignmentType.CENTER, true),
              createTableDataCell(`Semester ${r.semester}`, 13, AlignmentType.CENTER),
            ],
          })
        );
      });
    }
  }

  // Summary Row
  const totalJPToDisplay = isK13Curriculum ? k13Projection.totalAllocatedJP : projection.totalAllocatedJP;
  const totalRow = new TableRow({
    children: [
      new TableCell({
        width: { size: isK13Curriculum ? 75 : 75, type: WidthType.PERCENTAGE },
        columnSpan: isK13Curriculum ? 3 : 4,
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
      createTableDataCell(isBlankMode ? '' : `${totalJPToDisplay} JP`, 12, AlignmentType.CENTER, true),
      new TableCell({
        width: { size: 13, type: WidthType.PERCENTAGE },
        children: [new Paragraph({})],
      }),
    ],
  });

  const protaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [tableHeaderRow, ...tableDataRows, totalRow],
  });

  docChildren.push(protaTable);

  // Status Alokasi Waktu
  if (!isK13Curriculum && !isBlankMode) {
    let allocationStatusText = 'Belum ada data alokasi waktu.';
    if (projection.officialAnnualJP !== null) {
      const remainingJP = projection.remainingAnnualJP;
      if (remainingJP !== null) {
        if (remainingJP > 0) {
          allocationStatusText = `Sisa JP Belum Dialokasikan: ${remainingJP} JP dari standar tahunan (${projection.officialAnnualJP} JP/tahun).`;
        } else if (remainingJP === 0) {
          allocationStatusText = `Alokasi Seimbang: Tepat ${projection.totalAllocatedJP} JP sesuai kapasitas tahunan resmi (${projection.officialAnnualJP} JP).`;
        } else {
          allocationStatusText = `Defisit JP: Total alokasi (${projection.totalAllocatedJP} JP) melampaui kapasitas tahunan resmi (${projection.officialAnnualJP} JP) sebesar ${Math.abs(remainingJP)} JP.`;
        }
      }
    } else {
      allocationStatusText = 'Kapasitas tahunan resmi belum diverifikasi.';
    }

    docChildren.push(
      createSectionHeading('Status Alokasi Waktu Tahunan', 2),
      createProseParagraph(
        `• ${allocationStatusText}\n• Angka alokasi waktu berasal dari data perencanaan pembelajaran nyata yang telah disusun guru.\n• Item bertanda strip (-) menunjukkan unit kompetensi yang belum dialokasikan beban jam pelajarannya.`,
        { firstLineIndent: false, italics: true }
      )
    );
  }

  // 5. Signoff
  docChildren.push(...createSignoffBlock(school, profile, isBlankMode, context.documentDate));

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
  const cleanSubject = (academicSetting.subject || 'Mapel').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanGrade = (academicSetting.grade || 'Kelas').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `PROTA_${cleanSubject}_${cleanGrade}_${new Date().toISOString().slice(0, 10)}.docx`;

  if (!context.skipDownload) {
    saveAs(blob, fileName);
  }

  return {
    success: true,
    type: 'PROTA',
    title: 'Program Tahunan (PROTA)',
    fileName,
    blob,
    record: {
      id: `doc-prota-${Date.now()}`,
      type: 'PROTA',
      title: 'Program Tahunan (PROTA)',
      status: 'completed',
      lastGenerated: new Date().toISOString(),
      fileName,
      academicSettingId: academicSetting.id,
      workspaceId: context.workspace?.id,
    },
  };
}
