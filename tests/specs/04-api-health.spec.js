const { test, expect } = require('@playwright/test');

const API = 'https://econova-backend-ybiq.onrender.com';
const ADMIN = { username: 'admin', password: 'admin123' };

// Backend uses OAuth2PasswordRequestForm — must send form-urlencoded, not JSON
async function getAdminToken(apiContext) {
    const res = await apiContext.post(`${API}/token`, {
        form: { username: ADMIN.username, password: ADMIN.password },
    });
    if (!res.ok()) return null;
    const body = await res.json();
    return body.access_token;
}

test.describe('Backend API Health', () => {
    test('GET / root responds', async ({ request }) => {
        const res = await request.get(`${API}/`);
        expect(res.status()).toBeLessThan(500);
    });

    test('POST /token with valid admin credentials returns JWT', async ({ request }) => {
        const res = await request.post(`${API}/token`, {
            form: { username: ADMIN.username, password: ADMIN.password },
        });
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body).toHaveProperty('access_token');
        expect(body.token_type).toBe('bearer');
    });

    test('GET /market/state returns sim state', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const res = await request.get(`${API}/market/state`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body).toHaveProperty('current_year');
        expect(body).toHaveProperty('current_quarter');
    });

    test('GET /market/assets returns 4+ assets with tickers', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const res = await request.get(`${API}/market/assets`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(Array.isArray(body)).toBeTruthy();
        expect(body.length).toBeGreaterThanOrEqual(4);
        const tickers = body.map(a => a.ticker);
        expect(tickers).toContain('GOLD');
        expect(tickers).toContain('NVDA');
    });

    test('GET /admin/users returns user list (admin only)', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const res = await request.get(`${API}/admin/users`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('GET /admin/users blocked without auth (401)', async ({ request }) => {
        const res = await request.get(`${API}/admin/users`);
        expect(res.status()).toBe(401);
    });

    test('GET /auction/lots returns array', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const res = await request.get(`${API}/auction/lots`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('GET /auction/secondary-lots returns array', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const res = await request.get(`${API}/auction/secondary-lots`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('GET /news returns news items', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const res = await request.get(`${API}/news`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        expect(Array.isArray(await res.json())).toBeTruthy();
    });

    test('GET /leaderboard returns data', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const res = await request.get(`${API}/leaderboard`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
    });

    test('GET /admin/auction/config returns object', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const res = await request.get(`${API}/admin/auction/config`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
    });

    test('GET /market/history/{id} returns array for GOLD', async ({ request }) => {
        const token = await getAdminToken(request);
        if (!token) { test.skip(); return; }
        const assetsRes = await request.get(`${API}/market/assets`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const assets = await assetsRes.json();
        const gold = assets.find(a => a.ticker === 'GOLD');
        if (!gold) { test.skip(); return; }
        const res = await request.get(`${API}/market/history/${gold.id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(Array.isArray(body)).toBeTruthy();
        expect(body.length).toBeGreaterThan(0);
        expect(body[0]).toHaveProperty('year');
        expect(body[0]).toHaveProperty('price');
    });
});
