'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  setDoc,
} from 'firebase/firestore';
import { format } from 'date-fns';
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
import SplashScreen from '@/components/SplashScreen';

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [holidayList, setHolidayList] = useState<{ year: string; count: number }[]>([]);
  const [teacherCount, setTeacherCount] = useState(0);
  const [noDutyRangeList, setNoDutyRangeList] = useState<NoDutyRange[]>([]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeReason, setRangeReason] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
      else {
        setReady(true);
        await Promise.all([loadHolidayList(), loadTeacherCount(), loadNoDutyRangeList()]);
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
      setResult('✓ 당직 비적용 기간이 추가되었습니다. 적용하려면 아래 "오늘부터 재생성"을 눌러주세요.');
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

  async function loadTeacherCount() {
    const snap = await getDocs(collection(db, 'teachers'));
    setTeacherCount(snap.size);
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
    if (
      !confirm(
        `오늘부터 ${year}년 12월 31일까지의 일정을 재생성합니다.\n\n` +
          '• 지난 일정은 그대로 보존됩니다\n' +
          '• 미래 일정만 현재 선생님 명단으로 다시 만듭니다\n' +
          '• 누적 당직 횟수는 이어집니다 (형평성 유지)\n\n' +
          '진행할까요?'
      )
    )
      return;

    setLoading(true);
    setResult('');
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      await Promise.all([loadHolidays(), loadNoDutyRanges()]);

      const teachersSnap = await getDocs(collection(db, 'teachers'));
      const teachers: Teacher[] = teachersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Teacher, 'id'>),
      }));
      if (teachers.length === 0) {
        setResult('✗ 선생님 명단이 비어있습니다. seed.js를 먼저 실행하세요.');
        setLoading(false);
        return;
      }

      const assignSnap = await getDocs(collection(db, 'assignments'));
      const allAssignments: DutyAssignment[] = assignSnap.docs.map(
        (d) => d.data() as DutyAssignment
      );

      const pastAssignments = allAssignments.filter((a) => a.date < today);
      const futureToDelete = allAssignments.filter((a) => a.date >= today);
      const deletePromises = futureToDelete.map((a) =>
        deleteDoc(doc(db, 'assignments', a.date))
      );
      await Promise.all(deletePromises);

      const endStr = `${year}-12-31`;
      const newAssignments = generateSchedule(
        teachers,
        today,
        endStr,
        pastAssignments
      );

      const savePromises = newAssignments.map((a) =>
        setDoc(doc(db, 'assignments', a.date), a)
      );
      await Promise.all(savePromises);

      setResult(
        `✓ 일정 재생성 완료!\n` +
          `   • 보존된 과거 일정: ${pastAssignments.length}개\n` +
          `   • 삭제된 미래 일정: ${futureToDelete.length}개\n` +
          `   • 새로 생성된 일정: ${newAssignments.length}개`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`✗ 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateFullYear() {
    if (
      !confirm(
        `⚠️ ${year}년 전체 일정을 모두 삭제하고 처음부터 재생성합니다.\n\n` +
          '• 지난 일정도 모두 사라집니다\n' +
          '• 누적 통계가 초기화됩니다\n\n' +
          '정말 진행할까요?'
      )
    )
      return;

    setLoading(true);
    setResult('');
    try {
      await Promise.all([loadHolidays(), loadNoDutyRanges()]);

      const teachersSnap = await getDocs(collection(db, 'teachers'));
      const teachers: Teacher[] = teachersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Teacher, 'id'>),
      }));
      if (teachers.length === 0) {
        setResult('✗ 선생님 명단이 비어있습니다.');
        setLoading(false);
        return;
      }

      const snap = await getDocs(collection(db, 'assignments'));
      const toDelete = snap.docs.filter((d) => d.id.startsWith(`${year}-`));
      await Promise.all(toDelete.map((d) => deleteDoc(doc(db, 'assignments', d.id))));

      const newAssignments = generateSchedule(
        teachers,
        `${year}-01-01`,
        `${year}-12-31`
      );
      await Promise.all(
        newAssignments.map((a) => setDoc(doc(db, 'assignments', a.date), a))
      );

      setResult(`✓ ${year}년 전체 일정 ${newAssignments.length}개를 새로 생성했습니다.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult(`✗ 실패: ${msg}`);
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

      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium mb-3">현황</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">등록된 선생님</span>
            <span className="font-medium">{teacherCount}명</span>
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
            onChange={(e) => setYear(Number(e.target.value))}
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

      <section className="bg-white border-2 border-blue-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">오늘 이후 일정 재생성</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            추천
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          선생님 명단 변경(전입/전출) 후 사용하세요.
          <br />
          과거 일정은 보존하고 미래만 새 명단으로 다시 만듭니다.
        </p>
        <button
          onClick={regenerateFutureSchedule}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md disabled:bg-slate-300"
        >
          {loading ? '처리중...' : '오늘부터 재생성'}
        </button>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-medium mb-2 text-amber-700">
          ⚠️ 전체 재생성 (위험)
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {year}년 전체 일정을 처음부터 다시 만듭니다. 과거 일정도 사라집니다.
          <br />
          새해 첫 사용 또는 강제 초기화 시에만 사용하세요.
        </p>
        <button
          onClick={regenerateFullYear}
          disabled={loading}
          className="w-full px-4 py-2 bg-white border border-amber-500 text-amber-700 text-sm rounded-md disabled:bg-slate-100"
        >
          {year}년 전체 재생성
        </button>
      </section>

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
