'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { Teacher, DutyAssignment, generateSchedule } from '@/lib/schedule';
import { setupForegroundListener } from '@/lib/notifications';
import { loadHolidays } from '@/lib/holidays';
import HomeScreen from '@/components/HomeScreen';
import CalendarScreen from '@/components/CalendarScreen';
import StatsScreen from '@/components/StatsScreen';
import SettingsScreen from '@/components/SettingsScreen';

type Tab = 'home' | 'calendar' | 'stats' | 'settings';

export default function Page() {
  const [tab, setTab] = useState<Tab>('home');
  const [user, setUser] = useState<User | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [currentTeacherId, setCurrentTeacherId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        await signInAnonymously(auth);
      } else {
        setUser(u);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // 1. 공휴일 데이터 먼저 로드 (Firestore에서)
      await loadHolidays();

      // 2. 선생님 명단
      const teachersSnap = await getDocs(collection(db, 'teachers'));
      const teachersList: Teacher[] = teachersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Teacher, 'id'>),
      }));

      // 3. 일정 로드
      const assignSnap = await getDocs(collection(db, 'assignments'));
      let assignList: DutyAssignment[] = assignSnap.docs.map((d) => d.data() as DutyAssignment);

      // 일정이 없으면 올해 일정 생성
      if (assignList.length === 0 && teachersList.length > 0) {
        const today = new Date();
        const startStr = `${today.getFullYear()}-01-01`;
        const endStr = `${today.getFullYear()}-12-31`;
        assignList = generateSchedule(teachersList, startStr, endStr);
        await Promise.all(
          assignList.map((a) => setDoc(doc(db, 'assignments', a.date), a))
        );
      }

      setTeachers(teachersList);
      setAssignments(assignList);

      const savedId = localStorage.getItem('teacherId');
      if (savedId) setCurrentTeacherId(savedId);

      setLoading(false);
    })();

    setupForegroundListener();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm">불러오는 중...</div>
      </div>
    );
  }

  if (!currentTeacherId && teachers.length > 0) {
    return (
      <div className="min-h-screen p-6 max-w-md mx-auto">
        <h1 className="text-xl font-semibold mb-2">본인을 선택해주세요</h1>
        <p className="text-sm text-slate-500 mb-4">한 번만 선택하면 다음부터 자동 로그인됩니다.</p>
        <div className="space-y-2">
          {teachers.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                localStorage.setItem('teacherId', t.id);
                setCurrentTeacherId(t.id);
              }}
              className="w-full p-3 text-left rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (teachers.length === 0) {
    return (
      <div className="min-h-screen p-6 max-w-md mx-auto">
        <h1 className="text-xl font-semibold mb-2">초기 설정 필요</h1>
        <p className="text-sm text-slate-500">
          관리자 페이지(`/admin`)에서 선생님 명단을 먼저 등록해주세요. README.md를 참조하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-slate-50 pb-20">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">교사 당직 관리</h1>
        <span className="text-xs text-slate-500">
          {teachers.find((t) => t.id === currentTeacherId)?.name} 선생님
        </span>
      </header>

      <main className="p-4">
        {tab === 'home' && (
          <HomeScreen
            assignments={assignments}
            teachers={teachers}
            currentTeacherId={currentTeacherId}
          />
        )}
        {tab === 'calendar' && (
          <CalendarScreen assignments={assignments} currentTeacherId={currentTeacherId} />
        )}
        {tab === 'stats' && <StatsScreen assignments={assignments} teachers={teachers} />}
        {tab === 'settings' && (
          <SettingsScreen
            teachers={teachers}
            currentTeacherId={currentTeacherId}
            assignments={assignments}
            setAssignments={setAssignments}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 grid grid-cols-4">
        {(
          [
            { id: 'home', label: '홈', icon: '🏠' },
            { id: 'calendar', label: '달력', icon: '📅' },
            { id: 'stats', label: '통계', icon: '📊' },
            { id: 'settings', label: '설정', icon: '⚙️' },
          ] as { id: Tab; label: string; icon: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-3 flex flex-col items-center text-xs ${
              tab === t.id ? 'text-blue-600 font-medium' : 'text-slate-500'
            }`}
          >
            <span className="text-lg mb-0.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
