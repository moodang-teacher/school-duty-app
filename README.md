# 교사 당직 관리 PWA

학교 교사 당직 순번을 자동 생성하고 모바일에서 확인 가능한 PWA(Progressive Web App)입니다.

## 주요 기능

- **자동 순번 생성**: 평일만 배정, 주말/공휴일 자동 제외
- **개별 요일 제외**: 특정 선생님은 특정 요일에 당직 배정 안 됨 (예: 박지훈 - 매주 목요일)
- **형평성 보정**: 누적 당직 횟수가 적은 선생님부터 우선 배정
- **푸시 알림**: 매일 오후 5:40 당직자에게 알림
- **교환 신청**: 관리자 승인 없이 두 선생님이 합의하면 즉시 적용
- **통계**: 선생님별 당직 횟수 시각화
- **PWA**: 모바일 홈 화면에 설치 가능

## 기술 스택

| 분야 | 기술 | 비용 |
|---|---|---|
| 프레임워크 | Next.js 14 (App Router) | 무료 |
| 스타일 | Tailwind CSS | 무료 |
| 데이터베이스 | Firebase Firestore | 무료 (Spark Plan) |
| 인증 | Firebase Auth (익명) | 무료 |
| 푸시 알림 | Firebase Cloud Messaging | **완전 무제한 무료** |
| 스케줄러 | Cloud Functions | Blaze Plan 필요 (실 사용액 ≈ 0원) |
| 호스팅 | Vercel | 무료 |

## 폴더 구조

```
duty-app/
├── app/                # Next.js 페이지
├── components/         # 화면 컴포넌트
├── lib/                # 비즈니스 로직 (순번 생성, 공휴일, FCM)
├── public/             # PWA 파일 (manifest, sw)
├── functions/          # Cloud Functions (알림 스케줄러)
├── scripts/seed.js     # 초기 선생님 명단 등록
├── firestore.rules     # Firestore 보안 규칙
└── DEPLOY.md           # 배포 단계별 가이드
```

## 빠른 시작

자세한 설정과 배포 절차는 [DEPLOY.md](./DEPLOY.md)를 참조하세요.

### 1. 패키지 설치
```bash
npm install
```

### 2. 환경변수 설정
```bash
cp .env.local.example .env.local
# .env.local 파일을 열어서 Firebase 키 입력
```

### 3. 선생님 명단 등록
```bash
node scripts/seed.js
```

### 4. 로컬 실행
```bash
npm run dev
# http://localhost:3000 접속
```

### 5. 배포
```bash
# Vercel 배포 (웹앱)
vercel

# Firebase Cloud Functions 배포 (알림)
cd functions && npm install && firebase deploy --only functions
```

## 데이터 모델 (Firestore)

```
teachers/{teacherId}
  - name: string
  - excludeWeekdays: number[]  // 0=일, ..., 6=토

assignments/{YYYY-MM-DD}
  - date: string
  - teacherId: string
  - teacherName: string
  - swappedFrom?: string

swapRequests/{requestId}
  - fromTeacherId, fromDate
  - toTeacherId, toDate
  - status: 'pending' | 'accepted' | 'rejected'
  - createdAt: number

tokens/{teacherId}
  - token: string  // FCM 토큰
  - updatedAt: number
```

## 라이선스

자유 사용. 학교 환경에 맞게 수정해서 활용하세요.
