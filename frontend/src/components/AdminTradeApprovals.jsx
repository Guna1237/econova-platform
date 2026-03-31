import { useState, useEffect } from 'react';
import { Check, X, Clock, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getTradeApprovals, approveTradeApproval, rejectTradeApproval } from '../services/api';

export default function AdminTradeApprovals({ lastUpdate }) {
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [notes, setNotes] = useState({});
    const [showResolved, setShowResolved] = useState(false);

    const fetchApprovals = async () => {
        try {
            const data = await getTradeApprovals();
            setApprovals(data);
        } catch (err) {
            console.error('Failed to fetch trade approvals', err);
        }
    };

    useEffect(() => {
        fetchApprovals();
    }, [lastUpdate]);

    const handleApprove = async (id) => {
        setLoading(true);
        try {
            const res = await approveTradeApproval(id, notes[id] || '');
            toast.success(res.message || 'Trade approved');
            fetchApprovals();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to approve trade');
        } finally {
            setLoading(false);
        }
    };

    const handleReject = async (id) => {
        setLoading(true);
        try {
            const res = await rejectTradeApproval(id, notes[id] || '');
            toast.success(res.message || 'Trade rejected');
            fetchApprovals();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to reject trade');
        } finally {
            setLoading(false);
        }
    };

    const pending = approvals.filter(a => a.status === 'pending');
    const resolved = approvals.filter(a => a.status !== 'pending');

    const statusColor = (s) => s === 'approved' ? '#10B981' : s === 'rejected' ? '#EF4444' : '#F59E0B';
    const statusBg = (s) => s === 'approved' ? '#D1FAE5' : s === 'rejected' ? '#FEE2E2' : '#FEF3C7';

    return (
        <div className="fintech-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <ShieldCheck size={18} color="#D1202F" />
                <div className="text-label">TRADE APPROVAL QUEUE</div>
                {pending.length > 0 && (
                    <span style={{
                        background: '#D1202F', color: '#fff', borderRadius: '999px',
                        fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                        marginLeft: 'auto'
                    }}>
                        {pending.length} PENDING
                    </span>
                )}
            </div>

            {pending.length === 0 && (
                <div style={{ color: '#999', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                    No pending trade approvals.
                </div>
            )}

            {pending.map(ap => (
                <div key={ap.id} style={{
                    border: '1px solid #F59E0B', borderRadius: '4px',
                    padding: '0.85rem', marginBottom: '0.75rem', background: '#FFFBEB'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 700 }}>
                            {ap.from_username}
                            <span style={{ color: '#666', fontWeight: 400 }}> → </span>
                            {ap.to_username}
                        </span>
                        <span style={{
                            fontSize: '0.65rem', fontWeight: 700,
                            background: statusBg(ap.status), color: statusColor(ap.status),
                            padding: '0.15rem 0.4rem', borderRadius: '2px'
                        }}>
                            {ap.status.toUpperCase()}
                        </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.5rem' }}>
                        <b>{ap.offer_type?.toUpperCase()}</b> {ap.quantity}x{' '}
                        <b>{ap.asset_ticker}</b> @ ${ap.price_per_unit?.toFixed(2)} each
                        <span style={{ color: '#666', marginLeft: '0.5rem' }}>(Total: ${ap.total_value?.toLocaleString()})</span>
                    </div>
                    {ap.message && (
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                            "{ap.message}"
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                            className="input-field"
                            style={{ flex: 1, fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                            placeholder="Admin note (optional)"
                            value={notes[ap.id] || ''}
                            onChange={e => setNotes(p => ({ ...p, [ap.id]: e.target.value }))}
                        />
                        <button
                            id={`approve-trade-${ap.id}`}
                            onClick={() => handleApprove(ap.id)}
                            disabled={loading}
                            style={{
                                background: '#10B981', color: '#fff', border: 'none',
                                padding: '0.4rem 0.75rem', fontWeight: 700, fontSize: '0.7rem',
                                display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer'
                            }}
                        >
                            <Check size={13} /> APPROVE
                        </button>
                        <button
                            id={`reject-trade-${ap.id}`}
                            onClick={() => handleReject(ap.id)}
                            disabled={loading}
                            style={{
                                background: '#EF4444', color: '#fff', border: 'none',
                                padding: '0.4rem 0.75rem', fontWeight: 700, fontSize: '0.7rem',
                                display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer'
                            }}
                        >
                            <X size={13} /> REJECT
                        </button>
                    </div>
                </div>
            ))}

            {/* Resolved Section (collapsible) */}
            {resolved.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <button
                        onClick={() => setShowResolved(p => !p)}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            fontSize: '0.75rem', color: '#6B7280', fontWeight: 600, padding: 0
                        }}
                    >
                        {showResolved ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {resolved.length} RESOLVED TRADE{resolved.length !== 1 ? 'S' : ''}
                    </button>
                    {showResolved && (
                        <div style={{ marginTop: '0.75rem' }}>
                            {resolved.map(ap => (
                                <div key={ap.id} style={{
                                    border: `1px solid ${statusColor(ap.status)}33`,
                                    borderLeft: `3px solid ${statusColor(ap.status)}`,
                                    padding: '0.6rem 0.75rem', marginBottom: '0.5rem',
                                    fontSize: '0.78rem', background: statusBg(ap.status) + '55'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>
                                            <b>{ap.from_username}</b> → <b>{ap.to_username}</b> |{' '}
                                            {ap.quantity}× {ap.asset_ticker} @ ${ap.price_per_unit?.toFixed(2)}
                                        </span>
                                        <span style={{ fontWeight: 700, color: statusColor(ap.status), fontSize: '0.7rem' }}>
                                            {ap.status.toUpperCase()}
                                        </span>
                                    </div>
                                    {ap.admin_note && (
                                        <div style={{ color: '#6B7280', fontSize: '0.72rem', marginTop: '0.25rem' }}>
                                            Note: {ap.admin_note}
                                        </div>
                                    )}
                                    <div style={{ color: '#9CA3AF', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                                        by {ap.resolved_by} · {ap.resolved_at ? new Date(ap.resolved_at).toLocaleString() : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
