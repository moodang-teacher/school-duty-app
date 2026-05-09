// 한국 공휴일 관리 - Firestore에서 동적 로드
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

export type HolidayMap = Record<string, string>;

// 캐시 (앱 세션 동안 유지)
const holidayCache: Record<string, HolidayMap> = {};
let cacheLoaded = false;

// 폴백용 - API 갱신 전이거나 오류 시 사용 (수동으로 매년 갱신해도 OK)
const FALLBACK_HOLIDAYS: HolidayMap = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-25': '부처님오신날',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일(광복절)',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
};

let combinedHolidays: HolidayMap = { ...FALLBACK_HOLIDAYS };

/**
 * Firestore의 holidays 컬렉션에서 공휴일 데이터를 모두 로드
 * 앱 시작 시 한 번만 호출
 */
export async function loadHolidays(): Promise<void> {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1]; // 올해 + 내년

  for (const year of years) {
    try {
      const snap = await getDoc(doc(db, 'holidays', String(year)));
      if (snap.exists()) {
        const data = snap.data().data as HolidayMap;
        holidayCache[String(year)] = data;
        combinedHolidays = { ...combinedHolidays, ...data };
      }
    } catch (e) {
      console.warn(`공휴일 데이터 로드 실패 (${year}):`, e);
    }
  }
  cacheLoaded = true;
}

export function isHoliday(dateStr: string): boolean {
  return !!combinedHolidays[dateStr];
}

export function getHolidayName(dateStr: string): string | null {
  return combinedHolidays[dateStr] || null;
}

export function isHolidayCacheLoaded(): boolean {
  return cacheLoaded;
}
