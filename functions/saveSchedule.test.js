const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function harness(stored) {
  const writes = [];
  const module = { exports: {} };
  const firestore = {
    doc: (_db, _collection, date) => date,
    runTransaction: async (_db, callback) => {
      const pending = [];
      await callback({
        get: async date => ({ exists: () => !!stored[date], data: () => stored[date] }),
        set: (date, row) => pending.push({ date, row }),
        delete: date => pending.push({ date, deleted: true }),
      });
      writes.push(...pending);
    },
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/saveSchedule.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports: module.exports, require: name =>
    name === 'firebase/firestore' ? firestore : name === './firebase' ? { db: {} } : require('./schedule') });
  return { save: module.exports.saveSchedulePreview, writes };
}

const row = (date, teacherId) => ({ date, teacherId, teacherName: teacherId });
test('preview persistence never writes protected history', async () => {
  const past = row('2026-09-30', 'old');
  const future = row('2099-10-01', 'new');
  const { save, writes } = harness({ [past.date]: past, [future.date]: future });
  await save('2099-10-01', '2099-12-31', [past, future], [future]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].date, future.date);
});
test('concurrent swap invalidates preview before any write', async () => {
  const expected = row('2099-10-01', 'a');
  const { save, writes } = harness({ [expected.date]: row(expected.date, 'b') });
  await assert.rejects(save('2099-10-01', '2099-12-31', [expected], [expected]));
  assert.equal(writes.length, 0);
});
test('invalid cutover is rejected before any transaction write', async () => {
  const { save, writes } = harness({});
  await assert.rejects(save('2026-09-01', '2026-12-31', [], [row('2026-09-30', 'a')]));
  assert.equal(writes.length, 0);
});
