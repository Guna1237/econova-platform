import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, Check, X, Clock, RefreshCw } from 'lucide-react';
import { getAdminMortgageRequests, approveMortgage, rejectMortgage } from '../services/api';
import { toast } from 'sonner';

export default function AdminMortgageApprovals() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [adminNotes, setAdminNotes] = useState({});

    const fetchData = useCallback(async () => {
        try {
            const data = await getAdminMortgageRequests();
            setRequests(data);
        } catch (err) {
            console.error('Failed to load mortgage requests:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 8000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleApprove = async (id) => {
        setActionLoading(id);
        try {
            const res = await approveMortgage(id, adminNotes[id] || '');
            toast.success(res.message);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Approval failed');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (id) => {
        setActionLoading(id);
        try {
            const res = await rejectMortgage(id, adminNotes[id] || '');
            toast.success(res.message);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Rejection failed');
        } finally {
            setActionLoading(null);
        }
    };

    const pending = requests.filter(r => r.status === 'pending');
    const resolved = requests.filter(r => r.status !== 'pending');

    const statusColor = (status) => {
        switch (status) {
            case 'active': return '#3B82F6';
            case 'repaid': return '#10B981';
            case 'defaulted': return '#EF4444';
            case 'rejected': return '#6B7280';
            default: return '#F59E0B';
        }
    };

    return (
        <div className="fintech-card" style={{ background: '#FFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Shield size={22} color="#D1202F" />
                    <h3 style={{ margin: 0, textTransform: 'uppercase' }}>Emergency Mortgage Requests</h3>
                    {pending.length > 0 && (
                        <span style={{
                            background: '#FEF3C7', color: '#92400E', padding: '0.15rem 0.5rem',
                            fontSize: '0.7rem', fontWeight: 700
                        }}>
                            {pending.length} PENDING
                        </span>
                    )}
                </div>
                <button onClick={fetchData} className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem' }}>
                    <RefreshCw size={14} />
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading mortgage requests...</div>
            ) : requests.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No mortgage requests.</div>
            ) : (
                <>
                    {/* Pending Requests */}
                    {pending.length > 0 && (
                        <div style={{ marginBottom: '2rem' }}>
                            <div className="text-label" style={{ marginBottom: '0.75rem', color: '#D97706' }}>
                                <Clock size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} /> AWAITING APPROVAL
                            </div>
                            {pending.map(req => (
                                <motion.div
                                    key={req.id}
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    style={{
                                        border: '1px solid #FDE68A', background: '#FFFBEB',
                                        padding: '1.25rem', marginBottom: '1rem'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{req.borrower_username}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                                Pledging <strong>{req.collateral_quantity} {req.collateral_ticker}</strong> as collateral
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div className="mono-num" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                                                ${req.loan_amount?.toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#888' }}>LOAN AMOUNT (80% LTV)</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                        <div>
                                            <span className="text-label" style={{ fontSize: '0.65rem' }}>COLLATERAL VALUE</span>
                                            <div className="mono-num">${req.collateral_value_at_lock?.toLocaleString()}</div>
                                        </div>
                                        <div>
                                            <span className="text-label" style={{ fontSize: '0.65rem' }}>INTEREST RATE</span>
                                            <div className="mono-num" style={{ color: '#D1202F' }}>{req.interest_rate}% / Q</div>
                                        </div>
                                        <div>
                                            <span className="text-label" style={{ fontSize: '0.65rem' }}>MATURITY</span>
                                            <div className="mono-num">{req.maturity_quarters} Quarters</div>
                                        </div>
                                        <div>
                                            <span className="text-label" style={{ fontSize: '0.65rem' }}>TOTAL DUE AT MATURITY</span>
                                            <div className="mono-num" style={{ fontWeight: 700 }}>${req.total_due?.toLocaleString()}</div>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1rem' }}>
                                        <label className="text-label" style={{ fontSize: '0.65rem' }}>ADMIN NOTE (OPTIONAL)</label>
                                        <input
                                            className="input-field"
                                            value={adminNotes[req.id] || ''}
                                            onChange={e => setAdminNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                                            placeholder="Optional note..."
                                            style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button
                                            onClick={() => handleApprove(req.id)}
                                            disabled={actionLoading === req.id}
                                            className="btn"
                                            style={{
                                                flex: 1, background: '#10B981', color: '#FFF',
                                                fontWeight: 700, fontSize: '0.8rem'
                                            }}
                                        >
                                            <Check size={16} style={{ marginRight: '0.3rem' }} />
                                            {actionLoading === req.id ? 'PROCESSING...' : 'APPROVE & FUND'}
                                        </button>
                                        <button
                                            onClick={() => handleReject(req.id)}
                                            disabled={actionLoading === req.id}
                                            className="btn"
                                            style={{
                                                flex: 1, background: '#EF4444', color: '#FFF',
                                                fontWeight: 700, fontSize: '0.8rem'
                                            }}
                                        >
                                            <X size={16} style={{ marginRight: '0.3rem' }} /> REJECT
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* History */}
                    {resolved.length > 0 && (
                        <div>
                            <div className="text-label" style={{ marginBottom: '0.5rem' }}>HISTORY ({resolved.length})</div>
                            <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#F9FAFB' }}>
                                        <th>TEAM</th>
                                        <th>COLLATERAL</th>
                                        <th style={{ textAlign: 'right' }}>LOAN</th>
                                        <th style={{ textAlign: 'right' }}>RATE</th>
                                        <th style={{ textAlign: 'center' }}>STATUS</th>
                                        <th style={{ textAlign: 'right' }}>REMAINING</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resolved.slice(0, 20).map(req => (
                                        <tr key={req.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                            <td style={{ fontWeight: 600 }}>{req.borrower_username}</td>
                                            <td>{req.collateral_quantity} {req.collateral_ticker}</td>
                                            <td className="mono-num" style={{ textAlign: 'right' }}>${req.loan_amount?.toLocaleString()}</td>
                                            <td className="mono-num" style={{ textAlign: 'right' }}>{req.interest_rate}%</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '0.15rem 0.4rem', fontSize: '0.65rem', fontWeight: 700,
                                                    color: statusColor(req.status), background: `${statusColor(req.status)}15`
                                                }}>
                                                    {req.status?.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="mono-num" style={{ textAlign: 'right' }}>
                                                {req.status === 'active' ? `$${req.remaining_balance?.toLocaleString()}` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
