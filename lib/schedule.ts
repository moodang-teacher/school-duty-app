import { format, addDays, getDay } from 'date-fns';
import { isHoliday } from './holidays';
import { isNoDutyRangeDate } from './noDutyRanges';
import { isTeacherExcludedOnDate } from './teacherExcludeRanges';

export interface Teacher {
  id: string;
  name: string;
  excludeWeekdays: number[]; // 0=일, 1=월, ..., 6=토. 예: 박지훈 [4] (목요일 제외)
}

export interface DutyAssignment {
  date: string; // 'YYYY-MM-DD'
  teacherId: string;
  teacherName: string;
  swappedFrom?: string; // 교환된 경우 원래 당직자 ID
}

export interface SwapRequest {
  id: string;
  fromTeacherId: string;
  fromDate: string;
  toTeacherId: string;
  toDate: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isDutyDay(dateStr: string): boolean {
  return !isWeekend(dateStr) && !isHoliday(dateStr) && !isNoDutyRangeDate(dateStr);
}

/**
 * 당직 순번 생성
 *
 * 규칙:
 * 1. 평일만 배정 (주말/공휴일 제외)
 * 2. 선생님 명단 순서대로 순환
 * 3. 선생님 개별 제외 요일 적용 (예: 박지훈 → 매주 목요일 건너뜀)
 * 4. 형평성 보정: 누적 횟수가 가장 적은 선생님부터 우선 배정
 */
export function generateSchedule(
  teachers: Teacher[],
  startDate: string,
  endDate: string,
  existingAssignments: DutyAssignment[] = []
): DutyAssignment[] {
  if (teachers.length === 0) return [];

  const assignments: DutyAssignment[] = [];
  const counts: Record<string, number> = {};
  teachers.forEach((t) => (counts[t.id] = 0));

  // 기존 교환 내역 반영
  const swapMap: Record<string, string> = {};
  existingAssignments.forEach((a) => {
    if (a.swappedFrom) {
      swapMap[a.date] = a.teacherId;
    }
  });

  let cursor = new Date(startDate);
  const end = new Date(endDate);
  let rotationIdx = 0;

  while (cursor <= end) {
    const dateStr = format(cursor, 'yyyy-MM-dd');

    if (!isDutyDay(dateStr)) {
      cursor = addDays(cursor, 1);
      continue;
    }

    // 교환된 날짜는 그대로 유지
    if (swapMap[dateStr]) {
      const t = teachers.find((x) => x.id === swapMap[dateStr]);
      if (t) {
        assignments.push({ date: dateStr, teacherId: t.id, teacherName: t.name, swappedFrom: 'swap' });
        counts[t.id]++;
      }
      cursor = addDays(cursor, 1);
      continue;
    }

    const dayOfWeek = getDay(cursor);

    // 후보 선생님 중에서 (1) 해당 요일 제외 안 한 사람 (2) 누적 횟수 최소
    const candidates = teachers.filter(
      (t) => !t.excludeWeekdays.includes(dayOfWeek) && !isTeacherExcludedOnDate(t.id, dateStr)
    );
    if (candidates.length === 0) {
      // 모두가 제외한 요일이면 그냥 순번대로
      const t = teachers[rotationIdx % teachers.length];
      assignments.push({ date: dateStr, teacherId: t.id, teacherName: t.name });
      counts[t.id]++;
      rotationIdx++;
      cursor = addDays(cursor, 1);
      continue;
    }

    // 형평성을 위해 누적 횟수가 가장 적은 후보 우선
    // 동률이면 순번 인덱스가 빠른 사람
    const minCount = Math.min(...candidates.map((c) => counts[c.id]));
    const tied = candidates.filter((c) => counts[c.id] === minCount);

    // 순번 인덱스를 기준으로 가장 가까운 사람 선택
    let picked = tied[0];
    for (let i = 0; i < teachers.length; i++) {
      const t = teachers[(rotationIdx + i) % teachers.length];
      if (tied.find((c) => c.id === t.id)) {
        picked = t;
        break;
      }
    }

    assignments.push({ date: dateStr, teacherId: picked.id, teacherName: picked.name });
    counts[picked.id]++;
    rotationIdx = teachers.findIndex((t) => t.id === picked.id) + 1;
    cursor = addDays(cursor, 1);
  }

  return assignments;
}

/**
 * 두 날짜의 당직자를 교환
 * 관리자 승인 없이 두 당사자만 동의하면 즉시 적용
 */
export function applySwap(
  assignments: DutyAssignment[],
  date1: string,
  date2: string
): DutyAssignment[] {
  const a1 = assignments.find((a) => a.date === date1);
  const a2 = assignments.find((a) => a.date === date2);
  if (!a1 || !a2) return assignments;

  return assignments.map((a) => {
    if (a.date === date1) {
      return { ...a, teacherId: a2.teacherId, teacherName: a2.teacherName, swappedFrom: a1.teacherId };
    }
    if (a.date === date2) {
      return { ...a, teacherId: a1.teacherId, teacherName: a1.teacherName, swappedFrom: a2.teacherId };
    }
    return a;
  });
}

/**
 * 선생님별 당직 횟수 통계
 */
export function getStats(
  assignments: DutyAssignment[],
  teachers: Teacher[]
): { teacherId: string; teacherName: string; count: number }[] {
  const map: Record<string, number> = {};
  teachers.forEach((t) => (map[t.id] = 0));
  assignments.forEach((a) => {
    if (map[a.teacherId] !== undefined) map[a.teacherId]++;
  });
  return teachers
    .map((t) => ({ teacherId: t.id, teacherName: t.name, count: map[t.id] }))
    .sort((a, b) => b.count - a.count);
}
