import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import type { DutyAssignment } from './schedule';
import { POLICY_START } from '../functions/schedule';

const signature = (value: Record<string, unknown> | undefined) => value
  ? JSON.stringify(Object.keys(value).sort().map(key => [key, value[key]])) : '';

/** Atomically apply a reviewed preview, refusing to overwrite a newer swap. */
export async function saveSchedulePreview(
  startDate: string, endDate: string, expected: DutyAssignment[], generated: DutyAssignment[]
) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (startDate < POLICY_START || startDate < today || generated.some(a => a.date < startDate || a.date > endDate)) {
    throw new Error('보존 기간의 일정은 변경할 수 없습니다.');
  }
  const originals = new Map(expected.map(a => [a.date, a]));
  const replacements = new Map(generated.map(a => [a.date, a]));
  const dates = [...new Set([...originals.keys(), ...replacements.keys()])];
  await runTransaction(db, async transaction => {
    const snapshots = await Promise.all(dates.map(date => transaction.get(doc(db, 'assignments', date))));
    snapshots.forEach((snapshot, index) => {
      if (signature(snapshot.exists() ? snapshot.data() : undefined) !==
          signature(originals.get(dates[index]) as unknown as Record<string, unknown> | undefined)) {
        throw new Error('미리보기 이후 일정이 변경되었습니다. 다시 미리보기를 실행하세요.');
      }
    });
    dates.filter(date => date >= startDate && date <= endDate).forEach(date => {
      const replacement = replacements.get(date);
      if (replacement) transaction.set(doc(db, 'assignments', date), replacement);
      else transaction.delete(doc(db, 'assignments', date));
    });
  });
}
