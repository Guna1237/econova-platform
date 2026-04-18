const { test, expect } = require('@playwright/test');

const ADMIN = { username: 'admin', password: 'admin123' };
const BASE = 'https://mu-aeon-econova-biddingwars.vercel.app';

test.describe('Login Page', () => {
    test('loads and shows login form', async ({ page }) => {
        await page.goto(BASE);
        await expect(page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first()).toBeVisible();
        await expect(page.locator('input[type="password"]').first()).toBeVisible();
    });

    test('shows ECONOVA branding', async ({ page }) => {
        await page.goto(BASE);
        // Login page shows "ECONOVA FINANCIAL TERMINAL" text
        await expect(page.getByText('ECONOVA FINANCIAL TERMINAL', { exact: false }).first()).toBeVisible();
    });

    test('rejects wrong credentials', async ({ page }) => {
        await page.goto(BASE);
        await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill('wronguser');
        await page.locator('input[type="password"]').first().fill('wrongpass');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        const url = page.url();
        expect(url.includes('dashboard')).toBeFalsy();
    });

    test('admin login succeeds and redirects to dashboard', async ({ page }) => {
        await page.goto(BASE);
        await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill(ADMIN.username);
        await page.locator('input[type="password"]').first().fill(ADMIN.password);
        await page.keyboard.press('Enter');
        await page.waitForURL(/dashboard/, { timeout: 10000 });
        // Dashboard loaded — ADMIN badge in header
        await expect(page.locator('div').filter({ hasText: /^ADMIN$/ }).first()).toBeVisible({ timeout: 20000 });
    });
});
