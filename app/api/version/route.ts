import { NextResponse } from 'next/server';

// 배포할 때마다 Vercel이 자동으로 새로운 BUILD_ID를 생성합니다.
// 이 값을 비교해서 새 버전이 있는지 확인합니다.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  // Vercel 환경변수에서 가져오거나, 빌드 시각으로 폴백
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.NEXT_PUBLIC_BUILD_ID ||
    String(Date.now());

  return NextResponse.json(
    { version, timestamp: Date.now() },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
