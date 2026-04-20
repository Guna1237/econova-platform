import { useState } from 'react';
import { ShieldAlert, List, CheckSquare } from 'lucide-react';
import AdminLoanApprovals from '../components/AdminLoanApprovals';
import AdminMortgageApprovals from '../components/AdminMortgageApprovals';
import AdminTradeApprovals from '../components/AdminTradeApprovals';
import { logout } from '../services/api';
import univLogo from '../assets/ip.png';
import clubLogo from '../assets/image.png';

export default function SubAdminDashboard() {
    const [activeTab, setActiveTab] = useState('mortgages');

    const handleLogout = () => {
        logout();
        window.location.href = '/';
    };

    return (
        <div className="animate-fade-in" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFFFF' }}>
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
                        <div className="text-label" style={{ color: '#666', marginBottom: '1rem', letterSpacing: '0.1em' }}>APPROVAL QUEUES</div>
                        {[
                            { id: 'mortgages', label: 'MORTGAGES', icon: CheckSquare },
                            { id: 'loans', label: 'LOANS (CREDIT NET)', icon: List },
                            { id: 'trades', label: 'PRIVATE TRADES', icon: ShieldAlert }
                        ].map(item => (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
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
                                }}
                            >
                                <item.icon size={18} />
                                {item.label}
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
                        </h2>

                        {activeTab === 'mortgages' && <AdminMortgageApprovals />}
                        {activeTab === 'loans' && <AdminLoanApprovals />}
                        {activeTab === 'trades' && <AdminTradeApprovals />}
                    </div>
                </main>
            </div>
        </div>
    );
}
