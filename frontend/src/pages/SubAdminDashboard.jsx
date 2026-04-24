import { useState, useEffect, useRef } from 'react';
import { ShieldAlert, List, CheckSquare, Activity } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import AdminLoanApprovals from '../components/AdminLoanApprovals';
import AdminMortgageApprovals from '../components/AdminMortgageApprovals';
import AdminTradeApprovals from '../components/AdminTradeApprovals';
import PriceChart from '../components/PriceChart';
import { logout, getAssets, connectRealtime } from '../services/api';
import univLogo from '../assets/ip.png';
import clubLogo from '../assets/image.png';

export default function SubAdminDashboard() {
    const [activeTab, setActiveTab] = useState('mortgages');
    const activeTabRef = useRef('mortgages');

    const [assets, setAssets] = useState([]);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [notifications, setNotifications] = useState({ mortgages: false, loans: false, trades: false });

    const refreshAssets = () => {
        getAssets().then(data => {
            setAssets(data);
            setSelectedAsset(prev => {
                if (!prev) return data[0] ?? null;
                return data.find(a => a.id === prev.id) ?? prev;
            });
        }).catch(() => {});
    };

    useEffect(() => {
        refreshAssets();

        const cleanup = connectRealtime((msg) => {
            setLastUpdate(Date.now());

            if (msg.type === 'market_update') {
                const action = msg.data?.action || '';

                if (action.includes('mortgage') && action !== 'mortgage_repaid') {
                    if (activeTabRef.current !== 'mortgages') {
                        setNotifications(p => ({ ...p, mortgages: true }));
                        toast.info('📋 Mortgage request pending approval');
                    }
                }
                if (action === 'loan_pending_approval') {
                    if (activeTabRef.current !== 'loans') {
                        setNotifications(p => ({ ...p, loans: true }));
                        toast.info('💳 Loan acceptance pending approval');
                    }
                }
                if (action === 'trade_pending_approval') {
                    if (activeTabRef.current !== 'trades') {
                        setNotifications(p => ({ ...p, trades: true }));
                        toast.info('🔄 Private trade pending approval');
                    }
                }
            }

            // Keep prices fresh on any market activity
            if (['market_update', 'bid_placed', 'auction_update', 'trade_executed'].includes(msg.type)) {
                refreshAssets();
            }
        });

        return cleanup;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTabClick = (tabId) => {
        setActiveTab(tabId);
        activeTabRef.current = tabId;
        setNotifications(p => ({ ...p, [tabId]: false }));
    };

    const handleLogout = () => {
        logout();
        window.location.href = '/';
    };

    const tabs = [
        { id: 'mortgages', label: 'MORTGAGES', icon: CheckSquare },
        { id: 'loans', label: 'LOANS (CREDIT NET)', icon: List },
        { id: 'trades', label: 'PRIVATE TRADES', icon: ShieldAlert },
        { id: 'analysis', label: 'MARKET ANALYSIS', icon: Activity },
    ];

    return (
        <div className="animate-fade-in" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFFFF' }}>
            <Toaster position="top-right" richColors />

            {/* Header */}
            <div style={{ background: '#D1202F', padding: '1rem 2rem', color: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderBottom: '4px solid #000' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img src={univLogo} alt="university" style={{ height: '36px', objectFit: 'contain' }} />
                    <img src={clubLogo} alt="club" style={{ height: '36px', objectFit: 'contain' }} />
                    <ShieldAlert size={28} />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.05em' }}>ECONOVA</h1>
                        <div style={{ fontSize: '0.75rem', letterSpacing: '0.15em', opacity: 0.9 }}>SUB-ADMIN PORTAL</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Logged in as</div>
                        <div style={{ fontWeight: 700 }}>SUB-ADMIN (Approvals)</div>
                    </div>
                    <button onClick={handleLogout} className="btn" style={{ background: '#000', color: '#FFF', border: '1px solid rgba(255,255,255,0.2)', padding: '0.5rem 1.5rem', fontWeight: 700 }}>
                        LOGOUT
                    </button>
                </div>
            </div>

            {/* Layout */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Sidebar */}
                <div style={{ width: '280px', background: '#000', color: '#FFF', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <div style={{ padding: '2rem 1.5rem' }}>
                        <div className="text-label" style={{ color: '#666', marginBottom: '1rem', letterSpacing: '0.1em' }}>NAVIGATION</div>
                        {tabs.map(item => (
                            <button
                                key={item.id}
                                onClick={() => handleTabClick(item.id)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '1rem',
                                    background: activeTab === item.id ? '#D1202F' : 'transparent',
                                    color: activeTab === item.id ? '#FFF' : '#A0AEC0',
                                    border: 'none',
                                    borderLeft: `4px solid ${activeTab === item.id ? '#FFF' : 'transparent'}`,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    marginBottom: '0.5rem',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                }}
                            >
                                <item.icon size={18} />
                                <span style={{ flex: 1 }}>{item.label}</span>
                                {notifications[item.id] && (
                                    <span style={{
                                        width: '8px', height: '8px',
                                        borderRadius: '50%',
                                        background: '#FBBF24',
                                        flexShrink: 0,
                                    }} />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                <main style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: '#F9FAFB' }}>
                    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                        <h2 style={{ marginBottom: '2rem', color: '#000', borderBottom: '2px solid #D1202F', paddingBottom: '0.5rem', display: 'inline-block' }}>
                            {activeTab === 'mortgages' && 'Mortgage Approval Queue'}
                            {activeTab === 'loans' && 'Loan Approval Queue'}
                            {activeTab === 'trades' && 'Trade Approval Queue'}
                            {activeTab === 'analysis' && 'Market Analysis'}
                        </h2>

                        {activeTab === 'mortgages' && <AdminMortgageApprovals />}
                        {activeTab === 'loans' && <AdminLoanApprovals />}
                        {activeTab === 'trades' && <AdminTradeApprovals />}

                        {activeTab === 'analysis' && (
                            <div>
                                {/* Live price tiles */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    {assets.map(a => (
                                        <button
                                            key={a.ticker}
                                            onClick={() => setSelectedAsset(a)}
                                            style={{
                                                background: selectedAsset?.id === a.id ? '#000' : '#FFF',
                                                color: selectedAsset?.id === a.id ? '#FFF' : '#000',
                                                border: `2px solid ${selectedAsset?.id === a.id ? '#000' : '#E5E7EB'}`,
                                                borderRadius: '4px',
                                                padding: '0.75rem 1rem',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '0.2rem', opacity: 0.65 }}>{a.ticker}</div>
                                            <div style={{ fontSize: '1.05rem', fontWeight: 900, fontFamily: 'monospace' }}>${a.current_price?.toFixed(2)}</div>
                                            <div style={{ fontSize: '0.65rem', opacity: 0.55, marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                                        </button>
                                    ))}
                                </div>

                                {/* Price chart for selected asset */}
                                {selectedAsset ? (
                                    <div className="fintech-card">
                                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #000', paddingBottom: '0.5rem' }}>
                                            <h3 style={{ margin: 0 }}>{selectedAsset.name}</h3>
                                            <span style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700 }}>
                                                ${selectedAsset.current_price?.toFixed(2)}
                                            </span>
                                        </div>
                                        <div style={{ height: '350px', width: '100%' }}>
                                            <PriceChart asset={selectedAsset} lastUpdate={lastUpdate} />
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                                        Select an asset above to view its price chart.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
