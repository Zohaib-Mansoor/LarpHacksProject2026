/* global process, URL, console, document, innerWidth */
import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

const origin = process.env.E2E_ORIGIN ?? 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
  throw new Error('Use a local test server.');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}),
});
const a = await browser.newContext(),
  b = await browser.newContext();
const one = await a.newPage(),
  two = await b.newPage();
const errors = [];
for (const p of [one, two]) {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('response', async (r) => {
    if (r.status() >= 400 && r.url().includes('/commands'))
      console.log('Command rejected:', await r.text());
  });
}
try {
  await one.goto(origin);
  await one.getByRole('button', { name: 'Account & settings' }).click();
  await one.getByLabel('Private display name').fill('Browser QA');
  await one.getByLabel('Appearance').selectOption('dark');
  await one.getByRole('button', { name: 'Save settings' }).click();
  await expect(one.locator('#toast')).toHaveText('Settings saved.');
  await one.reload();
  await one.getByRole('button', { name: 'Account & settings' }).click();
  await expect(one.getByLabel('Private display name')).toHaveValue(
    'Browser QA',
  );
  await expect(one.locator('html')).toHaveAttribute('data-theme', 'dark');
  console.log('PASS: browser settings persist through reload.');

  await one
    .getByLabel('Email', { exact: true })
    .fill(`${randomUUID()}@example.invalid`);
  await one
    .getByLabel('Password', { exact: true })
    .fill('browser-test-password-123');
  await one
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(one.locator('#toast')).toHaveText(
    'Account created. Your progress is saved.',
  );
  await expect(one.getByLabel('Private display name')).toHaveValue(
    'Browser QA',
  );
  console.log('PASS: guest upgrades to an account without losing settings.');

  await one.getByRole('button', { name: 'Lobby', exact: true }).click();
  await one.getByRole('button', { name: 'Create private room' }).click();
  const invite = await one.getByLabel('Private invite link').inputValue();
  await two.goto(invite);
  await two.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(
    one.getByRole('button', { name: 'I’m ready', exact: true }),
  ).toBeEnabled();
  await one.getByRole('button', { name: 'I’m ready', exact: true }).click();
  await expect(
    one.getByRole('button', { name: 'Waiting for partner…' }),
  ).toBeVisible();
  await two.getByRole('button', { name: 'I’m ready', exact: true }).click();
  await expect(
    one.getByRole('heading', { name: 'Mara Voss, station quartermaster' }),
  ).toBeVisible();
  await expect(
    two.getByRole('heading', { name: 'Eli Soren, independent trader' }),
  ).toBeVisible();
  await expect(one.locator('body')).not.toContainText('Eli Soren');
  await expect(two.locator('body')).not.toContainText('Mara Voss');
  console.log(
    'PASS: two browsers join and receive distinct private briefs. Waiting for the 45-second briefing.',
  );

  await one.locator('#proposal-form').waitFor({ timeout: 60000 });
  await two.locator('#proposal-form').waitFor({ timeout: 5000 });
  await one
    .getByRole('textbox', { name: 'Your message' })
    .fill('Can we agree to 575 credits and three-day delivery?');
  await one.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(two.locator('#messages')).toContainText(
    'Can we agree to 575 credits',
  );
  await one.locator('#price').fill('575');
  await one.getByRole('button', { name: 'Publish new proposal' }).click();
  await expect(
    two.getByRole('button', { name: 'Confirm revision 1' }),
  ).toBeVisible();
  await one.getByRole('button', { name: 'Confirm revision 1' }).click();
  await expect(two.locator('.acceptance')).toContainText('Partner: confirmed');
  await two.locator('#price').fill('600');
  await two.getByRole('button', { name: 'Publish new proposal' }).click();
  await expect(
    one.getByRole('button', { name: 'Confirm revision 2' }),
  ).toBeVisible();
  await expect(one.locator('.acceptance')).not.toContainText('confirmed');
  await one.getByRole('button', { name: 'Confirm revision 2' }).click();
  await expect(two.locator('.acceptance')).toContainText('Partner: confirmed');
  await two.getByRole('button', { name: 'Confirm revision 2' }).click();
  await expect(
    one.getByRole('heading', { name: 'A deal worth talking about.' }),
  ).toBeVisible();
  await expect(
    two.getByRole('heading', { name: 'A deal worth talking about.' }),
  ).toBeVisible();
  await one.reload();
  await expect(
    one.getByRole('heading', { name: 'A deal worth talking about.' }),
  ).toBeVisible();
  console.log(
    'PASS: chat, proposals, confirmation reset, two-party deal, results, and reload persistence.',
  );

  await one.setViewportSize({ width: 390, height: 844 });
  expect(
    await one.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    'PASS: mobile layout has no horizontal overflow; no browser JavaScript errors.',
  );
} catch (error) {
  console.log(
    'Second browser state:',
    (await two.locator('body').innerText()).slice(-1800),
  );
  console.log('Browser errors:', errors);
  throw error;
} finally {
  await browser.close();
}
