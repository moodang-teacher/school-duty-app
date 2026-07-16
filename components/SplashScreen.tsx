'use client';

interface Props {
  message?: string;
  progress?: number; // 0~100, 지정하면 프로그레스바 표시
}

export default function SplashScreen({ message = '불러오는 중...', progress }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50">
      <img
        src="/images/splash.png"
        alt="당직ON"
        className="w-40 h-40 object-contain animate-splash-pulse"
      />
      <div className="mt-6 text-sm text-slate-500 animate-pulse">{message}</div>

      {typeof progress === 'number' && (
        <div className="mt-4 w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-200 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes splash-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.85;
          }
        }
        .animate-splash-pulse {
          animation: splash-pulse 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
