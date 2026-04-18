const { test, expect } = require('@playwright/test');

const BASE = 'https://mu-aeon-econova-biddingwars.vercel.app';
const ADMIN = { username: 'admin', password: 'admin123' };

async function loginAdmin(page) {
    await page.goto(BASE);
    await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill(ADMIN.username);
    await page.locator('input[type="password"]').first().fill(ADMIN.password);
    await page.keyboard.press('Enter');
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    // Wait for ADMIN CONTROL button — only renders after user data loads
    const adminBtn = page.locator('button').filter({ hasText: 'ADMIN CONTROL' }).first();
    await adminBtn.waitFor({ state: 'visible', timeout: 55000 });
    await adminBtn.evaluate(el => el.click());
    await page.waitForTimeout(3500);
}

test.describe('Admin Control Panel', () => {
    test('shows leaderboard section', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByText('Admin Control Panel', { exact: false })).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/LEADERBOARD/i).first()).toBeVisible();
    });

    test('shows market access controls', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByText('MARKET ACCESS CONTROLS', { exact: true })).toBeVisible();
        await expect(page.locator('#toggle-trade-approval')).toBeVisible();
        await expect(page.locator('#toggle-credit-facility')).toBeVisible();
    });

    test('shows investor sentiment dial', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByText('INVESTOR SENTIMENT', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /BULLISH/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /NEUTRAL/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /BEARISH/i })).toBeVisible();
    });

    test('shows market maker bots toggle', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByRole('button', { name: /MARKET MAKER BOTS/i })).toBeVisible();
    });

    test('shows leaderboard visibility toggle', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByRole('button', { name: /LEADERBOARD: (VISIBLE|HIDDEN)/i })).toBeVisible();
    });

    test('shows dividend issuance card', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByText('ISSUE DIVIDEND', { exact: true })).toBeVisible();
        await expect(page.locator('select').first()).toBeVisible();
        await expect(page.getByText('AMOUNT PER UNIT ($)', { exact: false })).toBeVisible();
    });

    test('shows auction lot configuration', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByText('AUCTION LOT CONFIGURATION', { exact: true })).toBeVisible();
        // Ticker headings are in div cards with inline font-weight style (rendered as font-weight:700)
        // Use the text-label's sibling div with bold text in each card
        for (const ticker of ['GOLD', 'NVDA', 'BRENT', 'REITS']) {
            await expect(page.locator(`div[style*="font-weight: 700"]`).filter({ hasText: ticker }).first()).toBeVisible({ timeout: 5000 });
        }
    });

    test('shows create team form', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByText('Create Team', { exact: false })).toBeVisible();
        await expect(page.getByText('STARTING CAPITAL', { exact: false })).toBeVisible();
        await expect(page.getByRole('button', { name: /REGISTER TEAM/i })).toBeVisible();
    });

    test('shows global controls (advance/reset)', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByRole('button', { name: 'ADVANCE FISCAL YEAR' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'ADVANCE QUARTER' })).toBeVisible();
        await expect(page.getByRole('button', { name: /RESET GAME/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /SETTLE ALL DEBTS/i })).toBeVisible();
    });

    test('reset game modal requires RESET confirmation', async ({ page }) => {
        await loginAdmin(page);
        await page.getByRole('button', { name: /RESET GAME/i }).click();
        await page.waitForTimeout(500);
        await expect(page.getByText(/Type.*RESET.*to confirm/i)).toBeVisible();
        await expect(page.getByRole('button', { name: 'CONFIRM RESET' })).toBeDisabled();
        await page.getByRole('button', { name: 'CANCEL' }).first().click();
    });

    test('dividend button disabled without amount', async ({ page }) => {
        await loginAdmin(page);
        await expect(page.getByRole('button', { name: /ISSUE DIVIDEND/i })).toBeDisabled();
    });
});
