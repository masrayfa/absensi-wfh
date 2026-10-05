const assert = require('node:assert/strict');
const { wibDateOf } = require('../dist/wib.js');

// 16:30Z = 23:30 WIB same day; 17:30Z = 00:30 WIB next day.
assert.equal(wibDateOf(new Date('2026-01-01T16:30:00.000Z')), '2026-01-01');
assert.equal(wibDateOf(new Date('2026-01-01T17:30:00.000Z')), '2026-01-02');
assert.equal(wibDateOf(new Date('2026-03-10T00:00:00.000Z')), '2026-03-10');
assert.equal(wibDateOf(new Date('2026-03-10T16:59:59.999Z')), '2026-03-10');
assert.equal(wibDateOf(new Date('2026-03-10T17:00:00.000Z')), '2026-03-11');

console.log('wib.selfcheck: OK (16:30Z -> same WIB day, 17:30Z -> next WIB day)');
