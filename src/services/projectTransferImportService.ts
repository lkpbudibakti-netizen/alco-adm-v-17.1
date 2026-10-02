import {
  ProjectTransferPackage,
  ProjectTransferCP,
  ProjectTransferTP,
  ProjectTransferATP,
} from '../types/projectTransfer';
import {
  loadStorageV5,
  saveStorageV5,
  validateStorageStateV5,
} from './storageV5';
import {
  AppStorageStateV5,
  AdministrationWorkspaceV5,
} from '../types/storageV5';
import {
  YearPlan,
  SemesterPlan,
  CPData,
  CPElem,
  TPData,
  TPItem,
  ATPData,
  ATPItem,
} from '../types';
import { validateProjectTransfer } from './projectTransferService';

export interface ProjectTransferImportParams {
  pkg: ProjectTransferPackage;
  profileId: string;
  schoolId: string;
  classSection?: string;
  documentDate?: string;
}

export interface ProjectTransferImportResult {
  yearPlan: YearPlan;
  workspace: AdministrationWorkspaceV5;
  semesterPlans: [SemesterPlan, SemesterPlan];
  cp: CPData;
  tp: TPData;
  atp: ATPData;
}

/**
 * Performs pure in-memory mapping of a validated ProjectTransferPackage into a target AppStorageStateV5.
 * Mutates the state parameter in-memory only; caller is responsible for validating and persisting.
 * Does not mutate legacy storage or create partial projects if an error occurs.
 */
export function performImportProjectTransferInState(
  state: AppStorageStateV5,
  params: ProjectTransferImportParams
): ProjectTransferImportResult {
  const { pkg, profileId, schoolId, classSection, documentDate } = params;

  if (!pkg || typeof pkg !== 'object') {
    throw new Error('ProjectTransferPackage harus berupa objek transfer yang valid.');
  }

  // 1. Validate contract conformance of the incoming package
  const validation = validateProjectTransfer(pkg);
  if (!validation.isValid) {
    const errorDetails = validation.errors.map((e) => `[${e.code}] ${e.message}`).join(', ');
    throw new Error(`ProjectTransferPackage tidak valid: ${errorDetails}`);
  }

  const targetProfileId = (profileId || '').trim();
  const targetSchoolId = (schoolId || '').trim();

  if (!targetProfileId) {
    throw new Error('Target profileId wajib diisi.');
  }
  if (!targetSchoolId) {
    throw new Error('Target schoolId wajib diisi.');
  }

  // 2. Validate Profile and School existence and association
  const profile = state.profiles.find((p) => p.id === targetProfileId);
  if (!profile) {
    throw new Error(`Profile dengan ID "${targetProfileId}" tidak ditemukan.`);
  }

  const school = state.schools.find((s) => s.id === targetSchoolId);
  if (!school) {
    throw new Error(`School dengan ID "${targetSchoolId}" tidak ditemukan.`);
  }

  if (profile.schoolId && profile.schoolId !== targetSchoolId) {
    throw new Error(
      `Ketidakcocokan sekolah: profile.schoolId "${profile.schoolId}" tidak cocok dengan target schoolId "${targetSchoolId}".`
    );
  }

  // 3. Duplicate Identity Guard: profile + school + academicYear + grade + classSection + subject
  const targetAcademicYear = pkg.academicYear.trim();
  const targetGrade = pkg.grade.trim();
  const targetClassSection = classSection ? classSection.trim() || undefined : undefined;
  const targetSubject = pkg.subject.trim();

  const isDuplicate = state.yearPlans.some(
    (yp) =>
      yp.profileId === targetProfileId &&
      yp.schoolId === targetSchoolId &&
      yp.academicYear === targetAcademicYear &&
      yp.grade === targetGrade &&
      (yp.classSection || '') === (targetClassSection || '') &&
      yp.subject.trim().toLowerCase() === targetSubject.toLowerCase()
  );

  if (isDuplicate) {
    throw new Error(
      `Project dengan identitas yang sama sudah ada: profileId "${targetProfileId}", schoolId "${targetSchoolId}", academicYear "${targetAcademicYear}", grade "${targetGrade}", classSection "${targetClassSection || ''}", subject "${targetSubject}".`
    );
  }

  const now = new Date().toISOString();

  // 4. Create Canonical YearPlan, WorkspaceV5, SemesterPlans (1 & 2)
  const newYearPlanId = `yp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const newYearPlan: YearPlan = {
    id: newYearPlanId,
    profileId: targetProfileId,
    schoolId: targetSchoolId,
    academicYear: targetAcademicYear,
    curriculumType: pkg.curriculumType,
    level: pkg.level as 'SD' | 'SMP' | 'SMA' | 'SMK',
    grade: targetGrade,
    ...(targetClassSection ? { classSection: targetClassSection } : {}),
    subject: targetSubject,
    ...(pkg.phase ? { phase: pkg.phase.trim() } : {}),
    curriculumLock: {
      curriculumType: pkg.curriculumType,
      academicYear: targetAcademicYear,
      lockedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  const newWorkspaceId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const workspaceName = `${targetSubject} - ${targetGrade}${
    targetClassSection ? ` (${targetClassSection})` : ''
  } (${targetAcademicYear})`;

  const newWorkspace: AdministrationWorkspaceV5 = {
    id: newWorkspaceId,
    profileId: targetProfileId,
    schoolId: targetSchoolId,
    yearPlanId: newYearPlanId,
    name: workspaceName,
    ...(documentDate && documentDate.trim() ? { documentDate: documentDate.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const newSemesterPlan1: SemesterPlan = {
    id: `sp-${Date.now()}-1-${Math.random().toString(36).slice(2, 9)}`,
    yearPlanId: newYearPlanId,
    semester: 1,
    createdAt: now,
    updatedAt: now,
  };

  const newSemesterPlan2: SemesterPlan = {
    id: `sp-${Date.now()}-2-${Math.random().toString(36).slice(2, 9)}`,
    yearPlanId: newYearPlanId,
    semester: 2,
    createdAt: now,
    updatedAt: now,
  };

  // 5. Generate fresh internal IDs for CPData and its elements
  const newCPDataId = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const cpElements: CPElem[] = (pkg.cp || []).map((c: ProjectTransferCP, idx: number) => ({
    id: `elem-${Date.now()}-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`,
    name: (c.element || c.code || `Elemen ${idx + 1}`).trim(),
    content: (c.content || '').trim(),
  }));

  const cpElementMap = new Map<string, string>();
  (pkg.cp || []).forEach((c) => {
    if (c.code) {
      cpElementMap.set(c.code.toUpperCase().trim(), (c.element || '').trim());
    }
  });

  const cpGeneralDescription =
    cpElements.length > 0
      ? cpElements.map((el) => `${el.name}: ${el.content}`).join('\n\n')
      : `Capaian Pembelajaran ${targetSubject} ${targetGrade}`;

  const newCPData: CPData = {
    id: newCPDataId,
    academicSettingId: newYearPlanId,
    generalDescription: cpGeneralDescription,
    elements: cpElements,
    workflowStatus: 'DRAFT',
    lastEditedAt: now,
    updatedAt: now,
  };

  // 6. Generate fresh internal IDs for TPData and TPItems
  // Map portable TP code -> internal TPItem
  const newTPDataId = `tp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const tpCodeToItemMap = new Map<string, TPItem>();

  const tpItems: TPItem[] = (pkg.tp || []).map((t: ProjectTransferTP, idx: number) => {
    const freshTPItemId = `tp-item-${Date.now()}-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`;
    const cleanCode = (t.code || '').trim();
    const mappedElementName = t.cpCode ? cpElementMap.get(t.cpCode.toUpperCase().trim()) : undefined;

    const item: TPItem = {
      id: freshTPItemId,
      code: cleanCode,
      ...(mappedElementName ? { elementName: mappedElementName } : {}),
      statement: (t.statement || '').trim(),
      competence: (t.competence || '').trim(),
      contentScope: (t.materialScope || '').trim(),
      order: idx + 1,
      sequence: idx + 1,
      status: 'DRAFT',
      provenance: {
        generatedBy: 'USER',
        generatedAt: now,
      },
    };

    if (cleanCode) {
      tpCodeToItemMap.set(cleanCode.toUpperCase(), item);
    }

    return item;
  });

  const newTPData: TPData = {
    id: newTPDataId,
    academicSettingId: newYearPlanId,
    workspaceId: newWorkspaceId,
    academicYear: targetAcademicYear,
    ...(pkg.phase ? { phase: pkg.phase.trim() } : {}),
    items: tpItems,
    status: 'DRAFT',
    workflowStatus: 'DRAFT',
    provenance: {
      generatedBy: 'USER',
      generatedAt: now,
    },
    updatedAt: now,
  };

  // 7. Generate fresh internal IDs for ATPData and ATPItems
  // 8. Resolve ATP tpCode -> internal TPItem.id and set ATPItem.tpId as canonical linkage
  const newATPDataId = `atp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let knownTotalJP = 0;
  let hasUnknownJP = false;

  const atpItems: ATPItem[] = (pkg.atp || []).map((a: ProjectTransferATP, idx: number) => {
    const freshATPItemId = `atp-item-${Date.now()}-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`;
    const portableTpCode = (a.tpCode || '').toUpperCase().trim();
    const matchedTPItem = tpCodeToItemMap.get(portableTpCode);

    if (!matchedTPItem) {
      throw new Error(
        `Gagal merelasikan ATP urutan ke-${a.order}: kode TP "${a.tpCode}" tidak ditemukan pada daftar TP.`
      );
    }

    const jpVal =
      a.jp !== undefined && a.jp !== null && typeof a.jp === 'number' && !isNaN(a.jp) && a.jp > 0
        ? a.jp
        : null;

    if (jpVal !== null) {
      knownTotalJP += jpVal;
    } else {
      hasUnknownJP = true;
    }

    const item: ATPItem = {
      id: freshATPItemId,
      stepNumber: a.order ?? idx + 1,
      sequence: a.order ?? idx + 1,
      tpId: matchedTPItem.id,
      tpCode: matchedTPItem.code,
      tpStatement: matchedTPItem.statement,
      materialScope: (a.material || matchedTPItem.contentScope || '').trim(),
      allocatedJP: jpVal,
      jp: jpVal,
      semester: a.semester === 1 || a.semester === 2 ? a.semester : null,
      provenance: {
        generatedBy: 'USER',
        generatedAt: now,
      },
    };

    return item;
  });

  const newATPData: ATPData = {
    id: newATPDataId,
    academicSettingId: newYearPlanId,
    workspaceId: newWorkspaceId,
    tpDataId: newTPDataId,
    academicYear: targetAcademicYear,
    ...(pkg.phase ? { phase: pkg.phase.trim() } : {}),
    items: atpItems,
    totalJP: knownTotalJP > 0 ? knownTotalJP : undefined,
    knownTotalJP,
    hasUnknownJP,
    allocationComplete: false,
    status: 'DRAFT',
    workflowStatus: 'DRAFT',
    provenance: {
      generatedBy: 'USER',
      generatedAt: now,
    },
    updatedAt: now,
  };

  // 9. Save hierarchy & annualData entries for the new YearPlan
  state.yearPlans.push(newYearPlan);
  state.workspaces.push(newWorkspace);
  state.semesterPlans.push(newSemesterPlan1, newSemesterPlan2);

  state.annualData.cp.push({ yearPlanId: newYearPlanId, value: newCPData });
  state.annualData.tp.push({ yearPlanId: newYearPlanId, value: newTPData });
  state.annualData.atp.push({ yearPlanId: newYearPlanId, value: newATPData });
  state.annualData.curriculumContext.push({
    yearPlanId: newYearPlanId,
    value: {
      curriculumType: pkg.curriculumType,
      academicYear: targetAcademicYear,
      lockedAt: now,
    },
  });

  // 10. Update activeYearPlanId and activeWorkspaceId to the new project
  // 11. Do NOT auto-select activeSemesterPlanId (leave undefined)
  state.activeProfileId = targetProfileId;
  state.activeYearPlanId = newYearPlanId;
  state.activeWorkspaceId = newWorkspaceId;
  state.activeSemesterPlanId = undefined;

  return {
    yearPlan: newYearPlan,
    workspace: newWorkspace,
    semesterPlans: [newSemesterPlan1, newSemesterPlan2],
    cp: newCPData,
    tp: newTPData,
    atp: newATPData,
  };
}

/**
 * Atomically imports a validated ProjectTransferPackage into Storage V5.
 *
 * Guarantees:
 * - Atomicity: If validation, duplicate check, or mapping fails, previous storage remains intact.
 * - Single persist: Validates the full V5 state graph and saves exactly once upon complete success.
 * - Does not auto-select activeSemesterPlanId.
 * - Does not create synthetic CPAnalysis or TimeAllocation.
 */
export function importProjectTransferPackageV5(
  params: ProjectTransferImportParams
): ProjectTransferImportResult {
  // 1. Load current Storage V5 state
  const state = loadStorageV5();

  // 2. Perform in-memory mapping and hierarchy generation
  const result = performImportProjectTransferInState(state, params);

  // 12. Validate full state graph before persisting
  validateStorageStateV5(state);

  // 13. Persist exactly once
  saveStorageV5(state);

  return result;
}
