// Firebase Cloud Functions
// 배포: firebase deploy --only functions

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { effectiveStart, generateFairSchedule } = require('./schedule');

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

const holidayApiKey = defineSecret('HOLIDAY_API_KEY');
const adminPin = defineSecret('ADMIN_PIN');

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
        // ─── Android 설정 ───────────────────────────────
        android: {
          priority: 'high',            // 즉각 전달 (배터리 절약 모드 우회)
          notification: {
            channelId: 'duty_alert',   // 전용 채널 (기기 설정에서 관리 가능)
            priority: 'high',          // 알림 우선순위 높음 → 소리 + 진동
            defaultSound: true,        // 기기 기본 알림음
            defaultVibrateTimings: true, // 기기 기본 진동
            tag: 'duty_daily',         // 같은 tag면 이전 알림을 덮어씀 (중복 방지)
          },
        },
        // ─── 웹(Android Chrome PWA) 설정 ──────────────
        webpush: {
          headers: { Urgency: 'high' },
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
      android: {
        priority: 'high',
        notification: {
          channelId: 'duty_alert',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
          tag: 'duty_swap',
        },
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: '/?tab=settings' },
      },
    });
  }
);

/**
 * 공휴일 자동 갱신 - 매년 12월 1일
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
    const holidays = await fetchHolidaysFromAPI(nextYear, holidayApiKey.value());
    if (Object.keys(holidays).length === 0) return;
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
    const count = await regenerateScheduleFrom(nextYear + '-01-01');
    console.log(nextYear + '년 당직 일정 ' + count + '개 생성 완료');
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

function addDaysToDateString(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getKoreanDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function regenerateScheduleFrom(startDate) {
  startDate = effectiveStart(startDate, getKoreanDateString());
  const year = Number(startDate.slice(0, 4));
  const endDate = `${year}-12-31`;

  return db.runTransaction(async (transaction) => {
    const [teachersSnap, holidayDoc, noDutySnap, excludeSnap, assignmentSnap] =
      await Promise.all([
        transaction.get(db.collection('teachers')),
        transaction.get(db.collection('holidays').doc(String(year))),
        transaction.get(db.collection('noDutyRanges')),
        transaction.get(db.collection('teacherExcludeRanges')),
        transaction.get(db.collection('assignments')
          .where('date', '>=', `${year}-01-01`)
          .where('date', '<=', endDate)),
      ]);

    const teachers = teachersSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((teacher) => teacher.active !== false);
    if (teachers.length === 0) {
      throw new HttpsError('failed-precondition', '활성 선생님이 한 명 이상 필요합니다.');
    }

    const holidays = holidayDoc.exists ? holidayDoc.data().data || {} : {};
    const noDutyRanges = noDutySnap.docs.map((doc) => doc.data());
    const excludeRanges = excludeSnap.docs.map((doc) => doc.data());
    const allAssignments = assignmentSnap.docs.map((doc) => doc.data());
    if (!holidayDoc.exists || !Object.keys(holidayDoc.data().data || {}).length) {
      throw new HttpsError('failed-precondition', '해당 연도의 공휴일 데이터를 먼저 등록하세요.');
    }
    const futureDocs = assignmentSnap.docs.filter((doc) => doc.data().date >= startDate);
    const generated = generateFairSchedule(teachers, startDate, endDate, allAssignments, {
      isDutyDay: (date) => {
        const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
        return weekday !== 0 && weekday !== 6 && !holidays[date] &&
          !noDutyRanges.some(range => range.startDate <= date && date <= range.endDate);
      },
      isTeacherExcluded: (id, date) => excludeRanges.some(range =>
        range.teacherId === id && range.startDate <= date && date <= range.endDate),
    });
    const operations = [
      ...futureDocs.filter(doc => !generated.some(a => a.date === doc.data().date)).map((doc) => (batch) => batch.delete(doc.ref)),
      ...generated.map((assignment) => (batch) =>
        batch.set(db.collection('assignments').doc(assignment.date), assignment)
      ),
    ];
    operations.forEach(operation => operation(transaction));
    return generated.length;
  });
}

const { HttpsError } = require('firebase-functions/v2/https');

exports.manageTeacher = onCall(
  {
    region: 'asia-northeast3',
    secrets: [adminPin],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    if (!adminPin.value() || request.data?.adminPin !== adminPin.value()) {
      throw new HttpsError('permission-denied', '관리자 PIN이 올바르지 않습니다.');
    }

    const action = request.data?.action;
    const teacherId = String(request.data?.teacherId || '').trim();
    let savedTeacherId = teacherId;

    if (action === 'upsert') {
      const name = String(request.data?.name || '').trim();
      const excludeWeekdays = request.data?.excludeWeekdays;
      const dutyStartDate = request.data?.dutyStartDate;
      if (dutyStartDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dutyStartDate) || Number.isNaN(Date.parse(dutyStartDate)) || new Date(dutyStartDate).toISOString().slice(0, 10) !== dutyStartDate)) {
        throw new HttpsError('invalid-argument', '최초 당직 참여일을 확인하세요.');
      }
      if (!name || name.length > 30) {
        throw new HttpsError('invalid-argument', '이름은 1~30자로 입력하세요.');
      }
      if (
        !Array.isArray(excludeWeekdays) ||
        excludeWeekdays.some(
          (day) => !Number.isInteger(day) || day < 0 || day > 6
        )
      ) {
        throw new HttpsError('invalid-argument', '제외 요일 형식이 올바르지 않습니다.');
      }

      const teacherRef = teacherId
        ? db.collection('teachers').doc(teacherId)
        : db.collection('teachers').doc();
      const existing = await teacherRef.get();
      await teacherRef.set(
        {
          name,
          ...(dutyStartDate ? { dutyStartDate } : !existing.exists ? { dutyStartDate: getKoreanDateString() } : {}),
          excludeWeekdays: [...new Set(excludeWeekdays)].sort(),
          active: existing.exists ? existing.data().active !== false : true,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      savedTeacherId = teacherRef.id;
    } else if (action === 'setActive') {
      if (!teacherId || typeof request.data?.active !== 'boolean') {
        throw new HttpsError('invalid-argument', '선생님과 상태를 확인하세요.');
      }
      const teacherRef = db.collection('teachers').doc(teacherId);
      const teacher = await teacherRef.get();
      if (!teacher.exists) throw new HttpsError('not-found', '선생님을 찾을 수 없습니다.');
      if (request.data.active === false) {
        const activeTeachers = await db.collection('teachers').get();
        const activeCount = activeTeachers.docs.filter(
          (doc) => doc.id !== teacherId && doc.data().active !== false
        ).length;
        if (activeCount === 0) {
          throw new HttpsError('failed-precondition', '활성 선생님이 한 명 이상 필요합니다.');
        }
      }
      await teacherRef.set({ active: request.data.active, updatedAt: Date.now() }, { merge: true });
    } else {
      throw new HttpsError('invalid-argument', '지원하지 않는 작업입니다.');
    }

    let generatedCount = 0;
    if (request.data?.regenerate === true) {
      const tomorrow = addDaysToDateString(getKoreanDateString(), 1);
      generatedCount = await regenerateScheduleFrom(tomorrow);
    }

    return {
      success: true,
      teacherId: savedTeacherId,
      regenerated: request.data?.regenerate === true,
      generatedCount,
    };
  }
);
