import { useState, useEffect, useCallback } from 'react';
import { getAdminSecondaryRequests, approveSecondaryRequest, rejectSecondaryRequest, getSecondaryLots, resolveSecondaryLot } from '../services/api';
import { toast } from 'sonner';

export default function AdminSecondaryAuction() {
    const [requests, setRequests] = useState([]);
    const [activeLots, setActiveLots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionNote, setActionNote] = useState({});

    const load = useCallback(async () => {
        try {
            const [reqs, lots] = await Promise.all([
                getAdminSecondaryRequests(),
                getSecondaryLots(),
            ]);
            setRequests(reqs);
            setActiveLots(lots);
        } catch {
            // non-critical
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleApprove = async (reqId) => {
        try {
            const res = await approveSecondaryRequest(reqId);
            toast.success(res.message);
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Approval failed');
        }
    };

    const handleReject = async (reqId) => {
        try {
            const res = await rejectSecondaryRequest(reqId, actionNote[reqId] || '');
            toast.info(res.message);
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Rejection failed');
        }
    };

    const handleResolve = async (lotId) => {
        try {
            const res = await resolveSecondaryLot(lotId);
            toast.success(res.message || 'Lot resolved');
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Resolution failed');
        }
    };

    const pending = requests.filter(r => r.status === 'pending');
    const resolved = requests.filter(r => r.status !== 'pending');

    return (
        <div className="fintech-card" style={{ background: '#FFF' }}>
            <div className="text-label" style={{ marginBottom: '1rem' }}>SECONDARY AUCTION REQUESTS</div>

            {loading ? (
                <div style={{ color: '#9CA3AF', fontSize: '0.85rem' }}>Loading...</div>
            ) : pending.length === 0 ? (
                <div style={{ color: '#9CA3AF', fontSize: '0.85rem', padding: '1rem 0' }}>No pending listing requests.</div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem 0.75rem' }}>TEAM</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>ASSET</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>QTY</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>RESERVE</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>DATE</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>NOTE</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pending.map(r => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{r.seller_username}</td>
                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: '#D1202F' }}>{r.asset_ticker}</td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{r.quantity}</td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>${r.reserve_price.toLocaleString()}</td>
                                <td style={{ padding: '0.5rem 0.75rem', color: '#6B7280', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                    <input
                                        placeholder="Admin note (optional)"
                                        value={actionNote[r.id] || ''}
                                        onChange={e => setActionNote(n => ({ ...n, [r.id]: e.target.value }))}
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid #D1D5DB', width: '140px' }}
                                    />
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                        <button
                                            onClick={() => handleApprove(r.id)}
                                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', fontWeight: 700, background: '#D1FAE5', color: '#059669', border: '1px solid #6EE7B7', cursor: 'pointer' }}
                                        >
                                            APPROVE
                                        </button>
                                        <button
                                            onClick={() => handleReject(r.id)}
                                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', fontWeight: 700, background: '#FEE2E2', color: '#D1202F', border: '1px solid #FCA5A5', cursor: 'pointer' }}
                                        >
                                            REJECT
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {activeLots.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                        LIVE LOTS — AWAITING RESOLUTION
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ background: '#F0FDF4', textAlign: 'left' }}>
                                <th style={{ padding: '0.5rem 0.75rem' }}>SELLER</th>
                                <th style={{ padding: '0.5rem 0.75rem' }}>ASSET</th>
                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>QTY</th>
                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>RESERVE</th>
                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>TOP BID</th>
                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeLots.map(lot => (
                                <tr key={lot.id} style={{ borderBottom: '1px solid #D1FAE5' }}>
                                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{lot.seller_username || '—'}</td>
                                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: '#D1202F' }}>{lot.asset_ticker}</td>
                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{lot.quantity}</td>
                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>${lot.base_price?.toLocaleString() ?? '—'}</td>
                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: lot.highest_bid ? '#059669' : '#9CA3AF' }}>
                                        {lot.highest_bid ? `$${lot.highest_bid.toLocaleString()}` : 'No bids'}
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                        <button
                                            onClick={() => handleResolve(lot.id)}
                                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', fontWeight: 700, background: '#1D4ED8', color: '#FFF', border: 'none', cursor: 'pointer' }}
                                        >
                                            HAMMER DOWN
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {resolved.length > 0 && (
                <details style={{ marginTop: '1rem' }}>
                    <summary style={{ fontSize: '0.75rem', color: '#6B7280', cursor: 'pointer', fontWeight: 600 }}>
                        Show resolved ({resolved.length})
                    </summary>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginTop: '0.5rem' }}>
                        <tbody>
                            {resolved.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6', color: '#6B7280' }}>
                                    <td style={{ padding: '0.4rem 0.75rem' }}>{r.seller_username}</td>
                                    <td style={{ padding: '0.4rem 0.75rem', fontWeight: 700 }}>{r.asset_ticker}</td>
                                    <td style={{ padding: '0.4rem 0.75rem' }}>{r.quantity}@${r.reserve_price.toLocaleString()}</td>
                                    <td style={{ padding: '0.4rem 0.75rem', fontWeight: 700, color: r.status === 'approved' ? '#059669' : '#D1202F', textTransform: 'uppercase' }}>{r.status}</td>
                                    <td style={{ padding: '0.4rem 0.75rem' }}>{r.admin_note || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </details>
            )}
        </div>
    );
}
