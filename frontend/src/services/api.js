import axios from 'axios';

// Auto-detect environment: use production URL if deployed, localhost for local dev
const API_BASE_URL = import.meta.env.VITE_API_URL ||
    ((window.location.hostname.includes('onrender.com') || window.location.hostname.includes('vercel.app'))
        ? 'https://econova-backend-ybiq.onrender.com'
        : `http://${window.location.hostname}:8000`);

const default_api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

default_api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

export const login = async (username, password) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    const response = await default_api.post('/token', params, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    if (response.data.access_token) {
        localStorage.setItem('token', response.data.access_token);
    } else {
        throw new Error("No access token received from server");
    }
    return response.data;
};

export const register = async (username, password) => {
    // Using simple register endpoint with body
    const response = await default_api.post('/register-simple', { username, password });
    return response.data;
};

export const getMarketState = async () => {
    const response = await default_api.get('/market/state');
    return response.data;
};

export const getAssets = async () => {
    const response = await default_api.get('/market/assets');
    return response.data;
};

export const getMe = async () => {
    const response = await default_api.get('/users/me');
    return response.data;
};

export const getPortfolio = async () => {
    const response = await default_api.get('/users/portfolio');
    return response.data;
}

export const logout = () => {
    localStorage.removeItem('token');
};

export const getPriceHistory = async (assetId, quarterly = false) => {
    const response = await default_api.get(`/market/history/${assetId}?quarterly=${quarterly}`);
    return response.data;
};

// --- ADMIN USER MANAGEMENT ---
export const getAdminUsers = async () => {
    const response = await default_api.get('/admin/users');
    return response.data;
};

export const getLeaderboard = async () => {
    const response = await default_api.get('/admin/leaderboard');
    return response.data;
};


export const createTeamUser = async (username, password) => {
    const response = await default_api.post('/admin/users/create', { username, password });
    return response.data;
};

export const toggleFreezeUser = async (userId) => {
    const response = await default_api.post(`/admin/users/${userId}/freeze`);
    return response.data;
};

export const liquidateTeamUser = async (userId) => {
    const response = await default_api.post(`/admin/users/${userId}/liquidate`);
    return response.data;
};

export const placeOrder = async (orderData) => {
    const response = await default_api.post('/orders', orderData);
    return response.data;
};

// --- NEW ENDPOINTS ---

export const scanBids = async () => {
    const response = await default_api.get('/auction/bids');
    return response.data;
};

export const placeBid = async (amount) => {
    const response = await default_api.post('/auction/bid', { amount });
    return response.data;
};

export const offerLoan = async (borrower_username, principal, interest_rate) => {
    const response = await default_api.post('/loans/offer', { borrower_username, principal, interest_rate });
    return response.data;
};

export const acceptLoan = async (loanId) => {
    const response = await default_api.post(`/loans/accept/${loanId}`);
    return response.data;
};

export const getPendingLoans = async () => {
    const response = await default_api.get('/loans/pending');
    return response.data;
};

export const getAllTeams = async () => {
    const response = await default_api.get('/loans/teams');
    return response.data;
};

export const getActiveLoans = async () => {
    const response = await default_api.get('/loans/active');
    return response.data;
};

export const repayLoan = async (loanId, amount) => {
    const response = await default_api.post('/loans/repay', { loan_id: loanId, amount });
    return response.data;
};

// --- MORTGAGE / EMERGENCY LIQUIDATION ---

export const requestMortgage = async (collateral_asset_ticker, collateral_quantity, interest_rate, maturity_quarters) => {
    const response = await default_api.post('/mortgage/request', { collateral_asset_ticker, collateral_quantity, interest_rate, maturity_quarters });
    return response.data;
};

export const getMyMortgages = async () => {
    const response = await default_api.get('/mortgage/my');
    return response.data;
};

export const repayMortgage = async (mortgageId, amount) => {
    const response = await default_api.post('/mortgage/repay', { mortgage_id: mortgageId, amount });
    return response.data;
};

// Admin mortgage
export const getAdminMortgageRequests = async () => {
    const response = await default_api.get('/admin/mortgage-requests');
    return response.data;
};

export const approveMortgage = async (mortgageId, adminNote) => {
    const response = await default_api.post(`/admin/mortgage/${mortgageId}/approve`, { admin_note: adminNote });
    return response.data;
};

export const rejectMortgage = async (mortgageId, adminNote) => {
    const response = await default_api.post(`/admin/mortgage/${mortgageId}/reject`, { admin_note: adminNote });
    return response.data;
};

// --- ADMIN ---

export const nextTurn = async () => {
    const response = await default_api.post('/admin/next-turn');
    return response.data;
};

export const nextQuarter = async () => {
    const response = await default_api.post('/admin/next-quarter');
    return response.data;
};

export const resolveAuction = async () => {
    const response = await default_api.post(`/admin/auction/resolve`);
    return response.data;
};

export const openNextLot = async () => {
    const response = await default_api.post(`/admin/auction/next-lot`);
    return response.data;
};

export const endAuction = async () => {
    const response = await default_api.post(`/admin/auction/end`);
    return response.data;
};


export const triggerShock = async (type, action) => {
    const response = await default_api.post('/admin/trigger-shock', { type, action });
    return response.data;
}

export const openAuction = async (ticker) => {
    const response = await default_api.post(`/admin/auction/open/${ticker}`);
    return response.data;
}

// ============ NEW ENDPOINTS FOR RESEARCH TRACKING ============

// --- CONSENT & ONBOARDING ---
export const checkConsentStatus = async () => {
    const response = await default_api.get('/consent/status');
    return response.data;
};

export const acceptConsent = async (consentData) => {
    const response = await default_api.post('/consent/accept', consentData);
    return response.data;
};

export const submitTeamLeaderInfo = async (teamInfo) => {
    const response = await default_api.post('/consent/team-leader', teamInfo);
    return response.data;
};


// --- MULTI-LOT AUCTIONS ---
export const getAuctionLots = async () => {
    const response = await default_api.get('/auction/lots');
    return response.data;
};

export const getLotBids = async (lotId) => {
    const response = await default_api.get(`/auction/bids/${lotId}`);
    return response.data;
};

export const placeLotBid = async (lotId, amount) => {
    const response = await default_api.post('/auction/bid', { lot_id: lotId, amount });
    return response.data;
};

// --- TREASURY (T-Bills) ---
export const getTreasuryInfo = async () => {
    const response = await default_api.get('/treasury/info');
    return response.data;
};

export const buyTBills = async (quantity) => {
    const response = await default_api.post('/treasury/buy', { quantity });
    return response.data;
};

export const sellTBills = async (quantity) => {
    const response = await default_api.post('/treasury/sell', { quantity });
    return response.data;
};

// --- ADMIN PRICE NUDGE ---
export const nudgePrice = async (ticker, adjustmentPct, adjustmentAbs) => {
    const response = await default_api.post('/admin/price/nudge', {
        ticker,
        adjustment_pct: adjustmentPct,
        adjustment_abs: adjustmentAbs
    });
    return response.data;
};

// --- AUTO-NEWS CONFIG ---
export const getAutoNewsConfig = async () => {
    const response = await default_api.get('/admin/auto-news/config');
    return response.data;
};
export const setAutoNewsConfig = async (ticker, up, down) => {
    const response = await default_api.post('/admin/auto-news/config', { ticker, up, down });
    return response.data;
};
export const deleteAutoNewsConfig = async (ticker) => {
    const response = await default_api.delete(`/admin/auto-news/config/${ticker}`);
    return response.data;
};

// --- ADMIN CREDENTIALS ---
export const updateAdminCredentials = async (newUsername, newPassword) => {
    const response = await default_api.post('/admin/credentials/update', {
        new_username: newUsername,
        new_password: newPassword
    });
    return response.data;
};

// --- DATA EXPORT ---
export const exportActivityData = async () => {
    const response = await default_api.get('/admin/export/activity', {
        responseType: 'blob'
    });
    return response.data;
};

export const exportTeamData = async () => {
    const response = await default_api.get('/admin/export/teams', {
        responseType: 'blob'
    });
    return response.data;
};

export const getResearchSummary = async () => {
    const response = await default_api.get('/admin/export/summary');
    return response.data;
};

// --- ACTIVITY LOGGING ---
export const logActivity = async (actionType, actionDetails, durationMs = null) => {
    const response = await default_api.post('/activity/log', {
        action_type: actionType,
        action_details: actionDetails,
        duration_ms: durationMs
    });
    return response.data;
};

// --- PRIVATE TRADING ---

export const createPrivateOffer = async (offerData) => {
    const response = await default_api.post('/offers/create', offerData);
    return response.data;
};

export const getMyOffers = async () => {
    const response = await default_api.get('/offers/my');
    return response.data;
};

export const acceptOffer = async (offerId) => {
    const response = await default_api.post(`/offers/${offerId}/accept`);
    return response.data;
};

export const rejectOffer = async (offerId) => {
    const response = await default_api.post(`/offers/${offerId}/reject`);
    return response.data;
};

export const getTransactions = async () => {
    const response = await default_api.get('/transactions');
    return response.data;
};

export const openMarketplace = async () => {
    const response = await default_api.post('/admin/marketplace/open');
    return response.data;
};

export const closeMarketplace = async () => {
    const response = await default_api.post('/admin/marketplace/close');
    return response.data;
};

// --- NEWS SYSTEM ---

export const getNews = async () => {
    const response = await default_api.get('/news');
    return response.data;
};

export const getAllNewsAdmin = async () => {
    const response = await default_api.get('/admin/news/all');
    return response.data;
};

export const createNews = async (newsData) => {
    const response = await default_api.post('/admin/news/create', newsData);
    return response.data;
};

export const updateNews = async (id, newsData) => {
    const response = await default_api.put(`/admin/news/${id}`, newsData);
    return response.data;
};

export const deleteNews = async (id) => {
    const response = await default_api.delete(`/admin/news/${id}`);
    return response.data;
};

// --- NEW ADMIN CONTROLS ---

export const addCashToTeam = async (teamId, amount, reason = '') => {
    const response = await default_api.post(`/admin/teams/${teamId}/add-cash`, { amount, reason });
    return response.data;
};

export const penalizeTeam = async (teamId, amount, reason = '') => {
    const response = await default_api.post(`/admin/teams/${teamId}/penalty`, { amount, reason });
    return response.data;
};

export const toggleTradeApproval = async () => {
    const response = await default_api.post('/admin/market/toggle-trade-approval');
    return response.data;
};

export const getTradeApprovals = async () => {
    const response = await default_api.get('/admin/trade-approvals');
    return response.data;
};

export const approveTradeApproval = async (approvalId, adminNote = '') => {
    const response = await default_api.post(`/admin/trade-approvals/${approvalId}/approve`, { admin_note: adminNote });
    return response.data;
};

export const rejectTradeApproval = async (approvalId, adminNote = '') => {
    const response = await default_api.post(`/admin/trade-approvals/${approvalId}/reject`, { admin_note: adminNote });
    return response.data;
};

export const migrateAssets = async () => {
    const response = await default_api.post('/admin/migrate-assets');
    return response.data;
};

// --- CREDIT FACILITY ---
export const openCreditFacility = async () => {
    const response = await default_api.post('/admin/credit/open');
    return response.data;
};

export const closeCreditFacility = async () => {
    const response = await default_api.post('/admin/credit/close');
    return response.data;
};

// --- LOAN APPROVALS ---
export const getLoanApprovals = async () => {
    const response = await default_api.get('/admin/loan-approvals');
    return response.data;
};

export const approveLoan = async (approvalId, adminNote = '') => {
    const response = await default_api.post(`/admin/loan-approvals/${approvalId}/approve`, { admin_note: adminNote });
    return response.data;
};

export const rejectLoan = async (approvalId, adminNote = '') => {
    const response = await default_api.post(`/admin/loan-approvals/${approvalId}/reject`, { admin_note: adminNote });
    return response.data;
};

// --- TEAM PORTFOLIO (ADMIN) ---
export const getTeamPortfolio = async (teamId) => {
    const response = await default_api.get(`/admin/teams/${teamId}/portfolio`);
    return response.data;
};

// --- ACTIVITY FEED ---
export const getActivityFeed = async () => {
    const response = await default_api.get('/admin/activity-feed');
    return response.data;
};

export const getTeamActivity = async (teamId) => {
    const response = await default_api.get(`/admin/teams/${teamId}/activity`);
    return response.data;
};

// --- USER AUCTION LOTS ---
export const getMyAuctionLots = async () => {
    const response = await default_api.get('/auction/my-lots');
    return response.data;
};

// ============ BANKER REQUESTS (New Approval Flow) ============

export const getBankerOwnRequests = async () => {
    const response = await default_api.get('/banker/requests');
    return response.data;
};

export const bankerRequestAssets = async (assetTicker, quantity, reason = '') => {
    const response = await default_api.post('/banker/request/assets', { asset_ticker: assetTicker, quantity, reason });
    return response.data;
};

export const bankerRequestShort = async (teamId, assetTicker, quantity) => {
    const response = await default_api.post('/banker/request/short', { team_id: teamId, asset_ticker: assetTicker, quantity });
    return response.data;
};

export const bankerRequestBailout = async (teamId, amount, terms = '', interestRate = 2.0, unfreezeTeam = true) => {
    const response = await default_api.post('/banker/request/bailout', {
        team_id: teamId, amount, terms, interest_rate: interestRate, unfreeze_team: unfreezeTeam
    });
    return response.data;
};

// ============ ADMIN APPROVALS & LIMITS ============

export const getAllBankerRequests = async () => {
    const response = await default_api.get('/admin/banker-requests');
    return response.data;
};

export const approveBankerRequest = async (requestId, adminNote = '') => {
    const response = await default_api.post(`/admin/banker-requests/${requestId}/approve`, { admin_note: adminNote });
    return response.data;
};

export const rejectBankerRequest = async (requestId, adminNote = '') => {
    const response = await default_api.post(`/admin/banker-requests/${requestId}/reject`, { admin_note: adminNote });
    return response.data;
};

export const getShortLimits = async () => {
    const response = await default_api.get('/admin/short-limits');
    return response.data;
};

export const updateShortLimits = async (limits) => {
    const response = await default_api.post('/admin/short-limits', limits);
    return response.data;
};

// ============ BANKER DASHBOARD ============

export const getBankerDashboard = async () => {
    const response = await default_api.get('/banker/dashboard');
    return response.data;
};

export const getBankerTeams = async () => {
    const response = await default_api.get('/banker/teams');
    return response.data;
};

export const getBankerTeamOverview = async (teamId) => {
    const response = await default_api.get(`/banker/team/${teamId}/overview`);
    return response.data;
};

export const getBankerTransactions = async () => {
    const response = await default_api.get('/banker/transactions');
    return response.data;
};

export const getBailoutHistory = async () => {
    const response = await default_api.get('/banker/bailout-history');
    return response.data;
};

// ============ ADMIN BANKER MANAGEMENT ============

export const createBankerAccount = async (username, password, initialCapital = 10000000) => {
    const response = await default_api.post('/admin/bankers/create', {
        username, password, initial_capital: initialCapital
    });
    return response.data;
};

export const getAllBankers = async () => {
    const response = await default_api.get('/admin/bankers');
    return response.data;
};

export const addBankerCapital = async (bankerId, amount, reason = '') => {
    const response = await default_api.post(`/admin/bankers/${bankerId}/add-capital`, { amount, reason });
    return response.data;
};

// --- ADMIN: RESET GAME ---
export const resetGame = async () => {
    const response = await default_api.post('/admin/reset-game');
    return response.data;
};

// --- ADMIN: SETTLE ALL DEBTS (End-of-game liquidation) ---
export const settleAllDebts = async () => {
    const response = await default_api.post('/admin/settle-all-debts');
    return response.data;
};

// --- ADMIN: SEED HISTORY ---
export const seedHistory = async () => {
    const response = await default_api.post('/admin/seed-history');
    return response.data;
};

// --- ADMIN: MANUAL RECOVERY / SHOCK RESET ---
export const triggerRecovery = async () => {
    const response = await default_api.post('/admin/trigger-recovery');
    return response.data;
};

export const resetShock = async () => {
    const response = await default_api.post('/admin/reset-shock');
    return response.data;
};

// --- ADMIN: INVESTOR SENTIMENT ---
export const setSentiment = async (sentiment) => {
    const response = await default_api.post('/admin/sentiment', { sentiment });
    return response.data;
};

// --- ADMIN: MARKET MAKER BOTS ---
export const toggleBots = async () => {
    const response = await default_api.post('/admin/bots/toggle');
    return response.data;
};

// --- SECONDARY AUCTION HALL ---
export const submitSecondaryAuctionRequest = async (assetTicker, quantity, reservePrice) => {
    const response = await default_api.post('/secondary-auction/request', {
        asset_ticker: assetTicker,
        quantity,
        reserve_price: reservePrice,
    });
    return response.data;
};

export const getMySecondaryRequests = async () => {
    const response = await default_api.get('/secondary-auction/my-requests');
    return response.data;
};

export const getAdminSecondaryRequests = async () => {
    const response = await default_api.get('/admin/secondary-auction/requests');
    return response.data;
};

export const approveSecondaryRequest = async (reqId) => {
    const response = await default_api.post(`/admin/secondary-auction/${reqId}/approve`);
    return response.data;
};

export const rejectSecondaryRequest = async (reqId, adminNote = '') => {
    const response = await default_api.post(`/admin/secondary-auction/${reqId}/reject`, { admin_note: adminNote });
    return response.data;
};

export const getSecondaryLots = async () => {
    const response = await default_api.get('/auction/secondary-lots');
    return response.data;
};

export const resolveSecondaryLot = async (lotId) => {
    const response = await default_api.post(`/admin/secondary-lots/${lotId}/resolve`);
    return response.data;
};

export const issueDividend = async (ticker, amountPerUnit, note = '') => {
    const response = await default_api.post('/admin/dividends', { ticker, amount_per_unit: amountPerUnit, note: note || undefined });
    return response.data;
};

export const getFlaggedTrades = async () => {
    const response = await default_api.get('/admin/flagged-trades');
    return response.data;
};

// --- PUBLIC LEADERBOARD ---
export const getPublicLeaderboard = async () => {
    const response = await default_api.get('/leaderboard');
    return response.data;
};

export const toggleLeaderboard = async () => {
    const response = await default_api.post('/admin/leaderboard/toggle');
    return response.data;
};

// --- AUCTION CONFIG ---
export const getAuctionConfig = async () => {
    const response = await default_api.get('/admin/auction/config');
    return response.data;
};

export const setAuctionConfig = async (ticker, lots) => {
    const response = await default_api.post('/admin/auction/config', { ticker, lots });
    return response.data;
};

// --- TEAM STARTING CAPITAL ---
export const setTeamStartingCapital = async (amount) => {
    const response = await default_api.post('/admin/team-capital', { amount });
    return response.data;
};

export default default_api;



// --- Real-time Connection (SSE primary, WS fallback) ---
export const connectRealtime = (onMessage, onStatusChange) => {
    const token = localStorage.getItem('token');
    const sseUrl = `${API_BASE_URL}/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    let eventSource = null;
    let ws = null;
    let reconnectTimer = null;
    let pingInterval = null;
    let closed = false;
    let wsBackoff = 3000; // Start at 3s, cap at 30s

    const setStatus = (s) => onStatusChange && onStatusChange(s);

    // --- SSE (primary) ---
    const connectSSE = () => {
        if (closed) return;
        try {
            setStatus('connecting');
            eventSource = new EventSource(sseUrl);

            eventSource.onopen = () => {
                console.log('[SSE] Connected');
                setStatus('connected');
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type !== 'connected') {
                        onMessage(data);
                    }
                } catch (e) {
                    // heartbeat or unparseable
                }
            };

            eventSource.onerror = () => {
                console.warn('[SSE] Error, falling back to WebSocket...');
                setStatus('disconnected');
                if (eventSource) { eventSource.close(); eventSource = null; }
                if (!closed) reconnectTimer = setTimeout(connectWS, 1000);
            };
        } catch (e) {
            console.warn('[SSE] Failed, trying WebSocket...');
            if (!closed) connectWS();
        }
    };

    // --- WebSocket (fallback) ---
    const connectWS = () => {
        if (closed) return;
        let wsUrl;
        try {
            const apiUrl = new URL(API_BASE_URL);
            const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${apiUrl.host}/ws`;
        } catch (e) {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        }

        try {
            setStatus('connecting');
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('[WS] Connected');
                setStatus('connected');
                wsBackoff = 3000; // Reset backoff on success
                pingInterval = setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping');
                }, 30000);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type !== 'pong') onMessage(data);
                } catch (e) { /* ignore */ }
            };

            ws.onclose = () => {
                clearInterval(pingInterval);
                setStatus('disconnected');
                if (!closed) {
                    console.log(`[WS] Disconnected, retrying in ${wsBackoff / 1000}s...`);
                    reconnectTimer = setTimeout(connectSSE, wsBackoff); // Try SSE again
                    wsBackoff = Math.min(wsBackoff * 1.5, 30000); // Exponential backoff, cap 30s
                }
            };

            ws.onerror = () => {
                if (ws) ws.close();
            };
        } catch (e) {
            setStatus('disconnected');
            if (!closed) reconnectTimer = setTimeout(connectSSE, wsBackoff);
        }
    };

    // Start with SSE
    connectSSE();

    // Return cleanup function
    return () => {
        closed = true;
        clearTimeout(reconnectTimer);
        clearInterval(pingInterval);
        if (eventSource) eventSource.close();
        if (ws) ws.close();
    };
};
