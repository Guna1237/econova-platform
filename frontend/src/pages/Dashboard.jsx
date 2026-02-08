

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LogOut, TrendingUp, Wallet, Clock, Play, Activity, Layers, Search,
    ChevronRight, ArrowUpRight, ArrowDownRight, ShieldAlert, Gavel, Radio, Zap, Landmark
} from 'lucide-react';
import { getMarketState, getAssets, placeOrder, getMe, logout, nextTurn, triggerShock, getAdminUsers, toggleFreezeUser, createTeamUser, getPortfolio, checkConsentStatus, openMarketplace, closeMarketplace } from '../services/api';
import univLogo from '../assets/ip.png';
import clubLogo from '../assets/image.png';
import AuctionHouse from '../components/AuctionHouse';
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

    // Trading State
    const [order, setOrder] = useState({ assetId: '', type: 'buy', quantity: '', price: '' });
    const [selectedAsset, setSelectedAsset] = useState(null);
    const selectedAssetTickerRef = useRef(null); // Track selected ticker across refreshes

    const navigate = useNavigate();

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
            setAssets(assetsData);
            setPortfolio(portfolioData);

            // Check consent status for team users
            if (userData.role === 'team') {
                try {
                    const skipped = sessionStorage.getItem('econova_consent_skipped');
                    if (skipped) {
                        setHasConsented(true);
                    } else {
                        const consentStatus = await checkConsentStatus();
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
        const interval = setInterval(fetchData, 2000); // Faster polling (2s)
        return () => clearInterval(interval);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        } catch (e) { toast.error("Failed to create team"); }
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
        const loadId = toast.loading("Advancing market year...");
        try {
            await nextTurn();
            await fetchData();
            toast.success("Year Advanced", { id: loadId });
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
        { id: 'credit', label: 'CREDIT NETWORK', icon: Landmark },
        { id: 'analysis', label: 'ANALYSIS', icon: Activity },
    ];

    // Admin Items
    if (user.role === 'admin') {
        sidebarItems.push({ id: 'admin_panel', label: 'ADMIN CONTROL', icon: ShieldAlert });
    } else {
        // Team users get settings option
        sidebarItems.push({ id: 'settings', label: 'SETTINGS', icon: ShieldAlert });
    }

    // Show consent form if user hasn't consented
    if (!hasConsented && user.role === 'team') {
        return <ConsentForm onConsentAccepted={() => setHasConsented(true)} />;
    }

    return (
        <div className="animate-fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFFFF' }}>
            <Toaster position="bottom-right" richColors theme="light" />

            {/* 3.2 HEADER (Institutional Identity) */}
            <header style={{
                background: '#FFFFFF',
                borderBottom: '1px solid #000000',
                height: '65px',
                display: 'flex',
                alignItems: 'center',
                padding: '0 1rem',
                justifyContent: 'space-between',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img src={univLogo} alt="Mahindra University" style={{ height: '45px' }} />
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
                        YEAR {marketState?.current_year || '----'}
                    </div>
                    {user?.role === 'admin' && (
                        <div style={{ border: '1px solid #D1202F', padding: '0.1rem 0.4rem', color: '#D1202F', fontSize: '0.7rem', fontWeight: 700 }}>ADMIN</div>
                    )}
                    <div style={{ height: '30px', width: '1px', background: '#E5E7EB' }}></div>
                    <img src={clubLogo} alt="Finance Club" style={{ height: '45px' }} />
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
                                onClick={() => setActiveTab(item.id)}
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

                        {/* Admin Panel (If Applicable) */}
                        {user?.role === 'admin' && activeTab !== 'admin_panel' && (
                            <div style={{ marginBottom: '2rem', border: '1px solid #D1202F', background: '#FFF', padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, color: '#D1202F', textTransform: 'uppercase' }}>Governance Control</h3>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button onClick={() => handleShock('INFLATION', 'CRASH')} style={{ background: '#D1202F', color: 'white', border: 'none', padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.8rem' }}>TRIG. INFLATION</button>
                                        <button onClick={() => handleShock('RECESSION', 'CRASH')} style={{ background: '#D1202F', color: 'white', border: 'none', padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.8rem' }}>TRIG. RECESSION</button>
                                        <button onClick={handleNextTurn} style={{ border: '2px solid #000', background: 'transparent', padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.8rem' }}>ADVANCE YEAR</button>
                                    </div>
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

                                        {/* Existing Team Management */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                            <TeamManagement teams={adminUsers} onUpdate={fetchData} />

                                            <div>
                                                <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Create Team</h2>
                                                <div className="fintech-card">
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
                                                        <button onClick={handleNextTurn} className="btn" style={{ width: '100%', background: '#000', color: '#FFF', marginBottom: '1rem' }}>ADVANCE FISCAL YEAR</button>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                            <button onClick={() => handleShock('INFLATION', 'HINT')} className="btn btn-secondary">HINT INFLATION</button>
                                                            <button onClick={() => handleShock('RECESSION', 'HINT')} className="btn btn-secondary">HINT RECESSION</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
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
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {portfolio.length === 0 ? (
                                                        <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No active positions.</td></tr>
                                                    ) : (
                                                        portfolio.map(holding => (
                                                            <tr key={holding.ticker} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                                <td style={{ fontWeight: 600 }}>{holding.ticker}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>{holding.quantity}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>${holding.avg_cost.toFixed(2)}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>${holding.current_price.toFixed(2)}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>${holding.market_value.toFixed(2)}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right', color: holding.unrealized_pnl >= 0 ? '#10B981' : '#EF4444' }}>
                                                                    ${holding.unrealized_pnl >= 0 ? '+' : ''}{holding.unrealized_pnl.toFixed(2)}
                                                                </td>
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
                                            {/* Private Trading Interface (Full Width) */}
                                            <PrivateTrading user={user} marketState={marketState} assets={assets} />

                                            {/* Market Reference (Order Book / Prices) - Optional, kept for reference */}
                                            <div>
                                                <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Reference Prices</h2>
                                                <div className="fintech-card">
                                                    <table style={{ width: '100%' }}>
                                                        <thead>
                                                            <tr style={{ background: '#F9FAFB', textAlign: 'left' }}>
                                                                <th style={{ padding: '0.5rem' }}>ASSET</th>
                                                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>PRICE</th>
                                                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>CHANGE</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {assets.map(a => (
                                                                <tr key={a.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{a.ticker}</td>
                                                                    <td className="mono-num" style={{ padding: '0.5rem', textAlign: 'right' }}>${a.current_price.toFixed(2)}</td>
                                                                    <td className="mono-num" style={{ padding: '0.5rem', textAlign: 'right', color: '#666' }}>--</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'auction' && (
                                    <AuctionHouse user={user} marketState={marketState} onUpdate={fetchData} />
                                )}

                                {activeTab === 'credit' && (
                                    <CreditNetwork user={user} />
                                )}

                                {activeTab === 'news' && (
                                    <NewsTab user={user} />
                                )}

                                {activeTab === 'news' && (
                                    <NewsTab user={user} />
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
                                                        <PriceChart asset={selectedAsset} />
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
        </div>
    );
}
