'use client';

import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Teacher, DutyAssignment } from '@/lib/schedule';
import { getHolidayName, isHoliday } from '@/lib/holidays';
import { isWeekend } from '@/lib/schedule';

interface Props {
  assignments: DutyAssignment[];
  teachers: Teacher[];
  currentTeacherId: string;
}

export default function HomeScreen({ assignments, currentTeacherId }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayDuty = assignments.find((a) => a.date === today);
  const upcoming = assignments
    .filter((a) => a.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextDuty = upcoming[0];
  const myNext = upcoming.find((a) => a.teacherId === currentTeacherId);

  const todayLabel = format(new Date(), 'M월 d일 (E)', { locale: ko });

  return (
    <div className="space-y-3">
      {/* 오늘 당직 */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-blue-700 font-medium">오늘 · {todayLabel}</span>
        </div>
        {isWeekend(today) ? (
          <div className="text-xl text-slate-800 font-semibold">주말 — 당직 없음</div>
        ) : isHoliday(today) ? (
          <div className="text-xl text-slate-800 font-semibold">{getHolidayName(today)} — 당직 없음</div>
        ) : todayDuty ? (
          <div>
            <div className="text-xl font-semibold">{todayDuty.teacherName} 선생님</div>
            <div className="text-sm text-slate-600 mt-1">오후 5:40 알림 예정</div>
          </div>
        ) : (
          <div className="text-base text-slate-600">배정 없음</div>
        )}
      </div>

      {/* 다음 당직 */}
      {nextDuty && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">다음 당직</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-medium">{nextDuty.teacherName} 선생님</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {format(parseISO(nextDuty.date), 'M월 d일 (E)', { locale: ko })} · 17:40
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 이번 주 일정 */}
      <div>
        <div className="text-sm text-slate-500 mb-2 mt-4">이번 주 일정</div>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {upcoming.slice(0, 5).map((a) => (
            <div
              key={a.date}
              className={`p-4 flex items-center justify-between ${
                a.teacherId === currentTeacherId ? 'bg-blue-50' : ''
              }`}
            >
              <div className="text-md">
                {format(parseISO(a.date), 'M/d (E)', { locale: ko })}
              </div>
              <div className="text-md font-medium">
                {a.teacherName}
                {a.swappedFrom && <span className="ml-1 text-xs text-amber-600">(변경)</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 내 다음 당직 */}
      {myNext && (
        <div>
          <div className="text-sm text-slate-500 mb-2 mt-4">내 다음 당직</div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-base font-medium">
                {format(parseISO(myNext.date), 'M월 d일 (E)', { locale: ko })}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                D-{differenceInCalendarDays(parseISO(myNext.date), new Date())}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
