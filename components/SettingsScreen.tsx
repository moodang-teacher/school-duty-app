'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Teacher, DutyAssignment, applySwap, SwapRequest } from '@/lib/schedule';
import { requestNotificationPermission } from '@/lib/notifications';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

interface Props {
  teachers: Teacher[];
  currentTeacherId: string;
  assignments: DutyAssignment[];
  setAssignments: (a: DutyAssignment[]) => void;
}

export default function SettingsScreen({
  teachers,
  currentTeacherId,
  assignments,
  setAssignments,
}: Props) {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);

  // 내 당직일 목록 (미래만)
  const today = format(new Date(), 'yyyy-MM-dd');
  const myDuties = assignments
    .filter((a) => a.teacherId === currentTeacherId && a.date >= today)
    .slice(0, 10);

  useEffect(() => {
    setNotifEnabled(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  }, []);

  // 나에게 들어온 교환 요청 + 내가 보낸 교환 요청 실시간 구독
  useEffect(() => {
    if (!currentTeacherId) return;
    const unsub = onSnapshot(collection(db, 'swapRequests'), (snap) => {
      const list: SwapRequest[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SwapRequest, 'id'>) }))
        .filter(
          (r) => r.fromTeacherId === currentTeacherId || r.toTeacherId === currentTeacherId
        )
        .sort((a, b) => b.createdAt - a.createdAt);
      setSwapRequests(list);
    });
    return () => unsub();
  }, [currentTeacherId]);

  async function handleEnableNotif() {
    const token = await requestNotificationPermission(currentTeacherId);
    if (token) {
      setNotifEnabled(true);
      alert('알림이 활성화되었습니다!');
    }
  }

  async function handleSwapRequest(myDate: string, partnerId: string, partnerDate: string) {
    const id = `${currentTeacherId}_${myDate}_${Date.now()}`;
    const req: SwapRequest = {
      id,
      fromTeacherId: currentTeacherId,
      fromDate: myDate,
      toTeacherId: partnerId,
      toDate: partnerDate,
      status: 'pending',
      createdAt: Date.now(),
    };
    await setDoc(doc(db, 'swapRequests', id), req);
    setShowSwap(false);
    alert('교환 요청을 보냈습니다. 상대방이 수락하면 즉시 적용됩니다.');
  }

  async function handleAcceptSwap(req: SwapRequest) {
    // 1. 일정 갱신
    const updated = applySwap(assignments, req.fromDate, req.toDate);
    setAssignments(updated);
    // 2. Firestore 업데이트
    const a1 = updated.find((a) => a.date === req.fromDate)!;
    const a2 = updated.find((a) => a.date === req.toDate)!;
    await setDoc(doc(db, 'assignments', req.fromDate), a1);
    await setDoc(doc(db, 'assignments', req.toDate), a2);
    // 3. 요청 상태 변경
    await updateDoc(doc(db, 'swapRequests', req.id), { status: 'accepted' });
  }

  async function handleRejectSwap(req: SwapRequest) {
    await updateDoc(doc(db, 'swapRequests', req.id), { status: 'rejected' });
  }

  return (
    <div className="space-y-4">
      {/* 알림 설정 */}
      <section>
        <div className="text-sm text-slate-500 mb-2">알림 설정</div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">당직일 알림</div>
              <div className="text-xs text-slate-500 mt-0.5">매일 오후 5:40</div>
            </div>
            {notifEnabled ? (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">
                활성화됨
              </span>
            ) : (
              <button
                onClick={handleEnableNotif}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md"
              >
                알림 켜기
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 교환 신청 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-500">교환 신청</div>
          <button
            onClick={() => setShowSwap(true)}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md"
            disabled={myDuties.length === 0}
          >
            새 교환 요청
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {swapRequests.length === 0 ? (
            <div className="p-4 text-sm text-slate-400 text-center">교환 내역 없음</div>
          ) : (
            swapRequests.map((r) => {
              const isIncoming = r.toTeacherId === currentTeacherId && r.status === 'pending';
              const fromName = teachers.find((t) => t.id === r.fromTeacherId)?.name;
              const toName = teachers.find((t) => t.id === r.toTeacherId)?.name;
              return (
                <div key={r.id} className="p-3">
                  <div className="text-sm">
                    {format(parseISO(r.fromDate), 'M/d', { locale: ko })} ↔{' '}
                    {format(parseISO(r.toDate), 'M/d', { locale: ko })}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {fromName} → {toName}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === 'accepted'
                          ? 'bg-green-50 text-green-700'
                          : r.status === 'rejected'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {r.status === 'pending'
                        ? '대기중'
                        : r.status === 'accepted'
                        ? '수락됨'
                        : '거절됨'}
                    </span>
                    {isIncoming && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRejectSwap(r)}
                          className="text-xs px-2 py-1 border border-slate-300 rounded"
                        >
                          거절
                        </button>
                        <button
                          onClick={() => handleAcceptSwap(r)}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded"
                        >
                          수락
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 사용자 변경 */}
      <button
        onClick={() => {
          if (confirm('본인 선택을 다시 하시겠어요?')) {
            localStorage.removeItem('teacherId');
            window.location.reload();
          }
        }}
        className="w-full p-3 text-sm text-slate-500 border border-slate-200 rounded-lg"
      >
        본인 다시 선택
      </button>

      {/* 교환 요청 모달 */}
      {showSwap && (
        <SwapModal
          myDuties={myDuties}
          teachers={teachers}
          assignments={assignments}
          currentTeacherId={currentTeacherId}
          onClose={() => setShowSwap(false)}
          onSubmit={handleSwapRequest}
        />
      )}
    </div>
  );
}

interface SwapModalProps {
  myDuties: DutyAssignment[];
  teachers: Teacher[];
  assignments: DutyAssignment[];
  currentTeacherId: string;
  onClose: () => void;
  onSubmit: (myDate: string, partnerId: string, partnerDate: string) => void;
}

function SwapModal({ myDuties, assignments, currentTeacherId, onClose, onSubmit }: SwapModalProps) {
  const [myDate, setMyDate] = useState('');
  const [partnerDate, setPartnerDate] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const otherDuties = assignments
    .filter((a) => a.teacherId !== currentTeacherId && a.date >= today)
    .slice(0, 30);

  const partnerAssign = otherDuties.find((a) => a.date === partnerDate);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-3">교환 요청</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">내 당직일</label>
            <select
              value={myDate}
              onChange={(e) => setMyDate(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-md text-sm"
            >
              <option value="">선택하세요</option>
              {myDuties.map((d) => (
                <option key={d.date} value={d.date}>
                  {format(parseISO(d.date), 'M월 d일 (E)', { locale: ko })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">바꿀 상대 당직일</label>
            <select
              value={partnerDate}
              onChange={(e) => setPartnerDate(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-md text-sm"
            >
              <option value="">선택하세요</option>
              {otherDuties.map((d) => (
                <option key={d.date} value={d.date}>
                  {format(parseISO(d.date), 'M월 d일 (E)', { locale: ko })} - {d.teacherName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-slate-300 rounded-md text-sm"
          >
            취소
          </button>
          <button
            disabled={!myDate || !partnerDate || !partnerAssign}
            onClick={() => onSubmit(myDate, partnerAssign!.teacherId, partnerDate)}
            className="flex-1 py-2 bg-blue-600 text-white rounded-md text-sm disabled:bg-slate-300"
          >
            요청 보내기
          </button>
        </div>
      </div>
    </div>
  );
}
