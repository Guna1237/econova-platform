import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Landmark, Plus, DollarSign, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { getAllBankers, createBankerAccount, addBankerCapital, getAssets } from '../services/api';
import { toast } from 'sonner';

export default function AdminBankerManagement() {
    const [bankers, setBankers] = useState([]);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedBanker, setExpandedBanker] = useState(null);

    // Create form
    const [newBanker, setNewBanker] = useState({ username: '', password: '', capital: 10000000 });

    // Capital injection form
    const [capitalForm, setCapitalForm] = useState({ bankerId: null, amount: '', reason: '' });

    const fetchData = async () => {
        try {
            const [bankersData, assetsData] = await Promise.all([
                getAllBankers(), 
                getAssets()
            ]);
            setBankers(bankersData);
            setAssets(assetsData);
        } catch (err) {
            console.error('Failed to load banker data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const res = await createBankerAccount(newBanker.username, newBanker.password, newBanker.capital);
            toast.success(res.message);
            setNewBanker({ username: '', password: '', capital: 10000000 });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create banker');
        }
    };

    const handleAddCapital = async (bankerId) => {
        if (!capitalForm.amount || parseFloat(capitalForm.amount) <= 0) {
            toast.error('Enter a valid amount');
            return;
        }
        try {
            const res = await addBankerCapital(bankerId, parseFloat(capitalForm.amount), capitalForm.reason);
            toast.success(res.message);
            setCapitalForm({ bankerId: null, amount: '', reason: '' });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to add capital');
        }
    };


    if (loading) return (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
            <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} /> Loading banker data...
        </div>
    );

    return (
        <div>
            <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Landmark size={24} color="#1D4ED8" /> Banker Management
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', marginBottom: '2rem', maxWidth: '600px' }}>

                {/* Create Banker Account */}
                <div className="fintech-card" style={{ background: '#FFF' }}>
                    <div className="text-label" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={14} /> CREATE BANKER ACCOUNT
                    </div>
                    <form onSubmit={handleCreate}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className="text-label" style={{ fontSize: '0.7rem' }}>Username</label>
                            <input className="input-field" value={newBanker.username}
                                onChange={e => setNewBanker({ ...newBanker, username: e.target.value })}
                                placeholder="banker_name" />
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className="text-label" style={{ fontSize: '0.7rem' }}>Password</label>
                            <input className="input-field" type="password" value={newBanker.password}
                                onChange={e => setNewBanker({ ...newBanker, password: e.target.value })}
                                placeholder="min 8 chars, 1 uppercase, 1 digit" />
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className="text-label" style={{ fontSize: '0.7rem' }}>Initial Capital ($)</label>
                            <input className="input-field" type="number" value={newBanker.capital}
                                onChange={e => setNewBanker({ ...newBanker, capital: parseFloat(e.target.value) || 0 })}
                                placeholder="10000000" />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', background: '#1D4ED8' }}>
                            CREATE BANKER
                        </button>
                    </form>
                </div>
            </div>

            {/* Quick Stats Overview */}
            <div className="fintech-card" style={{ background: '#FFF', marginBottom: '2rem' }}>
                <div className="text-label" style={{ marginBottom: '1rem' }}>BANKING SYSTEM OVERVIEW</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>TOTAL BANKERS</div>
                        <div className="mono-num" style={{ fontSize: '2rem', fontWeight: 700 }}>{bankers.length}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>TOTAL CAPITAL</div>
                        <div className="mono-num" style={{ fontSize: '2rem', fontWeight: 700, color: '#1D4ED8' }}>
                            ${bankers.reduce((s, b) => s + b.total_capital, 0).toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>TOTAL FEES EARNED</div>
                        <div className="mono-num" style={{ fontSize: '2rem', fontWeight: 700, color: '#10B981' }}>
                            ${bankers.reduce((s, b) => s + b.total_fees_earned, 0).toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Banker Accounts Table */}
            <div className="fintech-card" style={{ padding: 0 }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="text-label" style={{ margin: 0 }}>BANKER ACCOUNTS ({bankers.length})</div>
                    <button onClick={fetchData} className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem' }}>
                        <RefreshCw size={12} />
                    </button>
                </div>

                {bankers.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#888' }}>No banker accounts. Create one above.</div>
                ) : (
                    bankers.map(banker => (
                        <div key={banker.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                            {/* Banker Row */}
                            <div
                                onClick={() => setExpandedBanker(expandedBanker === banker.id ? null : banker.id)}
                                style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
                                    padding: '1rem 1.5rem', cursor: 'pointer', alignItems: 'center',
                                    background: expandedBanker === banker.id ? '#F0F9FF' : 'transparent',
                                    transition: 'background 0.15s'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 700 }}>{banker.username}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#888' }}>ID: {banker.id}</div>
                                </div>
                                <div>
                                    <div className="text-label" style={{ fontSize: '0.65rem' }}>CASH</div>
                                    <div className="mono-num" style={{ fontWeight: 600 }}>${banker.cash.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-label" style={{ fontSize: '0.65rem' }}>TOTAL CAPITAL</div>
                                    <div className="mono-num" style={{ fontWeight: 600 }}>${banker.total_capital.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-label" style={{ fontSize: '0.65rem' }}>FEES EARNED</div>
                                    <div className="mono-num" style={{ fontWeight: 600, color: '#10B981' }}>${banker.total_fees_earned.toLocaleString()}</div>
                                </div>
                                <div>
                                    {expandedBanker === banker.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                            </div>

                            {/* Expanded Panel */}
                            {expandedBanker === banker.id && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    style={{ padding: '1rem 1.5rem 1.5rem', background: '#F8FAFC', overflow: 'hidden' }}
                                >
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                                        {/* Holdings */}
                                        <div>
                                            <div className="text-label" style={{ marginBottom: '0.5rem' }}>HOLDINGS</div>
                                            {banker.holdings.length === 0 ? (
                                                <div style={{ color: '#888', fontSize: '0.85rem' }}>No holdings yet. Wait for banker asset requests.</div>
                                            ) : (
                                                <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                                    <thead><tr style={{ background: '#F1F5F9' }}>
                                                        <th>ASSET</th><th style={{ textAlign: 'right' }}>TOTAL</th>
                                                    </tr></thead>
                                                    <tbody>
                                                        {banker.holdings.map(h => (
                                                            <tr key={h.ticker} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                                                <td style={{ fontWeight: 600, padding: '0.5rem 0' }}>{h.ticker}</td>
                                                                <td className="mono-num" style={{ textAlign: 'right' }}>{h.total}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>

                                        {/* Action Panels */}
                                        <div>
                                            {/* Add Capital */}
                                            <div style={{ border: '1px solid #E2E8F0', padding: '1rem', background: '#FFF' }}>
                                                <div className="text-label" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <DollarSign size={12} /> INJECT CAPITAL
                                                </div>
                                                <input
                                                    className="input-field" type="number" value={capitalForm.bankerId === banker.id ? capitalForm.amount : ''}
                                                    onFocus={() => setCapitalForm({ ...capitalForm, bankerId: banker.id })}
                                                    onChange={e => setCapitalForm({ ...capitalForm, bankerId: banker.id, amount: e.target.value })}
                                                    placeholder="Amount ($)" style={{ marginBottom: '0.5rem' }}
                                                />
                                                <input
                                                    className="input-field" value={capitalForm.bankerId === banker.id ? capitalForm.reason : ''}
                                                    onFocus={() => setCapitalForm({ ...capitalForm, bankerId: banker.id })}
                                                    onChange={e => setCapitalForm({ ...capitalForm, bankerId: banker.id, reason: e.target.value })}
                                                    placeholder="Reason (optional)" style={{ marginBottom: '0.75rem' }}
                                                />
                                                <button onClick={() => handleAddCapital(banker.id)}
                                                    className="btn btn-primary" style={{ width: '100%', fontSize: '0.8rem', background: '#1D4ED8' }}>
                                                    ADD CAPITAL
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
