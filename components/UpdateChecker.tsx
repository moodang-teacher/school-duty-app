'use client';

import { useEffect, useState, useRef } from 'react';
import SplashScreen from './SplashScreen';

const STORAGE_KEY = 'duty-on-app-version';

/**
 * 자동 업데이트 체커
 *
 * 동작:
 * 1. 앱 첫 로드 시 현재 버전을 localStorage에 저장 (기기에 설치된 PWA는
 *    모바일 OS에 의해 자주 완전히 종료됐다가 새로 켜지므로, 메모리에만
 *    기준 버전을 두면 켤 때마다 기준이 리셋되어 배너가 뜰 기회가 없다)
 * 2. 1분마다 /api/version에서 최신 버전을 확인
 * 3. 저장된 버전과 다르면 화면 하단에 업데이트 알림 띠 표시
 * 4. 사용자가 "업데이트" 누르면 캐시 비우고 저장된 버전을 갱신한 뒤 새로고침
 */
export default function UpdateChecker() {
  const [showBanner, setShowBanner] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const latestVersionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchVersion(): Promise<string | null> {
      try {
        const res = await fetch('/api/version', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { version: string };
        return data.version;
      } catch {
        return null;
      }
    }

    async function check() {
      const v = await fetchVersion();
      if (cancelled || !v) return;

      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        // 프라이빗 브라우징 등으로 localStorage 접근 불가 - 업데이트 확인 건너뜀
        return;
      }

      if (stored === null) {
        // 이 기기에서 처음 확인하는 경우 - 현재 버전을 기준으로 저장
        try {
          localStorage.setItem(STORAGE_KEY, v);
        } catch {
          /* no-op */
        }
      } else if (stored !== v) {
        // 저장된 버전과 다름 - 업데이트 띠 표시
        latestVersionRef.current = v;
        setShowBanner(true);
      }
    }

    // 첫 호출
    check();

    // 1분마다 체크
    const interval = setInterval(check, 60 * 1000);

    // 사용자가 앱으로 돌아왔을 때(다른 앱 갔다가 복귀) 체크
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  async function handleUpdate() {
    setUpdating(true);
    setProgress(8);

    // 실제 캐시 정리 작업은 순식간에 끝나는 경우가 많아,
    // 진행 상태를 체감할 수 있도록 진행률을 서서히 채워준다.
    const progressTimer = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.random() * 12 : p));
    }, 200);

    try {
      // 1. Service Worker 모두 해제 (PWA의 캐시된 자원 무효화)
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      // 2. 캐시 스토리지 비우기
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn('캐시 정리 실패:', e);
    }

    clearInterval(progressTimer);
    setProgress(100);

    // 3. 기준 버전 갱신 (없으면 새로고침 후 곧바로 다시 배너가 뜸)
    if (latestVersionRef.current) {
      try {
        localStorage.setItem(STORAGE_KEY, latestVersionRef.current);
      } catch {
        /* no-op */
      }
    }

    // 4. 강제 새로고침 (캐시 우회)
    setTimeout(() => window.location.reload(), 300);
  }

  if (updating) {
    return <SplashScreen message="새 버전을 적용하는 중입니다..." progress={progress} />;
  }

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-50">
      <div className="bg-blue-600 text-white rounded-xl shadow-lg p-3 flex items-center justify-between gap-3 animate-slide-up">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">새 버전이 있어요</div>
          <div className="text-xs opacity-90 mt-0.5">업데이트하면 최신 기능을 쓸 수 있어요</div>
        </div>
        <button
          onClick={handleUpdate}
          className="text-sm bg-white text-blue-700 font-medium px-3 py-1.5 rounded-md whitespace-nowrap"
        >
          지금 업데이트
        </button>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
