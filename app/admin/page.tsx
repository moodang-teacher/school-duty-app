'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
  doc,
  query,
  where,
} from 'firebase/firestore';
import { effectiveStart } from '../../functions/schedule';
import { saveSchedulePreview } from '@/lib/saveSchedule';
import {
  Teacher,
  DutyAssignment,
  generateSchedule,
} from '@/lib/schedule';
import { loadHolidays } from '@/lib/holidays';
import {
  NoDutyRange,
  loadNoDutyRanges,
  addNoDutyRange,
  deleteNoDutyRange,
} from '@/lib/noDutyRanges';
import {
  TeacherExcludeRange,
  loadTeacherExcludeRanges,
  addTeacherExcludeRange,
  deleteTeacherExcludeRange,
} from '@/lib/teacherExcludeRanges';
import SplashScreen from '@/components/SplashScreen';

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [holidayList, setHolidayList] = useState<{ year: string; count: number }[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [noDutyRangeList, setNoDutyRangeList] = useState<NoDutyRange[]>([]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeReason, setRangeReason] = useState('');
  const [teacherExcludeRangeList, setTeacherExcludeRangeList] = useState<TeacherExcludeRange[]>([]);
  const [excludeTeacherId, setExcludeTeacherId] = useState('');
  const [excludeStart, setExcludeStart] = useState('');
  const [excludeEnd, setExcludeEnd] = useState('');
  const [excludeReason, setExcludeReason] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [editingTeacherId, setEditingTeacherId] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [dutyStartDate, setDutyStartDate] = useState('');
  const [preview, setPreview] = useState<{start: string; end: string; before: DutyAssignment[]; after: DutyAssignment[]} | null>(null);
  const [teacherWeekdays, setTeacherWeekdays] = useState<number[]>([]);
  const [regenerateAfterTeacherChange, setRegenerateAfterTeacherChange] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
      else {
        setReady(true);
        await Promise.all([
          loadHolidayList(),
          loadTeachers(),
          loadNoDutyRangeList(),
          loadTeacherExcludeRangeList(),
        ]);
      }
    });
    return () => unsub();
  }, []);

  async function loadHolidayList() {
    const snap = await getDocs(collection(db, 'holidays'));
    const list = snap.docs.map((d) => ({
      year: d.id,
      count: Object.keys(d.data().data || {}).length,
    }));
    setHolidayList(list.sort((a, b) => a.year.localeCompare(b.year)));
  }

  async function loadNoDutyRangeList() {
    const snap = await getDocs(collection(db, 'noDutyRanges'));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<NoDutyRange, 'id'>),
    }));
    setNoDutyRangeList(list.sort((a, b) => a.startDate.localeCompare(b.startDate)));
  }

  async function handleAddNoDutyRange() {
    if (!rangeStart || !rangeEnd || !rangeReason.trim()) {
      setResult('✗ 실패: 시작일, 종료일, 사유를 모두 입력하세요.');
      return;
    }
    const [s, e] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    setLoading(true);
    setResult('');
    try {
      await addNoDutyRange(s, e, rangeReason.trim());
      setRangeStart('');
      setRangeEnd('');
      setRangeReason('');
      await loadNoDutyRangeList();
      setResult('✓ 당직 비적용 기간이 추가되었습니다. 아래 "일정 미리보기"에서 확인 후 적용하세요.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`✗ 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteNoDutyRange(id: string) {
    if (!confirm('이 기간을 삭제할까요?\n\n기존에 생성된 일정은 자동으로 되돌아가지 않습니다. 반영하려면 재생성이 필요합니다.'))
      return;
    setLoading(true);
    setResult('');
    try {
      await deleteNoDutyRange(id);
      await loadNoDutyRangeList();
      setResult('✓ 삭제되었습니다. 반영하려면 일정을 재생성하세요.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`✗ 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadTeachers() {
    const snap = await getDocs(collection(db, 'teachers'));
    const list: Teacher[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Teacher, 'id'>),
    }));
    setTeachers(
      list.sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return a.name.localeCompare(b.name, 'ko');
      })
    );
  }

  function resetTeacherForm() {
    setEditingTeacherId('');
    setTeacherName('');
    setDutyStartDate('');
    setTeacherWeekdays([]);
  }

  function startEditingTeacher(teacher: Teacher) {
    setEditingTeacherId(teacher.id);
    setTeacherName(teacher.name);
    setDutyStartDate(teacher.dutyStartDate || '');
    setTeacherWeekdays(teacher.excludeWeekdays || []);
  }

  function toggleTeacherWeekday(day: number) {
    setTeacherWeekdays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day]
    );
  }

  async function callManageTeacher(data: Record<string, unknown>) {
    const functions = getFunctions(undefined, 'asia-northeast3');
    const call = httpsCallable(functions, 'manageTeacher');
    return call({ ...data, adminPin });
  }

  async function handleSaveTeacher() {
    const name = teacherName.trim();
    if (!adminPin) {
      setResult('❌ 관리자 PIN을 입력하세요.');
      return;
    }
    if (!name) {
      setResult('❌ 선생님 이름을 입력하세요.');
      return;
    }
    const actionLabel = editingTeacherId ? '수정' : '추가';
    const scheduleLabel = regenerateAfterTeacherChange
      ? '오늘 일정과 2026년 9월 30일까지의 기록은 보존하고 이후 일정을 재생성합니다.'
      : '현재 일정은 변경하지 않습니다.';
    if (!confirm(`${name} 선생님을 ${actionLabel}할까요?\n\n${scheduleLabel}`)) return;

    setLoading(true);
    setResult('');
    try {
      const response = await callManageTeacher({
        action: 'upsert',
        teacherId: editingTeacherId || undefined,
        name,
        excludeWeekdays: teacherWeekdays,
        dutyStartDate: dutyStartDate || undefined,
        regenerate: regenerateAfterTeacherChange,
      });
      const data = response.data as { regenerated: boolean; generatedCount: number };
      await loadTeachers();
      resetTeacherForm();
      setResult(
        `✓ 선생님 명단을 ${actionLabel}했습니다.` +
          (data.regenerated
            ? `\n오늘 일정은 유지하고 내일부터 ${data.generatedCount}개 일정을 재생성했습니다.`
            : '\n기존 일정은 변경하지 않았습니다.')
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`❌ 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetTeacherActive(teacher: Teacher) {
    if (!adminPin) {
      setResult('❌ 관리자 PIN을 입력하세요.');
      return;
    }
    const nextActive = teacher.active === false;
    const actionLabel = nextActive ? '활성화' : '비활성화';
    const scheduleLabel = regenerateAfterTeacherChange
      ? '오늘 일정과 2026년 9월 30일까지의 기록은 보존하고 이후 일정을 재생성합니다.'
      : '현재 일정은 변경하지 않습니다.';
    if (!confirm(`${teacher.name} 선생님을 ${actionLabel}할까요?\n\n${scheduleLabel}`)) return;

    setLoading(true);
    setResult('');
    try {
      const response = await callManageTeacher({
        action: 'setActive',
        teacherId: teacher.id,
        active: nextActive,
        regenerate: regenerateAfterTeacherChange,
      });
      const data = response.data as { regenerated: boolean; generatedCount: number };
      await loadTeachers();
      if (editingTeacherId === teacher.id) resetTeacherForm();
      setResult(
        `✓ ${teacher.name} 선생님을 ${actionLabel}했습니다.` +
          (data.regenerated
            ? `\n오늘 일정은 유지하고 내일부터 ${data.generatedCount}개 일정을 재생성했습니다.`
            : '\n기존 일정은 변경하지 않았습니다.')
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`❌ 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadTeacherExcludeRangeList() {
    const snap = await getDocs(collection(db, 'teacherExcludeRanges'));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TeacherExcludeRange, 'id'>),
    }));
    setTeacherExcludeRangeList(list.sort((a, b) => a.startDate.localeCompare(b.startDate)));
  }

  async function handleAddTeacherExcludeRange() {
    if (!excludeTeacherId || !excludeStart || !excludeEnd) {
      setResult('✗ 실패: 선생님, 시작일, 종료일을 모두 입력하세요.');
      return;
    }
    const [s, e] =
      excludeStart <= excludeEnd ? [excludeStart, excludeEnd] : [excludeEnd, excludeStart];
    setLoading(true);
    setResult('');
    try {
      await addTeacherExcludeRange(excludeTeacherId, s, e, excludeReason.trim());
      setExcludeTeacherId('');
      setExcludeStart('');
      setExcludeEnd('');
      setExcludeReason('');
      await loadTeacherExcludeRangeList();
      setResult('✓ 선생님별 제외 기간이 추가되었습니다. 아래 "일정 미리보기"에서 확인 후 적용하세요.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`✗ 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTeacherExcludeRange(id: string) {
    if (!confirm('이 제외 기간을 삭제할까요?\n\n반영하려면 일정 재생성이 필요합니다.')) return;
    setLoading(true);
    setResult('');
    try {
      await deleteTeacherExcludeRange(id);
      await loadTeacherExcludeRangeList();
      setResult('✓ 삭제되었습니다. 반영하려면 일정을 재생성하세요.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`✗ 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchHolidays() {
    setLoading(true);
    setResult('');
    try {
      const functions = getFunctions(undefined, 'asia-northeast3');
      const call = httpsCallable(functions, 'manualFetchHolidays');
      const res = await call({ year });
      const data = res.data as { success: boolean; count: number; year: number };
      setResult(`✓ ${data.year}년 공휴일 ${data.count}개를 가져왔습니다.`);
      await loadHolidayList();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`✗ 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateFutureSchedule() {
    setLoading(true);
    setPreview(null);
    setResult('');
    try {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const start = effectiveStart(year + '-01-01', today);
      const end = year + '-12-31';
      if (start > end) throw new Error('지난 연도의 일정은 변경할 수 없습니다.');
      await Promise.all([loadHolidays(year, true), loadNoDutyRanges(true), loadTeacherExcludeRanges(true)]);
      const [teacherSnap, assignmentSnap] = await Promise.all([
        getDocs(collection(db, 'teachers')),
        getDocs(query(collection(db, 'assignments'), where('date', '>=', year + '-01-01'), where('date', '<=', end))),
      ]);
      const roster = teacherSnap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher));
      const before = assignmentSnap.docs.map(d => d.data() as DutyAssignment);
      const after = generateSchedule(roster, start, end, before);
      setPreview({ start, end, before, after });
      setResult('✓ 미리보기 생성 완료. 아직 운영 일정은 변경되지 않았습니다.');
    } catch (e: unknown) {
      setResult('✗ 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function applyPreview() {
    if (!preview || !confirm(preview.start + '부터의 미리보기 일정을 적용할까요? 이전 일정과 확정 교환은 보존됩니다.')) return;
    setLoading(true);
    try {
      const previewYear = Number(preview.start.slice(0, 4));
      await Promise.all([loadHolidays(previewYear, true), loadNoDutyRanges(true), loadTeacherExcludeRanges(true)]);
      const teacherSnap = await getDocs(collection(db, 'teachers'));
      const roster = teacherSnap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher));
      const checked = generateSchedule(roster, preview.start, preview.end, preview.before);
      if (JSON.stringify(checked) !== JSON.stringify(preview.after)) {
        setPreview(null);
        throw new Error('미리보기 이후 명단이나 제외 조건이 변경되었습니다. 다시 미리보기를 실행하세요.');
      }
      await saveSchedulePreview(preview.start, preview.end, preview.before, preview.after);
      setResult('✓ ' + preview.start + '부터 ' + preview.after.length + '개 일정을 적용했습니다.');
      setPreview(null);
    } catch (e: unknown) {
      setResult('✗ 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return <SplashScreen />;
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-slate-50 p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">관리자 도구</h1>
        <p className="text-xs text-slate-500 mt-1">공휴일 갱신 및 일정 재생성</p>
      </header>

      <section className="bg-white border-2 border-blue-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium mb-1">선생님 명단 관리</div>
        <p className="text-xs text-slate-500 mb-3">
          추가·수정·비활성화 후 선택한 경우에만 오늘 일정과 2026년 9월 30일까지의 기록을 보존하고 이후 일정을 다시 배정합니다.
        </p>

        <label className="block text-xs text-slate-500 mb-1" htmlFor="admin-pin">
          관리자 PIN
        </label>
        <input
          id="admin-pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={adminPin}
          onChange={(e) => setAdminPin(e.target.value)}
          placeholder="Firebase Secret에 설정한 PIN"
          className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm mb-3"
        />

        <label className="block text-xs text-slate-500 mb-1" htmlFor="duty-start-date">최초 당직 참여일 (교환 전 기준, 신규 등록 시 미입력하면 등록일)</label>
        <input id="duty-start-date" type="date" value={dutyStartDate} onChange={e => setDutyStartDate(e.target.value)} className="w-full border rounded-md p-2 mb-3" />

        <div className="space-y-2 mb-4">
          {teachers.map((teacher) => (
            <div
              key={teacher.id}
              className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                teacher.active === false ? 'bg-slate-100 text-slate-400' : 'bg-slate-50'
              }`}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {teacher.name}
                  {teacher.active === false && (
                    <span className="ml-2 text-xs font-normal">비활성</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  제외 요일:{' '}
                  {(teacher.excludeWeekdays || []).length === 0
                    ? '없음'
                    : (teacher.excludeWeekdays || [])
                        .map((day) => ['일', '월', '화', '수', '목', '금', '토'][day])
                        .join(', ')}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEditingTeacher(teacher)}
                  disabled={loading || teacher.active === false}
                  className="text-blue-600 disabled:text-slate-300"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleSetTeacherActive(teacher)}
                  disabled={loading}
                  className={teacher.active === false ? 'text-emerald-600' : 'text-amber-700'}
                >
                  {teacher.active === false ? '활성화' : '비활성화'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {editingTeacherId ? '선생님 정보 수정' : '새 선생님 추가'}
            </span>
            {editingTeacherId && (
              <button type="button" onClick={resetTeacherForm} className="text-xs text-slate-500">
                취소
              </button>
            )}
          </div>
          <input
            type="text"
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="선생님 이름"
            maxLength={30}
            className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm mb-2"
          />
          <div className="text-xs text-slate-500 mb-1">매주 당직 제외 요일</div>
          <div className="flex gap-1 mb-3">
            {['월', '화', '수', '목', '금'].map((label, index) => {
              const day = index + 1;
              const selected = teacherWeekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleTeacherWeekday(day)}
                  className={`flex-1 rounded-md border py-1.5 text-xs ${
                    selected
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600 mb-3">
            <input
              type="checkbox"
              checked={regenerateAfterTeacherChange}
              onChange={(e) => setRegenerateAfterTeacherChange(e.target.checked)}
              className="mt-0.5"
            />
            <span>저장 후 오늘 일정과 2026년 9월까지의 기록을 보존하고 이후 일정 자동 재생성</span>
          </label>
          <button
            type="button"
            onClick={handleSaveTeacher}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md disabled:bg-slate-300"
          >
            {loading ? '처리중...' : editingTeacherId ? '수정 저장' : '선생님 추가'}
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium mb-3">현황</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">등록된 선생님</span>
            <span className="font-medium">
              {teachers.filter((teacher) => teacher.active !== false).length}명
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">공휴일 데이터</span>
            <span className="font-medium">
              {holidayList.length === 0
                ? '없음'
                : holidayList.map((h) => `${h.year}년(${h.count}개)`).join(', ')}
            </span>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium mb-2">공휴일 가져오기</div>
        <p className="text-xs text-slate-500 mb-3">
          공공데이터포털에서 해당 연도의 공휴일을 받아옵니다.
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setPreview(null); }}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-md text-sm"
            min={2024}
            max={2030}
          />
          <button
            onClick={fetchHolidays}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md disabled:bg-slate-300"
          >
            {loading ? '처리중...' : '가져오기'}
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium mb-2">당직 비적용 기간</div>
        <p className="text-xs text-slate-500 mb-3">
          방학 등 당직이 필요 없는 기간을 등록합니다. 이 기간의 날짜는 당직 배정에서
          제외됩니다.
          <br />
          추가/삭제 후 아래에서 일정을 재생성해야 실제 일정에 반영됩니다.
        </p>

        {noDutyRangeList.length === 0 ? (
          <div className="text-xs text-slate-400 mb-3">등록된 기간 없음</div>
        ) : (
          <div className="space-y-1 mb-3">
            {noDutyRangeList.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-xs bg-slate-50 rounded-md px-2 py-1.5"
              >
                <span>
                  {r.startDate} ~ {r.endDate}{' '}
                  <span className="text-slate-500">({r.reason})</span>
                </span>
                <button
                  onClick={() => handleDeleteNoDutyRange(r.id)}
                  disabled={loading}
                  className="text-red-600 disabled:text-slate-300"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-2">
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="flex-1 px-2 py-2 border border-slate-200 rounded-md text-sm"
          />
          <input
            type="date"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="flex-1 px-2 py-2 border border-slate-200 rounded-md text-sm"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={rangeReason}
            onChange={(e) => setRangeReason(e.target.value)}
            placeholder="예: 여름방학"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-md text-sm"
          />
          <button
            onClick={handleAddNoDutyRange}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md disabled:bg-slate-300"
          >
            추가
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium mb-2">선생님별 당직 제외</div>
        <p className="text-xs text-slate-500 mb-3">
          특정 선생님이 특정 기간(예: 개인 사정으로 미출근) 동안 당직에서 제외됩니다.
          다른 선생님들은 이 기간에도 평소대로 순환 배정됩니다.
          <br />
          추가/삭제 후 아래에서 일정을 재생성해야 실제 일정에 반영됩니다.
        </p>

        {teacherExcludeRangeList.length === 0 ? (
          <div className="text-xs text-slate-400 mb-3">등록된 제외 기간 없음</div>
        ) : (
          <div className="space-y-1 mb-3">
            {teacherExcludeRangeList.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-xs bg-slate-50 rounded-md px-2 py-1.5"
              >
                <span>
                  {teachers.find((t) => t.id === r.teacherId)?.name ?? '(알 수 없음)'}:{' '}
                  {r.startDate} ~ {r.endDate}
                  {r.reason && <span className="text-slate-500"> ({r.reason})</span>}
                </span>
                <button
                  onClick={() => handleDeleteTeacherExcludeRange(r.id)}
                  disabled={loading}
                  className="text-red-600 disabled:text-slate-300"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-2">
          <select
            value={excludeTeacherId}
            onChange={(e) => setExcludeTeacherId(e.target.value)}
            className="w-full px-2 py-2 border border-slate-200 rounded-md text-sm"
          >
            <option value="">선생님 선택</option>
            {teachers.filter((t) => t.active !== false).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 mb-2">
          <input
            type="date"
            value={excludeStart}
            onChange={(e) => setExcludeStart(e.target.value)}
            className="flex-1 px-2 py-2 border border-slate-200 rounded-md text-sm"
          />
          <input
            type="date"
            value={excludeEnd}
            onChange={(e) => setExcludeEnd(e.target.value)}
            className="flex-1 px-2 py-2 border border-slate-200 rounded-md text-sm"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={excludeReason}
            onChange={(e) => setExcludeReason(e.target.value)}
            placeholder="사유 (선택, 예: 개인 사정)"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-md text-sm"
          />
          <button
            onClick={handleAddTeacherExcludeRange}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md disabled:bg-slate-300"
          >
            추가
          </button>
        </div>
      </section>

      <section className="bg-white border-2 border-blue-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">보존 기간 이후 일정 변경</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            추천
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          선생님 명단 변경(전입/전출) 후 사용하세요.
          <br />
          2026년 9월 30일까지의 기록과 지난 일정은 보존합니다. 적용 전에 미리보기를 확인하세요.
        </p>
        <button
          onClick={regenerateFutureSchedule}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md disabled:bg-slate-300"
        >
          {loading ? '처리중...' : '일정 미리보기'}
        </button>
      </section>

      {preview && (
        <section className="bg-white border border-blue-200 rounded-xl p-4 mb-4">
          <h2 className="font-medium">{preview.start} ~ {preview.end} 미리보기</h2>
          <p className="text-xs text-slate-500 my-2">2026년 9월 30일까지의 기록과 승인된 교환은 보존합니다. 아래 내용 확인 후 적용하세요.</p>
          <table className="w-full text-xs mb-3">
            <caption className="text-left py-2">선생님별 횟수와 요일 분포</caption>
            <thead><tr><th scope="col">선생님</th><th scope="col">횟수</th>{['월', '화', '수', '목', '금'].map(d => <th scope="col" key={d}>{d}</th>)}</tr></thead>
            <tbody>{Array.from(new Set(preview.after.map(a => a.teacherId))).map(id => {
              const own = preview.after.filter(a => a.teacherId === id);
              return <tr key={id}><th scope="row">{own[0].teacherName}</th><td className="text-center">{own.length}</td>{[1, 2, 3, 4, 5].map(day => <td className="text-center" key={day}>{own.filter(a => new Date(a.date).getUTCDay() === day).length}</td>)}</tr>;
            })}</tbody>
          </table>
          <div className="max-h-80 overflow-auto text-sm">
            {preview.after.map(a => <div key={a.date} className="flex justify-between py-1 border-b"><span>{a.date}{a.swappedFrom ? ' (확정 교환)' : ''}</span><span>{a.teacherName}</span></div>)}
          </div>
          <button onClick={applyPreview} disabled={loading} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-slate-300">미리보기 일정 적용</button>
        </section>
      )}

      {result && (
        <div
          className={`p-3 rounded-md text-sm whitespace-pre-line ${
            result.startsWith('✓')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {result}
        </div>
      )}

      <a
        href="/"
        className="block mt-6 text-center text-sm text-blue-600 underline"
      >
        ← 메인 페이지로 돌아가기
      </a>
    </div>
  );
}
