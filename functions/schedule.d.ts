import type { Teacher, DutyAssignment } from '../lib/schedule';
export const POLICY_START: string;
export function effectiveStart(requested: string, today?: string): string;
export function generateFairSchedule(teachers: Teacher[], startDate: string, endDate: string,
  existing?: DutyAssignment[], options?: {
    isDutyDay?: (date: string) => boolean;
    isTeacherExcluded?: (teacherId: string, date: string) => boolean;
  }): DutyAssignment[];
