import axios from 'axios';

// Auto-detect environment: use production URL if deployed, localhost for local dev
const API_BASE_URL = import.meta.env.VITE_API_URL ||
    (window.location.hostname === 'localhost'
        ? 'http://localhost:8000'
        : 'https://econova-backend-ybiq.onrender.com');

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
    // Using simple register endpoint
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    const response = await default_api.post(`/register-simple?username=${username}&password=${password}`, {});
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

export const getPriceHistory = async (assetId) => {
    const response = await default_api.get(`/market/history/${assetId}`);
    return response.data;
};

// --- ADMIN USER MANAGEMENT ---
export const getAdminUsers = async () => {
    const response = await default_api.get('/admin/users');
    return response.data;
};

export const createTeamUser = async (username, password) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    const response = await default_api.post(`/admin/users/create?username=${username}&password=${password}`, {});
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

// --- ADMIN ---

export const nextTurn = async () => {
    const response = await default_api.post('/admin/next-turn');
    return response.data;
};

export const resolveAuction = async () => {
    const response = await default_api.post(`/admin/auction/resolve`);
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

// --- ADMIN PRICE NUDGE ---
export const nudgePrice = async (ticker, adjustmentPct, adjustmentAbs) => {
    const response = await default_api.post('/admin/price/nudge', {
        ticker,
        adjustment_pct: adjustmentPct,
        adjustment_abs: adjustmentAbs
    });
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

export default default_api;

