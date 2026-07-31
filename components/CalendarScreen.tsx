'use client';

import { useEffect, useRef, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { DutyAssignment, isWeekend } from '@/lib/schedule';
import { isHoliday, getHolidayName } from '@/lib/holidays';
import { isNoDutyRangeDate, getNoDutyReason } from '@/lib/noDutyRanges';

interface Props {
  assignments: DutyAssignment[];
  currentTeacherId: string;
}

const TRANSITION_MS = 280;

type Anim = { dir: 1 | -1; from: Date; to: Date; phase: 'start' | 'run' };

export default function CalendarScreen({ assignments, currentTeacherId }: Props) {
  const [month, setMonth] = useState(new Date());
  const [anim, setAnim] = useState<Anim | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  const triggerChange = (dir: 1 | -1) => {
    if (anim) return;
    setAnim({
      dir,
      from: month,
      to: dir === 1 ? addMonths(month, 1) : subMonths(month, 1),
      phase: 'start',
    });
  };

  useEffect(() => {
    if (anim && anim.phase === 'start') {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnim((a) => (a ? { ...a, phase: 'run' } : a)));
      });
      return () => cancelAnimationFrame(id);
    }
  }, [anim]);

  const finishAnim = () => {
    if (!anim) return;
    setMonth(anim.to);
    setAnim(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (anim) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;

    const SWIPE_THRESHOLD = 50;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      triggerChange(dx > 0 ? -1 : 1);
    }
  };

  const renderGrid = (m: Date) => {
    const start = startOfMonth(m);
    const end = endOfMonth(m);
    const days = eachDayOfInterval({ start, end });
    const startPad = getDay(start);

    const cells: (Date | null)[] = [...Array(startPad).fill(null), ...days];
    while (cells.length < 42) cells.push(null);

    return (
      <div className="grid grid-cols-7 grid-rows-6 gap-0.5 w-full h-full">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateStr = format(d, 'yyyy-MM-dd');
          const a = assignments.find((x) => x.date === dateStr);
          const holiday = isHoliday(dateStr);
          const noDuty = isNoDutyRangeDate(dateStr);
          const weekend = isWeekend(dateStr);
          const isMine = a?.teacherId === currentTeacherId;

          return (
            <div
              key={i}
              className={`rounded-md p-1 flex flex-col items-center justify-start ${
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
    );
  };

  const titleMonth = anim ? anim.to : month;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => triggerChange(-1)}
          className="px-3 py-1 text-slate-600"
        >
          ‹
        </button>
        <div className="text-base font-semibold">
          {format(titleMonth, 'yyyy년 M월', { locale: ko })}
        </div>
        <button
          onClick={() => triggerChange(1)}
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

      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: '7 / 6' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {anim ? (
          <>
            <div
              className="absolute inset-0"
              style={{
                transform: `translateX(${anim.phase === 'start' ? 0 : anim.dir * -100}%)`,
                transition: `transform ${TRANSITION_MS}ms ease-out`,
              }}
            >
              {renderGrid(anim.from)}
            </div>
            <div
              className="absolute inset-0"
              style={{
                transform: `translateX(${anim.phase === 'start' ? anim.dir * 100 : 0}%)`,
                transition: `transform ${TRANSITION_MS}ms ease-out`,
              }}
              onTransitionEnd={finishAnim}
            >
              {renderGrid(anim.to)}
            </div>
          </>
        ) : (
          <div className="absolute inset-0">{renderGrid(month)}</div>
        )}
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
