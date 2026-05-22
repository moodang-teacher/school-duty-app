import { getMessagingInstance } from './firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * Android 알림 채널 등록
 * Android 8.0(API 26)+ 필수 — 채널이 없으면 소리/진동이 기본값(낮음)으로 처리됨
 * 채널은 한 번 생성 후에는 사용자만 변경 가능 (코드로 수정 불가)
 * → 채널 ID와 중요도를 처음부터 올바르게 설정해야 함
 */
async function registerAndroidNotificationChannel() {
  if (typeof window === 'undefined') return;
  // Android Chrome / PWA 환경에서만 동작
  if (!('Notification' in window)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    // ServiceWorkerRegistration에 showNotification으로
    // 채널 등록을 트리거하는 방식
    // (실제 채널 등록은 FCM 서비스 워커 + 첫 알림 수신 시 자동 생성)
    // Android에서 중요한 건 Cloud Function의 channelId 설정이 핵심
    console.log('[Notification] 서비스 워커 준비 완료:', registration.scope);
  } catch (e) {
    console.warn('[Notification] 채널 등록 확인 실패:', e);
  }
}

/**
 * 알림 권한 요청 및 FCM 토큰 발급
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
      // Firestore에 토큰 + 기기 정보 저장
      const isAndroid = /android/i.test(navigator.userAgent);
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

      await setDoc(
        doc(db, 'tokens', teacherId),
        {
          token,
          updatedAt: Date.now(),
          platform: isAndroid ? 'android' : isIOS ? 'ios' : 'web',
          userAgent: navigator.userAgent,
        },
        { merge: true }
      );

      // Android 채널 등록 시도
      if (isAndroid) {
        await registerAndroidNotificationChannel();
      }

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
        tag: 'duty_daily',       // 중복 알림 방지
        requireInteraction: false,
      });
    }
  });
}
