import { generateFairSchedule, POLICY_START } from '../functions/schedule';
import { isHoliday } from './holidays';
import { isNoDutyRangeDate } from './noDutyRanges';
import { isTeacherExcludedOnDate } from './teacherExcludeRanges';

export interface Teacher {
  id: string;
  name: string;
  active?: boolean;
  dutyStartDate?: string; // 최초 당직 참여일 (교환으로 바뀌지 않음)
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
  const day = d.getUTCDay();
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
 * 2. 참여 이전의 부담을 보정하고 총횟수를 균등하게 배정
 * 3. 선생님 개별 제외 요일 적용 (예: 박지훈 → 매주 목요일 건너뜀)
 * 4. 총횟수를 유지하며 요일 편중과 연속 근무를 줄임
 * 5. 2026-09-30까지의 기록과 승인된 교환은 보존
 */
export function generateSchedule(
  teachers: Teacher[],
  startDate: string,
  endDate: string,
  existingAssignments: DutyAssignment[] = []
): DutyAssignment[] {
  return generateFairSchedule(teachers, startDate, endDate, existingAssignments, {
    isDutyDay,
    isTeacherExcluded: isTeacherExcludedOnDate,
  });
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
  if (date1 < POLICY_START || date2 < POLICY_START) {
    throw new Error('2026년 9월 30일까지의 배정은 변경할 수 없습니다.');
  }
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
