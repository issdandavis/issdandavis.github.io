'use strict';

const assert = require('node:assert/strict');
const {
  certificateTiming,
  evaluateHealth,
} = require('./tls-certificate-guard.js');

const now = new Date('2026-07-24T00:00:00Z');

const ninetyDayBeforeWindow = certificateTiming(
  '2026-06-25T00:00:00Z',
  '2026-09-23T00:00:00Z',
  now,
);
assert.equal(ninetyDayBeforeWindow.lifetimeDays, 90);
assert.equal(ninetyDayBeforeWindow.renewalWindowDays, 30);
assert.equal(ninetyDayBeforeWindow.renewalDue, false);

const ninetyDayInWindow = certificateTiming(
  '2026-04-25T00:00:00Z',
  '2026-07-24T00:00:00Z',
  now,
);
assert.equal(ninetyDayInWindow.expired, true);
assert.equal(ninetyDayInWindow.renewalDue, true);

const fortyFiveDayWindow = certificateTiming(
  '2026-07-09T00:00:00Z',
  '2026-08-23T00:00:00Z',
  now,
);
assert.equal(fortyFiveDayWindow.lifetimeDays, 45);
assert.equal(fortyFiveDayWindow.renewalWindowDays, 15);
assert.equal(fortyFiveDayWindow.renewalDue, false);

const healthy = evaluateHealth({
  certificateResult: { authorized: true, authorizationError: null },
  certificateError: null,
  timing: { expired: false, renewalDue: false },
  pages: {
    https_certificate: { state: 'approved' },
    https_enforced: true,
  },
  pagesError: null,
  httpResult: { statusCode: 301, location: 'https://aethermoore.com/' },
  httpError: null,
});
assert.equal(healthy.healthy, true);
assert.deepEqual(healthy.reasons, []);

const broken = evaluateHealth({
  certificateResult: {
    authorized: false,
    authorizationError: 'CERT_HAS_EXPIRED',
  },
  certificateError: null,
  timing: {
    expired: true,
    renewalDue: true,
    expiresAt: '2026-07-05T01:04:42.000Z',
    remainingDays: -19,
    renewalWindowDays: 30,
  },
  pages: {
    https_certificate: {
      state: 'bad_authz',
      description: 'The ACME authorization is in a bad state.',
    },
    https_enforced: false,
  },
  pagesError: null,
  httpResult: { statusCode: 200, location: '' },
  httpError: null,
});
assert.equal(broken.healthy, false);
assert.ok(broken.reasons.some((reason) => reason.includes('CERT_HAS_EXPIRED')));
assert.ok(broken.reasons.some((reason) => reason.includes('bad_authz')));
assert.ok(broken.reasons.some((reason) => reason.includes('not enforcing HTTPS')));

console.log('tls-certificate-guard tests passed');
