import React, { useState } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Printer,
  FileText,
  Layers,
  FileCheck2,
  BookOpen,
} from 'lucide-react';
import {
  NormalizedAssessmentDocument,
  AssessmentDocumentProjection,
} from '../../types/assessmentExport';
import {
  AssessmentRegenerationTarget,
  AssessmentRegenerationLocator,
} from '../../types';

export interface AssessmentDocumentPreviewProps {
  model: NormalizedAssessmentDocument;
  workflowStatus: 'DRAFT' | 'PERLU_DILENGKAPI' | 'SIAP';
  needsReview?: boolean;
  activeProjection?: AssessmentDocumentProjection;
  onProjectionChange?: (projection: AssessmentDocumentProjection) => void;
  onExportDocx?: (projection: AssessmentDocumentProjection) => void;
  onExportPdf?: (projection: AssessmentDocumentProjection) => void;
  isExportingDocx?: boolean;
  isExportingPdf?: boolean;
  onRegenerateTarget?: (
    target: AssessmentRegenerationTarget,
    targetId: string,
    explicitOverride?: boolean,
    locator?: AssessmentRegenerationLocator,
    description?: string
  ) => Promise<void> | void;
  activeRegeneration?: {
    target: AssessmentRegenerationTarget;
    targetId: string;
    label: string;
  } | null;
  feedback?: {
    status: 'SUCCESS' | 'ERROR';
    title: string;
    message: string;
    target: AssessmentRegenerationTarget;
    targetId: string;
    locator?: AssessmentRegenerationLocator;
    canRetry?: boolean;
  } | null;
  onDismissFeedback?: () => void;
  onRetryFeedback?: () => void;
}

export const AssessmentDocumentPreview: React.FC<AssessmentDocumentPreviewProps> = ({
  model,
  workflowStatus,
  needsReview,
  activeProjection,
  onProjectionChange,
  onExportDocx,
  onExportPdf,
  isExportingDocx = false,
  isExportingPdf = false,
  onRegenerateTarget,
  activeRegeneration,
  feedback,
  onDismissFeedback,
  onRetryFeedback,
}) => {
  // Default projection is STUDENT_INSTRUMENT (Lembar Soal / Instrumen)
  const [internalProjection, setInternalProjection] = useState<AssessmentDocumentProjection>('STUDENT_INSTRUMENT');
  const projection = activeProjection || internalProjection;

  const handleSelectProjection = (proj: AssessmentDocumentProjection) => {
    setInternalProjection(proj);
    if (onProjectionChange) {
      onProjectionChange(proj);
    }
  };

  const meta = model.metadata;

  const isTargetLoading = (target: AssessmentRegenerationTarget, targetId?: string) => {
    if (!activeRegeneration || !targetId) return false;
    return activeRegeneration.target === target && activeRegeneration.targetId === targetId;
  };

  const isAnyLoading = Boolean(activeRegeneration);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* 1. STATUS BANNER */}
      <div
        className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center md:justify-between gap-2 no-print ${
          workflowStatus === 'SIAP'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : workflowStatus === 'PERLU_DILENGKAPI'
            ? 'bg-amber-50 border-amber-300 text-amber-900'
            : 'bg-blue-50 border-blue-300 text-blue-900'
        }`}
      >
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wide">
            {workflowStatus === 'SIAP' && 'Pratinjau Dokumen SIAP'}
            {workflowStatus === 'PERLU_DILENGKAPI' && 'Pratinjau — Perlu Dilengkapi'}
            {workflowStatus === 'DRAFT' && 'Pratinjau Draf Asesmen'}
          </h3>
          <p className="text-xs mt-0.5 opacity-90">
            {workflowStatus === 'SIAP' && 'Dokumen siap digunakan guru, dicetak, dan diekspor ke Word/PDF.'}
            {workflowStatus === 'PERLU_DILENGKAPI' && 'Dokumen masih memiliki bagian yang perlu diperiksa atau dilengkapi.'}
            {workflowStatus === 'DRAFT' && 'Dokumen ini masih dalam bentuk draf awal.'}
          </p>
        </div>
        {needsReview && (
          <div className="inline-flex items-center px-2.5 py-1 rounded bg-amber-100 border border-amber-300 text-amber-800 text-xs font-semibold self-start md:self-auto">
            Memerlukan review guru
          </div>
        )}
      </div>

      {/* 2. PROJECTION SELECTOR & DOCUMENT ACTIONS (NO-PRINT) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Pilihan Tampilan & Cetak Dokumen
            </span>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Cetak tampilan dokumen aktif ke printer atau simpan sebagai PDF browser"
            >
              <Printer className="w-3.5 h-3.5 text-slate-700" />
              <span>Cetak</span>
            </button>

            {onExportDocx && (
              <button
                type="button"
                onClick={() => onExportDocx(projection)}
                disabled={isExportingDocx || workflowStatus !== 'SIAP'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  workflowStatus === 'SIAP'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={workflowStatus === 'SIAP' ? 'Unduh dokumen Word (.docx)' : 'Status harus SIAP untuk ekspor resmi'}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isExportingDocx ? 'Mengunduh...' : 'Ekspor Word (.docx)'}</span>
              </button>
            )}

            {onExportPdf && (
              <button
                type="button"
                onClick={() => onExportPdf(projection)}
                disabled={isExportingPdf || workflowStatus !== 'SIAP'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  workflowStatus === 'SIAP'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={workflowStatus === 'SIAP' ? 'Unduh cetakan PDF resmi' : 'Status harus SIAP untuk ekspor resmi'}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isExportingPdf ? 'Memproses...' : 'Cetak PDF'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* 1. LEMBAR SOAL / INSTRUMEN */}
          <button
            type="button"
            onClick={() => handleSelectProjection('STUDENT_INSTRUMENT')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              projection === 'STUDENT_INSTRUMENT'
                ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-400/20 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileCheck2
                className={`w-4 h-4 ${
                  projection === 'STUDENT_INSTRUMENT' ? 'text-indigo-600' : 'text-slate-500'
                }`}
              />
              <span
                className={`text-xs font-bold ${
                  projection === 'STUDENT_INSTRUMENT' ? 'text-indigo-950' : 'text-slate-800'
                }`}
              >
                Lembar Soal / Instrumen
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Dokumen yang diberikan kepada siswa.</p>
          </button>

          {/* 2. PANDUAN PENILAIAN */}
          <button
            type="button"
            onClick={() => handleSelectProjection('SCORING_GUIDE')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              projection === 'SCORING_GUIDE'
                ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-400/20 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen
                className={`w-4 h-4 ${
                  projection === 'SCORING_GUIDE' ? 'text-indigo-600' : 'text-slate-500'
                }`}
              />
              <span
                className={`text-xs font-bold ${
                  projection === 'SCORING_GUIDE' ? 'text-indigo-950' : 'text-slate-800'
                }`}
              >
                Panduan Penilaian
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Kunci, rubrik, dan pedoman pemeriksaan untuk guru.</p>
          </button>

          {/* 3. PERANGKAT LENGKAP */}
          <button
            type="button"
            onClick={() => handleSelectProjection('COMPLETE')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              projection === 'COMPLETE'
                ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-400/20 shadow-xs'
                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers
                className={`w-4 h-4 ${
                  projection === 'COMPLETE' ? 'text-indigo-600' : 'text-slate-500'
                }`}
              />
              <span
                className={`text-xs font-bold ${
                  projection === 'COMPLETE' ? 'text-indigo-950' : 'text-slate-800'
                }`}
              >
                Perangkat Lengkap
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Dokumen administrasi lengkap untuk guru.</p>
          </button>
        </div>
      </div>

      {/* 3. GRANULAR REGENERATION FEEDBACK (NO-PRINT) */}
      {activeRegeneration && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-3 text-xs text-blue-900 shadow-sm animate-pulse no-print">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            <div>
              <span className="font-bold text-blue-950">Membuat ulang {activeRegeneration.label}...</span>
              <p className="text-[11px] text-blue-700">Mohon tunggu, AI sedang memproses pembaruan komponen ini.</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold uppercase shrink-0">
            Sedang Diproses
          </span>
        </div>
      )}

      {feedback && !activeRegeneration && (
        <div
          className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 text-xs shadow-sm transition-all no-print ${
            feedback.status === 'SUCCESS'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.status === 'SUCCESS' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="font-bold text-sm">{feedback.title}</div>
              <p className={feedback.status === 'SUCCESS' ? 'text-emerald-800' : 'text-red-800'}>
                {feedback.message}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {feedback.status === 'ERROR' && feedback.canRetry && onRetryFeedback && (
              <button
                type="button"
                onClick={onRetryFeedback}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-semibold text-xs flex items-center gap-1 shadow-sm transition"
              >
                <RefreshCw className="w-3 h-3" /> Coba Lagi
              </button>
            )}
            {onDismissFeedback && (
              <button
                type="button"
                onClick={onDismissFeedback}
                className="text-slate-400 hover:text-slate-700 font-bold px-1 py-0.5 text-xs rounded transition"
                title="Tutup pemberitahuan"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. DOCUMENT SHEET (PRINTABLE) */}
      <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-6 md:p-10 space-y-8 text-slate-800 text-sm font-sans leading-relaxed print:p-0 print:border-none print:shadow-none">
        
        {/* ========================================================================= */}
        {/* PROJECTION A: LEMBAR SOAL / INSTRUMEN SISWA */}
        {/* ========================================================================= */}
        {projection === 'STUDENT_INSTRUMENT' && (
          <div className="space-y-6">
            {/* Student Document Header */}
            <div className="text-center space-y-1 pb-3 border-b-2 border-slate-800">
              <h2 className="text-lg md:text-xl font-extrabold uppercase tracking-tight text-slate-900">
                {model.instruments.list.every((i) => i.type === 'WRITTEN_TEST')
                  ? 'LEMBAR SOAL ASESMEN'
                  : model.instruments.list.every((i) => ['PERFORMANCE', 'PROJECT', 'PRODUCT'].includes(i.type))
                  ? 'LEMBAR TUGAS & INSTRUMEN SISWA'
                  : 'LEMBAR SOAL & INSTRUMEN ASESMEN'}
              </h2>
              {meta.subTitle && (
                <p className="text-sm font-semibold text-slate-700">{meta.subTitle}</p>
              )}
              <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">{meta.schoolName}</p>
            </div>

            {/* Student Identity Form Grid */}
            <div className="border border-slate-400 rounded-lg p-3.5 bg-slate-50/50 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <div className="space-y-1.5">
                  <div className="flex">
                    <span className="w-28 text-slate-600 font-semibold">Mata Pelajaran:</span>
                    <span className="font-bold text-slate-900">{meta.subject || '-'}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-slate-600 font-semibold">Kelas / Semester:</span>
                    <span className="font-bold text-slate-900">
                      {meta.grade ? `Kelas ${meta.grade}` : '-'} / {meta.semester || '-'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-slate-600 font-semibold">Tahun Ajaran:</span>
                    <span className="font-bold text-slate-900">{meta.academicYear || '-'}</span>
                  </div>
                </div>

                <div className="space-y-1.5 border-t sm:border-t-0 sm:border-l sm:pl-6 border-slate-300 pt-2 sm:pt-0">
                  <div className="flex items-center">
                    <span className="w-24 text-slate-700 font-semibold">Nama Siswa:</span>
                    <div className="flex-1 border-b border-dotted border-slate-500 h-4"></div>
                  </div>
                  <div className="flex items-center">
                    <span className="w-24 text-slate-700 font-semibold">Nomor Absen:</span>
                    <div className="w-24 border-b border-dotted border-slate-500 h-4"></div>
                    <span className="mx-2 text-slate-700 font-semibold">Kelas:</span>
                    <div className="flex-1 border-b border-dotted border-slate-500 h-4"></div>
                  </div>
                  <div className="flex items-center">
                    <span className="w-24 text-slate-700 font-semibold">Hari / Tanggal:</span>
                    <div className="flex-1 border-b border-dotted border-slate-500 h-4"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* General Student Instructions */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              <span className="font-bold uppercase tracking-wider block text-[11px]">Petunjuk Pengerjaan:</span>
              <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-amber-950">
                <li>Berdoalah sebelum mengerjakan soal atau tugas.</li>
                <li>Tuliskan identitas Anda dengan jelas dan lengkap pada kolom yang telah disediakan.</li>
                <li>Bacalah setiap petunjuk, stimulus, dan butir soal dengan cermat dan teliti.</li>
                <li>Dahulukan menjawab soal yang Anda anggap paling mudah.</li>
                <li>Periksa kembali seluruh lembar jawaban Anda sebelum diserahkan kepada guru.</li>
              </ol>
            </div>

            {/* Instruments & Questions (Pure Student Facing) */}
            <div className="space-y-6 pt-2">
              {model.instruments.list.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Belum ada instrumen soal.</p>
              ) : (
                model.instruments.list.map((inst, instIdx) => (
                  <div key={inst.id} className="space-y-4">
                    {model.instruments.list.length > 1 && (
                      <div className="font-bold text-xs uppercase tracking-wide bg-slate-100 p-2 rounded border border-slate-300 text-slate-800">
                        BAGIAN {instIdx + 1}: {inst.title || inst.typeLabel || inst.type}
                      </div>
                    )}

                    {/* 1. WRITTEN ITEMS */}
                    {inst.type === 'WRITTEN_TEST' && inst.writtenItems && (
                      <div className="space-y-5">
                        {inst.writtenItems.map((item) => {
                          const isStimulusLoading = isTargetLoading('STIMULUS', item.id);
                          const isPromptLoading = isTargetLoading('ITEM_PROMPT', item.id);
                          const isOptionsLoading = isTargetLoading('OPTIONS', item.id);

                          return (
                            <div key={`student-written-${inst.id}-${item.no}`} className="space-y-2 text-xs">
                              {/* Stimulus */}
                              {item.stimulus && (
                                <div className="p-3 bg-slate-50 border-l-4 border-slate-400 italic text-slate-800 rounded-r flex items-start justify-between gap-2">
                                  <div className="flex-1 leading-relaxed whitespace-pre-wrap">{item.stimulus}</div>
                                  {onRegenerateTarget && item.id && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onRegenerateTarget(
                                          'STIMULUS',
                                          item.id!,
                                          false,
                                          { kind: 'INSTRUMENT_ITEM', id: item.id! },
                                          `Stimulus Soal ${item.no}`
                                        )
                                      }
                                      disabled={isAnyLoading}
                                      className="no-print shrink-0 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition disabled:opacity-50"
                                      title={`Buat ulang Stimulus Soal ${item.no}`}
                                    >
                                      <RefreshCw className={`w-3 h-3 ${isStimulusLoading ? 'animate-spin text-indigo-600' : ''}`} />
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Question Prompt */}
                              <div className="flex items-start gap-2.5 pt-1">
                                <span className="font-bold text-slate-900 w-5 text-right shrink-0">{item.no}.</span>
                                <div className="flex-1 font-medium text-slate-900 leading-relaxed">
                                  {item.prompt}
                                </div>
                                {onRegenerateTarget && item.id && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onRegenerateTarget(
                                        'ITEM_PROMPT',
                                        item.id!,
                                        false,
                                        { kind: 'INSTRUMENT_ITEM', id: item.id! },
                                        `Pertanyaan Soal ${item.no}`
                                      )
                                    }
                                    disabled={isAnyLoading}
                                    className="no-print shrink-0 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition disabled:opacity-50"
                                    title={`Buat ulang Pertanyaan Soal ${item.no}`}
                                  >
                                    <RefreshCw className={`w-3 h-3 ${isPromptLoading ? 'animate-spin text-indigo-600' : ''}`} />
                                  </button>
                                )}
                              </div>

                              {/* Options (Multiple choice, etc) */}
                              {item.options && item.options.length > 0 && (
                                <div className="pl-7 space-y-1.5 pt-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase no-print">Pilihan:</span>
                                    {onRegenerateTarget && item.id && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onRegenerateTarget(
                                            'OPTIONS',
                                            item.id!,
                                            false,
                                            { kind: 'INSTRUMENT_ITEM', id: item.id! },
                                            `Pilihan Jawaban Soal ${item.no}`
                                          )
                                        }
                                        disabled={isAnyLoading}
                                        className="no-print shrink-0 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition disabled:opacity-50"
                                        title={`Buat ulang Pilihan Soal ${item.no}`}
                                      >
                                        <RefreshCw className={`w-3 h-3 ${isOptionsLoading ? 'animate-spin text-indigo-600' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {item.options.map((opt, optIdx) => (
                                      <div
                                        key={`opt-${item.no}-${opt.label || optIdx}`}
                                        className="flex items-start gap-2 p-1.5 rounded hover:bg-slate-50 transition"
                                      >
                                        <span className="font-bold text-slate-700 w-4">{opt.label}.</span>
                                        <span className="text-slate-800">{opt.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Blank Space for Essay / Short Answer */}
                              {['ESSAY', 'SHORT_ANSWER'].includes(item.itemType || '') && (
                                <div className="pl-7 pt-2">
                                  <div className="border border-dashed border-slate-300 rounded p-4 bg-slate-50/30 text-slate-400 text-[10px] italic">
                                    Ruang Jawaban Siswa:
                                    <div className="h-16"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 2. PERFORMANCE / PROJECT / PRODUCT / ASSIGNMENT */}
                    {['PERFORMANCE', 'PROJECT', 'PRODUCT', 'ASSIGNMENT'].includes(inst.type) && (
                      <div className="p-4 border border-slate-300 rounded-lg space-y-3 bg-white text-xs">
                        {(inst.task || inst.projectBrief || inst.productBrief || inst.instructions) && (
                          <div className="space-y-1">
                            <span className="font-bold text-slate-800 block uppercase tracking-wide text-[11px]">
                              Tugas / Instruksi Pengerjaan:
                            </span>
                            <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                              {inst.task || inst.projectBrief || inst.productBrief || inst.instructions}
                            </p>
                          </div>
                        )}

                        {(inst.expectedDeliverable || inst.expectedProduct || inst.expectedOutput) && (
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded space-y-0.5">
                            <span className="font-semibold text-slate-700 block text-[11px]">
                              Bukti / Produk yang Wajib Dikumpulkan:
                            </span>
                            <p className="text-slate-800">
                              {inst.expectedDeliverable || inst.expectedProduct || inst.expectedOutput}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 3. PORTFOLIO */}
                    {inst.type === 'PORTFOLIO' && (
                      <div className="p-4 border border-slate-300 rounded-lg space-y-3 bg-white text-xs">
                        {inst.instructions && (
                          <div className="space-y-1">
                            <span className="font-bold text-slate-800 block uppercase tracking-wide text-[11px]">
                              Petunjuk Penyusunan Portofolio:
                            </span>
                            <p className="text-slate-900 whitespace-pre-wrap">{inst.instructions}</p>
                          </div>
                        )}
                        {inst.evidenceRequirements && inst.evidenceRequirements.length > 0 && (
                          <div className="space-y-1">
                            <span className="font-semibold text-slate-700 block">Daftar Bukti Portofolio:</span>
                            <ul className="list-disc list-inside space-y-0.5 text-slate-800">
                              {inst.evidenceRequirements.map((req, rIdx) => (
                                <li key={rIdx}>{req}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. SELF / PEER ASSESSMENT */}
                    {['SELF_ASSESSMENT', 'PEER_ASSESSMENT'].includes(inst.type) && inst.selfPeerItems && (
                      <div className="space-y-3">
                        {inst.instructions && (
                          <p className="text-xs text-slate-700 italic">{inst.instructions}</p>
                        )}
                        <table className="w-full text-xs border border-slate-300 border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                              <th className="p-2 w-10 text-center border-r border-slate-300">No</th>
                              <th className="p-2 text-left border-r border-slate-300">Pernyataan Penilaian Diri / Antarteman</th>
                              <th className="p-2 w-20 text-center border-r border-slate-300">Ya</th>
                              <th className="p-2 w-20 text-center">Tidak</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {inst.selfPeerItems.map((item) => (
                              <tr key={item.no}>
                                <td className="p-2 text-center font-bold text-slate-600 border-r border-slate-200">{item.no}</td>
                                <td className="p-2 text-slate-900 border-r border-slate-200">{item.statement}</td>
                                <td className="p-2 text-center border-r border-slate-200"></td>
                                <td className="p-2 text-center"></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PROJECTION B: PANDUAN PENILAIAN */}
        {/* ========================================================================= */}
        {projection === 'SCORING_GUIDE' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center space-y-1 pb-4 border-b border-slate-300">
              <h2 className="text-lg md:text-xl font-extrabold uppercase tracking-tight text-slate-900">
                PANDUAN PENILAIAN & PEDOMAN PENSKORAN
              </h2>
              {meta.subTitle && <p className="text-sm font-semibold text-slate-700">{meta.subTitle}</p>}
              <p className="text-xs text-slate-500 font-medium">{meta.schoolName}</p>
            </div>

            {/* Identitas Asesmen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500 font-medium">Satuan Pendidikan:</span>
                <span className="font-semibold text-slate-800">{meta.schoolName || '-'}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500 font-medium">Mata Pelajaran:</span>
                <span className="font-semibold text-slate-800">{meta.subject || '-'}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500 font-medium">Kelas / Semester:</span>
                <span className="font-semibold text-slate-800">
                  {meta.grade ? `Kelas ${meta.grade}` : '-'} / {meta.semester || '-'}
                </span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500 font-medium">Guru Pengampu:</span>
                <span className="font-semibold text-slate-800">{meta.teacherName || '-'}</span>
              </div>
            </div>

            {/* 1. Kunci Jawaban Tes Tertulis & Lisan */}
            {model.answerKeys.list.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 border-l-4 border-indigo-600 pl-2">
                  I. Kunci Jawaban & Bobot Soal
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="p-2 w-14 text-center">No</th>
                        <th className="p-2 w-28">Tipe Soal</th>
                        <th className="p-2">Kunci / Jawaban yang Diharapkan</th>
                        <th className="p-2">Pedoman Penskoran</th>
                        {onRegenerateTarget && <th className="p-2 w-20 text-center no-print">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {model.answerKeys.list.map((ak, akIdx) => {
                        const isKeyLoading = isTargetLoading('PROPOSED_ANSWER', ak.id);

                        return (
                          <tr key={`ak-${akIdx}`} className="hover:bg-slate-50/50">
                            <td className="p-2 text-center font-bold text-slate-700">{ak.itemNumber ?? akIdx + 1}</td>
                            <td className="p-2 text-slate-600 font-medium">{ak.answerType}</td>
                            <td className="p-2 font-bold text-indigo-700">{ak.value || '-'}</td>
                            <td className="p-2 text-slate-600">{ak.notes || '-'}</td>
                            {onRegenerateTarget && (
                              <td className="p-2 text-center no-print">
                                {ak.id && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onRegenerateTarget(
                                        'PROPOSED_ANSWER',
                                        ak.id!,
                                        false,
                                        { kind: 'ANSWER_KEY', id: ak.id! },
                                        `Kunci Jawaban Soal ${ak.itemNumber ?? akIdx + 1}`
                                      )
                                    }
                                    disabled={isAnyLoading}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition disabled:opacity-50"
                                    title="Buat ulang kunci jawaban"
                                  >
                                    <RefreshCw className={`w-3 h-3 ${isKeyLoading ? 'animate-spin text-indigo-600' : ''}`} />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. Pedoman Penskoran Spesifik */}
            {model.scoringGuides.list.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 border-l-4 border-indigo-600 pl-2">
                  II. Pedoman Penskoran
                </h3>
                <div className="space-y-3">
                  {model.scoringGuides.list.map((guide, guideIdx) => (
                    <div key={`guide-${guideIdx}`} className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{guide.title}</span>
                        {guide.maxScore !== undefined && (
                          <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            Skor Maks: {guide.maxScore}
                          </span>
                        )}
                      </div>
                      {guide.instructions && (
                        <p className="text-slate-700"><span className="font-medium">Petunjuk:</span> {guide.instructions}</p>
                      )}
                      {guide.notes && (
                        <p className="text-slate-500 italic"><span className="font-medium not-italic">Catatan:</span> {guide.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Rubrik Penilaian Kinerja / Praktik / Proyek */}
            {model.rubrics.list.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 border-l-4 border-indigo-600 pl-2">
                  III. Rubrik Penilaian Kinerja / Produk / Proyek
                </h3>
                {model.rubrics.list.map((rub, rubIdx) => (
                  <div key={`rub-${rubIdx}`} className="p-4 bg-slate-50 border border-slate-200 rounded space-y-3 text-xs">
                    <div className="font-bold text-slate-800 text-sm">{rub.title}</div>
                    {rub.scale && rub.scale.length > 0 && rub.criteria && rub.criteria.length > 0 ? (
                      <div className="overflow-x-auto border border-slate-200 rounded bg-white">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                              <th className="p-2 w-1/3">Kriteria Penilaian</th>
                              {rub.scale.map((sc, scIdx) => (
                                <th key={`sc-${scIdx}`} className="p-2 text-center">
                                  <div>{sc.label}</div>
                                  {sc.score !== undefined && (
                                    <div className="text-[10px] font-normal text-slate-500">({sc.score})</div>
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {rub.criteria.map((crit, critIdx) => (
                              <tr key={`crit-${critIdx}`}>
                                <td className="p-2 font-semibold text-slate-800 align-top">
                                  <div>{critIdx + 1}. {crit.label}</div>
                                  {crit.weight !== undefined && (
                                    <span className="text-[10px] text-slate-500 font-normal">Bobot: {crit.weight}</span>
                                  )}
                                </td>
                                {rub.scale.map((_, sIdx) => (
                                  <td key={`desc-${critIdx}-${sIdx}`} className="p-2 text-slate-600 align-top text-[11px]">
                                    {crit.descriptors && crit.descriptors[sIdx] ? crit.descriptors[sIdx] : '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* PROJECTION C: PERANGKAT LENGKAP */}
        {/* ========================================================================= */}
        {projection === 'COMPLETE' && (
          <div className="space-y-8">
            {/* Header / Titles */}
            <div className="text-center space-y-1 pb-4 border-b border-slate-200">
              <h2 className="text-lg md:text-xl font-extrabold uppercase tracking-tight text-slate-900">
                {meta.title}
              </h2>
              {meta.subTitle && <p className="text-sm font-semibold text-slate-600">{meta.subTitle}</p>}
              <p className="text-xs text-slate-500 font-medium">{meta.schoolName}</p>
            </div>

            {/* Identitas Lengkap */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1">
                Informasi Dokumen & Satuan Pendidikan
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <div className="flex justify-between py-0.5 border-b border-slate-50">
                  <span className="text-slate-500 font-medium">Satuan Pendidikan:</span>
                  <span className="font-semibold text-slate-800">{meta.schoolName || '-'}</span>
                </div>
                {meta.npsn && (
                  <div className="flex justify-between py-0.5 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">NPSN:</span>
                    <span className="font-semibold text-slate-800">{meta.npsn}</span>
                  </div>
                )}
                <div className="flex justify-between py-0.5 border-b border-slate-50">
                  <span className="text-slate-500 font-medium">Mata Pelajaran:</span>
                  <span className="font-semibold text-slate-800">{meta.subject || '-'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-50">
                  <span className="text-slate-500 font-medium">Fase / Kelas:</span>
                  <span className="font-semibold text-slate-800">
                    {meta.phase ? `Fase ${meta.phase}` : ''} {meta.grade ? `Kelas ${meta.grade}` : ''}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-50">
                  <span className="text-slate-500 font-medium">Tahun Ajaran:</span>
                  <span className="font-semibold text-slate-800">{meta.academicYear || '-'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-50">
                  <span className="text-slate-500 font-medium">Semester:</span>
                  <span className="font-semibold text-slate-800">{meta.semester || '-'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-50">
                  <span className="text-slate-500 font-medium">Guru Pengampu:</span>
                  <span className="font-semibold text-slate-800">{meta.teacherName || '-'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-50">
                  <span className="text-slate-500 font-medium">Tanggal Dokumen:</span>
                  <span className="font-semibold text-slate-800">{meta.formattedDocumentDate || meta.documentDate || '-'}</span>
                </div>
                {meta.packageRevision !== undefined && (
                  <div className="flex justify-between py-0.5 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Nomor Revisi:</span>
                    <span className="font-semibold text-slate-800">Rev {meta.packageRevision}</span>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION I: KISI-KISI ASESMEN */}
            {model.kisiKisi.rows.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 border-l-4 border-blue-600 pl-2">
                  I. Kisi-Kisi Asesmen
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="p-2 w-10 text-center">No</th>
                        <th className="p-2 w-1/4">Tujuan Pembelajaran / KD</th>
                        <th className="p-2">Indikator</th>
                        <th className="p-2">Materi / Konteks</th>
                        <th className="p-2 w-28">Instrumen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {model.kisiKisi.rows.map((row) => (
                        <tr key={`kisikisi-${row.no}`} className="hover:bg-slate-50/50">
                          <td className="p-2 text-center font-semibold text-slate-600">{row.no}</td>
                          <td className="p-2">
                            <div className="text-slate-800">{row.tpCodeAndStatement}</div>
                          </td>
                          <td className="p-2 text-slate-700">{row.indicator}</td>
                          <td className="p-2 text-slate-700">{row.material || '-'}</td>
                          <td className="p-2 text-slate-700 font-medium">{row.instrumentType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECTION II: INSTRUMEN ASESMEN */}
            {model.instruments.list.length > 0 && (
              <div className="space-y-6 pt-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 border-l-4 border-blue-600 pl-2">
                  II. Instrumen Asesmen
                </h3>
                {model.instruments.list.map((inst, instIdx) => (
                  <div key={inst.id} className="p-4 rounded border border-slate-200 bg-slate-50/60 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                        Instrumen {instIdx + 1}: {inst.title || inst.typeLabel || inst.type}
                      </h4>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {inst.typeLabel || inst.type}
                      </span>
                    </div>

                    {/* WRITTEN TEST */}
                    {inst.type === 'WRITTEN_TEST' && inst.writtenItems && (
                      <div className="space-y-4">
                        {inst.writtenItems.map((item) => (
                          <div key={`written-${inst.id}-${item.no}`} className="space-y-2 p-3 bg-white border border-slate-200 rounded">
                            {item.stimulus && (
                              <div className="p-2.5 bg-slate-50 border-l-2 border-slate-400 text-xs italic text-slate-700 rounded-r">
                                {item.stimulus}
                              </div>
                            )}
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-xs text-slate-700">{item.no}.</span>
                              <div className="text-xs text-slate-800 flex-1">{item.prompt}</div>
                            </div>
                            {item.options && item.options.length > 0 && (
                              <div className="pl-6 space-y-1 pt-1 border-t border-slate-100">
                                {item.options.map((opt, optIdx) => (
                                  <div key={optIdx} className="text-xs text-slate-700 flex items-start gap-2">
                                    <span className="font-semibold text-slate-600">{opt.label}.</span>
                                    <span>{opt.text}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* OTHER INSTRUMENTS */}
                    {inst.type !== 'WRITTEN_TEST' && (
                      <div className="text-xs text-slate-800 space-y-2">
                        {inst.task && <p className="whitespace-pre-wrap">{inst.task}</p>}
                        {inst.projectBrief && <p className="whitespace-pre-wrap">{inst.projectBrief}</p>}
                        {inst.productBrief && <p className="whitespace-pre-wrap">{inst.productBrief}</p>}
                        {inst.instructions && <p className="text-slate-600 italic">{inst.instructions}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* SECTION III: KUNCI JAWABAN */}
            {model.answerKeys.list.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 border-l-4 border-blue-600 pl-2">
                  III. Kunci Jawaban
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="p-2 w-16 text-center">No. Butir</th>
                        <th className="p-2 w-28">Instrumen</th>
                        <th className="p-2 w-28">Tipe Kunci</th>
                        <th className="p-2">Kunci Jawaban</th>
                        <th className="p-2">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {model.answerKeys.list.map((ak, akIdx) => (
                        <tr key={`ak-${akIdx}`} className="hover:bg-slate-50/50">
                          <td className="p-2 text-center font-semibold text-slate-600">{ak.itemNumber ?? '-'}</td>
                          <td className="p-2 text-slate-700 font-medium">{ak.instrumentType}</td>
                          <td className="p-2 text-slate-700">{ak.answerType}</td>
                          <td className="p-2 font-semibold text-blue-700">{ak.value || '-'}</td>
                          <td className="p-2 text-slate-600">{ak.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECTION IV: PEDOMAN PENSKORAN */}
            {model.scoringGuides.list.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 border-l-4 border-blue-600 pl-2">
                  IV. Pedoman Penskoran
                </h3>
                <div className="space-y-3">
                  {model.scoringGuides.list.map((guide, guideIdx) => (
                    <div key={`guide-${guideIdx}`} className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{guide.title}</span>
                        {guide.maxScore !== undefined && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                            Skor Maks: {guide.maxScore}
                          </span>
                        )}
                      </div>
                      {guide.instructions && <p className="text-slate-700">{guide.instructions}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION V: RUBRIK PENILAIAN */}
            {model.rubrics.list.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 border-l-4 border-blue-600 pl-2">
                  V. Rubrik Penilaian
                </h3>
                {model.rubrics.list.map((rub, rubIdx) => (
                  <div key={`rub-${rubIdx}`} className="p-4 bg-slate-50 border border-slate-200 rounded space-y-3 text-xs">
                    <div className="font-bold text-slate-800 text-sm">{rub.title}</div>
                    {rub.scale && rub.scale.length > 0 && rub.criteria && rub.criteria.length > 0 && (
                      <div className="overflow-x-auto border border-slate-200 rounded bg-white">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                              <th className="p-2 w-1/3">Kriteria</th>
                              {rub.scale.map((sc, scIdx) => (
                                <th key={scIdx} className="p-2 text-center">
                                  <div>{sc.label}</div>
                                  {sc.score !== undefined && <div className="text-[10px] text-slate-500">({sc.score})</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {rub.criteria.map((crit, critIdx) => (
                              <tr key={critIdx}>
                                <td className="p-2 font-semibold text-slate-800 align-top">{crit.label}</td>
                                {rub.scale.map((_, sIdx) => (
                                  <td key={sIdx} className="p-2 text-slate-600 align-top text-[11px]">
                                    {crit.descriptors && crit.descriptors[sIdx] ? crit.descriptors[sIdx] : '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* SIGNOFF */}
            <div className="pt-8 border-t border-slate-200 text-xs">
              <div className="text-right text-slate-700 font-medium mb-6">
                {model.signoff.locationAndDate}
              </div>
              <div className="grid grid-cols-2 gap-8 text-center">
                <div className="space-y-16">
                  <div className="font-medium text-slate-700">{model.signoff.principalTitle}</div>
                  <div>
                    <div className="font-bold underline text-slate-800">{model.signoff.principalName}</div>
                    {model.signoff.principalNip && (
                      <div className="text-slate-600">{model.signoff.principalNip}</div>
                    )}
                  </div>
                </div>
                <div className="space-y-16">
                  <div className="font-medium text-slate-700">{model.signoff.teacherTitle}</div>
                  <div>
                    <div className="font-bold underline text-slate-800">{model.signoff.teacherName}</div>
                    {model.signoff.teacherNip && (
                      <div className="text-slate-600">{model.signoff.teacherNip}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
