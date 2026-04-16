import { useState, useEffect } from 'react';
import { getAllBankerRequests, approveBankerRequest, rejectBankerRequest } from '../services/api';
import { CheckCircle, XCircle, RefreshCw, Inbox, Clock } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_LABELS = {
    asset_request: 'ASSET REQUEST',
    bailout: 'BAILOUT',
};

const STATUS_STYLE = {
    pending:  { background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B' },
    approved: { background: '#D1FAE5', color: '#065F46', border: '1px solid #10B981' },
    rejected: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #EF4444' },
};

export default function AdminBankerApprovals() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState({});
    const [expanded, setExpanded] = useState(null);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const data = await getAllBankerRequests();
            setRequests(data);
        } catch (err) {
            console.error('Failed to fetch banker requests:', err);
            toast.error('Could not load banker requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRequests(); }, []);

    const handleAction = async (requestId, action) => {
        try {
            if (action === 'approve') {
                await approveBankerRequest(requestId, notes[requestId] || '');
                toast.success('Request approved');
            } else {
                await rejectBankerRequest(requestId, notes[requestId] || '');
                toast.warning('Request rejected');
            }
            setExpanded(null);
            setNotes(prev => { const n = { ...prev }; delete n[requestId]; return n; });
            fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.detail || `Failed to ${action} request`);
        }
    };

    const pending  = requests.filter(r => r.status === 'pending');
    const resolved = requests.filter(r => r.status !== 'pending');

    if (loading && requests.length === 0) return (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
            <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
            Loading requests...
        </div>
    );

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Inbox size={18} /> Banker Request Queue
                        {pending.length > 0 && (
                            <span style={{ background: '#D1202F', color: '#FFF', fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                                {pending.length}
                            </span>
                        )}
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#6B7280' }}>
                        Review asset acquisition and bailout requests from Bank Managers.
                    </p>
                </div>
                <button onClick={fetchRequests} className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>

            {/* Pending */}
            <div className="fintech-card" style={{ marginBottom: '1.5rem' }}>
                <div className="text-label" style={{ marginBottom: '1rem' }}>PENDING ({pending.length})</div>
                {pending.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9CA3AF', fontSize: '0.9rem' }}>
                        No pending requests.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {pending.map(req => (
                            <div key={req.id} style={{ border: '1px solid #E5E7EB', background: '#FAFAFA', padding: '1rem', borderRadius: '4px', borderLeft: '4px solid #D1202F' }}>
                                {/* Top row */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ background: '#000', color: '#FFF', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.6rem', letterSpacing: '0.08em' }}>
                                            {TYPE_LABELS[req.request_type] || req.request_type.replace('_', ' ').toUpperCase()}
                                        </span>
                                        <span style={{ fontWeight: 700 }}>{req.banker_username}</span>
                                    </div>
                                    <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{new Date(req.created_at).toLocaleString()}</span>
                                </div>

                                {/* Details */}
                                <div style={{ background: '#FFF', border: '1px solid #E5E7EB', padding: '0.75rem', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#374151' }}>
                                    {req.request_type === 'asset_request' && (
                                        <>
                                            <div><span className="text-label" style={{ fontSize: '0.65rem' }}>REQUESTING</span></div>
                                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{req.quantity} × {req.asset_ticker}</div>
                                            {req.request_reason && <div style={{ marginTop: '0.4rem', color: '#6B7280', fontSize: '0.8rem' }}>{req.request_reason}</div>}
                                        </>
                                    )}
                                    {req.request_type === 'bailout' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <div>
                                                <div className="text-label" style={{ fontSize: '0.65rem' }}>TEAM</div>
                                                <div style={{ fontWeight: 700 }}>{req.team_name}</div>
                                            </div>
                                            <div>
                                                <div className="text-label" style={{ fontSize: '0.65rem' }}>AMOUNT</div>
                                                <div className="mono-num" style={{ fontWeight: 700, color: '#D1202F' }}>${req.bailout_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            </div>
                                            <div>
                                                <div className="text-label" style={{ fontSize: '0.65rem' }}>INTEREST</div>
                                                <div style={{ fontWeight: 700 }}>{req.bailout_interest_rate}% / qtr</div>
                                            </div>
                                            <div>
                                                <div className="text-label" style={{ fontSize: '0.65rem' }}>UNFREEZE</div>
                                                <div style={{ fontWeight: 700, color: req.unfreeze_team ? '#059669' : '#9CA3AF' }}>{req.unfreeze_team ? 'Yes' : 'No'}</div>
                                            </div>
                                            {req.bailout_terms && (
                                                <div style={{ gridColumn: '1/-1', marginTop: '0.25rem', fontSize: '0.8rem', color: '#6B7280' }}>{req.bailout_terms}</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Action area */}
                                {expanded === req.id ? (
                                    <div>
                                        <input
                                            className="input-field"
                                            placeholder="Admin note (optional)"
                                            value={notes[req.id] || ''}
                                            onChange={e => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                                            style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}
                                        />
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => handleAction(req.id, 'approve')} className="btn" style={{ flex: 1, background: '#D1FAE5', color: '#065F46', border: '1px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                                                <CheckCircle size={14} /> APPROVE
                                            </button>
                                            <button onClick={() => handleAction(req.id, 'reject')} className="btn" style={{ flex: 1, background: '#FEE2E2', color: '#991B1B', border: '1px solid #EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                                                <XCircle size={14} /> REJECT
                                            </button>
                                            <button onClick={() => setExpanded(null)} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => setExpanded(req.id)} className="btn btn-secondary" style={{ fontSize: '0.8rem', width: '100%' }}>
                                        REVIEW REQUEST
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Resolved history */}
            {resolved.length > 0 && (
                <div className="fintech-card">
                    <div className="text-label" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={13} /> RECENTLY RESOLVED
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {resolved.slice(0, 10).map(req => (
                            <div key={req.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '4px', fontSize: '0.82rem' }}>
                                <span style={{ background: '#000', color: '#FFF', fontSize: '0.6rem', fontWeight: 800, padding: '0.15rem 0.5rem', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                                    {TYPE_LABELS[req.request_type] || req.request_type.replace('_', ' ').toUpperCase()}
                                </span>
                                <span style={{ fontWeight: 600 }}>{req.banker_username}</span>
                                <span style={{ ...STATUS_STYLE[req.status], padding: '0.15rem 0.6rem', fontSize: '0.68rem', fontWeight: 800, borderRadius: '3px', whiteSpace: 'nowrap' }}>
                                    {req.status.toUpperCase()}
                                </span>
                                <span style={{ color: '#9CA3AF', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{new Date(req.resolved_at).toLocaleDateString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
