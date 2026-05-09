// Firebase Cloud Functions
// 배포: firebase deploy --only functions

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// 공공데이터포털 API 키 (Firebase Secret)
const holidayApiKey = defineSecret('HOLIDAY_API_KEY');

/**
 * 매일 한국시간 17:40에 실행 → 오늘 당직자에게 알림 발송
 */
exports.dailyDutyNotification = onSchedule(
  {
    schedule: '40 17 * * *',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
  },
  async () => {
    const today = new Date();
    const kst = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const dateStr = kst.toISOString().slice(0, 10);

    const assignDoc = await db.collection('assignments').doc(dateStr).get();
    if (!assignDoc.exists) {
      console.log(`${dateStr} 당직자 없음 (주말/공휴일)`);
      return;
    }
    const { teacherId, teacherName } = assignDoc.data();

    const tokenDoc = await db.collection('tokens').doc(teacherId).get();
    if (!tokenDoc.exists) {
      console.log(`${teacherName} 선생님의 토큰 없음`);
      return;
    }
    const { token } = tokenDoc.data();

    try {
      await messaging.send({
        token,
        notification: {
          title: '🔔 당직 알림',
          body: `오늘 당직 시간입니다 (오후 5:40)`,
        },
        webpush: {
          fcmOptions: { link: '/' },
        },
      });
      console.log(`${teacherName} 선생님에게 알림 발송 완료`);
    } catch (e) {
      console.error('알림 발송 실패:', e);
      if (e.code === 'messaging/registration-token-not-registered') {
        await db.collection('tokens').doc(teacherId).delete();
      }
    }
  }
);

/**
 * 변경 요청이 생성되면 상대방에게 알림
 */
exports.notifySwapRequest = onDocumentCreated(
  {
    document: 'swapRequests/{requestId}',
    region: 'asia-northeast3',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const tokenDoc = await db.collection('tokens').doc(data.toTeacherId).get();
    if (!tokenDoc.exists) return;

    const fromTeacher = await db.collection('teachers').doc(data.fromTeacherId).get();
    const fromName = fromTeacher.data()?.name || '';

    await messaging.send({
      token: tokenDoc.data().token,
      notification: {
        title: '변경 요청 도착',
        body: `${fromName} 선생님이 당직 변경을 요청했습니다`,
      },
      webpush: {
        fcmOptions: { link: '/?tab=settings' },
      },
    });
  }
);

/**
 * 공휴일 자동 갱신 - 매년 12월 1일에 다음해 공휴일을 가져옴
 */
async function fetchHolidaysFromAPI(year, apiKey) {
  const result = {};
  try {
    for (let month = 1; month <= 12; month++) {
      const mm = String(month).padStart(2, '0');
      const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?solYear=${year}&solMonth=${mm}&ServiceKey=${apiKey}&_type=json&numOfRows=30`;
      const res = await fetch(url);
      const data = await res.json();
      const items = data?.response?.body?.items?.item;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      list.forEach((item) => {
        if (item.isHoliday === 'Y') {
          const dStr = String(item.locdate);
          const key = `${dStr.slice(0, 4)}-${dStr.slice(4, 6)}-${dStr.slice(6, 8)}`;
          result[key] = item.dateName;
        }
      });
    }
  } catch (e) {
    console.error('공휴일 API 호출 실패:', e);
    throw e;
  }
  return result;
}

exports.fetchNextYearHolidays = onSchedule(
  {
    schedule: '0 3 1 12 *',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
    secrets: [holidayApiKey],
  },
  async () => {
    const nextYear = new Date().getFullYear() + 1;
    console.log(`${nextYear}년 공휴일 데이터 가져오기 시작...`);

    const holidays = await fetchHolidaysFromAPI(nextYear, holidayApiKey.value());

    if (Object.keys(holidays).length === 0) {
      console.error('공휴일 데이터를 가져오지 못했습니다');
      return;
    }

    await db.collection('holidays').doc(String(nextYear)).set({
      year: nextYear,
      data: holidays,
      updatedAt: Date.now(),
    });

    console.log(`${nextYear}년 공휴일 ${Object.keys(holidays).length}개 저장 완료`);
  }
);

exports.generateNextYearSchedule = onSchedule(
  {
    schedule: '0 3 15 12 *',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
  },
  async () => {
    const nextYear = new Date().getFullYear() + 1;
    console.log(`${nextYear}년 당직 일정 생성 시작...`);

    const teachersSnap = await db.collection('teachers').get();
    const teachers = teachersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (teachers.length === 0) {
      console.error('선생님 명단이 없습니다');
      return;
    }

    const holidayDoc = await db.collection('holidays').doc(String(nextYear)).get();
    const holidays = holidayDoc.exists ? holidayDoc.data().data || {} : {};

    const counts = {};
    teachers.forEach((t) => (counts[t.id] = 0));
    let rotationIdx = 0;
    const batch = db.batch();
    let batchCount = 0;

    const start = new Date(`${nextYear}-01-01`);
    const end = new Date(`${nextYear}-12-31`);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const day = d.getDay();
      if (day === 0 || day === 6) continue;
      if (holidays[dateStr]) continue;

      const candidates = teachers.filter(
        (t) => !(t.excludeWeekdays || []).includes(day)
      );
      const pool = candidates.length > 0 ? candidates : teachers;

      const minCount = Math.min(...pool.map((c) => counts[c.id]));
      const tied = pool.filter((c) => counts[c.id] === minCount);

      let picked = tied[0];
      for (let i = 0; i < teachers.length; i++) {
        const t = teachers[(rotationIdx + i) % teachers.length];
        if (tied.find((c) => c.id === t.id)) {
          picked = t;
          break;
        }
      }

      const ref = db.collection('assignments').doc(dateStr);
      batch.set(ref, {
        date: dateStr,
        teacherId: picked.id,
        teacherName: picked.name,
      });
      counts[picked.id]++;
      rotationIdx = teachers.findIndex((t) => t.id === picked.id) + 1;
      batchCount++;

      if (batchCount >= 400) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();
    console.log(`${nextYear}년 당직 일정 생성 완료`);
  }
);

const { onCall } = require('firebase-functions/v2/https');

exports.manualFetchHolidays = onCall(
  {
    region: 'asia-northeast3',
    secrets: [holidayApiKey],
  },
  async (request) => {
    const year = request.data?.year || new Date().getFullYear();
    const holidays = await fetchHolidaysFromAPI(year, holidayApiKey.value());

    await db.collection('holidays').doc(String(year)).set({
      year,
      data: holidays,
      updatedAt: Date.now(),
    });

    return { success: true, count: Object.keys(holidays).length, year };
  }
);
