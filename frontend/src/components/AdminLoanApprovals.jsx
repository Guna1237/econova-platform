import { useState, useEffect } from 'react';
import { getLoanApprovals, approveLoan, rejectLoan } from '../services/api';
import { Check, X, Clock, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLoanApprovals() {
    const [approvals, setApprovals] = useState([]);
    const [notes, setNotes] = useState({});
    const [loading, setLoading] = useState({});

    const fetchApprovals = async () => {
        try {
            const data = await getLoanApprovals();
            setApprovals(data);
        } catch (e) {
            console.error('Failed to fetch loan approvals', e);
        }
    };

    useEffect(() => {
        fetchApprovals();
        const interval = setInterval(fetchApprovals, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleApprove = async (id) => {
        setLoading(prev => ({ ...prev, [id]: true }));
        try {
            const res = await approveLoan(id, notes[id] || '');
            toast.success(res.message);
            fetchApprovals();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to approve');
        } finally {
            setLoading(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleReject = async (id) => {
        setLoading(prev => ({ ...prev, [id]: true }));
        try {
            const res = await rejectLoan(id, notes[id] || '');
            toast.warning(res.message);
            fetchApprovals();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to reject');
        } finally {
            setLoading(prev => ({ ...prev, [id]: false }));
        }
    };

    const pending = approvals.filter(a => a.status === 'pending');
    const resolved = approvals.filter(a => a.status !== 'pending');

    return (
        <div className="animate-fade-in">
            <div className="fintech-card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <DollarSign size={20} /> Loan Approval Queue
                    </h3>
                    <span style={{
                        background: pending.length > 0 ? '#FEE2E2' : '#D1FAE5',
                        color: pending.length > 0 ? '#B91C1C' : '#065F46',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        fontWeight: 700
                    }}>
                        {pending.length} Pending
                    </span>
                </div>

                {pending.length === 0 ? (
                    <p style={{ color: '#6B7280', fontSize: '0.9rem', textAlign: 'center', padding: '1.5rem 0' }}>
                        No pending loan approvals.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {pending.map(approval => (
                            <div key={approval.id} style={{
                                border: '1px solid #FEE2E2',
                                background: '#FFFBEB',
                                padding: '1rem',
                                borderRadius: '4px'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <div>
                                        <div className="text-label" style={{ fontSize: '0.7rem' }}>LENDER → BORROWER</div>
                                        <div style={{ fontWeight: 700 }}>
                                            {approval.lender_username} → {approval.borrower_username}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-label" style={{ fontSize: '0.7rem' }}>LOAN DETAILS</div>
                                        <div className="mono-num" style={{ fontWeight: 700 }}>
                                            ${approval.principal?.toLocaleString()} @ {approval.interest_rate}%/yr
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input
                                        className="input-field"
                                        placeholder="Admin note (optional)"
                                        value={notes[approval.id] || ''}
                                        onChange={e => setNotes(prev => ({ ...prev, [approval.id]: e.target.value }))}
                                        style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => handleApprove(approval.id)}
                                        disabled={loading[approval.id]}
                                        className="btn"
                                        style={{
                                            background: '#D1FAE5', color: '#065F46', border: '1px solid #10B981',
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                                        }}
                                    >
                                        <Check size={14} /> APPROVE
                                    </button>
                                    <button
                                        onClick={() => handleReject(approval.id)}
                                        disabled={loading[approval.id]}
                                        className="btn"
                                        style={{
                                            background: '#FEE2E2', color: '#B91C1C', border: '1px solid #EF4444',
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                                        }}
                                    >
                                        <X size={14} /> REJECT
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent resolved */}
            {resolved.length > 0 && (
                <div className="fintech-card">
                    <h4 style={{ color: '#6B7280', fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                        <Clock size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                        Recent History
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {resolved.slice(0, 10).map(approval => (
                            <div key={approval.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.5rem 0.75rem',
                                background: approval.status === 'approved' ? '#F0FDF4' : '#FFF5F5',
                                border: `1px solid ${approval.status === 'approved' ? '#86EFAC' : '#FECACA'}`,
                                borderRadius: '4px',
                                fontSize: '0.85rem'
                            }}>
                                <span>
                                    <strong>{approval.lender_username}</strong> → <strong>{approval.borrower_username}</strong>
                                    &nbsp;${approval.principal?.toLocaleString()} @ {approval.interest_rate}%
                                </span>
                                <span style={{
                                    fontWeight: 700,
                                    color: approval.status === 'approved' ? '#16A34A' : '#DC2626',
                                    textTransform: 'uppercase',
                                    fontSize: '0.75rem'
                                }}>
                                    {approval.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
