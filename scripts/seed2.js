// 초기 선생님 명단을 Firestore에 등록하는 스크립트
// 실행: node scripts/seed.js
//
// 사전 준비:
// 1. Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
// 2. 다운로드한 JSON 파일을 scripts/serviceAccount.json 으로 저장
// 3. 아래 teachers 배열을 학교 명단에 맞게 수정

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const teachers = [
  { id: 't01', name: '임기웅', excludeWeekdays: [] },
  { id: 't02', name: '정은혜', excludeWeekdays: [] },
  { id: 't03', name: '조은경', excludeWeekdays: [] }, 
  { id: 't04', name: '이미희', excludeWeekdays: [] },
  { id: 't05', name: '이윤지', excludeWeekdays: [] },
  { id: 't06', name: '김수영', excludeWeekdays: [] },
  { id: 't07', name: '신선옥', excludeWeekdays: [] },
  { id: 't08', name: '김나래', excludeWeekdays: [4] },// 매주 목요일 제외
  { id: 't09', name: '이상민', excludeWeekdays: [] },
  // 학교 선생님 명단으로 수정하세요
];

async function seed() {
  for (const t of teachers) {
    await db.collection('teachers').doc(t.id).set({
      name: t.name,
      excludeWeekdays: t.excludeWeekdays,
    });
    console.log(`✓ ${t.name} 등록 완료`);
  }
  console.log('\n선생님 명단 등록 완료. 앱에 접속하면 자동으로 당직 일정이 생성됩니다.');
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
