// 당직 비적용 기간 관리 (예: 방학) - Firestore noDutyRanges 컬렉션
import { db } from './firebase';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';

export interface NoDutyRange {
  id: string;
  startDate: string; // 'yyyy-MM-dd' (포함)
  endDate: string; // 'yyyy-MM-dd' (포함)
  reason: string;
  createdAt: number;
}

// 캐시 (앱 세션 동안 유지)
let cachedRanges: NoDutyRange[] = [];
let cacheLoaded = false;

/**
 * Firestore의 noDutyRanges 컬렉션 전체를 로드
 * 앱 시작 시 loadHolidays()와 함께 한 번 호출
 */
export async function loadNoDutyRanges(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'noDutyRanges'));
    cachedRanges = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<NoDutyRange, 'id'>),
    }));
  } catch (e) {
    console.warn('당직 비적용 기간 로드 실패:', e);
  } finally {
    cacheLoaded = true;
  }
}

export function isNoDutyRangeDate(dateStr: string): boolean {
  return cachedRanges.some((r) => r.startDate <= dateStr && dateStr <= r.endDate);
}

export function getNoDutyReason(dateStr: string): string | null {
  const hit = cachedRanges.find((r) => r.startDate <= dateStr && dateStr <= r.endDate);
  return hit ? hit.reason : null;
}

export function isNoDutyRangeCacheLoaded(): boolean {
  return cacheLoaded;
}

/** 관리자 페이지: 새 비적용 기간 추가 */
export async function addNoDutyRange(
  startDate: string,
  endDate: string,
  reason: string
): Promise<void> {
  await addDoc(collection(db, 'noDutyRanges'), {
    startDate,
    endDate,
    reason,
    createdAt: Date.now(),
  });
}

/** 관리자 페이지: 비적용 기간 삭제 */
export async function deleteNoDutyRange(id: string): Promise<void> {
  await deleteDoc(doc(db, 'noDutyRanges', id));
}
