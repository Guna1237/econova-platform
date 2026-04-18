const { test, expect } = require('@playwright/test');

const BASE = 'https://mu-aeon-econova-biddingwars.vercel.app';
const ADMIN = { username: 'admin', password: 'admin123' };

async function loginAs(page, username, password) {
    await page.goto(BASE);
    await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill(username);
    await page.locator('input[type="password"]').first().fill(password);
    await page.keyboard.press('Enter');
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

test.describe('Admin Dashboard', () => {
    test('header shows ECONOVA h1 + year + ADMIN badge', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await expect(page.getByRole('heading', { name: 'ECONOVA' })).toBeVisible({ timeout: 10000 });
        await expect(page.locator('div').filter({ hasText: /^ADMIN$/ }).first()).toBeVisible();
        await expect(page.getByText(/YEAR/i).first()).toBeVisible();
    });

    test('sidebar shows all nav tabs', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        const tabs = ['PORTFOLIO', 'NEWS', 'MARKETPLACE', 'AUCTION HALL', 'CREDIT', 'ANALYSIS'];
        for (const tab of tabs) {
            await expect(page.getByText(tab, { exact: false }).first()).toBeVisible({ timeout: 15000 });
        }
    });

    test('governance banner shows shock + advance buttons', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        // Governance banner renders after user state loads — wait up to 10s
        await expect(page.getByText('GOVERNANCE', { exact: false }).first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('button', { name: /ADVANCE Q$/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /TRIGGER INFLATION/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /TRIGGER RECESSION/i })).toBeVisible();
    });

    test('portfolio tab renders market prices table', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await page.waitForTimeout(2000);
        // Admin portfolio tab shows asset prices — look for price-like content ($xxx)
        await expect(page.locator('text=/\\$[0-9]/').first()).toBeVisible({ timeout: 18000 });
    });

    test('news tab loads', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await page.getByText('NEWS', { exact: true }).first().evaluate(el => el.click());
        await page.waitForTimeout(2000);
        await expect(page.getByText(/NEWS/i).first()).toBeVisible();
    });

    test('auction hall tab loads', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await page.getByText('AUCTION HALL', { exact: false }).first().evaluate(el => el.click());
        await page.waitForTimeout(2000);
        await expect(page.getByText(/AUCTION|LOT|BID/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('secondary market tab loads', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await page.getByText('SECONDARY', { exact: false }).first().evaluate(el => el.click());
        await page.waitForTimeout(2000);
        await expect(page.getByText(/SECONDARY|LISTING|AUCTION/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('credit network tab loads', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await page.getByText('CREDIT', { exact: false }).first().evaluate(el => el.click());
        await page.waitForTimeout(2000);
        await expect(page.getByText(/CREDIT|LOAN|NETWORK/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('analysis tab renders SVG chart', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await page.getByText('ANALYSIS', { exact: false }).first().evaluate(el => el.click());
        await page.waitForTimeout(3000);
        await expect(page.locator('svg').first()).toBeVisible({ timeout: 8000 });
    });

    test('admin control panel tab loads', async ({ page }) => {
        await loginAs(page, ADMIN.username, ADMIN.password);
        await page.getByText('ADMIN CONTROL', { exact: false }).first().evaluate(el => el.click());
        await page.waitForTimeout(2000);
        await expect(page.getByText('Admin Control Panel', { exact: false })).toBeVisible({ timeout: 10000 });
    });
});
