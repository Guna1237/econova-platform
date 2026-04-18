const { test, expect } = require('@playwright/test');

const API = 'https://econova-backend-ybiq.onrender.com';
const ADMIN = { username: 'admin', password: 'admin123' };

// OAuth2PasswordRequestForm requires form-urlencoded
async function adminRequest(request, method, path, jsonData) {
    const loginRes = await request.post(`${API}/token`, {
        form: { username: ADMIN.username, password: ADMIN.password },
    });
    if (!loginRes.ok()) return null;
    const { access_token } = await loginRes.json();
    const opts = { headers: { Authorization: `Bearer ${access_token}` } };
    if (jsonData) opts.data = jsonData;
    if (method === 'GET') return request.get(`${API}${path}`, opts);
    if (method === 'POST') return request.post(`${API}${path}`, opts);
    return null;
}

test.describe('Simulation Logic (read-only probes)', () => {
    test('market state has valid year and quarter', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/market/state');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        const state = await res.json();
        expect(typeof state.current_year).toBe('number');
        expect([1, 2, 3, 4]).toContain(state.current_quarter);
    });

    test('all 4 main assets present with positive price', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/market/assets');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        const assets = await res.json();
        for (const ticker of ['GOLD', 'NVDA', 'BRENT', 'REITS']) {
            const asset = assets.find(a => a.ticker === ticker);
            expect(asset, `Asset ${ticker} should exist`).toBeTruthy();
            expect(asset.current_price, `${ticker} price should be > 0`).toBeGreaterThan(0);
        }
    });

    test('TBILL asset present with positive price', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/market/assets');
        expect(res).not.toBeNull();
        const assets = await res.json();
        const tbill = assets.find(a => a.ticker === 'TBILL');
        expect(tbill, 'TBILL should exist').toBeTruthy();
        expect(tbill.current_price).toBeGreaterThan(0);
    });

    test('price history for GOLD has data with year and price fields', async ({ request }) => {
        const assetsRes = await adminRequest(request, 'GET', '/market/assets');
        expect(assetsRes).not.toBeNull();
        const assets = await assetsRes.json();
        const gold = assets.find(a => a.ticker === 'GOLD');
        const res = await adminRequest(request, 'GET', `/market/history/${gold.id}`);
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        const history = await res.json();
        expect(history.length).toBeGreaterThan(0);
        expect(history[0]).toHaveProperty('year');
        expect(history[0]).toHaveProperty('price');
    });

    test('admin leaderboard returns array', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/admin/leaderboard');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('auction lots endpoint returns array', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/auction/lots');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('secondary lots endpoint returns array', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/auction/secondary-lots');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('auction config endpoint returns object', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/admin/auction/config');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        expect(typeof await res.json()).toBe('object');
    });

    test('auth/me endpoint returns admin user data', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/users/me');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        const me = await res.json();
        expect(me.username).toBe('admin');
        expect(me.role).toBe('admin');
        expect(typeof me.cash).toBe('number');
    });

    test('portfolio endpoint returns array', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/users/portfolio');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('news endpoint returns array', async ({ request }) => {
        const res = await adminRequest(request, 'GET', '/news');
        expect(res).not.toBeNull();
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('dividend endpoint rejects amount=0 with 4xx', async ({ request }) => {
        const res = await adminRequest(request, 'POST', '/admin/dividends', {
            ticker: 'GOLD', amount_per_unit: 0,
        });
        expect(res).not.toBeNull();
        expect(res.status()).toBeGreaterThanOrEqual(400);
        expect(res.status()).toBeLessThan(500);
    });

    test('dividend endpoint rejects unknown ticker with 4xx', async ({ request }) => {
        const res = await adminRequest(request, 'POST', '/admin/dividends', {
            ticker: 'FAKECOIN', amount_per_unit: 5,
        });
        expect(res).not.toBeNull();
        expect(res.status()).toBeGreaterThanOrEqual(400);
        expect(res.status()).toBeLessThan(500);
    });
});
