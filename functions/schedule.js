// Shared by the web app and Cloud Functions. Pure: never writes to Firestore.
const POLICY_START = '2026-10-01';
const day = date => new Date(`${date}T00:00:00Z`).getUTCDay();
const nextDate = date => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

function effectiveStart(requested, today) {
  return [requested, POLICY_START, today || requested].sort().at(-1);
}

function generateFairSchedule(teachers, startDate, endDate, existing = [], options = {}) {
  startDate = effectiveStart(startDate);
  if (startDate > endDate) return [];
  const yearStart = `${startDate.slice(0, 4)}-01-01`;
  const anchor = effectiveStart(yearStart);
  const history = existing.filter(a => a.date >= yearStart && a.date < startDate);
  const roster = teachers.filter(t => t.active !== false).slice().sort((a, b) => a.id.localeCompare(b.id));
  if (!roster.length) throw new Error('배정 가능한 선생님이 없습니다.');
  const isDutyDay = options.isDutyDay || (date => ![0, 6].includes(day(date)));
  const excluded = options.isTeacherExcluded || (() => false);
  // Legacy records have no join date. Original ownership also counts as evidence
  // of participation, even when the first duty was swapped to a later date.
  const original = existing.filter(a => a.date >= yearStart && a.date <= endDate);
  const firstCycleEnd = original.slice().sort((a, b) => a.date.localeCompare(b.date))[roster.length - 1]?.date || yearStart;
  const starts = Object.fromEntries(roster.map(t => {
    const first = original.filter(a => a.teacherId === t.id || a.swappedFrom === t.id)
      .map(a => a.date).sort()[0];
    return [t.id, t.dutyStartDate || (first ? (first <= firstCycleEnd ? yearStart : first) : startDate)];
  }));
  // Recompute virtual credit from the immutable history before participation.
  // It does not disappear after the newcomer completes their first duty.
  const credits = {};
  for (const t of roster.slice().sort((a, b) => starts[a.id].localeCompare(starts[b.id]) || a.id.localeCompare(b.id))) {
    credits[t.id] = Math.max(0, ...roster.filter(p => starts[p.id] < starts[t.id]).map(p =>
      (credits[p.id] || 0) + history.filter(a => a.teacherId === p.id && a.date < starts[t.id]).length));
  }
  const counts = Object.fromEntries(roster.map(t => [t.id, credits[t.id] + history.filter(a => a.teacherId === t.id).length]));
  const weekdays = Object.fromEntries(roster.map(t => [t.id, Array(7).fill(0)]));
  history.filter(a => a.date >= anchor).forEach(a => { if (weekdays[a.teacherId]) weekdays[a.teacherId][day(a.date)]++; });
  const eligible = (t, date) => date >= starts[t.id] && !(t.excludeWeekdays || []).includes(day(date)) && !excluded(t.id, date);
  const fixed = new Map(existing.filter(a => a.date >= startDate && a.date <= endDate && a.swappedFrom).map(a => [a.date, a]));
  const dates = [];
  for (let date = startDate; date <= endDate; date = nextDate(date)) {
    if (fixed.has(date) && !isDutyDay(date)) throw new Error(`${date}: 확정 교환과 휴무일이 충돌합니다.`);
    if (isDutyDay(date)) dates.push(date);
  }
  // Reserve fixed swaps once, so ordinary assignments account for that burden.
  for (const a of fixed.values()) {
    const t = roster.find(t => t.id === a.teacherId);
    if (!t || !eligible(t, a.date)) throw new Error(`${a.date}: 확정 교환과 제외 조건이 충돌합니다.`);
    counts[t.id]++;
    weekdays[t.id][day(a.date)]++;
  }
  const scheduled = existing.filter(a => a.date >= startDate && a.date <= endDate).slice().sort((a, b) => a.date.localeCompare(b.date));
  const projected = roster.map(t => credits[t.id] + history.filter(a => a.teacherId === t.id).length + scheduled.filter(a => a.teacherId === t.id).length);
  // A valid, already-balanced published schedule keeps its exact teacher totals.
  // Only the weekday distribution changes; accepted cross-boundary swaps remain.
  const reuse = scheduled.length === dates.length && scheduled.every((a, i) => {
    const t = roster.find(t => t.id === a.teacherId);
    return a.date === dates[i] && t && eligible(t, a.date);
  }) && Math.max(...projected) - Math.min(...projected) <= 2;
  const result = reuse ? scheduled.map(a => ({ ...a })) : [];
  if (reuse) result.filter(a => !fixed.has(a.date)).forEach(a => weekdays[a.teacherId][day(a.date)]++);
  let previous = history.slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.teacherId;
  for (let i = 0; !reuse && i < dates.length; i++) {
    const date = dates[i];
    for (const t of roster.filter(t => starts[t.id] > startDate && starts[t.id] <= date && (!i || starts[t.id] > dates[i - 1]))) {
      counts[t.id] = Math.max(counts[t.id], ...roster.filter(p => starts[p.id] < starts[t.id]).map(p => counts[p.id]));
    }
    if (fixed.has(date)) {
      result.push({ ...fixed.get(date) });
      previous = fixed.get(date).teacherId;
      continue;
    }
    const candidates = roster.filter(t => eligible(t, date));
    if (!candidates.length) throw new Error(`${date}: 제외 조건을 지키며 배정할 선생님이 없습니다.`);
    const nextFixed = fixed.get(dates[i + 1])?.teacherId;
    candidates.sort((a, b) => counts[a.id] - counts[b.id] ||
      Number(a.id === previous || a.id === nextFixed) - Number(b.id === previous || b.id === nextFixed) ||
      weekdays[a.id][day(date)] - weekdays[b.id][day(date)] || a.id.localeCompare(b.id));
    const t = candidates[0];
    result.push({ date, teacherId: t.id, teacherName: t.name });
    counts[t.id]++;
    weekdays[t.id][day(date)]++;
    previous = t.id;
  }
  // Exchange unfixed dates to improve weekday balance without changing totals.
  // Include history and future fixed duties when measuring adjacent-day burden.
  const prior = history.slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const lastHistoryDates = Object.fromEntries(roster.map(t => [t.id, history.filter(a => a.teacherId === t.id).map(a => a.date).sort().at(-1)]));
  const score = () => {
    let value = Object.values(weekdays).reduce((sum, w) => sum + w.reduce((s, n) => s + n * n, 0), 0);
    const lastDates = { ...lastHistoryDates };
    for (let i = 0; i < result.length; i++) {
      const before = i ? result[i - 1] : prior;
      if (before?.teacherId === result[i].teacherId) value += 1000;
      const a = result[i];
      if (lastDates[a.teacherId]) {
        const gap = (Date.parse(a.date) - Date.parse(lastDates[a.teacherId])) / 86400000;
        value += Math.max(0, 5 - gap) ** 2 * 10;
      }
      lastDates[a.teacherId] = a.date;
    }
    return value;
  };
  let current = score();
  const exchange = (a, b) => {
    const da = day(a.date), db = day(b.date);
    weekdays[a.teacherId][da]--; weekdays[a.teacherId][db]++;
    weekdays[b.teacherId][db]--; weekdays[b.teacherId][da]++;
    [a.teacherId, b.teacherId] = [b.teacherId, a.teacherId];
    [a.teacherName, b.teacherName] = [b.teacherName, a.teacherName];
  };
  for (let pass = 0; pass < 20; pass++) {
    let improved = false;
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
      const a = result[i], b = result[j];
      if (fixed.has(a.date) || fixed.has(b.date) || a.teacherId === b.teacherId) continue;
      if (!eligible(roster.find(t => t.id === a.teacherId), b.date) || !eligible(roster.find(t => t.id === b.teacherId), a.date)) continue;
      exchange(a, b);
      const candidate = score();
      if (candidate < current) { current = candidate; improved = true; } else exchange(a, b);
    }
    if (!improved) break;
  }
  return result;
}

module.exports = { POLICY_START, effectiveStart, generateFairSchedule };
