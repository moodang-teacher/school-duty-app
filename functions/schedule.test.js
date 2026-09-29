const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateFairSchedule: generate, effectiveStart } = require('./schedule');

const roster = (n = 10) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `Teacher ${i}`, excludeWeekdays: [] }));
const count = (rows, id) => rows.filter(a => a.teacherId === id).length;
const duty = (date, teacherId, extra = {}) => ({ date, teacherId, teacherName: teacherId, ...extra });
const distribution = (rows, id) => [1, 2, 3, 4, 5].map(day => rows.filter(a => a.teacherId === id && new Date(a.date).getUTCDay() === day).length);

test('cutover protects all dates through September 30 and input objects', () => {
  const history = [duty('2026-09-30', 't0')];
  const before = JSON.stringify(history);
  const rows = generate(roster(), '2026-01-01', '2026-12-31', history);
  assert(rows.every(a => a.date >= '2026-10-01'));
  assert.equal(JSON.stringify(history), before);
  assert.equal(effectiveStart('2026-09-29'), '2026-10-01');
  assert.deepEqual(generate(roster(), '2026-01-01', '2026-09-30', history), []);
});

test('balances total counts and weekdays for a regular roster', () => {
  const teachers = roster();
  const rows = generate(teachers, '2026-10-01', '2026-12-31');
  const totals = teachers.map(t => count(rows, t.id));
  assert(Math.max(...totals) - Math.min(...totals) <= 1);
  for (const t of teachers) {
    const days = distribution(rows, t.id);
    assert(Math.max(...days) - Math.min(...days) <= 1);
  }
  assert(rows.every((a, i) => !i || a.teacherId !== rows[i - 1].teacherId));
});

test('newcomer credit survives first duty and repeated regeneration', () => {
  const teachers = roster(3);
  teachers[2].dutyStartDate = '2026-09-15';
  const history = Array.from({ length: 40 }, (_, i) => duty(`2026-08-${String(i % 28 + 1).padStart(2, '0')}`, `t${i % 2}`));
  history.push(duty('2026-09-15', 't2'));
  const rows = generate(teachers, '2026-10-01', '2026-12-31', history);
  assert(count(rows, 't2') <= 23);
  const regenerated = generate(teachers, '2026-10-02', '2026-12-31', [...history, ...rows]);
  assert(count(regenerated, 't2') <= 23);
  assert(regenerated.every((a, i) => !i || a.teacherId !== regenerated[i - 1].teacherId));
});

test('preserves accepted swap metadata and published total counts', () => {
  const teachers = roster();
  const old = generate(teachers, '2026-10-01', '2026-12-31');
  const a = old[0], b = old[6];
  [a.teacherId, b.teacherId] = [b.teacherId, a.teacherId];
  a.swappedFrom = b.teacherId;
  b.swappedFrom = a.teacherId;
  a.teacherName = a.teacherId;
  b.teacherName = b.teacherId;
  const result = generate(teachers, '2026-10-01', '2026-12-31', old);
  assert.deepEqual(result.find(r => r.date === a.date), a);
  assert.deepEqual(result.find(r => r.date === b.date), b);
  for (const t of teachers) assert.equal(count(result, t.id), count(old, t.id));
});

test('respects exclusions, holidays, participation date and inactive teachers', () => {
  const teachers = roster(4);
  teachers[0].excludeWeekdays = [4];
  teachers[1].active = false;
  teachers[2].dutyStartDate = '2026-11-02';
  const rows = generate(teachers, '2026-10-01', '2026-12-31', [], {
    isDutyDay: date => ![0, 6].includes(new Date(date).getUTCDay()) && date !== '2026-10-09',
    isTeacherExcluded: (id, date) => id === 't3' && date >= '2026-10-12' && date <= '2026-10-14',
  });
  assert(!rows.some(a => a.teacherId === 't1' || a.date === '2026-10-09'));
  assert(!rows.some(a => a.teacherId === 't0' && new Date(a.date).getUTCDay() === 4));
  assert(!rows.some(a => a.teacherId === 't2' && a.date < '2026-11-02'));
  assert(!rows.some(a => a.teacherId === 't3' && a.date >= '2026-10-12' && a.date <= '2026-10-14'));
});

test('fails rather than overriding exclusions or a conflicting accepted swap', () => {
  const teachers = roster(2).map(t => ({ ...t, excludeWeekdays: [4] }));
  assert.throws(() => generate(teachers, '2026-10-01', '2026-10-01'), /2026-10-01/);
  assert.throws(() => generate(teachers, '2026-10-01', '2026-10-01', [duty('2026-10-01', 't0', { swappedFrom: 't1' })]), /2026-10-01/);
});

test('next year still generates a complete year and is deterministic', () => {
  const teachers = roster();
  const rows = generate(teachers, '2027-01-01', '2027-12-31');
  assert.equal(rows.length, 261);
  assert.deepEqual(generate([...teachers].reverse(), '2027-01-01', '2027-12-31'), rows);
  assert.equal(new Set(rows.map(a => a.date)).size, rows.length);
});
