'use client';

import { useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { DutyAssignment, isWeekend } from '@/lib/schedule';
import { isHoliday, getHolidayName } from '@/lib/holidays';
import { isNoDutyRangeDate, getNoDutyReason } from '@/lib/noDutyRanges';

interface Props {
  assignments: DutyAssignment[];
  currentTeacherId: string;
}

export default function CalendarScreen({ assignments, currentTeacherId }: Props) {
  const [month, setMonth] = useState(new Date());

  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start);

  const cells: (Date | null)[] = [...Array(startPad).fill(null), ...days];
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMonth(subMonths(month, 1))}
          className="px-3 py-1 text-slate-600"
        >
          ‹
        </button>
        <div className="text-base font-semibold">{format(month, 'yyyy년 M월', { locale: ko })}</div>
        <button
          onClick={() => setMonth(addMonths(month, 1))}
          className="px-3 py-1 text-slate-600"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weekdays.map((w, i) => (
          <div
            key={w}
            className={`text-center text-xs py-1 ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />;
          const dateStr = format(d, 'yyyy-MM-dd');
          const a = assignments.find((x) => x.date === dateStr);
          const holiday = isHoliday(dateStr);
          const noDuty = isNoDutyRangeDate(dateStr);
          const weekend = isWeekend(dateStr);
          const isMine = a?.teacherId === currentTeacherId;

          return (
            <div
              key={i}
              className={`aspect-square rounded-md p-1 flex flex-col items-center justify-start ${
                isMine
                  ? 'bg-blue-100 border border-blue-300'
                  : a
                  ? 'bg-blue-50'
                  : holiday || noDuty
                  ? 'bg-red-50'
                  : weekend
                  ? 'bg-slate-50'
                  : ''
              }`}
            >
              <span
                className={`text-xs ${
                  holiday || noDuty
                    ? 'text-red-600'
                    : weekend
                    ? 'text-slate-400'
                    : 'text-slate-700'
                }`}
              >
                {format(d, 'd')}
              </span>
              {a && (
                <span className="text-[11px] mt-0.5 text-blue-700 truncate w-full text-center leading-tight">
                  {a.teacherName.slice(0, 3)}
                </span>
              )}
              {(holiday || noDuty) && (
                <span className="text-[8px] text-red-600 truncate w-full text-center leading-tight">
                  {(getHolidayName(dateStr) ?? getNoDutyReason(dateStr))?.slice(0, 3)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 bg-blue-100 border border-blue-300 rounded" />내 당직
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 bg-blue-50 rounded" />다른 분 당직
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 bg-red-50 rounded" />공휴일 · 비적용기간
        </div>
      </div>
    </div>
  );
}
