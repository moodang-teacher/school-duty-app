// 백그라운드 알림 수신 (앱이 닫혀있을 때)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Firebase 설정 - 빌드 시 환경변수로 주입하거나 직접 입력
firebase.initializeApp({
  apiKey: "AIzaSyASWS6-jidzYXsOyUN-t6po4eXUFi9PPeA",
  authDomain: "school-duty-app.firebaseapp.com",
  projectId: "school-duty-app",
  storageBucket: "school-duty-app.firebasestorage.app",
  messagingSenderId: "1020596113095",
  appId: "1:1020596113095:web:b1cc552179885b084cf8e2",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title = '당직 알림', body = '' } = payload.notification || {};
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'duty-notification',
    requireInteraction: false,
  });
});
