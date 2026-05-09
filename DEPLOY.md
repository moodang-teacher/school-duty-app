# 배포 가이드

이 문서는 처음부터 끝까지 따라가면 동작하는 앱을 만들 수 있도록 작성되었습니다.
**예상 소요 시간: 2~4시간**

---

## 사전 준비물

- Google 계정 (Firebase용)
- GitHub 계정 (Vercel 배포용, 선택)
- Node.js 20 이상 설치
- 신용카드 (Cloud Functions 사용 시 필요, 실제 청구 ≈ 0원)

---

## 1단계. Firebase 프로젝트 생성 (10분)

1. [Firebase 콘솔](https://console.firebase.google.com) 접속 → "프로젝트 추가"
2. 프로젝트 이름: `school-duty-app` (자유)
3. Google Analytics: 끔 (선택)
4. 프로젝트 생성 완료

### Firestore 활성화
1. 좌측 메뉴 → "Firestore Database" → "데이터베이스 만들기"
2. **프로덕션 모드**로 시작
3. 위치: `asia-northeast3 (Seoul)` 선택

### Authentication 활성화
1. 좌측 메뉴 → "Authentication" → "시작하기"
2. "로그인 방법" 탭 → "익명" → 사용 설정 ON

### Cloud Messaging 설정
1. 좌측 메뉴 → 톱니바퀴(설정) → "프로젝트 설정"
2. "클라우드 메시징" 탭 → "웹 푸시 인증서" → "키 쌍 생성"
3. 생성된 키 값을 복사 → `.env.local`의 `NEXT_PUBLIC_FIREBASE_VAPID_KEY`에 붙여넣기

### 웹 앱 등록
1. "프로젝트 설정" → "내 앱" → 웹(`</>`) 아이콘
2. 앱 닉네임 입력 후 등록
3. 표시되는 `firebaseConfig` 객체의 값을 복사

---

## 2단계. 프로젝트 환경 설정 (15분)

### 2-1. 환경변수 입력
```bash
cp .env.local.example .env.local
```

`.env.local` 파일을 열어 1단계에서 복사한 값을 채워넣기:
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=school-duty-app.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=school-duty-app
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=school-duty-app.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BKx...
```

### 2-2. 서비스 워커 키 입력
`public/firebase-messaging-sw.js` 파일을 열고 `firebase.initializeApp({...})` 부분에 같은 값을 직접 입력하세요. (서비스 워커는 환경변수에 접근 못함)

### 2-3. 패키지 설치
```bash
npm install
```

---

## 3단계. 선생님 명단 등록 (5분)

### 3-1. 서비스 계정 키 발급
1. Firebase 콘솔 → 프로젝트 설정 → "서비스 계정" 탭
2. "새 비공개 키 생성" 클릭 → JSON 파일 다운로드
3. 파일을 `scripts/serviceAccount.json` 으로 저장

### 3-2. 명단 수정
`scripts/seed.js` 파일 열어서 `teachers` 배열을 학교 명단으로 수정:
```js
const teachers = [
  { id: 't01', name: '실제선생님이름1', excludeWeekdays: [] },
  { id: 't02', name: '실제선생님이름2', excludeWeekdays: [4] }, // 목요일 제외
  // ...
];
```

### 3-3. 실행
```bash
node scripts/seed.js
```

Firebase 콘솔 → Firestore에서 `teachers` 컬렉션 확인.

---

## 4단계. 로컬에서 테스트 (10분)

```bash
npm run dev
```

`http://localhost:3000` 접속.
- 본인 선생님 선택
- 첫 접속 시 자동으로 올해(2026년) 당직 일정이 생성됨
- 4개 탭(홈/달력/통계/설정) 동작 확인
- 설정 탭에서 "알림 켜기" 누르고 권한 허용

---

## 5단계. Firestore 보안 규칙 적용 (3분)

1. Firebase 콘솔 → Firestore Database → "규칙" 탭
2. `firestore.rules` 파일 내용 복사해서 붙여넣기
3. "게시"

---

## 6단계. Vercel 배포 (10분)

### 방법 A: CLI
```bash
npm install -g vercel
vercel login
vercel
```

배포 중 환경변수 입력 안내가 나오면 `.env.local`에 있는 값 그대로 입력.

### 방법 B: GitHub 연동
1. 코드를 GitHub 리포지토리에 푸시
2. [Vercel](https://vercel.com) → "New Project" → 리포 선택
3. "Environment Variables" 섹션에 `.env.local` 내용 복사 입력
4. Deploy 클릭

배포 완료되면 `https://school-duty-app.vercel.app` 같은 주소가 발급됩니다.

---

## 7단계. Cloud Functions 배포 - 알림 스케줄러 (15분)

### 7-1. Blaze Plan으로 업그레이드
Cloud Functions는 무료(Spark) 플랜에서 사용 불가.
Firebase 콘솔 → 좌측 하단 "업그레이드" → Blaze 선택 → 신용카드 등록.

학교 사용량(하루 1번 알림)은 무료 한도 내라 **실제 청구액 0원**.

### 7-2. Firebase CLI 설치 및 초기화
```bash
npm install -g firebase-tools
firebase login
firebase use --add  # 위에서 만든 프로젝트 선택
```

### 7-3. Functions 의존성 설치 및 배포
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

배포 후 Firebase 콘솔 → "Functions" 메뉴에서 두 함수 확인:
- `dailyDutyNotification` (매일 17:40 KST 실행)
- `notifySwapRequest` (교환 요청 시 실행)

---

## 8단계. 모바일에서 PWA 설치 (3분)

### iOS (Safari)
1. 배포된 사이트 접속
2. 공유 버튼 → "홈 화면에 추가"

### Android (Chrome)
1. 배포된 사이트 접속
2. 메뉴 → "홈 화면에 추가" 또는 "앱 설치"

설치 후 홈 화면 아이콘에서 실행하면 일반 앱처럼 사용 가능.

---

## 운영 가이드

### 매년 1월 해야 할 일
1. `lib/holidays.ts`의 `HOLIDAYS_2026` → 새해 데이터로 갱신
   (또는 공공데이터포털 API 키 발급해서 자동화)
2. Firebase 콘솔 → Firestore → `assignments` 컬렉션 전체 삭제
3. 첫 사용자 접속 시 새해 일정이 자동 생성됨

### 선생님 명단 변경
1. `scripts/seed.js`의 `teachers` 배열 수정
2. `node scripts/seed.js` 다시 실행
3. (또는 Firebase 콘솔에서 직접 편집)

### 자주 발생하는 문제

**Q. 알림이 안 와요**
- iOS는 Safari에서 PWA 홈 화면 추가 후에만 푸시 가능
- 배터리 절약 모드/방해금지 모드 확인
- Cloud Function 로그 확인: `firebase functions:log`

**Q. "Firebase 권한 오류"**
- Firestore 규칙이 제대로 게시됐는지 확인
- 익명 인증이 활성화됐는지 확인

**Q. 일정이 이상해요**
- Firestore에서 `assignments` 컬렉션 전체 삭제 후 새로 생성
- `lib/schedule.ts`의 `generateSchedule` 로직 확인

---

## 보안 권고

- 학교 외부에 공개 URL이 노출되는 것이 부담된다면 Vercel Password Protection (Pro 플랜)이나 Cloudflare Access (무료) 적용 가능
- Firebase Auth를 익명 → Google/이메일로 변경하면 더 안전
- 정기적으로 `tokens` 컬렉션의 오래된 토큰 정리 권장

---

문제가 생기면 각 단계의 콘솔 로그를 확인하세요. 대부분의 문제는 환경변수 오타입니다.
