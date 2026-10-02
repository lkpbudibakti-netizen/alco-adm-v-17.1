import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  FileDown,
  Layers,
  BookOpen,
  Calendar,
  GraduationCap,
  Clock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { TeacherProfile, SchoolData } from '../types';
import {
  ProjectTransferValidationResult,
  RawProjectTransferPackage,
  ProjectTransferPackage,
} from '../types/projectTransfer';
import {
  readXlsxToRawProjectTransferPackage,
  exportEmptyProjectTransferXlsxTemplateBuffer,
} from '../services/projectTransferXlsxService';
import { validateProjectTransfer } from '../services/projectTransferService';
import { importProjectTransferPackageV5 } from '../services/projectTransferImportService';
import { getLocalTodayDocumentDate, isValidDocumentDate } from '../services/documentDateService';

interface ProjectTransferImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfile?: TeacherProfile | null;
  activeSchool?: SchoolData | null;
  onSuccess: () => void;
}

export const ProjectTransferImportModal: React.FC<ProjectTransferImportModalProps> = ({
  isOpen,
  onClose,
  activeProfile,
  activeSchool,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawPackage, setRawPackage] = useState<RawProjectTransferPackage | null>(null);
  const [validationResult, setValidationResult] = useState<ProjectTransferValidationResult | null>(null);

  // Optional manual overrides / additions
  const [classSection, setClassSection] = useState<string>('');
  const [documentDate, setDocumentDate] = useState<string>(() => getLocalTodayDocumentDate());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFile(null);
    setIsParsing(false);
    setParseError(null);
    setRawPackage(null);
    setValidationResult(null);
    setClassSection('');
    setDocumentDate(getLocalTodayDocumentDate());
    setIsSubmitting(false);
    setSubmitError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setSubmitError(null);

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const raw = readXlsxToRawProjectTransferPackage(buffer);
        setRawPackage(raw);

        const result = validateProjectTransfer(raw);
        setValidationResult(result);
      } catch (err: any) {
        setParseError(err.message || 'Gagal membaca format workbook Excel.');
        setRawPackage(null);
        setValidationResult(null);
      } finally {
        setIsParsing(false);
      }
    };

    reader.onerror = () => {
      setParseError('Gagal memuat file yang dipilih.');
      setIsParsing(false);
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleDownloadTemplate = () => {
    try {
      const buffer = exportEmptyProjectTransferXlsxTemplateBuffer({
        subject: 'Pendidikan Pancasila',
        level: (activeProfile?.defaultLevel || 'SD') as 'SD' | 'SMP' | 'SMA' | 'SMK',
        grade: 'Kelas 4',
        phase: 'Fase B',
        academicYear: '2026/2027',
      });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, 'Template_Project_Transfer_Administrasi_v1.xlsx');
    } catch (err: any) {
      alert(`Gagal mengunduh template: ${err?.message || 'Terjadi kesalahan'}`);
    }
  };

  const handleConfirmImport = () => {
    if (!validationResult || !validationResult.isValid || !validationResult.validatedPackage) {
      return;
    }

    if (!activeProfile) {
      setSubmitError('Profil guru aktif tidak ditemukan. Pilih profil terlebih dahulu.');
      return;
    }

    const targetSchoolId = activeProfile.schoolId || activeSchool?.id;
    if (!targetSchoolId) {
      setSubmitError(
        'Sekolah utama belum ditentukan untuk profil guru ini. Tentukan sekolah utama pada Profil terlebih dahulu.'
      );
      return;
    }

    if (documentDate && !isValidDocumentDate(documentDate)) {
      setSubmitError('Tanggal Dokumen tidak valid. Gunakan format YYYY-MM-DD.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      importProjectTransferPackageV5({
        pkg: validationResult.validatedPackage,
        profileId: activeProfile.id,
        schoolId: targetSchoolId,
        classSection: classSection.trim() || undefined,
        documentDate: documentDate.trim() || undefined,
      });

      // Successful atomic import
      handleClose();
      onSuccess();
    } catch (err: any) {
      setSubmitError(err.message || 'Gagal mengimpor project ke Storage V5.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validatedPkg = validationResult?.validatedPackage;
  const summary = validationResult?.summary;
  const isValid = validationResult?.isValid ?? false;

  const displaySubject = validatedPkg?.subject || rawPackage?.subject || '-';
  const displayLevel = validatedPkg?.level || rawPackage?.level || '-';
  const displayGrade = validatedPkg?.grade || rawPackage?.grade || '-';
  const displayPhase = validatedPkg?.phase || rawPackage?.phase || '-';
  const displayAcademicYear = validatedPkg?.academicYear || rawPackage?.academicYear || '-';
  const displayCurriculum = validatedPkg?.curriculumType || rawPackage?.curriculumType || '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Import Project Administrasi (.xlsx)
              </h3>
              <p className="text-xs text-slate-500">
                Target Guru: <strong>{activeProfile?.name || 'Belum dipilih'}</strong> • Sekolah:{' '}
                <strong>{activeSchool?.name || activeProfile?.schoolId || 'Belum dipilih'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload File Section */}
        {!file && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40 rounded-2xl p-8 text-center cursor-pointer transition space-y-3 group"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 group-hover:scale-105 mx-auto flex items-center justify-center transition">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">
                  Klik untuk memilih file Excel (.xlsx)
                </p>
                <p className="text-xs text-slate-500">
                  Workbook harus memuat 4 sheet kanonikal: <code className="text-emerald-700 font-semibold">01_PROJECT</code>, <code className="text-emerald-700 font-semibold">02_CP</code>, <code className="text-emerald-700 font-semibold">03_TP</code>, <code className="text-emerald-700 font-semibold">04_ATP</code>
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Belum memiliki format file yang sesuai?</span>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Unduh Template XLSX Kosong</span>
              </button>
            </div>
          </div>
        )}

        {/* Parsing Indicator */}
        {isParsing && (
          <div className="py-8 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-600">
              Membaca dan memvalidasi file Excel...
            </p>
          </div>
        )}

        {/* Parse Error Box */}
        {parseError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Gagal Membaca File Excel</span>
            </div>
            <p className="text-rose-700">{parseError}</p>
            <button
              type="button"
              onClick={handleReset}
              className="mt-2 text-xs font-semibold text-rose-800 underline cursor-pointer"
            >
              Pilih file lain
            </button>
          </div>
        )}

        {/* Preview & Validation Result */}
        {file && !isParsing && validationResult && (
          <div className="space-y-4">
            {/* File info bar */}
            <div className="flex items-center justify-between bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs">
              <div className="flex items-center gap-2 truncate">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-800 truncate">{file.name}</span>
                <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-blue-700 hover:text-blue-800 font-semibold cursor-pointer shrink-0 ml-2"
              >
                Ganti File
              </button>
            </div>

            {/* Validation Outcome Banner */}
            {isValid ? (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold">Format Data Valid & Siap Diimpor</div>
                  <div className="text-emerald-700 text-[11px]">
                    Seluruh struktur project, kode CP, TP, dan ATP memenuhi spesifikasi Contract v1.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>Ditemukan {validationResult.errors.length} Kesalahan (Error)</span>
                </div>
                <p className="text-rose-700 text-[11px]">
                  File tidak dapat diimpor sebelum kesalahan pada struktur data diperbaiki.
                </p>
              </div>
            )}

            {/* Metadata Preview Grid */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Pratinjau Data Project</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-medium text-slate-500">Mata Pelajaran</div>
                  <div className="font-bold text-slate-900 truncate" title={displaySubject}>
                    {displaySubject}
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-medium text-slate-500">Jenjang & Kelas</div>
                  <div className="font-bold text-slate-900 truncate">
                    {displayLevel} • {displayGrade}
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-medium text-slate-500">Fase</div>
                  <div className="font-bold text-slate-900 truncate">{displayPhase}</div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-medium text-slate-500">Tahun Ajaran</div>
                  <div className="font-bold text-slate-900 truncate">{displayAcademicYear}</div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200 col-span-2">
                  <div className="text-[10px] font-medium text-slate-500">Kurikulum</div>
                  <div className="font-bold text-slate-900 truncate">
                    {displayCurriculum === 'KURIKULUM_MERDEKA'
                      ? 'Kurikulum Merdeka'
                      : displayCurriculum === 'K13'
                      ? 'Kurikulum 2013'
                      : displayCurriculum}
                  </div>
                </div>
              </div>

              {/* Counts Badge Row */}
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium">Capaian (CP)</div>
                    <div className="text-base font-extrabold text-blue-900">{summary.cpCount}</div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium">Tujuan (TP)</div>
                    <div className="text-base font-extrabold text-blue-900">{summary.tpCount}</div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium">Alur (ATP)</div>
                    <div className="text-base font-extrabold text-blue-900">{summary.atpCount}</div>
                  </div>
                  <div
                    className={`p-2 rounded-lg border ${
                      summary.atpWithoutJpCount > 0
                        ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="text-[10px] font-medium opacity-80">ATP Tanpa JP</div>
                    <div className="text-base font-extrabold">{summary.atpWithoutJpCount}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Error List */}
            {validationResult.errors.length > 0 && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs space-y-2">
                <div className="font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Daftar Kesalahan (Wajib Diperbaiki):</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-rose-800 text-[11px] max-h-36 overflow-y-auto pl-1">
                  {validationResult.errors.map((err, idx) => (
                    <li key={idx} className="leading-snug">
                      <span className="font-semibold">[{err.code}]</span> {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warning List */}
            {validationResult.warnings.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Peringatan ({validationResult.warnings.length}):</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-amber-800 text-[11px] max-h-28 overflow-y-auto pl-1">
                  {validationResult.warnings.map((warn, idx) => (
                    <li key={idx} className="leading-snug">
                      <span className="font-semibold">[{warn.code}]</span> {warn.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Optional Project Settings Form */}
            {isValid && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Pengaturan Tambahan (Opsional)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Rombel / Paralel
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: A / 1A"
                      value={classSection}
                      onChange={(e) => setClassSection(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tanggal Dokumen Resmi
                    </label>
                    <input
                      type="date"
                      value={documentDate}
                      onChange={(e) => setDocumentDate(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Submit Error */}
            {submitError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold">Gagal Membuat Project</div>
                  <div className="text-[11px] text-rose-700">{submitError}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            Batalkan
          </button>

          <button
            type="button"
            id="btn-confirm-import-project"
            onClick={handleConfirmImport}
            disabled={!isValid || isSubmitting || !activeProfile}
            className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition cursor-pointer flex items-center gap-1.5 ${
              isValid && !isSubmitting && activeProfile
                ? 'bg-emerald-700 hover:bg-emerald-800'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Membuat Project...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Buat Project</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
