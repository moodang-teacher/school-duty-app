'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { DutyAssignment } from '@/lib/schedule';
import SplashScreen from '@/components/SplashScreen';

interface Row {
  type: 'duty' | 'holiday';
  date?: string;
  weekday?: string;
  teacherName?: string;
  holidayName?: string;
}

export default function PrintPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [noDutyRanges, setNoDutyRanges] = useState<
    { startDate: string; endDate: string; reason: string }[]
  >([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
      else setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true);
      const startStr = `${year}-01-01`;
      const endStr = `${year}-12-31`;

      const [assignSnap, holSnap, rangeSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'assignments'),
            where('date', '>=', startStr),
            where('date', '<=', endStr)
          )
        ),
        getDoc(doc(db, 'holidays', String(year))),
        getDocs(collection(db, 'noDutyRanges')),
      ]);

      const all: DutyAssignment[] = assignSnap.docs.map((d) => d.data() as DutyAssignment);
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
      setAssignments(all.filter((a) => a.date.startsWith(monthPrefix)));

      const holData = (holSnap.exists() ? holSnap.data().data : {}) as Record<string, string>;
      setHolidays(holData);

      setNoDutyRanges(
        rangeSnap.docs.map((d) => d.data() as { startDate: string; endDate: string; reason: string })
      );

      setLoading(false);
    })();
  }, [ready, year, month]);

  function noDutyReasonFor(dateStr: string): string | null {
    const hit = noDutyRanges.find((r) => r.startDate <= dateStr && dateStr <= r.endDate);
    return hit ? hit.reason : null;
  }

  const rows: Row[] = (() => {
    const list: Row[] = [];
    const start = new Date(year, month - 1, 1);
    const end = endOfMonth(start);
    const days = eachDayOfInterval({ start, end });
    const weekdayKr = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

    for (const d of days) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayIdx = getDay(d);
      if (dayIdx === 0 || dayIdx === 6) continue;

      const noDutyReason = noDutyReasonFor(dateStr);
      if (holidays[dateStr]) {
        list.push({
          type: 'holiday',
          date: dateStr,
          holidayName: holidays[dateStr],
        });
      } else if (noDutyReason) {
        list.push({
          type: 'holiday',
          date: dateStr,
          holidayName: noDutyReason,
        });
      } else {
        const a = assignments.find((x) => x.date === dateStr);
        list.push({
          type: 'duty',
          date: dateStr,
          weekday: weekdayKr[dayIdx],
          teacherName: a?.teacherName || '',
        });
      }
    }
    return list;
  })();

  const half = Math.ceil(rows.length / 2);
  const leftRows = rows.slice(0, half);
  const rightRows = rows.slice(half);
  const maxRows = Math.max(leftRows.length, rightRows.length);

  const firstRow = rows.find((r) => r.type === 'duty' || r.type === 'holiday');
  const lastRow = [...rows].reverse().find((r) => r.type === 'duty' || r.type === 'holiday');
  const periodLabel =
    firstRow?.date && lastRow?.date ? `${firstRow.date} ~ ${lastRow.date}` : '';

  function handlePrint() {
    window.print();
  }

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    } else if (m < 1) {
      m = 12;
      y--;
    }
    setYear(y);
    setMonth(m);
  }

  if (!ready || loading) {
    return <SplashScreen />;
  }

  return (
    <>
      {/* 인쇄용 스타일 */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .print-page {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
          }
        }
        .print-page {
          font-family: 'Malgun Gothic', '맑은 고딕', -apple-system, sans-serif;
        }
        .print-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11pt;
        }
        .print-table th,
        .print-table td {
          border: 1px solid #000;
          padding: 3px 4px;
          text-align: center;
          vertical-align: middle;
          height: 36px;
        }
        .print-table th {
          background: #f5f5f5;
          font-weight: 600;
        }
        .holiday-cell {
          color: #c00;
          font-weight: 600;
        }
        .info-section {
          font-size: 9pt;
          line-height: 1.5;
        }
        .info-section h3 {
          font-size: 10pt;
          font-weight: 700;
          margin: 6px 0 2px;
        }
        .info-section ul {
          margin: 0;
          padding-left: 12px;
          list-style: none;
        }
        .info-section li {
          margin: 0;
        }
        .contact-table {
          margin: 0 auto;
          border-collapse: collapse;
          font-size: 9pt;
        }
        .contact-table th,
        .contact-table td {
          border: 1px solid #000;
          padding: 3px 10px;
          text-align: center;
        }
        .contact-table th {
          background: #f5f5f5;
        }
      `}</style>

      {/* 화면 컨트롤 (인쇄 시 숨김) */}
      <div className="no-print bg-slate-100 border-b border-slate-300 p-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeMonth(-1)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded text-sm"
            >
              ‹ 이전 달
            </button>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-2 py-1.5 border border-slate-300 rounded text-sm"
            >
              {[2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-2 py-1.5 border border-slate-300 rounded text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
            <button
              onClick={() => changeMonth(1)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded text-sm"
            >
              다음 달 ›
            </button>
          </div>
          <button
            onClick={handlePrint}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium"
          >
            🖨️ 인쇄하기
          </button>
        </div>
        <div className="max-w-4xl mx-auto mt-2 text-xs text-slate-500">
          💡 인쇄 시 머리글/바닥글이 안 보이게 하려면 인쇄 대화상자에서 "더 보기" → "머리글 및
          바닥글" 체크를 해제하세요.
        </div>
      </div>

      {/* 인쇄 영역 */}
      <div className="print-page max-w-4xl mx-auto bg-white p-8 my-4 shadow-md">
        {/* 제목 */}
        <h1
          style={{
            textAlign: 'center',
            fontSize: '18pt',
            fontWeight: 700,
            textDecoration: 'underline',
            margin: '0 0 6px',
          }}
        >
          일일 당직 근무자 명단
        </h1>

        {/* 기간 */}
        <div style={{ textAlign: 'right', fontSize: '9pt', marginBottom: '6px' }}>
          {periodLabel}
        </div>

        {/* 메인 테이블 */}
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: '13%' }}>당직자 성명</th>
              <th style={{ width: '8%' }}>요일</th>
              <th style={{ width: '10%' }}>일자</th>
              <th style={{ width: '9%' }}>변경</th>
              <th style={{ width: '10%' }}>서명</th>
              <th style={{ width: '13%' }}>당직자 성명</th>
              <th style={{ width: '8%' }}>요일</th>
              <th style={{ width: '10%' }}>일자</th>
              <th style={{ width: '9%' }}>변경</th>
              <th style={{ width: '10%' }}>서명</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, i) => {
              const L = leftRows[i];
              const R = rightRows[i];
              return (
                <tr key={i}>
                  {L?.type === 'holiday' ? (
                    <td colSpan={5} className="holiday-cell">
                      {L.holidayName}
                    </td>
                  ) : L?.type === 'duty' ? (
                    <>
                      <td style={{ fontWeight: 600 }}>{L.teacherName}</td>
                      <td>{L.weekday}</td>
                      <td>
                        {L.date ? format(parseISO(L.date), 'M월 d일', { locale: ko }) : ''}
                      </td>
                      <td></td>
                      <td></td>
                    </>
                  ) : (
                    <>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </>
                  )}
                  {R?.type === 'holiday' ? (
                    <td colSpan={5} className="holiday-cell">
                      {R.holidayName}
                    </td>
                  ) : R?.type === 'duty' ? (
                    <>
                      <td style={{ fontWeight: 600 }}>{R.teacherName}</td>
                      <td>{R.weekday}</td>
                      <td>
                        {R.date ? format(parseISO(R.date), 'M월 d일', { locale: ko }) : ''}
                      </td>
                      <td></td>
                      <td></td>
                    </>
                  ) : (
                    <>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 숙지사항 - 표와의 간격 추가 */}
        <div style={{ marginTop: '28px' }}>
          <h2
            style={{
              textAlign: 'center',
              fontSize: '12pt',
              fontWeight: 700,
              margin: '0 0 8px',
            }}
          >
            당직 근무자 숙지사항
          </h2>

          <div className="info-section">
            <h3>&lt; 당직시간 &gt;</h3>
            <ul>
              <li>- 당직시간은 17:40~18:00시까지이고, 17:40 부터 안전점검을 시작합니다.</li>
              <li>
                - 보충 및 야간수업, 야근이 있는 경우 담당 교직원에게 인수 인계 후 당직자는 18:00
                이후에 퇴근 합니다.
              </li>
            </ul>

            <h3>&lt; 당직업무 &gt;</h3>
            <ul>
              <li>- 고유 업무는 전화 및 방문자 응대, 시설 및 강의실 관리 등입니다.</li>
              <li>- 전화 및 내방 상담 시 관련 내용을 당직일지에 작성하여야 합니다.</li>
              <li>
                - 안전점검 중 상태가 미흡하거나 불량인 경우 관련 사항을 자세히 당직일지에
                작성합니다.
              </li>
              <li>
                - 강의실이 임의개방 되어 있거나, 방치가 되어 있는 경우 정리 한 후 당직일지에
                작성합니다.
              </li>
            </ul>

            <h3>&lt; 당직준수 &gt;</h3>
            <ul>
              <li>- 당직자는 안내데스크 또는 교무행정실에서 근무하여야 합니다.</li>
              <li>- 당직 일자를 변경하고자 하실 때에는 사전에 허락을 득하여야 합니다.</li>
              <li>- 각 강의실 키는 점검 후 항상 정 위치에 있도록 조치해야 합니다.</li>
              <li>- 당직일지는 항상 정해진 위치(출석부 보관함)에 보관하도록 합니다.</li>
              <li>
                - 당직 근무자는 교내·외를 불문하고 학교와 관련되는 이상이 있을 때에는 필요한
                응급조치를 강구하고,
              </li>
              <li>&nbsp;&nbsp;동시에 신속히 상급자(과장, 부학장, 이사장)에게 보고하여야 합니다.</li>
            </ul>
          </div>

          {/* 비상연락망 - 숙지사항과의 간격 추가 */}
          <div style={{ marginTop: '24px' }}>
            <table className="contact-table">
              <thead>
                <tr>
                  <th colSpan={6}>비상연락망</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>본부장</th>
                  <td>010-4756-0072</td>
                  <th>부학장</th>
                  <td>010-5379-7430</td>
                  <th>이사장</th>
                  <td>010-6351-1234</td>
                </tr>
                <tr>
                  <th colSpan={4}></th>
                  <th>관리실</th>
                  <td>032-862-3013</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 학교 로고 */}
          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <img
              src="/images/iti_logo.png"
              alt="인천직업전문학교"
              style={{ height: '40px', display: 'inline-block' }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
