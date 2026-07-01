// 특정 선생님의 특정 기간 당직 제외 관리 - Firestore teacherExcludeRanges 컬렉션
import { db } from './firebase';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';

export interface TeacherExcludeRange {
  id: string;
  teacherId: string;
  startDate: string; // 'yyyy-MM-dd' (포함)
  endDate: string; // 'yyyy-MM-dd' (포함)
  reason: string; // 없으면 빈 문자열
  createdAt: number;
}

// 캐시 (앱 세션 동안 유지)
let cachedRanges: TeacherExcludeRange[] = [];
let cacheLoaded = false;

/**
 * Firestore의 teacherExcludeRanges 컬렉션 전체를 로드
 * 앱 시작 시 loadHolidays()/loadNoDutyRanges()와 함께 한 번 호출
 */
export async function loadTeacherExcludeRanges(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'teacherExcludeRanges'));
    cachedRanges = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TeacherExcludeRange, 'id'>),
    }));
  } catch (e) {
    console.warn('선생님별 당직 제외 기간 로드 실패:', e);
  } finally {
    cacheLoaded = true;
  }
}

export function isTeacherExcludedOnDate(teacherId: string, dateStr: string): boolean {
  return cachedRanges.some(
    (r) => r.teacherId === teacherId && r.startDate <= dateStr && dateStr <= r.endDate
  );
}

export function isTeacherExcludeRangeCacheLoaded(): boolean {
  return cacheLoaded;
}

/** 관리자 페이지: 새 제외 기간 추가 */
export async function addTeacherExcludeRange(
  teacherId: string,
  startDate: string,
  endDate: string,
  reason: string
): Promise<void> {
  await addDoc(collection(db, 'teacherExcludeRanges'), {
    teacherId,
    startDate,
    endDate,
    reason,
    createdAt: Date.now(),
  });
}

/** 관리자 페이지: 제외 기간 삭제 */
export async function deleteTeacherExcludeRange(id: string): Promise<void> {
  await deleteDoc(doc(db, 'teacherExcludeRanges', id));
}
