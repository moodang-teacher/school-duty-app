import { getMessagingInstance } from './firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * 알림 권한 요청 및 토큰 발급
 * 발급된 토큰을 Firestore에 저장 → Cloud Function이 알림 발송 시 사용
 */
export async function requestNotificationPermission(teacherId: string): Promise<string | null> {
  try {
    if (!('Notification' in window)) {
      alert('이 브라우저는 알림을 지원하지 않습니다.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('알림 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.');
      return null;
    }

    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      // Firestore에 토큰 저장
      await setDoc(
        doc(db, 'tokens', teacherId),
        {
          token,
          updatedAt: Date.now(),
          userAgent: navigator.userAgent,
        },
        { merge: true }
      );
      return token;
    }
    return null;
  } catch (e) {
    console.error('알림 권한 요청 실패:', e);
    return null;
  }
}

/**
 * 포그라운드(앱이 열린 상태)에서 알림 수신
 */
export async function setupForegroundListener() {
  const messaging = await getMessagingInstance();
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log('포그라운드 알림 수신:', payload);
    if (Notification.permission === 'granted' && payload.notification) {
      new Notification(payload.notification.title || '당직 알림', {
        body: payload.notification.body || '',
        icon: '/icon-192.png',
      });
    }
  });
}
