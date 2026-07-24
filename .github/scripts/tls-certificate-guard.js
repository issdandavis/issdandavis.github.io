'use strict';

const http = require('node:http');
const tls = require('node:tls');

const DAY_MS = 24 * 60 * 60 * 1000;
const ISSUE_TITLE = 'TLS certificate requires attention: aethermoore.com';
const LABEL_NAME = 'tls-certificate';

function certificateTiming(validFrom, validTo, now = new Date()) {
  const validFromMs = Date.parse(validFrom);
  const validToMs = Date.parse(validTo);
  const nowMs = now.getTime();

  if (!Number.isFinite(validFromMs) || !Number.isFinite(validToMs) || validToMs <= validFromMs) {
    throw new Error('The server returned an invalid certificate validity period.');
  }

  const lifetimeMs = validToMs - validFromMs;
  const remainingMs = validToMs - nowMs;

  return {
    expiresAt: new Date(validToMs).toISOString(),
    lifetimeDays: Math.round((lifetimeMs / DAY_MS) * 10) / 10,
    remainingDays: Math.round((remainingMs / DAY_MS) * 10) / 10,
    renewalWindowDays: Math.ceil(lifetimeMs / DAY_MS / 3),
    expired: remainingMs <= 0,
    renewalDue: remainingMs <= lifetimeMs / 3,
  };
}

function evaluateHealth({
  certificateResult,
  certificateError,
  timing,
  pages,
  pagesError,
  httpResult,
  httpError,
}) {
  const reasons = [];
  const pageCertificateState = pages?.https_certificate?.state || 'unknown';
  const httpsEnforced = pages?.https_enforced === true;
  const secureRedirect =
    httpResult?.statusCode >= 300 &&
    httpResult?.statusCode < 400 &&
    /^https:\/\//i.test(httpResult?.location || '');

  if (certificateError) {
    reasons.push(`Live certificate could not be read: ${certificateError}`);
  } else if (!certificateResult?.authorized) {
    reasons.push(
      `Live TLS validation failed: ${certificateResult?.authorizationError || 'unknown error'}`,
    );
  }

  if (timing?.expired) {
    reasons.push(`Live certificate expired at ${timing.expiresAt}.`);
  } else if (timing?.renewalDue) {
    reasons.push(
      `Live certificate has ${timing.remainingDays} days left; its calculated renewal window is ${timing.renewalWindowDays} days.`,
    );
  }

  if (pagesError) {
    reasons.push(`GitHub Pages state could not be read: ${pagesError}`);
  } else if (pageCertificateState !== 'approved') {
    const description = pages?.https_certificate?.description || 'No description returned.';
    reasons.push(`GitHub Pages certificate state is ${pageCertificateState}: ${description}`);
  }

  if (!httpsEnforced) {
    reasons.push('GitHub Pages is not enforcing HTTPS.');
  }

  if (httpError) {
    reasons.push(`The HTTP redirect could not be checked: ${httpError}`);
  } else if (!secureRedirect) {
    reasons.push(
      `Plain HTTP returned ${httpResult?.statusCode || 'no status'} instead of redirecting to HTTPS.`,
    );
  }

  return {
    healthy: reasons.length === 0,
    reasons,
    pageCertificateState,
    httpsEnforced,
    secureRedirect,
  };
}

function readCertificate(domain) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    const socket = tls.connect({
      host: domain,
      port: 443,
      servername: domain,
      rejectUnauthorized: false,
    });

    socket.setTimeout(15_000, () => finish(new Error('TLS connection timed out.')));
    socket.once('error', (error) => finish(error));
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate(true);
      if (!certificate || !certificate.valid_to) {
        finish(new Error('No peer certificate was returned.'));
        return;
      }

      finish(null, {
        authorized: socket.authorized,
        authorizationError: socket.authorizationError || null,
        certificate,
      });
    });
  });
}

function readHttpRedirect(domain) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: domain,
        port: 80,
        path: '/',
        method: 'HEAD',
        headers: { 'User-Agent': 'aethermoore-tls-certificate-guard' },
      },
      (response) => {
        response.resume();
        resolve({
          statusCode: response.statusCode,
          location: response.headers.location || '',
        });
      },
    );

    request.setTimeout(15_000, () => request.destroy(new Error('HTTP request timed out.')));
    request.once('error', reject);
    request.end();
  });
}

async function ensureLabel(github, owner, repo) {
  try {
    await github.rest.issues.getLabel({ owner, repo, name: LABEL_NAME });
  } catch (error) {
    if (error.status !== 404) throw error;
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: LABEL_NAME,
      color: 'b60205',
      description: 'Automated GitHub Pages TLS certificate monitoring',
    });
  }
}

async function findGuardIssue(github, owner, repo) {
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'all',
    per_page: 100,
  });
  return issues.find((issue) => !issue.pull_request && issue.title === ISSUE_TITLE);
}

function issueBody({
  domain,
  health,
  timing,
  pages,
  httpResult,
  repairAttempted,
  repairResult,
  runUrl,
  checkedAt,
}) {
  const reasons = health.reasons.map((reason) => `- ${reason}`).join('\n');
  const certificateExpiry =
    timing?.expiresAt || pages?.https_certificate?.expires_at || 'unavailable';
  const remaining = timing ? `${timing.remainingDays} days` : 'unavailable';
  const redirect = httpResult
    ? `${httpResult.statusCode}${httpResult.location ? ` → ${httpResult.location}` : ''}`
    : 'unavailable';

  return `## Automated TLS certificate alert

The scheduled guard found that **${domain}** is not fully protected.

${reasons}

| Check | Result |
| --- | --- |
| Checked | ${checkedAt} |
| Live certificate expiry | ${certificateExpiry} |
| Time remaining | ${remaining} |
| Pages certificate state | ${health.pageCertificateState} |
| Enforce HTTPS | ${health.httpsEnforced} |
| HTTP response | ${redirect} |
| Diagnostic Pages rebuild | ${repairAttempted ? repairResult : 'not scheduled for this run'} |

The workflow can request a Pages rebuild, but GitHub deliberately does not give its
built-in token repository-administration permission. If the certificate remains
unapproved, an administrator must remove and re-add the custom domain in
\`Settings → Pages\`. Once the state becomes \`approved\`, enable **Enforce HTTPS**.

[Open this workflow run](${runUrl})

_This issue is updated automatically and will close after the certificate,
HTTPS enforcement, and HTTP redirect all recover._`;
}

async function updateGuardIssue({
  github,
  owner,
  repo,
  healthy,
  body,
  checkedAt,
  runUrl,
}) {
  const existing = await findGuardIssue(github, owner, repo);

  if (!healthy) {
    await ensureLabel(github, owner, repo);
    if (existing) {
      await github.rest.issues.update({
        owner,
        repo,
        issue_number: existing.number,
        state: 'open',
        body,
        labels: [LABEL_NAME],
      });
      return existing.number;
    }

    const created = await github.rest.issues.create({
      owner,
      repo,
      title: ISSUE_TITLE,
      body,
      labels: [LABEL_NAME],
    });
    return created.data.number;
  }

  if (existing?.state === 'open') {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: existing.number,
      body: `Recovered at ${checkedAt}. Certificate validation, HTTPS enforcement, and the HTTP redirect all passed.\n\n[Workflow run](${runUrl})`,
    });
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: existing.number,
      state: 'closed',
      state_reason: 'completed',
    });
  }

  return existing?.number || null;
}

async function run({ github, context, core }) {
  const domain = process.env.TLS_DOMAIN || 'aethermoore.com';
  const repairSchedule = process.env.TLS_REPAIR_SCHEDULE || '17 7 * * *';
  const { owner, repo } = context.repo;
  const checkedAt = new Date().toISOString();
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;

  let certificateResult;
  let certificateError;
  let timing;
  try {
    certificateResult = await readCertificate(domain);
    timing = certificateTiming(
      certificateResult.certificate.valid_from,
      certificateResult.certificate.valid_to,
    );
  } catch (error) {
    certificateError = error.message;
  }

  let httpResult;
  let httpError;
  try {
    httpResult = await readHttpRedirect(domain);
  } catch (error) {
    httpError = error.message;
  }

  let pages;
  let pagesError;
  try {
    const response = await github.request('GET /repos/{owner}/{repo}/pages', {
      owner,
      repo,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
    pages = response.data;
  } catch (error) {
    pagesError = `${error.status || 'error'} ${error.message}`;
  }

  const health = evaluateHealth({
    certificateResult,
    certificateError,
    timing,
    pages,
    pagesError,
    httpResult,
    httpError,
  });

  const shouldAttemptRepair =
    context.eventName === 'workflow_dispatch' || context.payload.schedule === repairSchedule;
  let repairAttempted = false;
  let repairResult = 'not needed';

  if (!health.healthy && shouldAttemptRepair) {
    repairAttempted = true;
    try {
      const response = await github.request('POST /repos/{owner}/{repo}/pages/builds', {
        owner,
        repo,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      });
      repairResult = response.data?.status || `accepted (${response.status})`;
    } catch (error) {
      repairResult = `failed: ${error.status || 'error'} ${error.message}`;
    }
  }

  const body = issueBody({
    domain,
    health,
    timing,
    pages,
    httpResult,
    repairAttempted,
    repairResult,
    runUrl,
    checkedAt,
  });
  const issueNumber = await updateGuardIssue({
    github,
    owner,
    repo,
    healthy: health.healthy,
    body,
    checkedAt,
    runUrl,
  });

  const expiry = timing?.expiresAt || pages?.https_certificate?.expires_at || 'unavailable';
  await core.summary
    .addHeading('TLS Certificate Guard')
    .addTable([
      [
        { data: 'Check', header: true },
        { data: 'Result', header: true },
      ],
      ['Domain', domain],
      ['Healthy', String(health.healthy)],
      ['Certificate expiry', expiry],
      ['Pages certificate state', health.pageCertificateState],
      ['Enforce HTTPS', String(health.httpsEnforced)],
      ['HTTP redirects to HTTPS', String(health.secureRedirect)],
      ['Pages rebuild', repairAttempted ? repairResult : 'not attempted'],
      ['Tracking issue', issueNumber ? `#${issueNumber}` : 'none'],
    ])
    .write();

  if (!health.healthy) {
    core.setFailed(health.reasons.join(' | '));
  }
}

module.exports = run;
module.exports.certificateTiming = certificateTiming;
module.exports.evaluateHealth = evaluateHealth;
