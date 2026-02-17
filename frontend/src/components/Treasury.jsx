import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, TrendingUp, DollarSign, Activity, Lock, ArrowRight, ArrowLeft } from 'lucide-react';
import { getTreasuryInfo, buyTBills, sellTBills } from '../services/api';
import { toast } from 'sonner';

export default function Treasury({ user, onUpdate }) {
    const [info, setInfo] = useState(null);
    const [quantity, setQuantity] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchInfo = useCallback(async () => {
        try {
            const data = await getTreasuryInfo();
            setInfo(data);
        } catch (e) {
            console.error('Failed to load treasury info:', e);
        }
    }, []);

    useEffect(() => {
        fetchInfo();
        const interval = setInterval(fetchInfo, 5000);
        return () => clearInterval(interval);
    }, [fetchInfo]);

    const handleBuy = async () => {
        const qty = parseInt(quantity);
        if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
        try {
            setLoading(true);
            const res = await buyTBills(qty);
            toast.success(res.message);
            setQuantity('');
            fetchInfo();
            onUpdate?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Purchase failed');
        } finally { setLoading(false); }
    };

    const handleSell = async () => {
        const qty = parseInt(quantity);
        if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
        try {
            setLoading(true);
            const res = await sellTBills(qty);
            toast.success(res.message);
            setQuantity('');
            fetchInfo();
            onUpdate?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Sale failed');
        } finally { setLoading(false); }
    };

    if (!info) return <div className="fintech-card" style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Loading Treasury Data...</div>;

    const totalCost = quantity && parseInt(quantity) > 0 ? (parseInt(quantity) * info.current_price) : 0;
    const canAfford = user.cash >= totalCost;
    const maxBuy = Math.floor(user.cash / info.current_price);

    return (
        <div className="animate-fade-in">
            {/* Header Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <Shield size={32} color="#D1202F" strokeWidth={1.5} />
                        Federal Treasury
                    </h2>
                    <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '1rem', maxWidth: '600px' }}>
                        Acquire risk-free government securities. Treasury Bills guarantee a fixed annual yield backed by the central bank.
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="text-label" style={{ marginBottom: '0.25rem' }}>CURRENT YIELD</div>
                    <div className="mono-num" style={{ fontSize: '2.5rem', fontWeight: 700, color: '#D1202F', lineHeight: 1 }}>
                        {info.annual_yield.toFixed(2)}%
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>

                {/* Left Column: Trading Interface */}
                <div>
                    <div className="fintech-card" style={{ padding: '2rem', borderTop: '4px solid #D1202F' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <div className="text-label" style={{ fontSize: '0.9rem' }}>ACTION REQUIRED</div>
                            <div className="mono-num" style={{ fontSize: '1rem', color: '#666' }}>
                                BALANCE: ${user.cash.toFixed(2)}
                            </div>
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <label className="text-label" style={{ display: 'block', marginBottom: '0.75rem' }}>QUANTITY</label>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <input
                                    type="number"
                                    className="input-field mono-num"
                                    style={{
                                        fontSize: '1.5rem',
                                        fontWeight: 700,
                                        flex: 1,
                                        padding: '1rem',
                                        border: '1px solid #E5E7EB',
                                        borderRadius: 0
                                    }}
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    placeholder="0"
                                    min="1"
                                />
                                {quantity && parseInt(quantity) > 0 && (
                                    <div style={{
                                        padding: '0 1.5rem',
                                        background: '#F9FAFB',
                                        border: '1px solid #E5E7EB',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        minWidth: '150px'
                                    }}>
                                        <div className="text-label" style={{ fontSize: '0.7rem' }}>TOTAL COST</div>
                                        <div className="mono-num" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                                            ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Quick Selectors */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                {[10, 50, 100, 500, 'MAX'].map(q => (
                                    <button
                                        key={q}
                                        onClick={() => setQuantity(q === 'MAX' ? maxBuy.toString() : q.toString())}
                                        style={{
                                            background: '#F3F4F6',
                                            border: 'none',
                                            padding: '0.4rem 0.8rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            color: '#374151',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseOver={e => e.target.style.background = '#E5E7EB'}
                                        onMouseOut={e => e.target.style.background = '#F3F4F6'}
                                    >
                                        {q === 'MAX' ? 'MAX ALLOCATION' : `+${q}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <button
                                onClick={handleBuy}
                                disabled={loading || !quantity || parseInt(quantity) <= 0 || !canAfford}
                                className="btn"
                                style={{
                                    background: canAfford ? '#D1202F' : '#E5E7EB',
                                    color: canAfford ? '#FFF' : '#9CA3AF',
                                    border: 'none',
                                    padding: '1rem',
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    cursor: canAfford ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                {loading ? 'PROCESSING...' : 'ACQUIRE ASSETS'} <ArrowRight size={18} />
                            </button>

                            <button
                                onClick={handleSell}
                                disabled={loading || !quantity || parseInt(quantity) <= 0 || info.user_holdings < parseInt(quantity || 0)}
                                className="btn"
                                style={{
                                    background: 'transparent',
                                    color: info.user_holdings >= parseInt(quantity || 0) ? '#000' : '#E5E7EB',
                                    border: '2px solid #000',
                                    borderColor: info.user_holdings >= parseInt(quantity || 0) ? '#000' : '#E5E7EB',
                                    padding: '1rem',
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    cursor: info.user_holdings >= parseInt(quantity || 0) ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <ArrowLeft size={18} /> LIQUIDATE
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Column: Holdings & Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="fintech-card" style={{ background: '#111', color: '#FFF' }}>
                        <div className="text-label" style={{ color: '#9CA3AF', marginBottom: '1.5rem' }}>PORTFOLIO EXPOSURE</div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <div className="text-label" style={{ color: '#6B7280', fontSize: '0.7rem' }}>TOTAL UNITS HELD</div>
                            <div className="mono-num" style={{ fontSize: '2.5rem', fontWeight: 700 }}>
                                {info.user_holdings.toLocaleString()}
                            </div>
                        </div>

                        <div>
                            <div className="text-label" style={{ color: '#6B7280', fontSize: '0.7rem' }}>MARKET VALUE</div>
                            <div className="mono-num" style={{ fontSize: '1.5rem', color: '#D1202F' }}>
                                ${info.user_holdings_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>

                    <div className="fintech-card" style={{ background: '#FFF' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <Lock size={20} color="#666" style={{ marginTop: '0.2rem' }} />
                            <div>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', textTransform: 'uppercase' }}>Security Information</h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#666', lineHeight: 1.5 }}>
                                    Treasury Bills (T-Bills) are short-term government debt obligations backed by the full faith and credit of the central government. They serve as a primary instrument for risk-free capital preservation.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
