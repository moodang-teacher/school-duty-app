'use client';

import { Teacher, DutyAssignment, getStats } from '@/lib/schedule';

interface Props {
  assignments: DutyAssignment[];
  teachers: Teacher[];
}

export default function StatsScreen({ assignments, teachers }: Props) {
  const stats = getStats(assignments, teachers);
  const max = Math.max(1, ...stats.map((s) => s.count));

  return (
    <div>
      <div className="text-sm text-slate-500 mb-3">선생님별 당직 횟수 (올해)</div>
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {stats.map((s) => (
          <div key={s.teacherId} className="p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm">{s.teacherName}</span>
              <span className="text-sm font-medium">{s.count}회</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${(s.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-slate-100 rounded-lg text-xs text-slate-600">
        ℹ️ 형평성을 위해 당직 횟수가 가장 적은 선생님부터 다음 순번에 우선 배정됩니다.
      </div>
    </div>
  );
}
