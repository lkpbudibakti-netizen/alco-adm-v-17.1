import {
  AcademicSetting,
  AssessmentGenerationProfile,
  AssessmentGradeCalibrationProfile,
  AssessmentReferenceProgression,
  AssessmentGenerationRule,
} from '../types';
import { getPhaseForGrade } from '../data/curriculum/resolver';

const ROMAN_GRADE_MAP: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
};

function parseGradeString(str: string): number | undefined {
  const trimmed = str.trim();
  if (!trimmed) return undefined;

  // Tolak format rentang atau karakter pembagi yang ambigu (misal: "4-5", "4/5", "10A-11A")
  if (/[-/,_]/.test(trimmed)) {
    return undefined;
  }

  // 1. Pola angka Arab: opsional prefix kata (kelas|kls|grade|tingkat), lalu angka integer 1..12 secara eksak
  const arabicMatch = trimmed.match(/^(?:(?:kelas|kls|grade|tingkat)\s+)?([1-9]|1[0-2])$/i);
  if (arabicMatch) {
    const num = parseInt(arabicMatch[1], 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      return num;
    }
  }

  // 2. Pola angka Romawi: opsional prefix kata (kelas|kls|grade|tingkat), lalu angka Romawi I..XII secara eksak
  const romanMatch = trimmed.match(/^(?:(?:kelas|kls|grade|tingkat)\s+)?(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)$/i);
  if (romanMatch) {
    const romanKey = romanMatch[1].toUpperCase();
    if (romanKey in ROMAN_GRADE_MAP) {
      return ROMAN_GRADE_MAP[romanKey];
    }
  }

  return undefined;
}

/**
 * Resolusi nilai kelas (grade) secara aman dan deterministik.
 * Nilai wajib berupa bilangan bulat 1 s.d. 12.
 * Jika tidak valid atau ambigu, mengembalikan undefined (FAIL-CLOSED, tanpa fallback tebakan).
 */
export function resolveGrade(
  setting?: AcademicSetting | null,
  inputGrade?: number | string
): number | undefined {
  if (inputGrade !== undefined && inputGrade !== null) {
    if (typeof inputGrade === 'number' && Number.isInteger(inputGrade) && inputGrade >= 1 && inputGrade <= 12) {
      return inputGrade;
    }
    if (typeof inputGrade === 'string') {
      return parseGradeString(inputGrade);
    }
    return undefined;
  }

  if (setting && typeof setting.grade === 'number' && Number.isInteger(setting.grade) && setting.grade >= 1 && setting.grade <= 12) {
    return setting.grade;
  }

  if (setting && typeof setting.grade === 'string') {
    return parseGradeString(setting.grade);
  }

  return undefined;
}

/**
 * Resolusi fase kurikulum resmi berdasarkan grade.
 * Menggunakan canonical getPhaseForGrade dari curriculum resolver.
 * Mengembalikan undefined jika grade tidak terdefinisi pada fase resmi.
 */
export function resolvePhaseForGrade(grade: number): string | undefined {
  const phaseCode = getPhaseForGrade(grade);
  if (!phaseCode) return undefined;
  return `Fase ${phaseCode}`;
}

/**
 * Resolusi progresi kerangka rujukan resmi AKM (Pusmendik BSKAP).
 * Perlakukan sebagai OFFICIAL_REFERENCE, bukan aturan universal asesmen.
 * DILARANG digunakan untuk menentukan HOTS, difficulty, skor, atau jumlah soal secara otomatis.
 */
export function resolveAKMProgression(grade: number): AssessmentReferenceProgression | undefined {
  if (grade < 1 || grade > 12) return undefined;

  let level: 1 | 2 | 3 | 4 | 5 | 6;
  if (grade === 1 || grade === 2) level = 1;
  else if (grade === 3 || grade === 4) level = 2;
  else if (grade === 5 || grade === 6) level = 3;
  else if (grade === 7 || grade === 8) level = 4;
  else if (grade === 9 || grade === 10) level = 5;
  else level = 6; // 11 - 12

  return {
    framework: 'AKM',
    level,
    sourceType: 'OFFICIAL_REFERENCE',
  };
}

/**
 * Profil kalibrasi perkembangan kognitif dan beban bacaan per jenjang kelas.
 * Bertindak sebagai panduan (guidance), bukan aturan mutlak atau template bahasa kaku.
 */
export function getGradeCalibrationProfile(grade: number): AssessmentGradeCalibrationProfile {
  const rules: AssessmentGenerationRule[] = [
    {
      id: `RULE-GRADE-CALIB-${grade}`,
      sourceType: 'PEDAGOGICAL_RULE',
      description: `Kalibrasi kompleksitas instruksi dan stimulus asesmen untuk kelas ${grade} berdasarkan kaidah perkembangan kognitif dan beban bacaan peserta didik.`,
      sourceTitle: 'Kaidah Pedagogis Kompleksitas Instruksi dan Beban Bacaan Peserta Didik',
    },
  ];

  if (grade <= 2) {
    return {
      grade,
      readingLoad: 'VERY_LOW',
      instructionLoad: 'SINGLE_STEP_PREFERRED',
      abstractionLevel: 'CONCRETE',
      visualSupport: 'STRONGLY_CONSIDER',
      rules,
    };
  }

  if (grade <= 4) {
    return {
      grade,
      readingLoad: 'LOW',
      instructionLoad: 'LIMITED_MULTI_STEP',
      abstractionLevel: 'CONCRETE',
      visualSupport: 'CONSIDER',
      rules,
    };
  }

  if (grade <= 6) {
    return {
      grade,
      readingLoad: 'MODERATE',
      instructionLoad: 'LIMITED_MULTI_STEP',
      abstractionLevel: 'CONCRETE_TO_ABSTRACT',
      visualSupport: 'CONSIDER',
      rules,
    };
  }

  if (grade <= 9) {
    return {
      grade,
      readingLoad: 'MODERATE',
      instructionLoad: 'MULTI_STEP_ALLOWED',
      abstractionLevel: 'CONCRETE_TO_ABSTRACT',
      visualSupport: 'AS_NEEDED',
      rules,
    };
  }

  return {
    grade,
    readingLoad: 'HIGH',
    instructionLoad: 'MULTI_STEP_ALLOWED',
    abstractionLevel: 'ABSTRACT_ALLOWED',
    visualSupport: 'AS_NEEDED',
    rules,
  };
}

/**
 * Pembangun Profil Asesmen Generasi (AssessmentGenerationProfile).
 */
export function createAssessmentGenerationProfile(grade: number): AssessmentGenerationProfile {
  const phase = resolvePhaseForGrade(grade);
  const akmProgression = resolveAKMProgression(grade);
  const gradeCalibration = getGradeCalibrationProfile(grade);

  const provenance: AssessmentGenerationRule[] = [
    {
      id: 'PROV-PHASE-OFFICIAL',
      sourceType: 'OFFICIAL',
      description: 'Penetapan Fase Capaian Pembelajaran Kurikulum Merdeka berdasarkan jenjang kelas.',
      sourceTitle: 'Keputusan Kepala BSKAP No. 032/H/KR/2024',
      sourceAgency: 'Kemendikbudristek',
      sourceVersion: '2024',
    },
  ];

  if (akmProgression) {
    provenance.push({
      id: 'PROV-AKM-PROGRESSION',
      sourceType: 'OFFICIAL_REFERENCE',
      description: `Rujukan Level Progresi Asesmen Kompetensi Minimum (AKM Level ${akmProgression.level}) untuk kelas ${grade}.`,
      sourceTitle: 'Kerangka Asesmen Kompetensi Minimum (AKM)',
      sourceAgency: 'Pusat Asesmen Pendidikan (Pusmendik) BSKAP',
      sourceVersion: '2020/2024',
    });
  }

  return {
    grade,
    phase,
    referenceProgression: akmProgression,
    gradeCalibration,
    provenance,
  };
}
