'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore';
import { Teacher, DutyAssignment, generateSchedule } from '@/lib/schedule';
import { setupForegroundListener, syncNotificationToken } from '@/lib/notifications';
import { loadHolidays } from '@/lib/holidays';
import { loadNoDutyRanges } from '@/lib/noDutyRanges';
import { loadTeacherExcludeRanges } from '@/lib/teacherExcludeRanges';
import HomeScreen from '@/components/HomeScreen';
import CalendarScreen from '@/components/CalendarScreen';
import StatsScreen from '@/components/StatsScreen';
import SettingsScreen from '@/components/SettingsScreen';
import SplashScreen from '@/components/SplashScreen';

type Tab = 'home' | 'calendar' | 'stats' | 'settings';

// ITI관리자를 나타내는 특수 ID
const VIEWER_ID = 'iti_admin';

export default function Page() {
  const [tab, setTab] = useState<Tab>('home');
  const [user, setUser] = useState<User | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [currentTeacherId, setCurrentTeacherId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const isViewer = currentTeacherId === VIEWER_ID;

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
      const currentYear = new Date().getFullYear();
      const startStr = `${currentYear}-01-01`;
      const endStr = `${currentYear}-12-31`;

      const [, teachersSnap, assignSnap] = await Promise.all([
        Promise.all([loadHolidays(), loadNoDutyRanges(), loadTeacherExcludeRanges()]),
        getDocs(collection(db, 'teachers')),
        getDocs(
          query(
            collection(db, 'assignments'),
            where('date', '>=', startStr),
            where('date', '<=', endStr)
          )
        ),
      ]);

      const teachersList: Teacher[] = teachersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Teacher, 'id'>),
      }));

      let assignList: DutyAssignment[] = assignSnap.docs.map((d) => d.data() as DutyAssignment);

      if (assignList.length === 0 && teachersList.length > 0) {
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

  // 관리자 모드에서 settings 탭이 선택되어 있으면 home으로 리다이렉트
  useEffect(() => {
    if (isViewer && tab === 'settings') {
      setTab('home');
    }
  }, [isViewer, tab]);

  // 앱 실행 시마다 알림 권한이 이미 허용된 상태면 토큰을 최신 상태로 재등록
  useEffect(() => {
    if (!currentTeacherId || isViewer) return;
    syncNotificationToken(currentTeacherId);
  }, [currentTeacherId, isViewer]);

  if (loading) {
    return <SplashScreen />;
  }

  // 첫 접속 선택 화면
  if (!currentTeacherId && teachers.length > 0) {
    return (
      <div className="min-h-screen p-6 max-w-md mx-auto">
        <h1 className="text-xl font-semibold mb-2">본인을 선택해주세요</h1>
        <p className="text-sm text-slate-500 mb-4">한 번만 선택하면 다음부터 자동 로그인됩니다.</p>

        {/* ITI관리자 - 상단 강조 */}
        <button
          onClick={() => {
            localStorage.setItem('teacherId', VIEWER_ID);
            setCurrentTeacherId(VIEWER_ID);
          }}
          className="w-full p-4 mb-3 rounded-xl border-2 border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 flex items-center gap-3 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg">
            👁️
          </div>
          <div className="flex-1 text-left">
            <div className="text-base font-semibold text-blue-900">ITI관리자</div>
            <div className="text-xs text-blue-700 mt-0.5">현황 조회 전용</div>
          </div>
        </button>

        {/* 구분선 */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-200" />
          <div className="text-xs text-slate-400">당직 선생님</div>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* 일반 선생님 명단 */}
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

  // 표시할 이름 결정
  const displayName = isViewer
    ? 'ITI관리자'
    : `${teachers.find((t) => t.id === currentTeacherId)?.name ?? ''} 선생님`;

  // 표시할 탭 결정 (관리자 모드면 settings 제외)
  const visibleTabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: '홈', icon: '/images/ico_home.png' },
    { id: 'calendar', label: '달력', icon: '/images/ico_calendar.png' },
    { id: 'stats', label: '통계', icon: '/images/ico_statistics.png' },
  ];
  if (!isViewer) {
    visibleTabs.push({ id: 'settings', label: '설정', icon: '/images/ico_settings.png' });
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">당직ON - ITI 당직관리</h1>
        <span className="text-xs text-slate-500">
          {isViewer ? (
            <button
              onClick={() => {
                if (confirm('본인 선택을 다시 하시겠어요?')) {
                  localStorage.removeItem('teacherId');
                  window.location.reload();
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200"
            >
              <span>👁️</span>
              <span>ITI관리자</span>
            </button>
          ) : (
            displayName
          )}
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
        {tab === 'settings' && !isViewer && (
          <SettingsScreen
            teachers={teachers}
            currentTeacherId={currentTeacherId}
            assignments={assignments}
            setAssignments={setAssignments}
          />
        )}
      </main>

      <nav
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 grid ${
          isViewer ? 'grid-cols-3' : 'grid-cols-4'
        }`}
      >
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-4 flex flex-col items-center text-xs ${
              tab === t.id ? 'text-blue-600 font-medium' : 'text-slate-500'
            }`}
          >
            <img
              src={t.icon}
              alt={t.label}
              className={`w-7 h-7 mb-1 ${tab === t.id ? 'opacity-100' : 'opacity-60'}`}
            />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
