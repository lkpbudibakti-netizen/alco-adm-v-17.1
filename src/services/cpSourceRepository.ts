import { ActiveContext, CPSource, CPElem, CPVerificationStatus, normalizeCPVerificationStatus } from '../types';
import { CP_PRESETS, CPSamplePreset } from '../data/curriculumDefaults';

export interface CPSourceSearchResult {
  id: string;
  subject: string;
  level: string;
  grade: string;
  phase: string;
  curriculum: string;
  title: string;
  institution: string;
  documentYear: string;
  url?: string;
  page?: string;
  verificationStatus: CPVerificationStatus;
  generalDescription: string;
  elements: CPElem[];
  sourceMeta: CPSource;
  confidenceScore: number;
}

function matchesSubject(target: string, item: string): { matches: boolean; score: number } {
  const t = target.trim().toLowerCase();
  const i = item.trim().toLowerCase();

  if (!t || !i) {
    return { matches: false, score: 0 };
  }

  // Exact match
  if (t === i) {
    return { matches: true, score: 50 };
  }

  // PJOK aliases
  const isTargetPJOK = t.includes('pjok') || t.includes('jasmani') || t.includes('penjas');
  const isItemPJOK = i.includes('pjok') || i.includes('jasmani') || i.includes('penjas');
  if (isTargetPJOK || isItemPJOK) {
    if (isTargetPJOK && isItemPJOK) {
      return { matches: true, score: 45 };
    }
    return { matches: false, score: 0 };
  }

  // Bahasa Indonesia aliases
  const isTargetBI = t.includes('bahasa indonesia') || t.includes('b. indonesia') || t.includes('b.indo');
  const isItemBI = i.includes('bahasa indonesia') || i.includes('b. indonesia') || i.includes('b.indo');
  if (isTargetBI || isItemBI) {
    if (isTargetBI && isItemBI) {
      return { matches: true, score: 45 };
    }
    return { matches: false, score: 0 };
  }

  // IPAS aliases
  const isTargetIPAS = t.includes('ipas') || t.includes('ilmu pengetahuan alam dan sosial') || t.includes('ilmu pengetahuan alam & sosial');
  const isItemIPAS = i.includes('ipas') || i.includes('ilmu pengetahuan alam dan sosial') || i.includes('ilmu pengetahuan alam & sosial');
  if (isTargetIPAS || isItemIPAS) {
    if (isTargetIPAS && isItemIPAS) {
      return { matches: true, score: 45 };
    }
    return { matches: false, score: 0 };
  }

  // Matematika aliases
  const isTargetMat = t.includes('matematika') || t.includes('mtk') || t === 'math';
  const isItemMat = i.includes('matematika') || i.includes('mtk');
  if (isTargetMat || isItemMat) {
    if (isTargetMat && isItemMat) {
      return { matches: true, score: 45 };
    }
    return { matches: false, score: 0 };
  }

  // Pendidikan Pancasila aliases
  const isTargetPancasila = t.includes('pancasila') || t.includes('ppkn') || t.includes('pkn');
  const isItemPancasila = i.includes('pancasila') || i.includes('ppkn') || i.includes('pkn');
  if (isTargetPancasila || isItemPancasila) {
    if (isTargetPancasila && isItemPancasila) {
      return { matches: true, score: 45 };
    }
    return { matches: false, score: 0 };
  }

  // Substring match for other subjects (minimum 3 characters to avoid trivial substring collisions)
  if (t.length >= 3 && (i.includes(t) || t.includes(i))) {
    return { matches: true, score: 35 };
  }

  return { matches: false, score: 0 };
}

/**
 * Official CP Source Repository & Registry
 * Prioritizes official government publications (Kemendikdasmen, BSKAP, Ruang GTK).
 * Fallbacks are transparently labeled as local_reference.
 */
class CPSourceRepository {
  private registry: CPSamplePreset[] = [...CP_PRESETS];

  /**
   * Search available CP entries by ActiveContext
   * Uses subject as a HARD FILTER: candidates of other subjects are never included.
   */
  public search(context: Partial<ActiveContext>): CPSourceSearchResult[] {
    const rawTargetSubject = context.subject || '';
    const targetSubject = rawTargetSubject.trim().toLowerCase();
    if (!targetSubject) {
      return [];
    }

    const targetLevel = (context.level || '').trim().toLowerCase();
    const targetPhase = (context.phase || '').trim().toLowerCase();
    const targetGrade = (context.grade || '').trim().toLowerCase();

    const matchedResults: CPSourceSearchResult[] = [];

    this.registry.forEach((item, index) => {
      // 1. HARD FILTER on subject: only matching subjects are permitted
      const subjectMatch = matchesSubject(targetSubject, item.subject);
      if (!subjectMatch.matches) {
        return;
      }

      let score = subjectMatch.score;
      const itemPhase = item.phase.toLowerCase();
      const itemLevel = item.level.toLowerCase();
      const itemGrade = item.grade.toLowerCase();

      // 2. Phase match
      if (targetPhase && itemPhase === targetPhase) {
        score += 30;
      } else if (targetPhase && (itemPhase.includes(targetPhase) || targetPhase.includes(itemPhase))) {
        score += 20;
      }

      // 3. Level match
      if (targetLevel && itemLevel === targetLevel) {
        score += 15;
      }

      // 4. Grade match
      if (targetGrade && itemGrade === targetGrade) {
        score += 10;
      } else if (targetGrade && (itemGrade.includes(targetGrade) || targetGrade.includes(itemGrade))) {
        score += 5;
      }

      matchedResults.push({
        id: `src-${index + 1}`,
        subject: item.subject,
        level: item.level,
        grade: item.grade,
        phase: item.phase,
        curriculum: 'Kurikulum Merdeka',
        title: item.sourceInfo.title,
        institution: item.sourceInfo.institution,
        documentYear: item.sourceInfo.documentYear || '2024/2025',
        url: item.sourceInfo.url,
        page: item.sourceInfo.page,
        verificationStatus: normalizeCPVerificationStatus(item.sourceInfo.verificationStatus),
        generalDescription: item.generalDescription,
        elements: item.elements.map((el, elIdx) => ({
          id: `elem-${index + 1}-${elIdx + 1}`,
          name: el.name,
          content: el.content,
        })),
        sourceMeta: item.sourceInfo,
        confidenceScore: score,
      });
    });

    return matchedResults.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Returns default fallback reference if no exact match is found
   */
  public getLocalReferenceFallback(context: Partial<ActiveContext>): CPSourceSearchResult {
    const defaultPhase = context.phase || 'Fase A';
    const defaultSubject = context.subject || 'Mata Pelajaran';
    const defaultGrade = context.grade || 'Kelas 1';

    return {
      id: 'fallback-local',
      subject: defaultSubject,
      level: context.level || 'SD',
      grade: defaultGrade,
      phase: defaultPhase,
      curriculum: context.curriculum || 'Kurikulum Merdeka',
      title: `Draft Dokumen Referensi Lokal - ${defaultSubject} (${defaultPhase})`,
      institution: 'Penyusunan Mandiri Guru (Lokal)',
      documentYear: new Date().getFullYear().toString(),
      url: 'https://kurikulum.kemdikbud.go.id/',
      page: `${defaultPhase} / ${defaultGrade}`,
      verificationStatus: 'local_reference',
      generalDescription: `Pada akhir ${defaultPhase}, peserta didik menguasai kompetensi dasar ${defaultSubject} sesuai tahapan perkembangan belajar pada ${defaultGrade}.`,
      elements: [
        {
          id: 'elem-fallback-1',
          name: 'Pemahaman Konsep & Keterampilan',
          content: `Peserta didik mampu memahami konsep esensial dan mempraktikkan keterampilan utama ${defaultSubject} secara bertahap.`,
        },
      ],
      sourceMeta: {
        title: `Draft Referensi Lokal - ${defaultSubject} (${defaultPhase})`,
        institution: 'Penyusunan Mandiri Guru (Lokal)',
        documentYear: new Date().getFullYear().toString(),
        url: 'https://kurikulum.kemdikbud.go.id/',
        page: `${defaultPhase} / ${defaultGrade}`,
        retrievedAt: new Date().toISOString(),
        verificationStatus: 'local_reference',
      },
      confidenceScore: 10,
    };
  }
}

export const cpSourceRepository = new CPSourceRepository();
