

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LogOut, TrendingUp, Wallet, Clock, Play, Activity, Layers, Search,
    ChevronRight, ArrowUpRight, ArrowDownRight, ShieldAlert, Gavel, Radio, Zap, Landmark
} from 'lucide-react';
import { getMarketState, getAssets, placeOrder, getMe, logout, nextTurn, nextQuarter, triggerShock, getAdminUsers, toggleFreezeUser, createTeamUser, getPortfolio, checkConsentStatus, openMarketplace, closeMarketplace, connectRealtime, toggleTradeApproval, migrateAssets, openCreditFacility, closeCreditFacility, resetGame, settleAllDebts, seedHistory, triggerRecovery, resetShock, setSentiment, toggleBots, getFlaggedTrades, toggleLeaderboard, getAuctionConfig, setAuctionConfig, setTeamStartingCapital, issueDividend, setInterestRate } from '../services/api';
import univLogo from '../assets/ip.png';
import clubLogo from '../assets/image.png';
import AuctionHouse from '../components/AuctionHouse';
import SecondaryAuctionHall from '../components/SecondaryAuctionHall';
import CreditNetwork from '../components/CreditNetwork';
import PriceChart from '../components/PriceChart';
import ConsentForm from '../components/ConsentForm';
import AdminPriceNudge from '../components/AdminPriceNudge';
import AdminCredentials from '../components/AdminCredentials';
import TeamPasswordChange from '../components/TeamPasswordChange';
import LoginStatus from '../components/LoginStatus';
import TeamManagement from '../components/TeamManagement';
import DataExport from '../components/DataExport';
import PrivateTrading from '../components/PrivateTrading';
import NewsTab from '../components/NewsTab';
import AdminTradeApprovals from '../components/AdminTradeApprovals';
import AdminLoanApprovals from '../components/AdminLoanApprovals';
import AdminLeaderboard from '../components/AdminLeaderboard';
import AdminBankerManagement from '../components/AdminBankerManagement';
import AdminBankerApprovals from '../components/AdminBankerApprovals';
import AdminMortgageApprovals from '../components/AdminMortgageApprovals';
import AdminSecondaryAuction from '../components/AdminSecondaryAuction';
import PublicLeaderboard from '../components/PublicLeaderboard';
import { Toaster, toast } from 'sonner';

export default function Dashboard() {
    const [user, setUser] = useState(null);
    const [marketState, setMarketState] = useState(null);
    const [assets, setAssets] = useState([]);
    const [portfolio, setPortfolio] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('portfolio');
    const [hasConsented, setHasConsented] = useState(false); // Default false to ensure form shows if check fails

    // Admin State
    const [adminUsers, setAdminUsers] = useState([]);
    const [newTeam, setNewTeam] = useState({ username: '', password: '' });
    const [flaggedTrades, setFlaggedTrades] = useState([]);
    const [auctionConfig, setAuctionConfigState] = useState({});
    const [teamCapitalInput, setTeamCapitalInput] = useState('');

    // Trading State
    const [order, setOrder] = useState({ assetId: '', type: 'buy', quantity: '', price: '' });
    const [selectedAsset, setSelectedAsset] = useState(null);
    const selectedAssetTickerRef = useRef(null); // Track selected ticker across refreshes
    const [lastUpdate, setLastUpdate] = useState(Date.now()); // Force refresh for children

    // Notifications State
    const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(false);
    const [autoAdvanceMin, setAutoAdvanceMin] = useState(3);
    const [timeRemainingDisplay, setTimeRemainingDisplay] = useState(0);
    const autoAdvanceTimerRef = useRef(null);
    const timeRemainingRef = useRef(0);

    const [notifications, setNotifications] = useState({
        news: false,
        marketplace: false,
        auction: false,
        credit: false,
        treasury: false
    });

    const audioCtxRef = useRef(null);
    const rtStatusRef = useRef('disconnected');
    const [rtStatus, setRtStatus] = useState('connecting');
    const fetchDebounceRef = useRef(null); // Debounce SSE-triggered fetches

    const playNotificationSound = (type = 'standard') => {
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;

            if (type === 'time') {
                // Major Chord Arpeggio (C4-E4-G4) for time advance
                [261.63, 329.63, 392.00].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + i * 0.12);
                    gain.gain.setValueAtTime(0.3, now + i * 0.12);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.8);
                    osc.start(now + i * 0.12);
                    osc.stop(now + i * 0.12 + 0.8);
                });
            } else if (type === 'news') {
                // Descending ding-dong doublet — F#5 → D5 (news flash feel)
                [739.99, 587.33].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + i * 0.18);
                    gain.gain.setValueAtTime(0, now + i * 0.18);
                    gain.gain.linearRampToValueAtTime(0.25, now + i * 0.18 + 0.03);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.55);
                    osc.start(now + i * 0.18);
                    osc.stop(now + i * 0.18 + 0.6);
                });
            } else {
                // Pleasant Chime (Harmonic Stack)
                const fundamental = 880; // A5
                const harmonics = [1, 1.5]; // Perfect Fifth

                harmonics.forEach((ratio, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(fundamental * ratio, now);

                    // Gentle Attack
                    gain.gain.setValueAtTime(0, now);
                    gain.gain.linearRampToValueAtTime(0.2 / (i + 1), now + 0.05); // Increased volume

                    // Long Decay
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

                    osc.start(now);
                    osc.stop(now + 1.2);
                });
            }
        } catch (e) { console.error("Audio play failed", e); }
    };

    const navigate = useNavigate();

    useEffect(() => {
        if (autoAdvanceEnabled && user?.role === 'admin') {
            timeRemainingRef.current = autoAdvanceMin * 60;
            setTimeRemainingDisplay(timeRemainingRef.current);
            autoAdvanceTimerRef.current = setInterval(() => {
                timeRemainingRef.current -= 1;
                setTimeRemainingDisplay(timeRemainingRef.current);
                if (timeRemainingRef.current <= 0) {
                    handleNextQuarter();
                    timeRemainingRef.current = autoAdvanceMin * 60;
                }
            }, 1000);
        } else {
            if (autoAdvanceTimerRef.current) {
                clearInterval(autoAdvanceTimerRef.current);
            }
        }
        return () => clearInterval(autoAdvanceTimerRef.current);
    }, [autoAdvanceEnabled, autoAdvanceMin, user?.role]);

    const fetchData = async () => {
        try {
            // setLoading(true); // Don't block UI on refresh
            const [userData, marketData, assetsData, portfolioData] = await Promise.all([
                getMe(),
                getMarketState(),
                getAssets(),
                getPortfolio()
            ]);
            setUser(userData);
            setMarketState(marketData);
            setAssets(assetsData.filter(a => a.ticker !== 'TBILL'));
            setPortfolio(portfolioData);

            // Check consent status for team users
            if (userData.role === 'team') {
                try {
                    const skipped = sessionStorage.getItem('econova_consent_skipped');
                    if (skipped) {
                        console.log("Consent hidden due to sessionStorage skip");
                        setHasConsented(true);
                    } else {
                        const consentStatus = await checkConsentStatus();
                        console.log("Consent API Status:", consentStatus);
                        setHasConsented(consentStatus.has_consented);
                    }
                } catch (err) {
                    console.error('Failed to check consent:', err);
                }
            }

            // Preserve selected asset across refreshes using ref
            if (selectedAssetTickerRef.current && assetsData.length > 0) {
                // Find the updated version of the currently selected asset
                const updatedAsset = assetsData.find(a => a.ticker === selectedAssetTickerRef.current);
                console.log('[Data Refresh] Preserving selection:', selectedAssetTickerRef.current, 'Found:', !!updatedAsset);
                if (updatedAsset) {
                    // Only update if the object reference changed (to avoid unnecessary re-renders)
                    setSelectedAsset(prev => {
                        if (!prev || prev.ticker !== updatedAsset.ticker) {
                            console.log('[Data Refresh] Ticker changed from', prev?.ticker, 'to', updatedAsset.ticker);
                            return updatedAsset;
                        }
                        // Update with fresh data but keep same ticker
                        return updatedAsset;
                    });
                }
            } else if (!selectedAssetTickerRef.current && assetsData.length > 0) {
                // Only set initial selection once
                const firstAsset = assetsData[0];
                console.log('[Initial Selection]', firstAsset.ticker);
                selectedAssetTickerRef.current = firstAsset.ticker; // Set ref FIRST
                setSelectedAsset(firstAsset);
                setOrder(prev => ({ ...prev, assetId: firstAsset.id }));
            }

            if (userData.role === 'admin') {
                const users = await getAdminUsers();
                setAdminUsers(users);
                try { const flagged = await getFlaggedTrades(); setFlaggedTrades(flagged); } catch (_) {}
                try { const cfg = await getAuctionConfig(); setAuctionConfigState(cfg || {}); } catch (_) {}
                if (!teamCapitalInput) {
                    setTeamCapitalInput(String(marketData?.team_starting_capital ?? 1000000));
                }
            }
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 401) {
                logout();
                navigate('/');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Dynamic polling: 3s when real-time is down, 15s when connected
        let interval = setInterval(fetchData, 3000);

        // Real-time connection (SSE → WS → fast polling)
        const cleanupRt = connectRealtime((msg) => {
            console.log('[RT] Event:', msg.type, msg.data);
            setLastUpdate(Date.now());

            let notifyTab = null;
            let soundType = 'standard';

            if (msg.type === 'bid_placed' || msg.type === 'auction_update') notifyTab = 'auction';
            if (msg.type === 'trade_executed') notifyTab = 'marketplace';
            if (msg.type === 'news_update') {
                notifyTab = 'news';
                const title = msg.data?.title || msg.data?.headline;
                if (title) {
                    playNotificationSound('news');
                    toast.info(`📰 ${title}`, { duration: 6000 });
                }
            }
            if (msg.type === 'auction_update') {
                const action = msg.data?.action || '';
                const ticker = msg.data?.ticker || '';
                if (action === 'opened') toast.info(`🔨 Auction opened: ${ticker}`, { duration: 4000 });
                else if (action === 'auction_ended' || action === 'closed') toast.info('🔨 Auction closed', { duration: 4000 });
                else if (action === 'lot_resolved') {
                    const msg2 = msg.data?.message || `Lot resolved`;
                    toast.success(`✅ ${msg2}`, { duration: 5000 });
                }
            }
            if (msg.type === 'market_update') {
                const action = msg.data?.action || '';
                if (action === 'loan_offered') {
                    const currentUser = user?.username;
                    const borrower = msg.data?.to;
                    const lender = msg.data?.from;
                    if (borrower === currentUser) {
                        notifyTab = 'credit';
                        playNotificationSound('standard');
                        toast.info(`💳 Loan offer received from ${lender} — check Credit Network`, { duration: 6000 });
                    } else if (lender === currentUser) {
                        notifyTab = 'credit';
                    }
                } else if (action.includes('loan') || action.includes('mortgage')) {
                    notifyTab = 'credit';
                }
                if (action === 'trade_pending_approval') {
                    notifyTab = 'admin_panel';
                    playNotificationSound('standard');
                }
                if (action.includes('mortgage') && action !== 'mortgage_repaid') {
                    if (user?.role === 'admin') { notifyTab = 'admin_panel'; playNotificationSound('standard'); }
                }
                if (action === 'quarter_advanced') {
                    soundType = 'time';
                    playNotificationSound('time');
                    const yr = msg.data?.year ?? '';
                    const q = msg.data?.quarter ?? '';
                    toast.success(`📅 Quarter advanced → Y${yr} Q${q}`, { duration: 5000 });
                } else if (action === 'year_advanced' || action.includes('year')) {
                    soundType = 'time';
                    playNotificationSound('time');
                    toast.success('📅 Year advanced', { duration: 5000 });
                } else if (action.includes('quarter')) {
                    soundType = 'time';
                    playNotificationSound('time');
                }
                if (action === 'dividend_issued') {
                    const tkr = msg.data?.ticker || '';
                    const amt = msg.data?.amount_per_unit;
                    toast.success(`💰 Dividend: ${tkr} +$${amt}/unit`, { duration: 6000 });
                }
                if (action === 'offer_created') {
                    const currentUser = user?.username;
                    const target = msg.data?.to;
                    if (!target || target === currentUser) {
                        notifyTab = 'marketplace';
                        playNotificationSound('standard');
                    }
                }
            }

            if (notifyTab && activeTab !== notifyTab) {
                setNotifications(prev => ({ ...prev, [notifyTab]: true }));
            }

            // bid_placed and news_update don't need a full 4-endpoint refresh:
            // auction lots poll independently every 3s; news doesn't affect portfolio/prices.
            // For state-changing events, debounce so rapid bursts collapse into one fetch.
            if (['market_update', 'auction_update', 'shock_triggered', 'trade_executed'].includes(msg.type)) {
                clearTimeout(fetchDebounceRef.current);
                fetchDebounceRef.current = setTimeout(fetchData, 300 + Math.random() * 1200);
            }
        }, (status) => {
            rtStatusRef.current = status;
            setRtStatus(status);
            // Adjust polling speed based on real-time connection health
            clearInterval(interval);
            if (status === 'connected') {
                interval = setInterval(fetchData, 15000); // Slow poll when connected
            } else {
                interval = setInterval(fetchData, 3000); // Fast poll when disconnected
            }
        });

        return () => {
            clearInterval(interval);
            cleanupRt();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Unlock AudioContext on first user interaction
    useEffect(() => {
        const unlockAudio = () => {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtxRef.current.state === 'suspended') {
                audioCtxRef.current.resume().then(() => {
                    console.log('AudioContext resumed');
                });
            }
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };

        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);

        return () => {
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const handleCreateTeam = async (e) => {
        e.preventDefault();
        try {
            await createTeamUser(newTeam.username, newTeam.password);
            toast.success(`Team ${newTeam.username} Created`);
            setNewTeam({ username: '', password: '' });
            fetchData();
        } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create team"); }
    };

    const handleFreeze = async (userId) => {
        try {
            await toggleFreezeUser(userId);
            toast.info("User status updated");
            fetchData();
        } catch (e) { toast.error("Failed to toggle freeze"); }
    };

    const handleOrderSubmit = async (e) => {
        e.preventDefault();
        const loadId = toast.loading("Processing order...");
        try {
            await placeOrder({
                asset_id: parseInt(order.assetId),
                type: order.type,
                quantity: parseInt(order.quantity),
                price: parseFloat(order.price)
            });
            toast.success("Order Placed", { id: loadId });
            setOrder(prev => ({ ...prev, quantity: '', price: '' }));
            fetchData();
        } catch (err) {
            toast.error('Order rejected', { description: err.response?.data?.detail || err.message, id: loadId });
        }
    };

    const handleNextTurn = async () => {
        const loadId = toast.loading("Advancing full year (4 quarters)...");
        try {
            const result = await nextTurn();
            await fetchData();
            toast.success(result.message || "Year Advanced", { id: loadId });
        } catch (err) {
            toast.error('Simulation error', { id: loadId });
        }
    };

    const handleNextQuarter = async () => {
        const loadId = toast.loading("Advancing quarter...");
        try {
            const result = await nextQuarter();
            await fetchData();
            toast.success(result.message || "Quarter Advanced", { id: loadId });
        } catch (err) {
            toast.error('Simulation error', { id: loadId });
        }
    };

    const handleShock = async (type, action) => {
        try {
            await triggerShock(type, action);
            toast.warning(`Shock Signal: ${type} ${action}`);
            fetchData();
        } catch (e) { toast.error("Failed to trigger shock"); }
    };

    const handleToggleTradeApproval = async () => {
        try {
            const res = await toggleTradeApproval();
            toast.info(res.message);
            fetchData();
        } catch (e) { toast.error('Failed to toggle trade approval mode'); }
    };

    const handleMigrateAssets = async () => {
        try {
            const res = await migrateAssets();
            toast.success(res.message);
            fetchData();
        } catch (e) { toast.error('Asset migration failed: ' + (e.response?.data?.detail || e.message)); }
    };

    const handleToggleCreditFacility = async () => {
        try {
            let res;
            if (marketState?.credit_facility_open) {
                res = await closeCreditFacility();
            } else {
                res = await openCreditFacility();
            }
            toast.info(res.message);
            fetchData();
        } catch (e) { toast.error('Failed to toggle credit facility'); }
    };

    // --- New handler functions ---
    const [dividendForm, setDividendForm] = useState({ ticker: 'GOLD', amount: '', note: '' });
    const [dividendLoading, setDividendLoading] = useState(false);

    const [resetConfirmText, setResetConfirmText] = useState('');
    const [showResetModal, setShowResetModal] = useState(false);
    const [auctionListModal, setAuctionListModal] = useState(null); // { ticker, maxQty }
    const [auctionListForm, setAuctionListForm] = useState({ quantity: '', reservePrice: '' });

    const [settleConfirmText, setSettleConfirmText] = useState('');
    const [showSettleModal, setShowSettleModal] = useState(false);
    const [settlementReport, setSettlementReport] = useState(null);

    const handleSettleAllDebts = async () => {
        if (settleConfirmText !== 'SETTLE') return;
        try {
            const res = await settleAllDebts();
            toast.success(res.message);
            setShowSettleModal(false);
            setSettleConfirmText('');
            setSettlementReport(res.report);
            fetchData();
        } catch (e) { toast.error('Settlement failed: ' + (e.response?.data?.detail || e.message)); }
    };

    const handleResetGame = async () => {
        if (resetConfirmText !== 'RESET') return;
        try {
            const res = await resetGame();
            toast.success(res.message);
            setShowResetModal(false);
            setResetConfirmText('');
            fetchData();
        } catch (e) { toast.error('Reset failed: ' + (e.response?.data?.detail || e.message)); }
    };

    const handleSeedHistory = async () => {
        try {
            const res = await seedHistory();
            toast.success(res.message);
            fetchData();
        } catch (e) { toast.error('Seed failed: ' + (e.response?.data?.detail || e.message)); }
    };

    const handleTriggerRecovery = async () => {
        try {
            const res = await triggerRecovery();
            toast.success(res.message);
            fetchData();
        } catch (e) { toast.error(e.response?.data?.detail || 'Failed to trigger recovery'); }
    };

    const handleResetShock = async () => {
        try {
            const res = await resetShock();
            toast.info(res.message);
            fetchData();
        } catch (e) { toast.error('Failed to reset shock'); }
    };

    const handleSetSentiment = async (sentiment) => {
        try {
            const res = await setSentiment(sentiment);
            toast.info(res.message);
            fetchData();
        } catch (e) { toast.error('Failed to set sentiment'); }
    };

    const handleSetInterestRate = async (level) => {
        try {
            const res = await setInterestRate(level);
            toast.info(res.message);
            fetchData();
        } catch (e) { toast.error('Failed to set interest rate'); }
    };

    const handleToggleBots = async () => {
        try {
            const res = await toggleBots();
            toast.info(res.message);
            fetchData();
        } catch (e) { toast.error('Failed to toggle bots'); }
    };

    const handleIssueDividend = async () => {
        const amt = parseFloat(dividendForm.amount);
        if (!amt || amt <= 0) { toast.error('Enter a valid dividend amount'); return; }
        setDividendLoading(true);
        try {
            const res = await issueDividend(dividendForm.ticker, amt, dividendForm.note);
            toast.success(`Dividend issued: ${dividendForm.ticker} $${amt}/unit — $${res.total_paid?.toLocaleString()} paid to ${res.recipients} teams`);
            setDividendForm(f => ({ ...f, amount: '', note: '' }));
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Failed to issue dividend');
        } finally {
            setDividendLoading(false);
        }
    };

    const handleSubmitAuctionListing = async () => {
        const qty = parseInt(auctionListForm.quantity);
        const price = parseFloat(auctionListForm.reservePrice);
        if (!qty || qty <= 0 || !price || price <= 0) {
            toast.error('Enter valid quantity and reserve price');
            return;
        }
        try {
            const { submitSecondaryAuctionRequest } = await import('../services/api');
            const res = await submitSecondaryAuctionRequest(auctionListModal.ticker, qty, price);
            toast.success(res.message);
            setAuctionListModal(null);
            setAuctionListForm({ quantity: '', reservePrice: '' });
        } catch (e) { toast.error(e.response?.data?.detail || 'Failed to submit listing'); }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
            <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid #D1202F', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
            <div style={{ color: '#aaa', fontSize: '0.9rem' }}>Initializing Terminal...</div>
        </div>
    );

    if (!user) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', textAlign: 'center' }}>
            <div style={{ marginBottom: '1rem', color: '#D1202F' }}><ShieldAlert size={48} /></div>
            <h2>Connection Error</h2>
            <p style={{ color: '#666' }}>Unable to load user profile. The server might be offline.</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary" style={{ marginTop: '1rem' }}>Retry Connection</button>
            <button onClick={handleLogout} className="btn btn-secondary" style={{ marginTop: '0.5rem' }}>Back to Login</button>
        </div>
    );

    const sidebarItems = [
        { id: 'portfolio', label: 'PORTFOLIO', icon: Wallet },
        { id: 'news', label: 'NEWS', icon: Play },
        { id: 'marketplace', label: 'MARKETPLACE', icon: TrendingUp },
        { id: 'auction', label: 'AUCTION HALL', icon: Gavel },
        { id: 'secondary_mkt', label: 'SECONDARY MKT', icon: Gavel },
        { id: 'credit', label: 'CREDIT NETWORK', icon: Landmark },
        { id: 'analysis', label: 'ANALYSIS', icon: Activity },
    ];

    // Admin Items
    if (user.role === 'admin') {
        sidebarItems.push({ id: 'admin_panel', label: 'ADMIN CONTROL', icon: ShieldAlert });
    } else {
        sidebarItems.push({ id: 'settings', label: 'SETTINGS', icon: ShieldAlert });
    }

    // Show consent form if user hasn't consented
    if (!hasConsented && user.role === 'team') {
        return <ConsentForm onConsentAccepted={() => setHasConsented(true)} />;
    }

    return (
        <div className="animate-fade-in" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFFFF' }}>
            <Toaster position="bottom-right" richColors theme="light" />

            {/* Backend offline / reconnecting banner */}
            {rtStatus !== 'connected' && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
                    background: rtStatus === 'connecting' ? '#1D4ED8' : '#B91C1C',
                    color: '#FFF', padding: '0.4rem 1rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em',
                }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#FFF', animation: 'pulse 1s infinite' }} />
                    {rtStatus === 'connecting' ? 'CONNECTING TO SERVER…' : 'SERVER OFFLINE — RECONNECTING…'}
                    <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: '0.5rem' }}>
                        {rtStatus !== 'connecting' && '(your data is safe — page will auto-refresh when back)'}
                    </span>
                </div>
            )}

            {/* Public Leaderboard Overlay */}
            <AnimatePresence>
                {marketState?.leaderboard_visible && (
                    <PublicLeaderboard
                        user={user}
                        marketState={marketState}
                        onClose={() => {
                            toggleLeaderboard().then(() => fetchData()).catch(e => toast.error(e?.response?.data?.detail || 'Failed'));
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Secondary Auction Listing Modal */}
            {auctionListModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: '#FFF', border: '1px solid #E5E7EB', padding: '2rem', maxWidth: '420px', width: '90%' }}>
                        <h3 style={{ marginTop: 0, textTransform: 'uppercase' }}>List in Auction Hall</h3>
                        <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '1.5rem' }}>
                            List your <strong>{auctionListModal.ticker}</strong> shares for auction. Admin will review and activate the lot. You hold up to <strong>{auctionListModal.maxQty}</strong> shares.
                        </p>
                        <p style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '1rem' }}>
                            Proceeds: 20% capital gains tax on profit, or $500 listing fee if sold at a loss.
                        </p>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>QUANTITY (max {auctionListModal.maxQty})</label>
                            <input
                                type="number" min="1" max={auctionListModal.maxQty}
                                value={auctionListForm.quantity}
                                onChange={e => setAuctionListForm(f => ({ ...f, quantity: e.target.value }))}
                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #D1D5DB', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>RESERVE PRICE PER UNIT ($)</label>
                            <input
                                type="number" min="0.01" step="0.01"
                                value={auctionListForm.reservePrice}
                                onChange={e => setAuctionListForm(f => ({ ...f, reservePrice: e.target.value }))}
                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #D1D5DB', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={handleSubmitAuctionListing} style={{ flex: 1, padding: '0.6rem', fontWeight: 700, background: '#000', color: '#FFF', border: 'none', cursor: 'pointer' }}>
                                SUBMIT REQUEST
                            </button>
                            <button onClick={() => setAuctionListModal(null)} style={{ flex: 1, padding: '0.6rem', fontWeight: 700, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                                CANCEL
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Game Confirmation Modal */}
            {showResetModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: '#FFF', border: '2px solid #D1202F', padding: '2rem', maxWidth: '400px', width: '90%' }}>
                        <h3 style={{ color: '#D1202F', marginTop: 0, textTransform: 'uppercase' }}>⚠ Reset Game</h3>
                        <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '1.5rem' }}>
                            This will wipe <strong>all teams, holdings, loans, news, and history</strong>. Admin and banker accounts are preserved. Asset prices reset to base values.
                        </p>
                        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>Type <code>RESET</code> to confirm:</p>
                        <input
                            value={resetConfirmText}
                            onChange={e => setResetConfirmText(e.target.value.toUpperCase())}
                            placeholder="RESET"
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #D1202F', fontSize: '1rem', marginBottom: '1rem', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={handleResetGame}
                                disabled={resetConfirmText !== 'RESET'}
                                style={{ flex: 1, padding: '0.6rem', fontWeight: 700, background: resetConfirmText === 'RESET' ? '#D1202F' : '#E5E7EB', color: resetConfirmText === 'RESET' ? '#FFF' : '#9CA3AF', border: 'none', cursor: resetConfirmText === 'RESET' ? 'pointer' : 'not-allowed' }}
                            >
                                CONFIRM RESET
                            </button>
                            <button
                                onClick={() => { setShowResetModal(false); setResetConfirmText(''); }}
                                style={{ flex: 1, padding: '0.6rem', fontWeight: 700, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', cursor: 'pointer' }}
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settle All Debts Confirmation Modal */}
            {showSettleModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: '#FFF', border: '2px solid #000', padding: '2rem', maxWidth: '450px', width: '90%' }}>
                        <h3 style={{ color: '#000', marginTop: 0, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Gavel size={20} /> End of Game Settlement
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '1.5rem' }}>
                            This will force liquidate assets from any team with outstanding debt (whose cash cannot cover the loan). Lenders will be repaid proportionally. <strong>This action is irreversible.</strong>
                        </p>
                        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>Type <code>SETTLE</code> to execute:</p>
                        <input
                            value={settleConfirmText}
                            onChange={e => setSettleConfirmText(e.target.value.toUpperCase())}
                            placeholder="SETTLE"
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #000', fontSize: '1rem', marginBottom: '1rem', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={handleSettleAllDebts}
                                disabled={settleConfirmText !== 'SETTLE'}
                                style={{ flex: 1, padding: '0.6rem', fontWeight: 700, background: settleConfirmText === 'SETTLE' ? '#000' : '#E5E7EB', color: settleConfirmText === 'SETTLE' ? '#FFF' : '#9CA3AF', border: 'none', cursor: settleConfirmText === 'SETTLE' ? 'pointer' : 'not-allowed' }}
                            >
                                EXECUTE
                            </button>
                            <button
                                onClick={() => { setShowSettleModal(false); setSettleConfirmText(''); }}
                                style={{ flex: 1, padding: '0.6rem', fontWeight: 700, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', cursor: 'pointer' }}
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settlement Report Modal */}
            {settlementReport && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: '#FFF', border: '2px solid #059669', padding: '2rem', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3 style={{ color: '#059669', marginTop: 0, textTransform: 'uppercase' }}>✅ Settlement Report</h3>
                        
                        {settlementReport.length === 0 ? (
                            <p style={{ fontSize: '0.9rem' }}>No defaulting teams found. All loans are either covered by cash or no active loans exist.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                {settlementReport.map((r, i) => (
                                    <div key={i} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '1rem', borderRadius: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <strong style={{ fontSize: '1rem' }}>{r.team}</strong>
                                            <span style={{ color: r.shortfall > 0 ? '#D1202F' : '#059669', fontWeight: 700 }}>
                                                {r.shortfall > 0 ? `Shortfall: $${r.shortfall}` : 'Fully Settled'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            <div>Total Debt: <strong>${r.debt}</strong></div>
                                            <div>Asset / Cash Used: <strong>${r.cash_used}</strong></div>
                                        </div>
                                        {r.assets_sold.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.2rem' }}>Assets Liquidated:</div>
                                                <div style={{ fontSize: '0.8rem', background: '#FFF', border: '1px solid #E5E7EB', padding: '0.5rem' }}>
                                                    {r.assets_sold.map((s, idx) => (
                                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>{s.quantity}x {s.ticker} @ ${s.unit_price}</span>
                                                            <strong>${s.proceeds}</strong>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={() => setSettlementReport(null)}
                            style={{ width: '100%', padding: '0.6rem', fontWeight: 700, background: '#059669', color: '#FFF', border: 'none', cursor: 'pointer' }}
                        >
                            CLOSE REPORT
                        </button>
                    </div>
                </div>
            )}


            {/* 3.2 HEADER (Institutional Identity) */}
            <header style={{
                background: '#FFFFFF',
                borderBottom: '1px solid #000000',
                height: '75px',
                display: 'flex',
                alignItems: 'center',
                padding: '0 1rem',
                justifyContent: 'space-between',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img src={univLogo} alt="Mahindra University" style={{ height: '55px' }} />
                    <div style={{ height: '30px', width: '1px', background: '#000000' }}></div>
                    <div>
                        <h1 style={{ fontSize: '1.2rem', margin: 0, color: '#D1202F', lineHeight: 1, letterSpacing: '-0.02em' }}>ECONOVA</h1>
                        <span style={{ fontSize: '0.65rem', color: '#000000', letterSpacing: '0.05em', fontWeight: 500, textTransform: 'uppercase' }}>
                            &nbsp;Mahindra University
                        </span>
                    </div>
                </div>

                {/* Status/Clock Area & Club Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="mono-num" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                        YEAR {marketState?.current_year ?? '---'}{marketState?.current_quarter ? ` Q${marketState.current_quarter}` : ''}
                    </div>
                    {user?.role === 'admin' && (
                        <div style={{ border: '1px solid #D1202F', padding: '0.1rem 0.4rem', color: '#D1202F', fontSize: '0.7rem', fontWeight: 700 }}>ADMIN</div>
                    )}
                    <div style={{ height: '30px', width: '1px', background: '#E5E7EB' }}></div>
                    <img src={clubLogo} alt="Finance Club" style={{ height: '55px' }} />
                </div>
            </header>

            {/* Layout Grid */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* 3.3 SIDEBAR (Command Awareness) */}
                <aside style={{
                    width: '220px',
                    background: '#FFFFFF',
                    borderRight: '1px solid #E5E7EB',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '1.5rem 1rem',
                    paddingBottom: '2.5rem', /* Extra padding to ensure logout button doesn't hide behind iPad bottom edge */
                    flexShrink: 0,
                    overflowY: 'auto'
                }}>

                    {/* NEWS TICKER (Added) */}
                    {marketState?.news_feed && (
                        <div style={{
                            marginBottom: '2rem',
                            borderLeft: '4px solid #D1202F',
                            padding: '1rem',
                            background: '#FFF1F2',
                            fontSize: '0.85rem',
                            lineHeight: '1.4'
                        }}>
                            <div style={{
                                fontWeight: 800,
                                color: '#D1202F',
                                marginBottom: '0.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                <Zap size={14} fill="#D1202F" /> MARKET WIRE
                            </div>
                            <div style={{ fontFamily: "'Roboto Mono', monospace", color: '#000' }}>
                                {marketState.news_feed.toUpperCase()}
                            </div>
                        </div>
                    )}

                    {/* Status Block */}
                    <div style={{ marginBottom: '3rem' }}>
                        <div className="text-label" style={{ color: '#000', marginBottom: '0.5rem' }}>TERMINAL USER</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.2rem' }}>{user?.username}</div>
                        <div style={{ fontSize: '0.8rem', color: user?.is_frozen ? '#D1202F' : '#000' }}>
                            {user?.is_frozen ? 'STATUS: FROZEN' : 'STATUS: ACTIVE'}
                        </div>
                    </div>

                    <div style={{ marginBottom: '3rem' }}>
                        <div className="text-label" style={{ color: '#000' }}>LIQUIDITY</div>
                        <motion.div
                            key={user?.cash}
                            initial={{ scale: 0.95, opacity: 0.5 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="mono-num"
                            style={{ fontSize: '1.5rem', fontWeight: 700, color: '#000000' }}
                        >
                            ${user?.cash.toLocaleString()}
                        </motion.div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                            <span>DEBT LOAD</span>
                            <motion.span
                                key={user?.debt}
                                initial={{ opacity: 0.5 }}
                                animate={{ opacity: 1 }}
                                className="mono-num"
                                style={{ color: user?.debt > 0 ? '#D1202F' : '#000' }}
                            >
                                ${user?.debt.toLocaleString()}
                            </motion.span>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                        <div className="text-label" style={{ color: '#000', marginBottom: '0.5rem' }}>COMMANDS</div>
                        {sidebarItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setActiveTab(item.id);
                                    setNotifications(prev => ({ ...prev, [item.id]: false })); // Clear notification
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '0.75rem 1rem',
                                    background: activeTab === item.id ? '#D1202F' : 'transparent',
                                    color: activeTab === item.id ? '#FFFFFF' : '#000000',
                                    border: 'none',
                                    textAlign: 'left',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    borderRadius: '0', // Sharp corners as per strict spec
                                    transition: 'background 0.2s'
                                }}
                            >
                                <item.icon size={18} />
                                {item.label}
                                {notifications[item.id] && (
                                    <div style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: '#D1202F',
                                        boxShadow: '0 0 5px #D1202F',
                                        marginLeft: 'auto'
                                    }} />
                                )}
                            </button>
                        ))}
                    </nav>

                    {/* Footer Actions */}
                    <div style={{ marginTop: 'auto', borderTop: '1px solid #E5E7EB', paddingTop: '1.5rem' }}>
                        <button onClick={handleLogout} className="btn" style={{ width: '100%', justifyContent: 'flex-start', paddingLeft: 0, color: '#666' }}>
                            <LogOut size={16} style={{ marginRight: '10px' }} /> LOGOUT SESSION
                        </button>
                    </div>
                </aside>

                {/* MAIN CONTENT (Decisions) */}
                <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#F9FAFB' }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

                        {/* Admin Quick Controls Banner */}
                        {user?.role === 'admin' && activeTab !== 'admin_panel' && (
                            <div style={{ marginBottom: '1.5rem', border: '1px solid #D1202F', background: '#FFF', padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ color: '#D1202F', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>GOVERNANCE</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#F9FAFB', padding: '0.35rem 0.75rem', borderRadius: '4px', border: '1px solid #E5E7EB' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={autoAdvanceEnabled} onChange={e => setAutoAdvanceEnabled(e.target.checked)} style={{ accentColor: '#D1202F' }}/>
                                            AUTO-ADVANCE Q:
                                        </label>
                                        <input type="number" value={autoAdvanceMin} onChange={e => setAutoAdvanceMin(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '40px', padding: '0.1rem', fontSize: '0.7rem', border: '1px solid #CCC', textAlign: 'center' }} disabled={autoAdvanceEnabled} />
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>MIN</span>
                                        {autoAdvanceEnabled && (
                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#D1202F', marginLeft: '0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                                                {Math.floor(timeRemainingDisplay / 60)}:{(timeRemainingDisplay % 60).toString().padStart(2, '0')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button onClick={() => handleShock('INFLATION', 'CRASH')} style={{ background: '#D1202F', color: '#FFF', border: 'none', padding: '0.35rem 0.85rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '0.04em' }}>TRIGGER INFLATION</button>
                                    <button onClick={() => handleShock('RECESSION', 'CRASH')} style={{ background: '#D1202F', color: '#FFF', border: 'none', padding: '0.35rem 0.85rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '0.04em' }}>TRIGGER RECESSION</button>
                                    <button onClick={() => handleShock('INFLATION', 'HINT')} style={{ background: 'transparent', color: '#D1202F', border: '1.5px solid #D1202F', padding: '0.35rem 0.75rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>HINT INFLATION</button>
                                    <button onClick={() => handleShock('RECESSION', 'HINT')} style={{ background: 'transparent', color: '#D1202F', border: '1.5px solid #D1202F', padding: '0.35rem 0.75rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>HINT RECESSION</button>
                                    <div style={{ width: '1px', height: '22px', background: '#E5E7EB', flexShrink: 0 }} />
                                    <button onClick={handleTriggerRecovery} style={{ background: '#059669', color: '#FFF', border: 'none', padding: '0.35rem 0.75rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>RECOVERY</button>
                                    <button onClick={handleResetShock} style={{ background: 'transparent', color: '#6B7280', border: '1.5px solid #6B7280', padding: '0.35rem 0.75rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>RESET SHOCK</button>
                                    <div style={{ width: '1px', height: '22px', background: '#E5E7EB', flexShrink: 0 }} />
                                    {marketState?.sentiment && (
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '3px', background: marketState.sentiment === 'BULLISH' ? '#D1FAE5' : marketState.sentiment === 'BEARISH' ? '#FEE2E2' : '#F3F4F6', color: marketState.sentiment === 'BULLISH' ? '#059669' : marketState.sentiment === 'BEARISH' ? '#D1202F' : '#6B7280' }}>
                                            {marketState.sentiment === 'BULLISH' ? '😊' : marketState.sentiment === 'BEARISH' ? '😟' : '😐'} {marketState.sentiment}
                                        </span>
                                    )}
                                    <div style={{ width: '1px', height: '22px', background: '#E5E7EB', flexShrink: 0 }} />
                                    <button onClick={handleNextQuarter} style={{ background: 'transparent', color: '#000', border: '1.5px solid #000', padding: '0.35rem 0.85rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>ADVANCE Q</button>
                                    <button onClick={handleNextTurn} style={{ background: '#000', color: '#FFF', border: 'none', padding: '0.35rem 0.85rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>ADVANCE YEAR</button>
                                </div>
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                {activeTab === 'admin_panel' && (
                                    <div>
                                        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Admin Control Panel</h2>

                                        {/* Leaderboard */}
                                        <div style={{
                                            background: '#fff',
                                            border: '1px solid #f0f0f0',
                                            borderRadius: '16px',
                                            padding: '1.5rem',
                                            marginBottom: '2rem',
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
                                        }}>
                                            <AdminLeaderboard />
                                        </div>

                                        {/* Login Status Monitor */}
                                        <div style={{ marginBottom: '2rem' }}>
                                            <LoginStatus />
                                        </div>

                                        {/* New Admin Tools */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                                            <AdminPriceNudge />
                                            <AdminCredentials />
                                        </div>

                                        <div style={{ marginBottom: '2rem' }}>
                                            <DataExport />
                                        </div>

                                        {/* Trade Approval Toggle + Migration */}
                                        <div className="fintech-card" style={{ marginBottom: '2rem', background: '#FFF' }}>
                                            <div className="text-label" style={{ marginBottom: '1rem' }}>MARKET ACCESS CONTROLS</div>
                                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <button
                                                    id="toggle-trade-approval"
                                                    onClick={handleToggleTradeApproval}
                                                    style={{
                                                        padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.8rem',
                                                        border: '2px solid',
                                                        borderColor: marketState?.trade_requires_approval ? '#10B981' : '#6B7280',
                                                        background: marketState?.trade_requires_approval ? '#D1FAE5' : '#F3F4F6',
                                                        color: marketState?.trade_requires_approval ? '#059669' : '#374151',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {marketState?.trade_requires_approval ? '✅ TRADE APPROVAL: ON' : '⬜ TRADE APPROVAL: OFF'}
                                                </button>
                                                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                                    {marketState?.trade_requires_approval
                                                        ? 'All private trades require admin approval before execution.'
                                                        : 'Trades execute instantly when both parties agree.'}
                                                </span>
                                                <button
                                                    id="toggle-credit-facility"
                                                    onClick={handleToggleCreditFacility}
                                                    style={{
                                                        padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.8rem',
                                                        border: '2px solid',
                                                        borderColor: marketState?.credit_facility_open ? '#3B82F6' : '#6B7280',
                                                        background: marketState?.credit_facility_open ? '#DBEAFE' : '#F3F4F6',
                                                        color: marketState?.credit_facility_open ? '#1D4ED8' : '#374151',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {marketState?.credit_facility_open ? '✅ CREDIT FACILITY: OPEN' : '🔒 CREDIT FACILITY: LOCKED'}
                                                </button>
                                                <button
                                                    id="migrate-assets-btn"
                                                    onClick={handleMigrateAssets}
                                                    style={{
                                                        marginLeft: 'auto', padding: '0.5rem 0.9rem', fontSize: '0.75rem',
                                                        fontWeight: 700, border: '1px solid #9CA3AF',
                                                        background: '#F9FAFB', color: '#374151', cursor: 'pointer'
                                                    }}
                                                    title="One-time rename: TECH→NVDA, OIL→BRENT, REAL→REITS"
                                                >
                                                    MIGRATE ASSETS (1×)
                                                </button>
                                            </div>

                                            {/* Investor Sentiment Dial */}
                                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                                                <div className="text-label" style={{ marginBottom: '0.5rem' }}>INVESTOR SENTIMENT</div>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    {['BULLISH', 'NEUTRAL', 'BEARISH'].map(s => (
                                                        <button
                                                            key={s}
                                                            onClick={() => handleSetSentiment(s)}
                                                            style={{
                                                                padding: '0.4rem 0.9rem', fontWeight: 700, fontSize: '0.78rem',
                                                                cursor: 'pointer',
                                                                border: '2px solid',
                                                                borderColor: marketState?.sentiment === s ? (s === 'BULLISH' ? '#059669' : s === 'BEARISH' ? '#D1202F' : '#6B7280') : '#E5E7EB',
                                                                background: marketState?.sentiment === s ? (s === 'BULLISH' ? '#D1FAE5' : s === 'BEARISH' ? '#FEE2E2' : '#F3F4F6') : '#FFF',
                                                                color: marketState?.sentiment === s ? (s === 'BULLISH' ? '#059669' : s === 'BEARISH' ? '#D1202F' : '#374151') : '#9CA3AF',
                                                            }}
                                                        >
                                                            {s === 'BULLISH' ? '😊' : s === 'BEARISH' ? '😟' : '😐'} {s}
                                                        </button>
                                                    ))}
                                                    <span style={{ fontSize: '0.72rem', color: '#9CA3AF', marginLeft: '0.5rem' }}>Affects quarterly price growth</span>
                                                </div>
                                            </div>

                                            {/* Global Interest Rate Environment */}
                                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                                                <div className="text-label" style={{ marginBottom: '0.5rem' }}>INTEREST RATE ENVIRONMENT</div>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    {['LOW', 'NEUTRAL', 'HIGH'].map(lvl => (
                                                        <button
                                                            key={lvl}
                                                            onClick={() => handleSetInterestRate(lvl)}
                                                            style={{
                                                                padding: '0.4rem 0.9rem', fontWeight: 700, fontSize: '0.78rem',
                                                                cursor: 'pointer', border: '2px solid',
                                                                borderColor: marketState?.global_interest_rate === lvl ? (lvl === 'LOW' ? '#059669' : lvl === 'HIGH' ? '#D1202F' : '#6B7280') : '#E5E7EB',
                                                                background: marketState?.global_interest_rate === lvl ? (lvl === 'LOW' ? '#D1FAE5' : lvl === 'HIGH' ? '#FEE2E2' : '#F3F4F6') : '#FFF',
                                                                color: marketState?.global_interest_rate === lvl ? (lvl === 'LOW' ? '#059669' : lvl === 'HIGH' ? '#D1202F' : '#374151') : '#9CA3AF',
                                                            }}
                                                        >
                                                            {lvl === 'LOW' ? '📉' : lvl === 'HIGH' ? '📈' : '⚖️'} {lvl}
                                                        </button>
                                                    ))}
                                                    <span style={{ fontSize: '0.72rem', color: '#9CA3AF', marginLeft: '0.5rem' }}>
                                                        LOW → REITS+4%/NVDA+2% | HIGH → REITS-8%/NVDA-5%/GOLD+2%
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Market Maker Bots Toggle */}
                                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <button
                                                    onClick={handleToggleBots}
                                                    style={{
                                                        padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.8rem',
                                                        border: '2px solid',
                                                        borderColor: marketState?.bots_enabled ? '#8B5CF6' : '#6B7280',
                                                        background: marketState?.bots_enabled ? '#EDE9FE' : '#F3F4F6',
                                                        color: marketState?.bots_enabled ? '#7C3AED' : '#374151',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {marketState?.bots_enabled ? '🤖 MARKET MAKER BOTS: ON' : '🤖 MARKET MAKER BOTS: OFF'}
                                                </button>
                                                <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                                                    {marketState?.bots_enabled ? 'Value & contrarian bots active each quarter.' : 'Bots are idle.'}
                                                </span>
                                            </div>

                                            {/* Leaderboard Visibility Toggle */}
                                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <button
                                                    onClick={() => toggleLeaderboard().then(() => fetchData()).catch(e => toast.error(e?.response?.data?.detail || 'Failed'))}
                                                    style={{
                                                        padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.8rem',
                                                        border: '2px solid',
                                                        borderColor: marketState?.leaderboard_visible ? '#D1202F' : '#6B7280',
                                                        background: marketState?.leaderboard_visible ? '#FEE2E2' : '#F3F4F6',
                                                        color: marketState?.leaderboard_visible ? '#D1202F' : '#374151',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {marketState?.leaderboard_visible ? '📊 LEADERBOARD: VISIBLE' : '📊 LEADERBOARD: HIDDEN'}
                                                </button>
                                                <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                                                    {marketState?.leaderboard_visible ? 'All players can see the live leaderboard.' : 'Only admin sees rankings.'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Dividend Issuance */}
                                        <div className="fintech-card" style={{ marginBottom: '2rem', background: '#FFF' }}>
                                            <div className="text-label" style={{ marginBottom: '1rem' }}>ISSUE DIVIDEND</div>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '3px' }}>ASSET</label>
                                                    <select
                                                        value={dividendForm.ticker}
                                                        onChange={e => setDividendForm(f => ({ ...f, ticker: e.target.value }))}
                                                        style={{ padding: '0.45rem 0.75rem', border: '1px solid #D1D5DB', fontSize: '0.85rem', fontWeight: 700, background: '#FFF', cursor: 'pointer' }}
                                                    >
                                                        {['GOLD', 'NVDA', 'BRENT', 'REITS'].map(t => (
                                                            <option key={t} value={t}>{t}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div style={{ flex: 1, minWidth: '120px' }}>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '3px' }}>AMOUNT PER UNIT ($)</label>
                                                    <input
                                                        type="number" min="0.01" step="0.01"
                                                        value={dividendForm.amount}
                                                        onChange={e => setDividendForm(f => ({ ...f, amount: e.target.value }))}
                                                        placeholder="e.g. 5.00"
                                                        style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #D1D5DB', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                                    />
                                                </div>
                                                <div style={{ flex: 2, minWidth: '160px' }}>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '3px' }}>NOTE (optional)</label>
                                                    <input
                                                        type="text"
                                                        value={dividendForm.note}
                                                        onChange={e => setDividendForm(f => ({ ...f, note: e.target.value }))}
                                                        placeholder="Q2 earnings distribution..."
                                                        style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #D1D5DB', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleIssueDividend}
                                                    disabled={dividendLoading || !dividendForm.amount}
                                                    style={{
                                                        padding: '0.5rem 1.25rem', fontWeight: 700, fontSize: '0.82rem',
                                                        background: dividendLoading || !dividendForm.amount ? '#E5E7EB' : '#059669',
                                                        color: dividendLoading || !dividendForm.amount ? '#9CA3AF' : '#FFF',
                                                        border: 'none', cursor: dividendLoading || !dividendForm.amount ? 'not-allowed' : 'pointer',
                                                        whiteSpace: 'nowrap', flexShrink: 0
                                                    }}
                                                >
                                                    {dividendLoading ? 'ISSUING...' : '💰 ISSUE DIVIDEND'}
                                                </button>
                                            </div>
                                            <p style={{ fontSize: '0.7rem', color: '#9CA3AF', marginTop: '0.5rem', marginBottom: 0 }}>
                                                Pays amount × units held to every team holding {dividendForm.ticker}. Triggers a news announcement automatically.
                                            </p>
                                        </div>

                                        {/* Auction Lot Configuration — per-lot individual units */}
                                        <div className="fintech-card" style={{ marginBottom: '2rem', background: '#FFF' }}>
                                            <div className="text-label" style={{ marginBottom: '1rem' }}>AUCTION LOT CONFIGURATION</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                                                {['GOLD', 'NVDA', 'BRENT', 'REITS'].map(ticker => {
                                                    const defaultLots = { GOLD: [5,10,15,20], NVDA: [25,50,75,100], BRENT: [50,100,150,200], REITS: [3,5,8,10] };
                                                    const cfg = auctionConfig[ticker] || {};
                                                    const lots = cfg.lots || defaultLots[ticker];
                                                    return (
                                                        <div key={ticker} style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '0.75rem' }}>
                                                            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.5rem', color: '#111' }}>{ticker}</div>
                                                            {lots.map((units, idx) => (
                                                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                                                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#6B7280', minWidth: '32px' }}>L{idx + 1}</span>
                                                                    <input
                                                                        type="number" min="1"
                                                                        value={units}
                                                                        onChange={e => {
                                                                            const newLots = [...lots];
                                                                            newLots[idx] = parseInt(e.target.value) || 1;
                                                                            setAuctionConfigState(prev => ({ ...prev, [ticker]: { ...(prev[ticker] || {}), lots: newLots } }));
                                                                        }}
                                                                        style={{ flex: 1, padding: '0.2rem 0.4rem', border: '1px solid #D1D5DB', fontSize: '0.78rem' }}
                                                                    />
                                                                    <span style={{ fontSize: '0.6rem', color: '#9CA3AF' }}>units</span>
                                                                    {lots.length > 1 && (
                                                                        <button
                                                                            onClick={() => {
                                                                                const newLots = lots.filter((_, i) => i !== idx);
                                                                                setAuctionConfigState(prev => ({ ...prev, [ticker]: { ...(prev[ticker] || {}), lots: newLots } }));
                                                                            }}
                                                                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', padding: '0 4px' }}
                                                                        >×</button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                                                                <button
                                                                    onClick={() => {
                                                                        const last = lots[lots.length - 1] || 10;
                                                                        setAuctionConfigState(prev => ({ ...prev, [ticker]: { ...(prev[ticker] || {}), lots: [...lots, last] } }));
                                                                    }}
                                                                    style={{ flex: 1, padding: '0.25rem', background: '#F3F4F6', border: '1px solid #D1D5DB', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}
                                                                >+ ADD LOT</button>
                                                                <button
                                                                    onClick={() => {
                                                                        setAuctionConfig(ticker, lots)
                                                                            .then(() => toast.success(`${ticker} lot config saved`))
                                                                            .catch(e => toast.error(e?.response?.data?.detail || 'Failed'));
                                                                    }}
                                                                    style={{ flex: 1, padding: '0.25rem', background: '#000', color: '#FFF', border: 'none', fontWeight: 700, fontSize: '0.65rem', cursor: 'pointer' }}
                                                                >SAVE</button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Trade Approval Queue */}
                                        <div style={{ marginBottom: '2rem' }}>
                                            <AdminTradeApprovals lastUpdate={lastUpdate} />
                                        </div>

                                        {/* Loan Approval Queue */}
                                        <div style={{ marginBottom: '2rem' }}>
                                            <AdminLoanApprovals />
                                        </div>

                                        {/* Mortgage Approval Queue */}
                                        <div style={{ marginBottom: '2rem' }}>
                                            <AdminMortgageApprovals />
                                        </div>

                                        {/* Secondary Auction Listing Requests */}
                                        <div style={{ marginBottom: '2rem' }}>
                                            <AdminSecondaryAuction />
                                        </div>

                                        {/* Existing Team Management */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                            <TeamManagement teams={adminUsers} onUpdate={fetchData} />

                                            <div>
                                                <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Create Team</h2>
                                                <div className="fintech-card">
                                                    {/* Team starting capital */}
                                                    <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #E5E7EB' }}>
                                                        <label className="text-label">STARTING CAPITAL (per team)</label>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                            <input
                                                                className="input-field"
                                                                type="number" min="1000" step="50000"
                                                                value={teamCapitalInput}
                                                                onChange={e => setTeamCapitalInput(e.target.value)}
                                                                style={{ flex: 1 }}
                                                                placeholder="1000000"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const amt = parseFloat(teamCapitalInput);
                                                                    if (!amt || amt <= 0) return toast.error('Enter a valid amount');
                                                                    setTeamStartingCapital(amt)
                                                                        .then(() => toast.success(`Starting capital set to $${amt.toLocaleString()}`))
                                                                        .catch(e => toast.error(e?.response?.data?.detail || 'Failed'));
                                                                }}
                                                                style={{ padding: '0 1rem', background: '#000', color: '#FFF', border: 'none', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}
                                                            >
                                                                SET
                                                            </button>
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginTop: '3px' }}>
                                                            Current: ${(marketState?.team_starting_capital ?? 1000000).toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <form onSubmit={handleCreateTeam}>
                                                        <div style={{ marginBottom: '1rem' }}>
                                                            <label className="text-label">Team Name</label>
                                                            <input className="input-field" value={newTeam.username} onChange={e => setNewTeam({ ...newTeam, username: e.target.value })} />
                                                        </div>
                                                        <div style={{ marginBottom: '1rem' }}>
                                                            <label className="text-label">Password</label>
                                                            <input className="input-field" type="password" value={newTeam.password} onChange={e => setNewTeam({ ...newTeam, password: e.target.value })} />
                                                        </div>
                                                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>REGISTER TEAM</button>
                                                    </form>
                                                </div>

                                                <div style={{ marginTop: '2rem' }}>
                                                    <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Global Controls</h2>
                                                    <div className="fintech-card">
                                                        <button onClick={handleNextTurn} className="btn" style={{ width: '100%', background: '#000', color: '#FFF', marginBottom: '0.75rem' }}>ADVANCE FISCAL YEAR</button>
                                                        <button onClick={handleNextQuarter} className="btn" style={{ width: '100%', background: '#FFF', color: '#D1202F', border: '2px solid #D1202F', marginBottom: '0.75rem', fontWeight: 700 }}>ADVANCE QUARTER</button>
                                                        <button
                                                            onClick={handleSeedHistory}
                                                            disabled={marketState?.current_year > 0}
                                                            className="btn"
                                                            style={{ width: '100%', marginBottom: '0.75rem', background: marketState?.current_year > 0 ? '#E5E7EB' : '#059669', color: marketState?.current_year > 0 ? '#9CA3AF' : '#FFF', fontWeight: 700, cursor: marketState?.current_year > 0 ? 'not-allowed' : 'pointer' }}
                                                            title={marketState?.current_year > 0 ? 'Already seeded' : 'Load 2 years of price history + news'}
                                                        >
                                                            {marketState?.current_year > 0 ? '✅ HISTORY LOADED (Y' + marketState.current_year + ' Q' + marketState.current_quarter + ')' : '📈 LOAD GAME HISTORY'}
                                                        </button>
                                                        <button
                                                            onClick={() => setShowSettleModal(true)}
                                                            className="btn"
                                                            style={{ width: '100%', marginBottom: '1rem', background: '#000', color: '#FFF', border: '2px solid #000', fontWeight: 700 }}
                                                        >
                                                            ⚖️ SETTLE ALL DEBTS
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const base = import.meta.env.VITE_API_URL ||
                                                                        ((window.location.hostname.includes('onrender.com') || window.location.hostname.includes('vercel.app'))
                                                                            ? 'https://econova-backend-ybiq.onrender.com' : '');
                                                                    const res = await fetch(`${base}/admin/game/snapshot`, {
                                                                        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
                                                                    });
                                                                    if (!res.ok) throw new Error(res.statusText);
                                                                    const blob = await res.blob();
                                                                    const url = URL.createObjectURL(blob);
                                                                    const a = document.createElement('a');
                                                                    a.href = url;
                                                                    a.download = `econova_snapshot_${new Date().toISOString().slice(0,16).replace('T','_')}.json`;
                                                                    a.click();
                                                                    URL.revokeObjectURL(url);
                                                                } catch(e) { toast.error('Snapshot failed: ' + e.message); }
                                                            }}
                                                            className="btn"
                                                            style={{ width: '100%', marginBottom: '1rem', background: '#1D4ED8', color: '#FFF', border: '2px solid #1D4ED8', fontWeight: 700 }}
                                                        >
                                                            💾 DOWNLOAD SNAPSHOT
                                                        </button>
                                                        <button
                                                            onClick={() => setShowResetModal(true)}
                                                            className="btn"
                                                            style={{ width: '100%', marginBottom: '1rem', background: '#FFF', color: '#D1202F', border: '2px solid #D1202F', fontWeight: 700 }}
                                                        >
                                                            🔄 RESET GAME
                                                        </button>
                                                                            <div style={{ marginTop: '1.5rem', background: '#f8f9fa', padding: '1rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                                                    <h3 style={{ fontSize: '0.9rem', margin: 0, color: '#000', fontWeight: 600 }}>AUTO-ADVANCE QUARTER</h3>
                                                                                    <label className="toggle-switch">
                                                                                        <input type="checkbox" checked={autoAdvanceEnabled} onChange={(e) => setAutoAdvanceEnabled(e.target.checked)} />
                                                                                        <span className="slider round"></span>
                                                                                    </label>
                                                                                </div>
                                                                                {autoAdvanceEnabled && (
                                                                                    <div>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                                                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Interval (Minutes):</span>
                                                                                            <input type="number" min="1" max="60" value={autoAdvanceMin} onChange={(e) => setAutoAdvanceMin(parseInt(e.target.value) || 1)} style={{ width: '60px', padding: '0.25rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                                                                                        </div>
                                                                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#D1202F', textAlign: 'center' }}>
                                                                                            {Math.floor(timeRemainingDisplay / 60)}:{(timeRemainingDisplay % 60).toString().padStart(2, '0')}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                            <button onClick={() => handleShock('INFLATION', 'HINT')} className="btn btn-secondary">HINT INFLATION</button>
                                                            <button onClick={() => handleShock('RECESSION', 'HINT')} className="btn btn-secondary">HINT RECESSION</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Banker Approvals */}
                                        <div style={{ marginBottom: '2rem' }}>
                                            <AdminBankerApprovals />
                                        </div>

                                        {/* Banker Management */}
                                        <div style={{ marginBottom: '2rem' }}>
                                            <AdminBankerManagement />
                                        </div>

                                        {/* Flagged Trades */}
                                        {flaggedTrades.length > 0 && (
                                            <div style={{ marginBottom: '2rem' }}>
                                                <div className="fintech-card" style={{ background: '#FFF' }}>
                                                    <div className="text-label" style={{ marginBottom: '1rem', color: '#D1202F' }}>FLAGGED TRADES ({flaggedTrades.length})</div>
                                                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                                                        <thead>
                                                            <tr style={{ background: '#1A0000', color: '#FFF' }}>
                                                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#FFF' }}>BUYER</th>
                                                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#FFF' }}>SELLER</th>
                                                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#FFF' }}>ASSET</th>
                                                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#FFF' }}>QTY</th>
                                                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#FFF' }}>PRICE</th>
                                                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#FFF' }}>REASON</th>
                                                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#FFF' }}>TIME</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {flaggedTrades.map(t => (
                                                                <tr key={t.id} style={{ borderBottom: '1px solid #FEE2E2', background: '#FFF5F5' }}>
                                                                    <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{t.buyer}</td>
                                                                    <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{t.seller}</td>
                                                                    <td style={{ padding: '0.4rem 0.6rem' }}>{t.asset}</td>
                                                                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.quantity}</td>
                                                                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${t.price?.toFixed(2)}</td>
                                                                    <td style={{ padding: '0.4rem 0.6rem', color: '#D1202F', fontSize: '0.72rem' }}>{t.flag_reason}</td>
                                                                    <td style={{ padding: '0.4rem 0.6rem', color: '#888', fontSize: '0.7rem' }}>{new Date(t.timestamp).toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'portfolio' && (
                                    <div>
                                        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Portfolio Holdings</h2>
                                        <div className="fintech-card" style={{ padding: '0' }}>
                                            <table style={{ width: '100%' }}>
                                                <thead>
                                                    <tr style={{ background: '#000', color: '#FFF' }}>
                                                        <th style={{ color: '#FFF' }}>ASSET</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>POSITION</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>AVG COST</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>MARKET PRICE</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>MARKET VALUE</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>UNREALIZED P&L</th>
                                                        {user?.role === 'team' && <th style={{ color: '#FFF', textAlign: 'center' }}>ACTIONS</th>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {portfolio.length === 0 ? (
                                                        <tr><td colSpan={user?.role === 'team' ? 7 : 6} style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No active positions.</td></tr>
                                                    ) : (
                                                        portfolio.map(holding => (
                                                            <tr key={holding.ticker} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                                <td style={{ fontWeight: 600 }}>
                                                                    {holding.ticker}
                                                                    <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 400 }}>{holding.name}</div>
                                                                </td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>{holding.quantity}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>${holding.avg_cost.toFixed(2)}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>${holding.current_price.toFixed(2)}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>${holding.market_value.toFixed(2)}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right', color: holding.unrealized_pnl >= 0 ? '#10B981' : '#EF4444' }}>
                                                                    ${holding.unrealized_pnl >= 0 ? '+' : ''}{holding.unrealized_pnl.toFixed(2)}
                                                                </td>
                                                                {user?.role === 'team' && (
                                                                    <td style={{ textAlign: 'center' }}>
                                                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setActiveTab('marketplace');
                                                                                    setNotifications(prev => ({ ...prev, marketplace: false }));
                                                                                    // Pre-fill a buy intent
                                                                                    toast.info(`Navigate to Marketplace to BUY more ${holding.ticker}`);
                                                                                }}
                                                                                style={{
                                                                                    padding: '0.3rem 0.6rem', fontSize: '0.65rem', fontWeight: 700,
                                                                                    background: '#10B981', color: '#FFF', border: 'none', cursor: 'pointer',
                                                                                    letterSpacing: '0.03em'
                                                                                }}
                                                                            >
                                                                                BUY
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setAuctionListModal({ ticker: holding.ticker, maxQty: holding.quantity });
                                                                                    setAuctionListForm({ quantity: '', reservePrice: '' });
                                                                                }}
                                                                                style={{
                                                                                    padding: '0.3rem 0.6rem', fontSize: '0.65rem', fontWeight: 700,
                                                                                    background: '#EF4444', color: '#FFF', border: 'none', cursor: 'pointer',
                                                                                    letterSpacing: '0.03em'
                                                                                }}
                                                                            >
                                                                                SELL
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'marketplace' && (
                                    <div>
                                        {/* Admin Controls */}
                                        {user?.role === 'admin' && (
                                            <div className="fintech-card" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Activity size={20} color={marketState?.marketplace_open ? '#10B981' : '#EF4444'} />
                                                    <h3 style={{ margin: 0, textTransform: 'uppercase' }}>
                                                        MARKET STATUS: <span style={{ color: marketState?.marketplace_open ? '#10B981' : '#EF4444' }}>{marketState?.marketplace_open ? 'OPEN FOR TRADING' : 'CLOSED'}</span>
                                                    </h3>
                                                </div>
                                                <div style={{ display: 'flex', gap: '1rem' }}>
                                                    {!marketState?.marketplace_open ? (
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await openMarketplace();
                                                                    toast.success('Marketplace Opened');
                                                                    fetchData();
                                                                } catch (e) { toast.error('Failed to open market'); }
                                                            }}
                                                            className="btn"
                                                            style={{ background: '#10B981', color: '#FFF', fontWeight: 700 }}
                                                        >
                                                            OPEN MARKET
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await closeMarketplace();
                                                                    toast.success('Marketplace Closed');
                                                                    fetchData();
                                                                } catch (e) { toast.error('Failed to close market'); }
                                                            }}
                                                            className="btn"
                                                            style={{ background: '#EF4444', color: '#FFF', fontWeight: 700 }}
                                                        >
                                                            CLOSE MARKET
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                                            {/* Asset Price Lookup — Inline Dropdown */}
                                            <div className="fintech-card" style={{ background: '#FFF', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span className="text-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>LIVE PRICE</span>
                                                    <select
                                                        className="input-field mono-num"
                                                        value={selectedAssetTickerRef.current || selectedAsset?.ticker || ''}
                                                        onChange={e => {
                                                            const ticker = e.target.value;
                                                            const asset = assets.find(a => a.ticker === ticker);
                                                            selectedAssetTickerRef.current = ticker;
                                                            setSelectedAsset(asset);
                                                        }}
                                                        style={{ maxWidth: '220px', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                                                    >
                                                        {assets.map(a => <option key={a.ticker} value={a.ticker}>{a.ticker} — {a.name}</option>)}
                                                    </select>
                                                </div>
                                                {selectedAsset && (
                                                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'baseline' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>Market Price</div>
                                                            <div className="mono-num" style={{ fontSize: '1.4rem', fontWeight: 700 }}>${selectedAsset.current_price.toFixed(2)}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>Base Price</div>
                                                            <div className="mono-num" style={{ fontSize: '1rem', color: '#666' }}>${selectedAsset.base_price.toFixed(2)}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>Change</div>
                                                            <div className="mono-num" style={{
                                                                fontSize: '1rem', fontWeight: 600,
                                                                color: selectedAsset.current_price >= selectedAsset.base_price ? '#10B981' : '#EF4444'
                                                            }}>
                                                                {selectedAsset.current_price >= selectedAsset.base_price ? '+' : ''}
                                                                {(((selectedAsset.current_price - selectedAsset.base_price) / selectedAsset.base_price) * 100).toFixed(1)}%
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Private Trading Interface (Full Width) */}
                                            <PrivateTrading user={user} marketState={marketState} assets={assets} />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'auction' && (
                                    <AuctionHouse user={user} marketState={marketState} onUpdate={fetchData} lastUpdate={lastUpdate} />
                                )}

                                {activeTab === 'secondary_mkt' && (
                                    <SecondaryAuctionHall user={user} lastUpdate={lastUpdate} />
                                )}

                                {activeTab === 'credit' && (
                                    <CreditNetwork user={user} marketState={marketState} assets={assets} />
                                )}

                                {activeTab === 'news' && (
                                    <NewsTab user={user} marketState={marketState} />
                                )}

                                {activeTab === 'analysis' && (
                                    <div>
                                        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Institutional Analysis</h2>
                                        <div className="fintech-card">
                                            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                <select
                                                    className="input-field"
                                                    value={selectedAssetTickerRef.current || selectedAsset?.ticker || ''}
                                                    onChange={e => {
                                                        const ticker = e.target.value;
                                                        const asset = assets.find(a => a.ticker === ticker);
                                                        console.log('[User Selection] Ticker:', ticker);
                                                        selectedAssetTickerRef.current = ticker; // Set ref FIRST
                                                        setSelectedAsset(asset);
                                                    }}
                                                    style={{ maxWidth: '200px', borderRadius: 0 }}
                                                >
                                                    {assets.map(a => <option key={a.ticker} value={a.ticker}>{a.ticker}</option>)}
                                                </select>
                                            </div>
                                            {selectedAsset ? (
                                                <div>
                                                    <div style={{ marginBottom: '1rem', borderBottom: '1px solid #000', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                        <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{selectedAsset.name}</h3>
                                                        <span className="mono-num" style={{ fontSize: '1.2rem' }}>${selectedAsset.current_price.toFixed(2)}</span>
                                                    </div>
                                                    <div style={{ height: '350px', width: '100%', minHeight: '350px' }}>
                                                        <PriceChart asset={selectedAsset} lastUpdate={lastUpdate} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Select an asset to view analysis.</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'settings' && (
                                    <div>
                                        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Account Settings</h2>
                                        <div style={{ maxWidth: '600px' }}>
                                            <TeamPasswordChange />
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>

                    </div>
                </main>
            </div>
        </div >
    );
}
