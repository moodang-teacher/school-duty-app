// 초기 선생님 명단을 Firestore에 등록/동기화하는 스크립트
// 실행: node scripts/seed.js
//
// 동작 방식:
// 1. 아래 teachers 배열을 학교 명단의 "정답"으로 간주
// 2. 배열에 있는 선생님 → 추가 또는 수정
// 3. 배열에 없는데 Firestore에 있는 선생님 → 삭제 (퇴사/전출)
//
// excludeWeekdays: 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토
// 예) [4] = 매주 목요일 제외

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ▼▼▼ 학교 선생님 명단을 여기서 관리하세요 ▼▼▼
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
];
// ▲▲▲ 학교 선생님 명단을 여기서 관리하세요 ▲▲▲

async function seed() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('선생님 명단 동기화 시작');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. 기존 Firestore 명단 조회
  const existingSnap = await db.collection('teachers').get();
  const existingMap = {};
  existingSnap.docs.forEach((d) => {
    existingMap[d.id] = d.data();
  });

  const newIds = new Set(teachers.map((t) => t.id));
  const existingIds = new Set(Object.keys(existingMap));

  // 2. 배열에 없지만 Firestore에 있는 선생님 → 삭제
  const toDelete = [...existingIds].filter((id) => !newIds.has(id));
  for (const id of toDelete) {
    const oldName = existingMap[id]?.name || id;
    await db.collection('teachers').doc(id).delete();
    console.log(`🗑️  삭제: ${oldName} (${id})`);
  }

  // 3. 추가 또는 수정
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const t of teachers) {
    const existing = existingMap[t.id];
    if (!existing) {
      await db.collection('teachers').doc(t.id).set({
        name: t.name,
        excludeWeekdays: t.excludeWeekdays,
      });
      console.log(`✨ 추가: ${t.name}`);
      added++;
    } else {
      const nameChanged = existing.name !== t.name;
      const weekdaysChanged =
        JSON.stringify(existing.excludeWeekdays || []) !==
        JSON.stringify(t.excludeWeekdays);
      if (nameChanged || weekdaysChanged) {
        await db.collection('teachers').doc(t.id).set({
          name: t.name,
          excludeWeekdays: t.excludeWeekdays,
        });
        const changes = [];
        if (nameChanged) changes.push(`이름: ${existing.name} → ${t.name}`);
        if (weekdaysChanged)
          changes.push(
            `요일제외: [${existing.excludeWeekdays || []}] → [${t.excludeWeekdays}]`
          );
        console.log(`📝 수정: ${t.name} (${changes.join(', ')})`);
        updated++;
      } else {
        unchanged++;
      }
    }
  }

  // 4. 결과 요약
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('동기화 완료');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✨ 추가: ${added}명`);
  console.log(`  📝 수정: ${updated}명`);
  console.log(`  🗑️  삭제: ${toDelete.length}명`);
  console.log(`  ➖ 유지: ${unchanged}명`);
  console.log(`  총 선생님 수: ${teachers.length}명\n`);

  if (added > 0 || updated > 0 || toDelete.length > 0) {
    console.log('💡 명단이 변경되었습니다.');
    console.log('   /admin 페이지에서 "오늘 이후 일정 재생성"을 눌러주세요.\n');
  }

  process.exit(0);
}

seed().catch((e) => {
  console.error('❌ 오류:', e);
  process.exit(1);
});
