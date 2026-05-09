'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * 자동 업데이트 체커
 *
 * 동작:
 * 1. 앱 첫 로드 시 현재 버전을 저장
 * 2. 1분마다 /api/version에서 최신 버전을 확인
 * 3. 다르면 화면 하단에 업데이트 알림 띠 표시
 * 4. 사용자가 "업데이트" 누르면 캐시 비우고 새로고침
 */
export default function UpdateChecker() {
  const [showBanner, setShowBanner] = useState(false);
  const currentVersionRef = useRef<string | null>(null);

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

      if (currentVersionRef.current === null) {
        // 첫 호출 - 현재 버전 저장만
        currentVersionRef.current = v;
      } else if (currentVersionRef.current !== v) {
        // 버전 달라짐 - 업데이트 띠 표시
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
    // 3. 강제 새로고침 (캐시 우회)
    window.location.reload();
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
