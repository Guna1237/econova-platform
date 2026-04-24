import { useState, useEffect, useRef, useCallback } from 'react';
import { Gavel, Package, List, Clock } from 'lucide-react';
import { getSecondaryLots, placeLotBid, resolveSecondaryLot, getMySecondaryRequests } from '../services/api';
import { toast } from 'sonner';

const ASSET_NAMES = {
    GOLD: 'Gold Reserves',
    NVDA: 'NVIDIA Growth ETF',
    BRENT: 'S&P Brent Crude Oil',
    REITS: 'REITs Index',
};

export default function SecondaryAuctionHall({ user, lastUpdate }) {
    const [lots, setLots] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    const [selectedLot, setSelectedLot] = useState(null);
    const selectedLotIdRef = useRef(null);
    const [bidAmount, setBidAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);

    const isAdmin = user?.role === 'admin';

    const fetchLots = useCallback(async () => {
        try {
            const data = await getSecondaryLots();
            setLots(data);

            if (selectedLotIdRef.current) {
                const updated = data.find(l => l.id === selectedLotIdRef.current);
                if (updated) {
                    setSelectedLot(updated);
                } else {
                    // Selected lot was resolved — auto-pick next active one
                    const next = data.find(l => l.status === 'active');
                    selectedLotIdRef.current = next?.id ?? null;
                    setSelectedLot(next ?? null);
                }
            } else {
                const active = data.find(l => l.status === 'active');
                if (active) {
                    selectedLotIdRef.current = active.id;
                    setSelectedLot(active);
                }
            }
        } catch {
            // non-critical
        } finally {
            setInitialLoad(false);
        }
    }, []);

    const fetchMyRequests = useCallback(async () => {
        if (isAdmin) return;
        try {
            const data = await getMySecondaryRequests();
            setMyRequests(data);
        } catch { /* silent */ }
    }, [isAdmin]);

    // Poll every 2s when there are active lots, slower otherwise
    useEffect(() => {
        fetchLots();
        fetchMyRequests();
        const fast = setInterval(fetchLots, 3000);
        const slow = setInterval(fetchMyRequests, 5000);
        return () => { clearInterval(fast); clearInterval(slow); };
    }, [fetchLots, fetchMyRequests, lastUpdate]);

    const handleSelectLot = (lot) => {
        selectedLotIdRef.current = lot.id;
        setSelectedLot(lot);
        // Pre-fill bid amount: highest bid + 50, or base price
        setBidAmount(lot.highest_bid ? String(lot.highest_bid + 50) : String(lot.base_price));
    };

    const handleBid = async () => {
        if (!selectedLot) return;
        const amount = parseFloat(bidAmount);
        if (!amount || amount <= 0) { toast.error('Enter a valid bid amount'); return; }
        try {
            setLoading(true);
            await placeLotBid(selectedLot.id, amount);
            toast.success(`Bid placed on Lot #${selectedLot.lot_number}`);
            setBidAmount('');
            await fetchLots();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Bid failed');
        } finally {
            setLoading(false);
        }
    };

    const handleResolve = async () => {
        if (!selectedLot) return;
        try {
            setLoading(true);
            const res = await resolveSecondaryLot(selectedLot.id);
            toast.success(res.message || 'Lot resolved');
            selectedLotIdRef.current = null;
            setSelectedLot(null);
            await fetchLots();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Resolution failed');
        } finally {
            setLoading(false);
        }
    };

    if (initialLoad) {
        return <div style={{ color: '#9CA3AF', fontSize: '0.85rem', padding: '2rem', textAlign: 'center' }}>Loading...</div>;
    }

    const statusColor = (status) => {
        if (status === 'active') return '#10b981';
        if (status === 'sold') return '#ef4444';
        if (status === 'cancelled') return '#6B7280';
        return 'transparent';
    };

    const isMine = selectedLot?.seller_id === user?.id;
    const canBid = selectedLot?.status === 'active' && !isMine && !isAdmin;
    const canResolve = selectedLot?.status === 'active' && isAdmin;

    return (
        <div className="animate-fade-in">
            {lots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#666' }}>
                    <Gavel size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                    <h2 style={{ textTransform: 'uppercase', marginBottom: '0.5rem', fontSize: '1rem' }}>
                        No Active Secondary Listings
                    </h2>
                    <p style={{ fontSize: '0.85rem' }}>
                        Teams can list assets here via the Marketplace (AUCTION listing type).
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
                    {/* LEFT: Lot List */}
                    <div>
                        <div className="fintech-card" style={{ marginBottom: '1rem' }}>
                            <div className="text-label" style={{ marginBottom: '0.75rem' }}>ACTIVE LISTINGS</div>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {lots.map(lot => {
                                    const mine = lot.seller_id === user?.id;
                                    const isSelected = selectedLot?.id === lot.id;
                                    return (
                                        <button
                                            key={lot.id}
                                            onClick={() => handleSelectLot(lot)}
                                            className={isSelected ? 'btn btn-primary' : 'btn btn-secondary'}
                                            style={{
                                                width: '100%',
                                                justifyContent: 'space-between',
                                                padding: '0.75rem 1rem',
                                                textAlign: 'left',
                                                borderLeft: `4px solid ${statusColor(lot.status)}`,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Package size={14} />
                                                <span style={{ fontWeight: 700 }}>{lot.asset_ticker}</span>
                                                <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>#{lot.lot_number}</span>
                                                {mine && (
                                                    <span style={{ fontSize: '0.65rem', background: '#FEF9C3', color: '#92400E', padding: '1px 5px', fontWeight: 700 }}>
                                                        MINE
                                                    </span>
                                                )}
                                            </div>
                                            <span className="mono-num" style={{ fontSize: '0.85rem' }}>
                                                {lot.quantity} units
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Bidding Interface */}
                    <div>
                        {selectedLot ? (
                            <>
                                {/* Lot Detail Card */}
                                <div className="fintech-card" style={{ marginBottom: '1rem', background: '#f9f9f9' }}>
                                    <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                        <div>
                                            <h3 style={{ fontSize: '1.1rem', margin: 0, color: '#D1202F', letterSpacing: '0.05em' }}>
                                                {selectedLot.asset_ticker}
                                            </h3>
                                            <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                                                {ASSET_NAMES[selectedLot.asset_ticker] || selectedLot.asset_ticker} · Lot #{selectedLot.lot_number}
                                            </div>
                                        </div>
                                        <div className="pill" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
                                            {selectedLot.status?.toUpperCase()}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                        <div>
                                            <div className="text-label">Quantity</div>
                                            <div className="mono-num" style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                                                {selectedLot.quantity}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-label">Reserve</div>
                                            <div className="mono-num" style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                                                ${selectedLot.base_price?.toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-label">Seller</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 600, paddingTop: '0.3rem' }}>
                                                {selectedLot.seller_username || '—'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '1rem' }}>
                                        <div className="text-label">Current Highest Bid</div>
                                        <div className="flex-between">
                                            <div className="mono-num" style={{ fontSize: '2rem', fontWeight: 700, color: '#D1202F' }}>
                                                {selectedLot.highest_bid ? `$${selectedLot.highest_bid.toLocaleString()}` : '— no bids —'}
                                            </div>
                                            {selectedLot.highest_bidder_username && (
                                                <div style={{ textAlign: 'right' }}>
                                                    <div className="text-label" style={{ marginBottom: '0.25rem' }}>Leader</div>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                                        {selectedLot.highest_bidder_username}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Action Card */}
                                <div className="fintech-card">
                                    {isAdmin ? (
                                        <>
                                            <div className="text-label" style={{ marginBottom: '0.75rem' }}>AUCTIONEER CONTROLS</div>
                                            <button
                                                onClick={handleResolve}
                                                disabled={loading || !canResolve}
                                                className="btn btn-primary"
                                                style={{
                                                    width: '100%',
                                                    background: '#b91c1c',
                                                    borderColor: '#b91c1c',
                                                    fontSize: '1rem',
                                                    padding: '0.75rem',
                                                    opacity: canResolve ? 1 : 0.5,
                                                    cursor: canResolve ? 'pointer' : 'not-allowed',
                                                }}
                                            >
                                                {loading ? 'PROCESSING...' : '🔨 HAMMER DOWN'}
                                            </button>
                                            {!canResolve && selectedLot.status !== 'active' && (
                                                <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '0.5rem', textAlign: 'center' }}>
                                                    Lot is {selectedLot.status} — nothing to resolve
                                                </p>
                                            )}
                                        </>
                                    ) : isMine ? (
                                        <div style={{ textAlign: 'center', padding: '1rem 0', color: '#6B7280', fontSize: '0.85rem' }}>
                                            <Package size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                                            <p style={{ margin: 0 }}>This is your listing. Waiting for bids.</p>
                                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>Admin will hammer down when ready.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-label">PLACE YOUR BID</div>
                                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                                <input
                                                    type="number"
                                                    className="input-field mono-num"
                                                    style={{ fontSize: '1.5rem', fontWeight: 700, flex: 1 }}
                                                    value={bidAmount}
                                                    onChange={e => setBidAmount(e.target.value)}
                                                    placeholder={selectedLot.base_price?.toString()}
                                                    disabled={!canBid}
                                                />
                                                <button
                                                    onClick={handleBid}
                                                    disabled={loading || !bidAmount || !canBid}
                                                    className="btn btn-primary"
                                                    style={{
                                                        fontSize: '1.2rem',
                                                        padding: '0 2rem',
                                                        opacity: canBid ? 1 : 0.5,
                                                        cursor: canBid ? 'pointer' : 'not-allowed',
                                                    }}
                                                >
                                                    {loading ? '...' : (canBid ? 'BID' : selectedLot.status?.toUpperCase())}
                                                </button>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                                {[50, 100, 500].map(inc => (
                                                    <button
                                                        key={inc}
                                                        onClick={() => setBidAmount(String((selectedLot.highest_bid || selectedLot.base_price) + inc))}
                                                        className="btn btn-secondary"
                                                        style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                                                        disabled={!canBid}
                                                    >
                                                        +${inc}
                                                    </button>
                                                ))}
                                            </div>
                                            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.75rem' }}>
                                                Minimum bid: ${selectedLot.highest_bid
                                                    ? (selectedLot.highest_bid + 1).toLocaleString()
                                                    : selectedLot.base_price?.toLocaleString()}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="fintech-card" style={{ textAlign: 'center', padding: '3rem' }}>
                                <Package size={40} color="#9CA3AF" style={{ marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1rem' }}>Select a Listing</h3>
                                <p style={{ color: '#666', fontSize: '0.85rem' }}>Choose a lot from the left to view details and bid</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* My Pending Requests (teams only) */}
            {!isAdmin && myRequests.length > 0 && (
                <div className="fintech-card" style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                        <List size={16} /> My Listing Requests
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {myRequests.map(req => {
                            const statusCol = req.status === 'approved' ? '#16A34A' : req.status === 'rejected' ? '#DC2626' : '#D97706';
                            return (
                                <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#F9FAFB', border: '1px solid #E5E7EB', fontSize: '0.85rem' }}>
                                    <span>
                                        <strong>{req.asset_ticker}</strong> — {req.quantity} units @ reserve ${req.reserve_price?.toLocaleString()}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {req.status === 'pending' && (
                                            <Clock size={13} color="#D97706" />
                                        )}
                                        <span style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: statusCol }}>
                                            {req.status}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
