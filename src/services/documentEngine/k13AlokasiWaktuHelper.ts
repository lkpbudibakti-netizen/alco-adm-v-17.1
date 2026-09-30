import { TimeAllocation } from '../../types';
import { normalizeLearningAllocation } from '../jpEngine';

export interface K13AlokasiWaktuRow {
  id: string;
  kdCode: string;
  materi: string;
  kegiatan?: string;
  allocatedJP: number;
  startWeek?: number;
  endWeek?: number;
  weekNumber?: number;
  weekDisplay: string;
}

export function buildK13AlokasiWaktuRows(
  k13Items: any[] = [],
  timeAllocations: TimeAllocation[] = []
): K13AlokasiWaktuRow[] {
  const normalizedAllocations = (timeAllocations || []).map(normalizeLearningAllocation);

  return (k13Items || []).map((item, index) => {
    const itemKd = item.kd || item.code || `KD ${index + 1}`;
    const itemId = item.id;

    // Matching allocation: prioritize sourceType === 'KD', sourceId === item.id || sourceId === item.kd
    const match = normalizedAllocations.find(
      (a) =>
        (a.sourceType === 'KD' && (a.sourceId === itemId || a.sourceId === itemKd)) ||
        a.sourceId === itemId ||
        a.sourceId === itemKd ||
        a.tpId === itemId ||
        a.atpItemId === itemId
    );

    const allocatedJP = match?.allocatedJP ?? (item.alokasiJp ? Number(item.alokasiJp) : 0);

    let weekDisplay = '-';
    let startWeek: number | undefined = match?.startWeek;
    let endWeek: number | undefined = match?.endWeek;
    let weekNumber: number | undefined = match?.weekNumber;

    if (startWeek !== undefined && endWeek !== undefined && startWeek > 0 && endWeek >= startWeek) {
      weekDisplay = startWeek === endWeek ? `Pekan ${startWeek}` : `Pekan ${startWeek}–${endWeek}`;
    } else if (weekNumber !== undefined && weekNumber > 0) {
      weekDisplay = `Pekan ${weekNumber}`;
    }

    return {
      id: itemId || `k13-row-${index}`,
      kdCode: itemKd,
      materi: item.materi || item.materiPokok || item.topic || '-',
      kegiatan: item.kegiatan,
      allocatedJP,
      startWeek,
      endWeek,
      weekNumber,
      weekDisplay,
    };
  });
}
