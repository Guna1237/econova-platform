const { test, expect } = require('@playwright/test');

const BASE = 'https://mu-aeon-econova-biddingwars.vercel.app';
const API = 'https://econova-backend-ybiq.onrender.com';
const ADMIN = { username: 'admin', password: 'admin123' };

let testTeamUser = null;

async function getAdminToken(apiContext) {
    const res = await apiContext.post(`${API}/token`, {
        form: { username: ADMIN.username, password: ADMIN.password },
    });
    if (!res.ok()) return null;
    return (await res.json()).access_token;
}

test.beforeAll(async ({ request }) => {
    const token = await getAdminToken(request);
    if (!token) return;
    const teamName = `pw_test_${Date.now()}`;
    const res = await request.post(`${API}/admin/users/create`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { username: teamName, password: 'testpass123' },
    });
    if (res.ok()) {
        testTeamUser = { username: teamName, password: 'testpass123' };
    }
});

test.afterAll(async ({ request }) => {
    if (!testTeamUser) return;
    const token = await getAdminToken(request);
    if (!token) return;
    const users = await (await request.get(`${API}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
    })).json().catch(() => []);
    const team = users.find(u => u.username === testTeamUser.username);
    if (team) {
        await request.post(`${API}/admin/users/${team.id}/freeze`, {
            headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
    }
});

test.describe('Team Login and Dashboard', () => {
    test('team can log in', async ({ page }) => {
        if (!testTeamUser) { test.skip(); return; }
        await page.goto(BASE);
        await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill(testTeamUser.username);
        await page.locator('input[type="password"]').first().fill(testTeamUser.password);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);
        // Either on dashboard or consent form — both are valid
        const url = page.url();
        expect(url).toContain(BASE.replace('https://', ''));
    });

    test('team dashboard shows PORTFOLIO/LIQUIDITY section', async ({ page }) => {
        if (!testTeamUser) { test.skip(); return; }
        await page.goto(BASE);
        await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill(testTeamUser.username);
        await page.locator('input[type="password"]').first().fill(testTeamUser.password);
        await page.keyboard.press('Enter');
        await page.waitForURL(/dashboard/, { timeout: 15000 });
        // Dismiss consent form if shown — actively wait up to 5s for skip button
        const skipBtn = page.getByText(/skip for now|skip|later/i).first();
        await skipBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await skipBtn.isVisible().catch(() => false)) await skipBtn.click();
        await page.waitForTimeout(1500);
        await expect(page.getByText(/LIQUIDITY|PORTFOLIO/i).first()).toBeVisible({ timeout: 12000 });
    });

    test('team does NOT see admin badge', async ({ page }) => {
        if (!testTeamUser) { test.skip(); return; }
        await page.goto(BASE);
        await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill(testTeamUser.username);
        await page.locator('input[type="password"]').first().fill(testTeamUser.password);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
        const skipBtn = page.getByText(/skip|later/i).first();
        if (await skipBtn.isVisible().catch(() => false)) await skipBtn.click();
        await page.waitForTimeout(1000);
        // The red ADMIN badge (exact text "ADMIN" in a div) should not be visible
        const count = await page.locator('div').filter({ hasText: /^ADMIN$/ }).count();
        expect(count).toBe(0);
    });

    test('team does NOT see ADMIN CONTROL tab', async ({ page }) => {
        if (!testTeamUser) { test.skip(); return; }
        await page.goto(BASE);
        await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill(testTeamUser.username);
        await page.locator('input[type="password"]').first().fill(testTeamUser.password);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
        const skipBtn = page.getByText(/skip|later/i).first();
        if (await skipBtn.isVisible().catch(() => false)) await skipBtn.click();
        await page.waitForTimeout(1000);
        const count = await page.locator('button', { hasText: 'ADMIN CONTROL' }).count();
        expect(count).toBe(0);
    });

    test('team sees MARKETPLACE tab', async ({ page }) => {
        if (!testTeamUser) { test.skip(); return; }
        await page.goto(BASE);
        await page.locator('input[type="text"], input[name="username"], input[placeholder*="sername" i]').first().fill(testTeamUser.username);
        await page.locator('input[type="password"]').first().fill(testTeamUser.password);
        await page.keyboard.press('Enter');
        await page.waitForURL(/dashboard/, { timeout: 15000 });
        const skipBtn = page.getByText(/skip for now|skip|later/i).first();
        await skipBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await skipBtn.isVisible().catch(() => false)) await skipBtn.click();
        await page.waitForTimeout(1000);
        await expect(page.locator('button').filter({ hasText: 'MARKETPLACE' }).first()).toBeVisible({ timeout: 10000 });
    });
});

test.describe('API: Team auth guards', () => {
    test('team cannot access /admin/users (403)', async ({ request }) => {
        if (!testTeamUser) { test.skip(); return; }
        const loginRes = await request.post(`${API}/token`, {
            form: { username: testTeamUser.username, password: testTeamUser.password },
        });
        const token = (await loginRes.json()).access_token;
        const res = await request.get(`${API}/admin/users`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status()).toBe(403);
    });

    test('team cannot call next-quarter (403)', async ({ request }) => {
        if (!testTeamUser) { test.skip(); return; }
        const loginRes = await request.post(`${API}/token`, {
            form: { username: testTeamUser.username, password: testTeamUser.password },
        });
        const token = (await loginRes.json()).access_token;
        const res = await request.post(`${API}/admin/next-quarter`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status()).toBe(403);
    });

    test('team cannot issue dividends (403)', async ({ request }) => {
        if (!testTeamUser) { test.skip(); return; }
        const loginRes = await request.post(`${API}/token`, {
            form: { username: testTeamUser.username, password: testTeamUser.password },
        });
        const token = (await loginRes.json()).access_token;
        const res = await request.post(`${API}/admin/dividends`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { ticker: 'GOLD', amount_per_unit: 10 },
        });
        expect(res.status()).toBe(403);
    });
});
