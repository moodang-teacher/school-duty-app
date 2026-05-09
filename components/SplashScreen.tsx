'use client';

interface Props {
  message?: string;
}

export default function SplashScreen({ message = '불러오는 중...' }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <img
        src="/images/splash.png"
        alt="당직ON"
        className="w-40 h-40 object-contain animate-splash-pulse"
      />
      <div className="mt-6 text-sm text-slate-500 animate-pulse">{message}</div>

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
