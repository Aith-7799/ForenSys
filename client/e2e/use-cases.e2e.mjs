/**
 * ForenSys Phase 4 verification: drives the real UI in Chrome.
 *
 * For each of the seven use cases it checks that the correct role can complete
 * the flow through the browser, and that a role WITHOUT the use case cannot --
 * both by route guard and, more importantly, by calling the API directly from
 * the page to prove the server refuses it.
 *
 * Requires both servers running:
 *   API -> http://localhost:4000   (npm run dev)
 *   Web -> http://localhost:5173   (cd client && npm run dev)
 *
 * Usage: node e2e/use-cases.e2e.mjs
 * Uses the locally installed Chrome (no browser download needed).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const PASSWORD = 'Forensys@123';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` -- ${String(detail).replace(/\s+/g, ' ').slice(0, 110)}` : ''}`);
}

/**
 * React renders after the navigation resolves, and Playwright's isVisible()
 * does not wait -- so every assertion that expects something to appear goes
 * through here instead.
 */
async function visible(page, selector, timeout = 15_000) {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function gone(page, selector, timeout = 15_000) {
  try {
    await page.locator(selector).first().waitFor({ state: 'detached', timeout });
    return true;
  } catch {
    return false;
  }
}

/** Signs in through the real login form in a fresh browser context. */
async function signIn(browser, badgeNumber, label, password = PASSWORD) {
  const context = await browser.newContext({ baseURL: WEB });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto('/login');
  await page.fill('#badgeNumber', badgeNumber);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  return { context, page, label };
}

/** Calls the API from inside the page, using that session's own token. */
async function apiStatus(page, method, urlPath, body) {
  return page.evaluate(
    async ([m, p, b]) => {
      const token = localStorage.getItem('forensys.accessToken');
      const res = await fetch(p, {
        method: m,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(b ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(b ? { body: JSON.stringify(b) } : {}),
      });
      return res.status;
    },
    [method, urlPath, body],
  );
}

async function main() {
  console.log(`ForenSys browser E2E against ${WEB}\n`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const stamp = Date.now();
  const caseTitle = `E2E Cyber Fraud ${stamp}`;
  let createdCaseId = '';
  let evidenceId = '';

  try {
    // =====================================================================
    // Use case 1: Authenticate User
    // =====================================================================
    console.log('1. Authenticate User');
    {
      const context = await browser.newContext({ baseURL: WEB });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);

      await page.goto('/login');
      check('Login screen renders', await visible(page, 'h1:has-text("ForenSys")'));

      await page.fill('#badgeNumber', 'BADGE-9081');
      await page.fill('#password', 'wrong-password');
      await page.click('button[type=submit]');
      const alertShown = await visible(page, '[role=alert]');
      check(
        'Wrong password shows an error and stays on /login',
        alertShown && page.url().includes('/login'),
        await page.locator('[role=alert]').innerText(),
      );

      // Demo-account shortcut prefills the form.
      await page.click('button:has-text("BADGE-9081")');
      await page.click('button[type=submit]');
      await page.waitForURL((url) => !url.pathname.startsWith('/login'));
      check('Valid credentials sign the officer in', !page.url().includes('/login'), page.url());
      check('Header shows the officer name and role', await visible(page, 'text=Det. Robert Vance'));

      const anonContext = await browser.newContext({ baseURL: WEB });
      const anonPage = await anonContext.newPage();
      await anonPage.goto('/cases');
      await anonPage.waitForURL((url) => url.pathname.startsWith('/login'));
      check('Unauthenticated visit to /cases redirects to /login', anonPage.url().includes('/login'));
      await anonContext.close();

      await page.click('button:has-text("Sign out")');
      await page.waitForURL((url) => url.pathname.startsWith('/login'));
      check('Sign out returns to the login screen', page.url().includes('/login'));

      await context.close();
    }

    // =====================================================================
    // Investigating Officer: use cases 2, 3, 4, 6 + nav gating
    // =====================================================================
    const io = await signIn(browser, 'BADGE-9081', 'Investigating Officer');
    console.log('\n   [Investigating Officer] navigation');

    check('IO sees "Cases & Timeline"', await visible(io.page, 'nav a:has-text("Cases & Timeline")'));
    check('IO sees "Chain of Custody"', await visible(io.page, 'nav a:has-text("Chain of Custody")'));
    check('IO does NOT see "Analytics Dashboard"', !(await visible(io.page, 'nav a:has-text("Analytics Dashboard")', 1500)));
    check('IO does NOT see "Manage Users"', !(await visible(io.page, 'nav a:has-text("Manage Users")', 1500)));
    check('IO does NOT see "Lab & Witness Reports"', !(await visible(io.page, 'nav a:has-text("Lab & Witness Reports")', 1500)));

    // --- Use case 2: Create Crime Report ---
    console.log('\n2. Create Crime Report');
    await io.page.goto('/cases');
    await io.page.click('a:has-text("+ Create Crime Report")');
    await io.page.waitForURL(/\/cases\/new/);
    check('Create Crime Report form opens for IO', await visible(io.page, '#title'));

    await io.page.fill('#title', caseTitle);
    await io.page.fill('#locationPoint', '40.7128,-74.0060');
    await io.page.click('button:has-text("Create case")');
    await io.page.waitForURL((url) => /^\/cases\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'));
    createdCaseId = io.page.url().split('/cases/')[1];

    check(
      'Case is created and the detail page opens',
      await visible(io.page, `h1:has-text("${caseTitle}")`),
      caseTitle,
    );
    check('Created case has an app-generated UUID id', /^[0-9a-f-]{36}$/.test(createdCaseId), createdCaseId);

    // --- Use case 3: Register Evidence Item ---
    console.log('\n3. Register Evidence Item');
    await io.page.click('a:has-text("+ Register evidence")');
    await io.page.waitForURL(/\/evidence\/new/);

    await io.page.selectOption('#evidenceType', 'Weapon');
    check(
      'Non-digital type shows the PHYSICAL_EVIDENCE sub-form',
      await visible(io.page, 'text=PHYSICAL_EVIDENCE'),
    );

    await io.page.fill('#storageLockerNumber', 'LOCKER-E2E');
    await io.page.fill('#sealNumber', 'SEAL-E2E-1');
    await io.page.fill('#containerType', 'E2E Steel Case');
    await io.page.click('button:has-text("Register evidence")');
    await io.page.waitForURL((url) => /^\/evidence\/[^/]+$/.test(url.pathname));
    evidenceId = io.page.url().split('/evidence/')[1];

    check('Physical evidence registers', /^[0-9a-f-]{36}$/.test(evidenceId), evidenceId);
    check('Detail page shows the physical attributes', await visible(io.page, 'text=LOCKER-E2E'));

    // Digital branch
    await io.page.goto(`/cases/${createdCaseId}/evidence/new`);
    await io.page.selectOption('#evidenceType', 'Digital Device');
    check(
      'Digital Device switches to the DIGITAL_EVIDENCE sub-form',
      await visible(io.page, 'text=DIGITAL_EVIDENCE'),
    );
    await io.page.fill('#fileHashSha256', 'b'.repeat(64));
    await io.page.fill('#mediaType', 'Disk Image (.raw)');
    await io.page.fill('#sizeMb', '321.25');
    await io.page.fill('#deviceSerial', 'SN-E2E-0001');
    await io.page.click('button:has-text("Register evidence")');
    await io.page.waitForURL((url) => /^\/evidence\/[^/]+$/.test(url.pathname));
    check('Digital evidence registers', await visible(io.page, 'text=Disk Image (.raw)'));

    // The new evidence must be listed on the case (Evidence tab, not the default).
    await io.page.goto(`/cases/${createdCaseId}`);
    await io.page.click('button:has-text("Evidence")');
    check('Case detail lists the registered evidence', await visible(io.page, `td:has-text("${evidenceId}")`));

    // --- Use case 4: Log Chain of Custody ---
    console.log('\n4. Log Chain of Custody');
    await io.page.goto(`/custody?evidenceId=${evidenceId}`);
    check('Custody page shows the current-holder panel', await visible(io.page, 'text=Current holder'));

    // The evidence select is preselected from the ?evidenceId= deep link.
    await io.page.waitForFunction(() => {
      const el = document.querySelector('#evidence');
      return el instanceof HTMLSelectElement && el.value.length > 0;
    });

    const releasedDefault = await io.page.locator('#releasedBy').inputValue();
    check(
      'Released-by defaults to the signed-in officer (no holder yet)',
      releasedDefault === 'OFF-101',
      releasedDefault,
    );

    // Hand it to the Lab Analyst. Resolve the option value from the rendered
    // list rather than hardcoding an id.
    const labOfficerId = await io.page.evaluate(() => {
      const sel = document.querySelector('#receivedBy');
      if (!(sel instanceof HTMLSelectElement)) return '';
      const opt = [...sel.options].find((o) => o.textContent?.includes('Dr. Sarah Connor'));
      return opt ? opt.value : '';
    });
    check('Lab Analyst is offered as a receiving officer', Boolean(labOfficerId), labOfficerId);

    await io.page.selectOption('#receivedBy', labOfficerId);
    await io.page.click('button:has-text("Log transfer")');
    check(
      'Custody transfer is logged through the UI',
      await visible(io.page, 'text=is now held by'),
    );
    check(
      'Transfer history panel lists the new entry',
      await visible(io.page, 'ol li:has-text("Dr. Sarah Connor")'),
    );

    // Read the amber holder panel by class: the page subtitle also contains the
    // words "current holder", so a text selector would be ambiguous.
    const holderAfter = await io.page.locator('div.bg-amber-50').innerText();
    check(
      'Current holder now shows the receiving officer',
      holderAfter.includes('Dr. Sarah Connor'),
      holderAfter,
    );

    // --- Use case 6: View Case Timeline (incl. trigger-written audit rows) ---
    console.log('\n6. View Case Timeline');
    await io.page.goto(`/cases/${createdCaseId}`);
    check('Timeline card renders', await visible(io.page, 'h2:has-text("Case timeline")'));

    // Change status through the UI; the DB trigger writes the audit row.
    await io.page.selectOption('div.fs-card select', 'under_investigation');

    const auditCard = io.page
      .locator('div.fs-card')
      .filter({ has: io.page.locator('h2', { hasText: 'CASE_AUDIT_LOG' }) });

    let auditText = '';
    try {
      await auditCard.locator('li:has-text("under_investigation")').first().waitFor({ state: 'visible', timeout: 15_000 });
      auditText = await auditCard.innerText();
    } catch {
      auditText = await auditCard.innerText().catch(() => '');
    }

    check(
      'Status change wrote a CASE_AUDIT_LOG row (database trigger)',
      auditText.includes('under_investigation') && auditText.includes('open'),
      auditText,
    );
    check('Audit row attributes the change to the acting officer', auditText.includes('Det. Robert Vance'));

    const timelineText = await io.page.locator('ol.relative').innerText();
    check(
      'Timeline merges evidence + custody + status events',
      timelineText.includes('collected') && timelineText.includes('Custody') && timelineText.includes('Status'),
    );

    // Wrong-role API checks, called from the IO's own browser session.
    check(
      'Server blocks IO from the analytics API (403)',
      (await apiStatus(io.page, 'GET', '/api/dashboard/summary')) === 403,
    );
    check(
      'Server blocks IO from creating users (403)',
      (await apiStatus(io.page, 'POST', '/api/officers', {
        badgeNumber: `BADGE-E2E-${stamp}`,
        fullName: 'Should Not Exist',
        role: 'Lab Analyst',
        password: 'Nope@1234',
      })) === 403,
    );

    await io.page.goto('/dashboard');
    check('IO typing /dashboard sees "Access denied"', await visible(io.page, 'text=Access denied'));
    await io.page.goto('/users');
    check('IO typing /users sees "Access denied"', await visible(io.page, 'text=Access denied'));

    // =====================================================================
    // Forensic Laboratory Analyst: use cases 4, 5, 6
    // =====================================================================
    console.log('\n   [Lab Analyst] navigation');
    const lab = await signIn(browser, 'BADGE-9082', 'Lab Analyst');

    check('Lab sees "Chain of Custody"', await visible(lab.page, 'nav a:has-text("Chain of Custody")'));
    check('Lab sees "Lab & Witness Reports"', await visible(lab.page, 'nav a:has-text("Lab & Witness Reports")'));
    check('Lab does NOT see "Analytics Dashboard"', !(await visible(lab.page, 'nav a:has-text("Analytics Dashboard")', 1500)));

    // --- Use case 5: Upload Laboratory and Witness Reports ---
    console.log('\n5. Upload Laboratory and Witness Reports');
    const fixture = path.join(os.tmpdir(), `forensys-e2e-${stamp}.txt`);
    fs.writeFileSync(fixture, 'E2E laboratory report fixture.\n');

    await lab.page.goto('/reports');
    await lab.page.selectOption('#case', createdCaseId);
    await lab.page.selectOption('#reportType', 'Laboratory');
    await lab.page.setInputFiles('#file', fixture);
    await lab.page.click('button:has-text("Upload report")');
    check('Lab Analyst uploads a report through the UI', await visible(lab.page, 'text=Uploaded "'));
    check(
      'Uploaded report appears in the list',
      await visible(lab.page, `text=forensys-e2e-${stamp}.txt`),
    );
    fs.rmSync(fixture, { force: true });

    // Lab can read the timeline but cannot create cases or register evidence.
    await lab.page.goto(`/cases/${createdCaseId}`);
    check('Lab Analyst can view the case timeline', await visible(lab.page, 'h2:has-text("Case timeline")'));
    check(
      'Lab Analyst sees no "Register evidence" button',
      !(await visible(lab.page, 'a:has-text("+ Register evidence")', 1500)),
    );

    check(
      'Server blocks Lab from registering evidence (403)',
      (await apiStatus(lab.page, 'POST', '/api/evidence', {
        caseId: createdCaseId,
        evidenceType: 'Document',
        collectionTimestamp: new Date().toISOString(),
        physical: { storageLockerNumber: 'X', sealNumber: 'Y', containerType: 'Z' },
      })) === 403,
    );
    check(
      'Server blocks Lab from creating a case (403)',
      (await apiStatus(lab.page, 'POST', '/api/cases', {
        title: 'Lab cannot create this',
        incidentTimestamp: new Date().toISOString(),
        locationPoint: '0,0',
      })) === 403,
    );

    const noParentUpload = await lab.page.evaluate(async () => {
      const token = localStorage.getItem('forensys.accessToken');
      const form = new FormData();
      form.append('reportType', 'Witness');
      form.append('file', new Blob(['x']), 'x.txt');
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      return res.status;
    });
    check('Upload without a case or evidence parent is rejected (400)', noParentUpload === 400, `status ${noParentUpload}`);

    // =====================================================================
    // System Administrator: use case 7 + manage users
    // =====================================================================
    console.log('\n7. View Analytics Dashboard');
    const admin = await signIn(browser, 'BADGE-9083', 'System Administrator');

    check('Admin sees "Analytics Dashboard"', await visible(admin.page, 'nav a:has-text("Analytics Dashboard")'));
    check('Admin sees "Manage Users"', await visible(admin.page, 'nav a:has-text("Manage Users")'));

    await admin.page.goto('/dashboard');
    check('Dashboard renders', await visible(admin.page, 'h1:has-text("Analytics Dashboard")'));
    check('Cases-by-status panel renders', await visible(admin.page, 'text=Cases by status'));
    check('Evidence-by-type panel renders', await visible(admin.page, 'text=Evidence by type'));
    check('Digital size stats panel renders', await visible(admin.page, 'text=Digital evidence size by media type'));
    check('Officer workload panel renders', await visible(admin.page, 'text=Officer workload'));
    check('ROLLUP panel renders', await visible(admin.page, 'text=Status × type rollup'));
    check('ROLLUP includes a grand-total row', await visible(admin.page, 'text=TOTAL ALL STATUSES'));
    check('Officer workload shows seeded officer Vance', await visible(admin.page, 'text=Det. Robert Vance'));

    check(
      'Server blocks Admin from creating a case (403)',
      (await apiStatus(admin.page, 'POST', '/api/cases', {
        title: 'Admin cannot create this',
        incidentTimestamp: new Date().toISOString(),
        locationPoint: '0,0',
      })) === 403,
    );
    await admin.page.goto('/cases/new');
    check('Admin typing /cases/new sees "Access denied"', await visible(admin.page, 'text=Access denied'));

    console.log('\n   [System Administrator] manage users');
    await admin.page.goto('/users');
    const newBadge = `BADGE-E2E-${stamp}`;
    await admin.page.fill('#badgeNumber', newBadge);
    await admin.page.fill('#fullName', 'E2E Created Officer');
    await admin.page.selectOption('#role', 'Lab Analyst');
    await admin.page.fill('#password', 'E2eCreated@123');
    await admin.page.click('button:has-text("Create officer")');
    check('Admin creates a user through the UI', await visible(admin.page, 'text=Created E2E Created Officer'));
    check('New officer appears in the table', await visible(admin.page, `td:has-text("${newBadge}")`));

    // Signs in with the password chosen above, proving bcrypt hashing round-trips
    // for an account created through the admin UI.
    const newUser = await signIn(browser, newBadge, 'New Officer', 'E2eCreated@123');
    check('The newly created officer can sign in', await visible(newUser.page, 'nav'));
    await newUser.context.close();

    // Clean up the officer, then the case.
    await admin.page.goto('/users');
    admin.page.on('dialog', (d) => void d.accept());
    const row = admin.page.locator(`tr:has-text("${newBadge}")`);
    if ((await row.count()) > 0) {
      await row.locator('button:has-text("Delete")').click();
      check('Admin deletes the test officer', await visible(admin.page, 'text=Deleted E2E Created Officer'));
    }

    check(
      'Test case cleaned up (204)',
      (await apiStatus(admin.page, 'DELETE', `/api/cases/${createdCaseId}`)) === 204,
    );

    await io.context.close();
    await lab.context.close();
    await admin.context.close();
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  ${passed}/${results.length} browser checks passed`);
  if (failed.length > 0) {
    console.log('\n  Failures:');
    for (const f of failed) console.log(`    - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  }
  console.log('='.repeat(72));

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nE2E run crashed:', err);
  process.exit(1);
});
