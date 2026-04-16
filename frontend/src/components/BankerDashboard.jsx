import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Landmark, Users, DollarSign, Search, ChevronRight,
    ArrowUpRight, ArrowDownRight, ShieldAlert, FileText, RefreshCw,
    LogOut, Zap, Clock, AlertTriangle, Shield, Wallet, Activity, X, List
} from 'lucide-react';
import {
    getBankerDashboard, getBankerTeams, getBankerTeamOverview,
    bankerRequestAssets, bankerRequestBailout, getBankerOwnRequests,
    getBankerTransactions,
    getBailoutHistory, getMarketState, getAssets, logout, connectRealtime
} from '../services/api';
import { Toaster, toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import AdminMortgageApprovals from './AdminMortgageApprovals';
import AdminLoanApprovals from './AdminLoanApprovals';
import AdminTradeApprovals from './AdminTradeApprovals';
import univLogo from '../assets/ip.png';
import clubLogo from '../assets/image.png';

export default function BankerDashboard() {
    const [dashboard, setDashboard] = useState(null);
    const [teams, setTeams] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [bailouts, setBailouts] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    const [marketState, setMarketState] = useState(null);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [teamDetail, setTeamDetail] = useState(null);
    const [teamDetailLoading, setTeamDetailLoading] = useState(false);

    // Request Forms State
    const [showAssetModal, setShowAssetModal] = useState(false);
    const [assetForm, setAssetForm] = useState({ ticker: '', quantity: '', reason: '' });

    

    const [showBailoutModal, setShowBailoutModal] = useState(false);
    const [bailoutForm, setBailoutForm] = useState({ teamId: null, teamName: '', amount: '', terms: '', interestRate: 2.0, unfreeze: true });

    const navigate = useNavigate();
    const rtStatusRef = useRef('disconnected');

    const fetchData = async () => {
        try {
            const [dashData, teamsData, txnData, bailoutData, reqData, mktState, assetsData] = await Promise.all([
                getBankerDashboard(),
                getBankerTeams(),
                getBankerTransactions(),
                getBailoutHistory(),
                getBankerOwnRequests(),
                getMarketState(),
                getAssets()
            ]);
            setDashboard(dashData);
            setTeams(teamsData);
            setTransactions(txnData);
            setBailouts(bailoutData);
            setMyRequests(reqData);
            setMarketState(mktState);
            setAssets(assetsData);
        } catch (err) {
            console.error('Banker dashboard fetch error:', err);
            if (err.response?.status === 401 || err.response?.status === 403) {
                logout();
                navigate('/');
            }
        } finally {
            setLoading(false);
        }
    };

    const loadTeamDetail = async (teamId) => {
        setTeamDetailLoading(true);
        setSelectedTeam(teamId);
        try {
            const detail = await getBankerTeamOverview(teamId);
            setTeamDetail(detail);
        } catch (err) {
            toast.error('Failed to load team details');
        } finally {
            setTeamDetailLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        let interval = setInterval(fetchData, 5000);
        const cleanupRt = connectRealtime((msg) => {
            if (['market_update', 'trade_executed'].includes(msg.type)) fetchData();
        }, (status) => {
            rtStatusRef.current = status;
            clearInterval(interval);
            interval = setInterval(fetchData, status === 'connected' ? 15000 : 5000);
        });
        return () => { clearInterval(interval); cleanupRt(); };
    }, []);

    const handleLogout = () => { logout(); navigate('/'); };

    const handleAssetRequest = async () => {
        if (!assetForm.ticker || !assetForm.quantity || parseInt(assetForm.quantity) <= 0) {
            toast.error('Enter valid asset and quantity');
            return;
        }
        const loadId = toast.loading('Filing asset request...');
        try {
            await bankerRequestAssets(assetForm.ticker, parseInt(assetForm.quantity), assetForm.reason);
            toast.success('Asset request filed and pending admin approval', { id: loadId });
            setShowAssetModal(false);
            setAssetForm({ ticker: '', quantity: '', reason: '' });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Request failed', { id: loadId });
        }
    };

    const handleBailoutRequest = async () => {
        if (!bailoutForm.teamId || !bailoutForm.amount || parseFloat(bailoutForm.amount) <= 0) {
            toast.error('Enter a valid amount');
            return;
        }
        const loadId = toast.loading('Filing bailout request...');
        try {
            await bankerRequestBailout(
                bailoutForm.teamId,
                parseFloat(bailoutForm.amount),
                bailoutForm.terms,
                parseFloat(bailoutForm.interestRate),
                bailoutForm.unfreeze
            );
            toast.success('Bailout request filed and pending admin approval', { id: loadId });
            setShowBailoutModal(false);
            setBailoutForm({ teamId: null, teamName: '', amount: '', terms: '', interestRate: 2.0, unfreeze: true });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Request failed', { id: loadId });
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
            <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid #1D4ED8', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
            <div style={{ color: '#aaa', fontSize: '0.9rem' }}>Initializing Banking Terminal...</div>
        </div>
    );

    const sidebarItems = [
        { id: 'overview', label: 'OVERVIEW', icon: Wallet },
        { id: 'requests', label: 'MY REQUESTS', icon: List },
        { id: 'teams', label: 'TEAM MONITOR', icon: Users },
        { id: 'loans', label: 'LOAN APPROVALS', icon: FileText },
        { id: 'mortgages', label: 'MORTGAGE APPROVALS', icon: Landmark },
        { id: 'bailouts', label: 'BAILOUT LOGS', icon: Shield },
        { id: 'transactions', label: 'TRANSACTIONS', icon: Activity },
    ];

    const bankruptTeams = teams.filter(t => t.bankrupt);
    const requestableAssets = assets.filter(a => a.ticker !== 'TBILL');

    return (
        <div className="animate-fade-in" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFFFF' }}>
            <Toaster position="bottom-right" richColors theme="light" />

            {/* Header */}
            <header style={{
                background: '#FFFFFF', borderBottom: '2px solid #1D4ED8', height: '75px',
                display: 'flex', alignItems: 'center', padding: '0 1rem', justifyContent: 'space-between', flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img src={univLogo} alt="Mahindra University" style={{ height: '55px' }} />
                    <div style={{ height: '30px', width: '1px', background: '#000000' }}></div>
                    <div>
                        <h1 style={{ fontSize: '1.2rem', margin: 0, color: '#1D4ED8', lineHeight: 1, letterSpacing: '-0.02em' }}>ECONOVA</h1>
                        <span style={{ fontSize: '0.65rem', color: '#000000', letterSpacing: '0.05em', fontWeight: 500, textTransform: 'uppercase' }}>
                            &nbsp;Banking Terminal
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="mono-num" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                        YEAR {marketState?.current_year ?? '---'}{marketState?.current_quarter ? ` Q${marketState.current_quarter}` : ''}
                    </div>
                    <div style={{ border: '1px solid #1D4ED8', padding: '0.1rem 0.4rem', color: '#1D4ED8', fontSize: '0.7rem', fontWeight: 700 }}>BANKER</div>
                    <div style={{ height: '30px', width: '1px', background: '#E5E7EB' }}></div>
                    <img src={clubLogo} alt="Finance Club" style={{ height: '55px' }} />
                </div>
            </header>

            {/* Layout Grid */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Sidebar */}
                <aside style={{
                    width: '220px', background: '#FFFFFF', borderRight: '1px solid #E5E7EB',
                    display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem', paddingBottom: '2.5rem',
                    flexShrink: 0, overflowY: 'auto'
                }}>
                    {/* Capital Summary */}
                    <div style={{ marginBottom: '3rem' }}>
                        <div className="text-label" style={{ color: '#000', marginBottom: '0.5rem' }}>BANKER</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.2rem' }}>{dashboard?.username}</div>
                        <div style={{ fontSize: '0.8rem', color: '#1D4ED8' }}>STATUS: ACTIVE</div>
                    </div>

                    <div style={{ marginBottom: '3rem' }}>
                        <div className="text-label" style={{ color: '#000' }}>CAPITAL</div>
                        <motion.div key={dashboard?.cash} initial={{ scale: 0.95, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }}
                            className="mono-num" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#000000' }}>
                            ${dashboard?.cash?.toLocaleString() || '0'}
                        </motion.div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                            <span>PORTFOLIO</span>
                            <span className="mono-num">${dashboard?.portfolio_value?.toLocaleString() || '0'}</span>
                        </div>
                    </div>

                    {/* Bankrupt Alert */}
                    {bankruptTeams.length > 0 && (
                        <div style={{
                            background: '#FEF2F2', border: '1px solid #FECACA', padding: '0.75rem',
                            marginBottom: '2rem', fontSize: '0.8rem'
                        }}>
                            <div style={{ fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.25rem' }}>
                                <AlertTriangle size={14} /> {bankruptTeams.length} BANKRUPT
                            </div>
                            {bankruptTeams.map(t => (
                                <div key={t.id} style={{ color: '#991B1B' }}>{t.username}</div>
                            ))}
                        </div>
                    )}

                    {/* Navigation */}
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                        <div className="text-label" style={{ color: '#000', marginBottom: '0.5rem' }}>COMMANDS</div>
                        {sidebarItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem',
                                    background: activeTab === item.id ? '#1D4ED8' : 'transparent',
                                    color: activeTab === item.id ? '#FFFFFF' : '#000000',
                                    border: 'none', textAlign: 'left', fontWeight: 600, cursor: 'pointer',
                                    borderRadius: '0', transition: 'background 0.2s'
                                }}
                            >
                                <item.icon size={18} />
                                {item.label}
                                {item.id === 'requests' && myRequests.filter(r => r.status === 'pending').length > 0 && (
                                    <div style={{
                                        width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B',
                                        boxShadow: '0 0 5px #F59E0B', marginLeft: 'auto'
                                    }} />
                                )}
                            </button>
                        ))}
                    </nav>

                    <div style={{ marginTop: 'auto', borderTop: '1px solid #E5E7EB', paddingTop: '1.5rem' }}>
                        <button onClick={handleLogout} className="btn" style={{ width: '100%', justifyContent: 'flex-start', paddingLeft: 0, color: '#666' }}>
                            <LogOut size={16} style={{ marginRight: '10px' }} /> LOGOUT SESSION
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#F9FAFB' }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                        <AnimatePresence mode="wait">
                            <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

                                {/* OVERVIEW TAB */}
                                {activeTab === 'overview' && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                            <h2 style={{ textTransform: 'uppercase', margin: 0 }}>Banking Overview</h2>
                                        </div>

                                        {/* KPI Cards */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                                            {[
                                                { label: 'TOTAL CAPITAL', value: `$${(dashboard?.total_capital || 0).toLocaleString()}`, icon: DollarSign, color: '#1D4ED8' },
                                                { label: 'BAILOUTS ISSUED', value: dashboard?.total_bailouts || 0, icon: Shield, color: '#10B981' },
                                                { label: 'ASSET POOL VALUE', value: `$${(dashboard?.portfolio_value || 0).toLocaleString()}`, icon: Wallet, color: '#7E22CE' },
                                                { label: 'BANKRUPT TEAMS', value: bankruptTeams.length, icon: AlertTriangle, color: '#F59E0B' }
                                            ].map((kpi, i) => (
                                                <motion.div key={kpi.label} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                                                    transition={{ delay: i * 0.1 }} className="fintech-card" style={{ background: '#FFF' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                        <div className="text-label">{kpi.label}</div>
                                                        <kpi.icon size={20} color={kpi.color} />
                                                    </div>
                                                    <div className="mono-num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{kpi.value}</div>
                                                </motion.div>
                                            ))}
                                        </div>

                                        {/* Holdings Table */}
                                        <div className="fintech-card" style={{ padding: 0, marginBottom: '2rem' }}>
                                            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #E5E7EB' }}>
                                                <div className="text-label" style={{ margin: 0 }}>ASSET HOLDINGS & LENDING POOL</div>
                                            </div>
                                            <table style={{ width: '100%' }}>
                                                <thead>
                                                    <tr style={{ background: '#1D4ED8', color: '#FFF' }}>
                                                        <th style={{ color: '#FFF' }}>ASSET</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>TOTAL</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>LENT OUT</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>AVAILABLE</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>PRICE</th>
                                                        <th style={{ color: '#FFF', textAlign: 'right' }}>MARKET VALUE</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(dashboard?.holdings || []).length === 0 ? (
                                                        <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No holdings. Use "Request Assets" to request shares from Admin.</td></tr>
                                                    ) : dashboard.holdings.map(h => (
                                                        <tr key={h.ticker} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                            <td style={{ fontWeight: 600 }}>{h.ticker}<div style={{ fontSize: '0.7rem', color: '#888' }}>{h.name}</div></td>
                                                            <td className="mono-num" style={{ textAlign: 'right' }}>{h.total_quantity}</td>
                                                            <td className="mono-num" style={{ textAlign: 'right', color: h.lent_out > 0 ? '#D1202F' : '#888' }}>{h.lent_out}</td>
                                                            <td className="mono-num" style={{ textAlign: 'right', color: '#10B981', fontWeight: 600 }}>{h.available}</td>
                                                            <td className="mono-num" style={{ textAlign: 'right' }}>${h.current_price.toFixed(2)}</td>
                                                            <td className="mono-num" style={{ textAlign: 'right' }}>${h.market_value.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* MY REQUESTS TAB */}
                                {activeTab === 'requests' && (
                                    <div>
                                        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>My Action Requests</h2>
                                        
                                        <div className="fintech-card" style={{ padding: 0 }}>
                                            <table style={{ width: '100%' }}>
                                                <thead>
                                                    <tr style={{ background: '#F9FAFB' }}>
                                                        <th>REQUEST TYPE</th>
                                                        <th>DETAILS</th>
                                                        <th style={{ textAlign: 'center' }}>STATUS</th>
                                                        <th>ADMIN NOTE</th>
                                                        <th>DATE</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {myRequests.length === 0 ? (
                                                        <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No requests filed.</td></tr>
                                                    ) : myRequests.map(req => (
                                                        <tr key={req.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                            <td>
                                                                <span style={{ 
                                                                    fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px',
                                                                    background: req.request_type === 'asset_request' ? '#DBEAFE' : '#FEE2E2',
                                                                    color: req.request_type === 'asset_request' ? '#1D4ED8' : '#B91C1C'
                                                                }}>
                                                                    {req.request_type.replace('_',' ').toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td style={{ fontSize: '0.85rem' }}>
                                                                {req.request_type === 'asset_request' && `Requesting ${req.quantity} shares of ${req.asset_ticker}`}
                                                                {req.request_type === 'bailout' && `Bailout $${req.bailout_amount?.toLocaleString()} for ${req.team_name}`}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                {req.status === 'pending' ? <span style={{ color: '#D97706', fontWeight: 700, fontSize: '0.8rem' }}>PENDING</span> : null}
                                                                {req.status === 'approved' ? <span style={{ color: '#10B981', fontWeight: 700, fontSize: '0.8rem' }}>APPROVED</span> : null}
                                                                {req.status === 'rejected' ? <span style={{ color: '#DC2626', fontWeight: 700, fontSize: '0.8rem' }}>REJECTED</span> : null}
                                                            </td>
                                                            <td style={{ fontSize: '0.8rem', color: '#666', fontStyle: req.admin_note ? 'italic' : 'normal' }}>
                                                                {req.admin_note || '—'}
                                                            </td>
                                                            <td style={{ fontSize: '0.8rem', color: '#888' }}>
                                                                {new Date(req.created_at).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* TEAMS MONITOR TAB */}
                                {activeTab === 'teams' && (
                                    <div>
                                        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Team Financial Monitor</h2>

                                        <div style={{ display: 'grid', gridTemplateColumns: selectedTeam ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
                                            {/* Teams List */}
                                            <div className="fintech-card" style={{ padding: 0 }}>
                                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #E5E7EB' }}>
                                                    <div className="text-label" style={{ margin: 0 }}>ALL TEAMS ({teams.length})</div>
                                                </div>
                                                <table style={{ width: '100%' }}>
                                                    <thead>
                                                        <tr style={{ background: '#F9FAFB' }}>
                                                            <th>TEAM</th>
                                                            <th style={{ textAlign: 'right' }}>NET WORTH</th>
                                                            <th style={{ textAlign: 'right' }}>CASH</th>
                                                            <th style={{ textAlign: 'center' }}>STATUS</th>
                                                            <th></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {teams.map(team => (
                                                            <tr key={team.id}
                                                                onClick={() => loadTeamDetail(team.id)}
                                                                style={{
                                                                    borderBottom: '1px solid #E5E7EB', cursor: 'pointer',
                                                                    background: selectedTeam === team.id ? '#EFF6FF' : 'transparent',
                                                                    transition: 'background 0.15s'
                                                                }}
                                                            >
                                                                <td style={{ fontWeight: 600 }}>
                                                                    {team.username}
                                                                </td>
                                                                <td className="mono-num" style={{ textAlign: 'right', color: team.net_worth >= 0 ? '#000' : '#DC2626', fontWeight: 700 }}>
                                                                    ${team.net_worth.toLocaleString()}
                                                                </td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>${team.cash.toLocaleString()}</td>
                                                                <td style={{ textAlign: 'center' }}>
                                                                    {team.bankrupt ? (
                                                                        <span style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem', fontWeight: 700, background: '#FEE2E2', color: '#991B1B' }}>BANKRUPT</span>
                                                                    ) : team.is_frozen ? (
                                                                        <span style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem', fontWeight: 700, background: '#FEF3C7', color: '#92400E' }}>FROZEN</span>
                                                                    ) : (
                                                                        <span style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem', fontWeight: 700, background: '#D1FAE5', color: '#065F46' }}>ACTIVE</span>
                                                                    )}
                                                                </td>
                                                                <td><ChevronRight size={14} color="#888" /></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Team Detail Panel */}
                                            {selectedTeam && (
                                                <div className="fintech-card" style={{ position: 'relative' }}>
                                                    <button onClick={() => { setSelectedTeam(null); setTeamDetail(null); }}
                                                        style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                        <X size={18} />
                                                    </button>

                                                    {teamDetailLoading ? (
                                                        <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
                                                            <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                                                            Loading...
                                                        </div>
                                                    ) : teamDetail && (
                                                        <div>
                                                            <h3 style={{ marginBottom: '0.5rem' }}>{teamDetail.username}</h3>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                                                <div><span className="text-label">CASH</span><div className="mono-num" style={{ fontWeight: 700 }}>${teamDetail.cash.toLocaleString()}</div></div>
                                                                <div><span className="text-label">NET WORTH</span><div className="mono-num" style={{ fontWeight: 700, color: teamDetail.net_worth >= 0 ? '#000' : '#DC2626' }}>${teamDetail.net_worth.toLocaleString()}</div></div>
                                                                <div><span className="text-label">DEBT</span><div className="mono-num" style={{ color: teamDetail.debt > 0 ? '#DC2626' : '#888' }}>${teamDetail.debt.toLocaleString()}</div></div>
                                                                <div><span className="text-label">STATUS</span><div style={{ fontWeight: 700, color: teamDetail.is_frozen ? '#DC2626' : '#10B981' }}>{teamDetail.is_frozen ? 'FROZEN' : 'ACTIVE'}</div></div>
                                                            </div>

                                                            {/* Holdings */}
                                                            <div className="text-label" style={{ marginBottom: '0.5rem' }}>HOLDINGS</div>
                                                            {teamDetail.holdings.length === 0 ? (
                                                                <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>No holdings.</div>
                                                            ) : (
                                                                <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                                                    <thead><tr style={{ background: '#F9FAFB' }}><th>ASSET</th><th style={{ textAlign: 'right' }}>QTY</th><th style={{ textAlign: 'right' }}>P&L</th></tr></thead>
                                                                    <tbody>
                                                                        {teamDetail.holdings.map(h => (
                                                                            <tr key={h.ticker} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                                                <td style={{ fontWeight: 600 }}>{h.ticker}</td>
                                                                                <td className="mono-num" style={{ textAlign: 'right' }}>{h.quantity}</td>
                                                                                <td className="mono-num" style={{ textAlign: 'right', color: h.unrealized_pnl >= 0 ? '#10B981' : '#EF4444' }}>
                                                                                    ${h.unrealized_pnl.toFixed(0)}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            )}

                                                            {/* Bailout Action */}
                                                            {(teamDetail.is_frozen || teamDetail.net_worth < 0) && (
                                                                <button
                                                                    onClick={() => {
                                                                        setBailoutForm({ teamId: selectedTeam, teamName: teamDetail.username, amount: '', terms: '', interestRate: 2.0, unfreeze: true });
                                                                        setShowBailoutModal(true);
                                                                    }}
                                                                    className="btn"
                                                                    style={{ width: '100%', background: '#D1202F', color: '#FFF', fontWeight: 700, marginTop: '0.5rem' }}
                                                                >
                                                                    <Shield size={16} style={{ marginRight: '0.5rem' }} /> FILE BAILOUT REQUEST
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'loans' && (
                                    <div style={{ marginBottom: '2rem' }}>
                                        <AdminLoanApprovals />
                                    </div>
                                )}

                                {activeTab === 'mortgages' && (
                                    <div style={{ marginBottom: '2rem' }}>
                                        <AdminMortgageApprovals />
                                    </div>
                                )}

                                {/* Bailout History */}
                                {activeTab === 'bailouts' && (
                                        <div className="fintech-card" style={{ padding: 0 }}>
                                            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #E5E7EB' }}>
                                                <div className="text-label" style={{ margin: 0 }}>BAILOUT HISTORY ({bailouts.length})</div>
                                            </div>
                                            <table style={{ width: '100%' }}>
                                                <thead>
                                                    <tr style={{ background: '#F9FAFB' }}>
                                                        <th>TEAM</th>
                                                        <th style={{ textAlign: 'right' }}>AMOUNT</th>
                                                        <th>TYPE</th>
                                                        <th>INTEREST RATE</th>
                                                        <th>TERMS</th>
                                                        <th>DATE</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bailouts.length === 0 ? (
                                                        <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No bailouts issued yet.</td></tr>
                                                    ) : bailouts.map(b => (
                                                        <tr key={b.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                            <td style={{ fontWeight: 600 }}>{b.team}</td>
                                                            <td className="mono-num" style={{ textAlign: 'right', fontWeight: 700 }}>${b.amount.toLocaleString()}</td>
                                                            <td style={{ fontSize: '0.8rem' }}>Institution Loan</td>
                                                            <td style={{ fontSize: '0.8rem', color: '#10B981' }}>{b.interest_rate ?? 2}% / Q</td>
                                                            <td style={{ fontSize: '0.8rem', color: '#666' }}>{b.terms || '—'}</td>
                                                            <td style={{ fontSize: '0.8rem', color: '#888' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                )}

                                {/* TRANSACTIONS TAB */}
                                {activeTab === 'transactions' && (
                                    <div>
                                        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Transaction Log</h2>
                                        <div className="fintech-card" style={{ padding: 0 }}>
                                            <table style={{ width: '100%' }}>
                                                <thead>
                                                    <tr style={{ background: '#F9FAFB' }}>
                                                        <th>TYPE</th>
                                                        <th>DETAILS</th>
                                                        <th>TIME</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {transactions.length === 0 ? (
                                                        <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No transactions yet.</td></tr>
                                                    ) : transactions.map(txn => (
                                                        <tr key={txn.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                            <td>
                                                                <span style={{
                                                                    padding: '0.15rem 0.4rem', fontSize: '0.7rem', fontWeight: 700,
                                                                    background: txn.action_type.includes('BAILOUT') ? '#FEF3C7' :
                                                                               txn.action_type.includes('INTEREST') ? '#D1FAE5' : '#F3F4F6',
                                                                    color: txn.action_type.includes('BAILOUT') ? '#92400E' :
                                                                           txn.action_type.includes('INTEREST') ? '#065F46' : '#374151'
                                                                }}>
                                                                    {txn.action_type}
                                                                </span>
                                                            </td>
                                                            <td style={{ fontSize: '0.85rem', color: '#555' }}>
                                                                {typeof txn.action_details === 'string'
                                                                    ? txn.action_details
                                                                    : JSON.stringify(txn.action_details)}
                                                            </td>
                                                            <td style={{ fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap' }}>
                                                                {new Date(txn.timestamp).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                            </motion.div>
                            </AnimatePresence>
                        </div>
                    </main>
            </div>

            {/* Asset Request Modal */}
            <AnimatePresence>
                {showAssetModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
                        onClick={() => setShowAssetModal(false)}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}
                            style={{ background: '#FFF', padding: '2rem', width: '480px', border: '2px solid #1D4ED8', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                            <h3 style={{ margin: '0 0 1.5rem 0', color: '#1D4ED8' }}>Request Asset Allocation</h3>
                            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1.5rem' }}>Submit a request to Admin for an injection of shares into your lending pool.</p>
                            
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">Asset</label>
                                <select className="input-field" value={assetForm.ticker} onChange={e => setAssetForm({ ...assetForm, ticker: e.target.value })} style={{ width: '100%' }}>
                                    <option value="">Select asset...</option>
                                    {requestableAssets.map(a => <option key={a.ticker} value={a.ticker}>{a.ticker} — {a.name}</option>)}
                                </select>
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">Quantity</label>
                                <input className="input-field" type="number" min="1" value={assetForm.quantity} onChange={e => setAssetForm({ ...assetForm, quantity: e.target.value })} placeholder="Number of shares" />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="text-label">Business Case / Reason (Optional)</label>
                                <textarea className="input-field" value={assetForm.reason} onChange={e => setAssetForm({ ...assetForm, reason: e.target.value })} style={{ width: '100%', minHeight: '60px' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button onClick={() => setShowAssetModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>CANCEL</button>
                                <button onClick={handleAssetRequest} className="btn" style={{ flex: 1, background: '#1D4ED8', color: '#FFF' }}>FILE REQUEST</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>



            {/* Bailout Modal */}
            <AnimatePresence>
                {showBailoutModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
                        onClick={() => setShowBailoutModal(false)}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}
                            style={{ background: '#FFF', padding: '2rem', width: '480px', border: '2px solid #D1202F', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                            <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#D1202F' }}>
                                <Shield size={20} /> Propose Team Bailout
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1.5rem' }}>Proposing a bailout loan for Team: <strong>{bailoutForm.teamName}</strong>. Admin must approve.</p>

                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">Injection Amount ($)</label>
                                <input className="input-field" type="number" min="1" value={bailoutForm.amount} onChange={e => setBailoutForm({ ...bailoutForm, amount: e.target.value })} placeholder="Cash amount" />
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">Quarterly Interest Rate (%)</label>
                                <input className="input-field" type="number" min="0" step="0.5" value={bailoutForm.interestRate} onChange={e => setBailoutForm({ ...bailoutForm, interestRate: e.target.value })} placeholder="2.0" />
                                <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.2rem' }}>Default is 2%.</div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">Bailout Terms (Optional Notes)</label>
                                <input className="input-field" value={bailoutForm.terms} onChange={e => setBailoutForm({ ...bailoutForm, terms: e.target.value })} placeholder="e.g., equity transfer, conditions" />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    <input type="checkbox" checked={bailoutForm.unfreeze} onChange={e => setBailoutForm({ ...bailoutForm, unfreeze: e.target.checked })} />
                                    Unfreeze team account upon approval
                                </label>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button onClick={() => setShowBailoutModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>CANCEL</button>
                                <button onClick={handleBailoutRequest} className="btn" style={{ flex: 1, background: '#D1202F', color: '#FFF' }}>SUBMIT PROPOSAL</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
