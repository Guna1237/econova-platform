import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gavel, TrendingUp, AlertCircle, Play, CheckCircle, Package, List } from 'lucide-react';
import { getAuctionLots, placeLotBid, openAuction, resolveAuction, openNextLot, endAuction, getMyAuctionLots } from '../services/api';
import { toast } from 'sonner';

export default function AuctionHouse({ user, marketState, onUpdate, lastUpdate }) {
    const [lots, setLots] = useState([]);
    const [myLots, setMyLots] = useState([]);
    const [selectedLot, setSelectedLot] = useState(null);
    const selectedLotIdRef = useRef(null); // Stable ref — won't reset on re-render
    const [bidAmount, setBidAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastLotResult, setLastLotResult] = useState(null); // Track post-hammer state

    const isActive = marketState?.phase === 'AUCTION';
    const currentTicker = marketState?.active_auction_asset;

    useEffect(() => {
        let interval;
        if (isActive && currentTicker) {
            const fetchLots = async () => {
                try {
                    const data = await getAuctionLots();
                    setLots(data);

                    if (selectedLotIdRef.current) {
                        // Refresh the currently selected lot with fresh data
                        const updated = data.find(l => l.id === selectedLotIdRef.current);
                        if (updated) {
                            setSelectedLot(updated);
                        } else {
                            // Selected lot no longer exists — pick the ACTIVE one
                            const activeLot = data.find(l => l.status === 'active');
                            selectedLotIdRef.current = activeLot?.id ?? null;
                            setSelectedLot(activeLot ?? null);
                        }
                    } else {
                        // No selection yet — auto-pick the ACTIVE lot
                        const activeLot = data.find(l => l.status === 'active');
                        if (activeLot) {
                            selectedLotIdRef.current = activeLot.id;
                            setSelectedLot(activeLot);
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch lots', e);
                }
            };

            fetchLots();
            interval = setInterval(fetchLots, 2000);
        } else {
            // Auction ended — clear selection
            selectedLotIdRef.current = null;
            setSelectedLot(null);
            setLots([]);
        }
        return () => clearInterval(interval);
    }, [isActive, currentTicker, lastUpdate]);

    // Always fetch user's own listings regardless of auction phase
    useEffect(() => {
        const fetchMyLots = async () => {
            try {
                if (user.role !== 'admin') {
                    const data = await getMyAuctionLots();
                    setMyLots(data);
                }
            } catch (e) { /* silent */ }
        };
        fetchMyLots();
        const interval = setInterval(fetchMyLots, 5000);
        return () => clearInterval(interval);
    }, [user.role]);

    const handlePlaceBid = async () => {
        if (!selectedLot) {
            toast.error('Select a lot to bid on');
            return;
        }

        try {
            setLoading(true);
            await placeLotBid(selectedLot.id, parseFloat(bidAmount));
            toast.success(`Bid placed on Lot ${selectedLot.lot_number}`);
            setBidAmount('');
            // Force immediate refresh
            const data = await getAuctionLots();
            setLots(data);
            // Update selected lot with fresh data (keep same lot selected)
            const updated = data.find(l => l.id === selectedLotIdRef.current);
            if (updated) setSelectedLot(updated);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Bid failed');
        } finally {
            setLoading(false);
        }
    };

    const AdminControl = () => {
        const [openingAuction, setOpeningAuction] = useState(false);
        const [resolvingAuction, setResolvingAuction] = useState(false);
        const [openingNext, setOpeningNext] = useState(false);
        const [endingAuction, setEndingAuction] = useState(false);

        // Check if there is currently no active lot (all lots resolved/cancelled) but auction is still open
        const hasActiveLot = lots.some(l => l.status === 'active');
        const hasPendingLot = lots.some(l => l.status === 'pending');

        return (
            <div className="fintech-card" style={{ marginBottom: '1rem', border: '1px solid #b91c1c', backgroundColor: '#fef2f2' }}>
                <h3 style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <Gavel size={18} /> AUCTIONEER CONSOLE
                </h3>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    {!currentTicker ? (
                        // ── Stage 1: Open an Auction ──
                        <>
                            <p style={{ fontSize: '0.8rem', color: '#666', width: '100%', margin: 0 }}>Select an asset to open the auction:</p>
                            {['GOLD', 'NVDA', 'BRENT', 'REITS'].map(ticker => (
                                <button
                                    key={ticker}
                                    onClick={async () => {
                                        try {
                                            setOpeningAuction(true);
                                            await openAuction(ticker);
                                            toast.success(`Auction opened for ${ticker}`);
                                            setLastLotResult(null);
                                            await onUpdate();
                                        } catch (err) {
                                            toast.error(`Failed to open ${ticker}`, {
                                                description: err.response?.data?.detail || err.message
                                            });
                                        } finally {
                                            setOpeningAuction(false);
                                        }
                                    }}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem' }}
                                    disabled={openingAuction}
                                >
                                    {openingAuction ? 'OPENING...' : `OPEN ${ticker}`}
                                </button>
                            ))}
                        </>
                    ) : hasActiveLot ? (
                        // ── Stage 2: Hammer down active lot ──
                        <button
                            onClick={async () => {
                                try {
                                    setResolvingAuction(true);
                                    const res = await resolveAuction();
                                    setLastLotResult(res);
                                    toast.success(res.message || 'Lot closed');
                                    await onUpdate();
                                } catch (err) {
                                    toast.error('Failed to resolve lot', {
                                        description: err.response?.data?.detail || err.message
                                    });
                                } finally {
                                    setResolvingAuction(false);
                                }
                            }}
                            className="btn btn-primary"
                            style={{ width: '100%', background: '#b91c1c', borderColor: '#b91c1c' }}
                            disabled={resolvingAuction}
                        >
                            {resolvingAuction ? 'PROCESSING...' : '🔨 HAMMER DOWN (SOLD / CLOSE LOT)'}
                        </button>
                    ) : (
                        // ── Stage 3: Post-hammer — admin decides what to do next ──
                        <div style={{ width: '100%' }}>
                            {lastLotResult && (
                                <div style={{ padding: '0.75rem', background: '#fff', border: '1px solid #fca5a5', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem', color: '#374151' }}>
                                    <strong>Result:</strong> {lastLotResult.message}
                                    {lastLotResult.lots_remaining > 0 && (
                                        <span style={{ marginLeft: '0.75rem', color: '#6B7280' }}>({lastLotResult.lots_remaining} lot{lastLotResult.lots_remaining > 1 ? 's' : ''} remaining)</span>
                                    )}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {hasPendingLot && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                setOpeningNext(true);
                                                const res = await openNextLot();
                                                if (res.opened) {
                                                    toast.success(res.message);
                                                    setLastLotResult(null);
                                                } else {
                                                    toast.error(res.message);
                                                }
                                                await onUpdate();
                                            } catch (err) {
                                                toast.error('Failed to open next lot', { description: err.response?.data?.detail });
                                            } finally {
                                                setOpeningNext(false);
                                            }
                                        }}
                                        className="btn btn-primary"
                                        style={{ flex: 1 }}
                                        disabled={openingNext}
                                    >
                                        {openingNext ? 'OPENING...' : '▶ OPEN NEXT LOT'}
                                    </button>
                                )}
                                <button
                                    onClick={async () => {
                                        try {
                                            setEndingAuction(true);
                                            const res = await endAuction();
                                            toast.success(res.message || 'Auction ended');
                                            setLastLotResult(null);
                                            await onUpdate();
                                        } catch (err) {
                                            toast.error('Failed to end auction', { description: err.response?.data?.detail });
                                        } finally {
                                            setEndingAuction(false);
                                        }
                                    }}
                                    className="btn btn-secondary"
                                    style={{ flex: 1, border: '1px solid #b91c1c', color: '#b91c1c' }}
                                    disabled={endingAuction}
                                >
                                    {endingAuction ? 'ENDING...' : '⏹ END AUCTION'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const LotSchedule = () => (
        <div className="fintech-card" style={{ marginTop: isActive ? '2rem' : '0' }}>
            <h3 style={{ marginBottom: '1rem', textTransform: 'uppercase', color: '#666', fontSize: '0.85rem' }}>Asset Lot Schedule (Units per Lot)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem 0.5rem', width: '25%' }}>Asset</th>
                        <th style={{ padding: '0.75rem 0.5rem' }}>Lots</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>GOLD</td>
                        <td className="mono-num" style={{ padding: '0.75rem 0.5rem', color: '#4B5563' }}>5 &rarr; 10 &rarr; 15 &rarr; 20 units</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>NVDA</td>
                        <td className="mono-num" style={{ padding: '0.75rem 0.5rem', color: '#4B5563' }}>25 &rarr; 50 &rarr; 75 &rarr; 100 units</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>BRENT</td>
                        <td className="mono-num" style={{ padding: '0.75rem 0.5rem', color: '#4B5563' }}>50 &rarr; 100 &rarr; 150 &rarr; 200 units</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>REITS</td>
                        <td className="mono-num" style={{ padding: '0.75rem 0.5rem', color: '#4B5563' }}>3 &rarr; 5 &rarr; 8 &rarr; 10 units</td>
                    </tr>
                    <tr>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>TBILL</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: '#6B7280' }}>Not auctioned (buy direct)</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );

    if (!isActive && user.role !== 'admin') {
        return (
            <div className="animate-fade-in">
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#666' }}>
                    <Gavel size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                    <h2 style={{ textTransform: 'uppercase', marginBottom: '0.5rem' }}>Auction House Closed</h2>
                    <p style={{ fontSize: '0.9rem' }}>Wait for the auctioneer to open bidding on an asset.</p>
                </div>
                <LotSchedule />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {user.role === 'admin' && <AdminControl />}

            {isActive ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
                    {/* Left: Asset Info */}
                    <div>
                        <div className="fintech-card" style={{ textAlign: 'center', padding: '2rem', borderLeft: '5px solid #D1202F', marginBottom: '1rem' }}>
                            <div className="text-label" style={{ fontSize: '0.8rem' }}>ON THE BLOCK</div>
                            <h1 style={{ fontSize: '3rem', margin: '0.75rem 0', color: '#D1202F' }}>{currentTicker || "WAITING..."}</h1>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                {currentTicker === 'NVDA' ? 'NVIDIA Growth ETF' :
                                    currentTicker === 'GOLD' ? 'Gold Reserves' :
                                        currentTicker === 'BRENT' ? 'S&P Brent Crude Oil' :
                                            currentTicker === 'REITS' ? 'REITs Index' : 'Asset Class'}
                            </div>
                            <div className="pill pill-red" style={{ marginTop: '1rem', fontSize: '0.75rem' }}>LIVE AUCTION</div>
                        </div>

                        {/* Lot Selection */}
                        <div className="fintech-card">
                            <div className="text-label" style={{ marginBottom: '0.75rem' }}>AVAILABLE LOTS</div>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {lots.map(lot => (
                                    <button
                                        key={lot.id}
                                        onClick={() => {
                                            selectedLotIdRef.current = lot.id;
                                            setSelectedLot(lot);
                                            setBidAmount(lot.highest_bid ? (lot.highest_bid + 50).toString() : lot.base_price.toString());
                                        }}
                                        className={selectedLot?.id === lot.id ? 'btn btn-primary' : 'btn btn-secondary'}
                                        style={{
                                            width: '100%',
                                            justifyContent: 'space-between',
                                            padding: '0.75rem 1rem',
                                            textAlign: 'left',
                                            opacity: lot.status === 'active' ? 1 : 0.6,
                                            borderLeft: lot.status === 'active' ? '4px solid #10b981' : (lot.status === 'sold' ? '4px solid #ef4444' : '4px solid transparent')
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Package size={16} />
                                            <span>LOT {lot.lot_number}</span>
                                        </div>
                                        <span className="mono-num" style={{ fontSize: '0.85rem' }}>
                                            {lot.quantity} units
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Bidding Interface */}
                    <div>
                        {selectedLot ? (
                            <>
                                <div className="fintech-card" style={{ marginBottom: '1rem', background: '#f9f9f9' }}>
                                    <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                        <h3 style={{ fontSize: '1rem', margin: 0 }}>LOT {selectedLot.lot_number}</h3>
                                        <div className="pill" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
                                            {selectedLot.status}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                        <div>
                                            <div className="text-label">Quantity</div>
                                            <div className="mono-num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                                {selectedLot.quantity}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-label">Base Price</div>
                                            <div className="mono-num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                                ${selectedLot.base_price.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '1rem' }}>
                                        <div className="text-label">Current Highest Bid</div>
                                        <div className="flex-between">
                                            <div className="mono-num" style={{ fontSize: '2rem', fontWeight: 700, color: '#D1202F' }}>
                                                ${selectedLot.highest_bid ? selectedLot.highest_bid.toLocaleString() : '---'}
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

                                <div className="fintech-card">
                                    <div className="text-label">PLACE YOUR BID</div>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                        <input
                                            type="number"
                                            className="input-field mono-num"
                                            style={{ fontSize: '1.5rem', fontWeight: 700, flex: 1 }}
                                            value={bidAmount}
                                            onChange={e => setBidAmount(e.target.value)}
                                            placeholder={selectedLot.base_price.toString()}
                                        />
                                        <button
                                            onClick={handlePlaceBid}
                                            disabled={loading || !bidAmount || selectedLot.status !== 'active'}
                                            className="btn btn-primary"
                                            style={{
                                                fontSize: '1.2rem',
                                                padding: '0 2rem',
                                                opacity: selectedLot.status !== 'active' ? 0.5 : 1,
                                                cursor: selectedLot.status !== 'active' ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            {loading ? '...' : (selectedLot.status === 'active' ? 'BID' : selectedLot.status.toUpperCase())}
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setBidAmount((selectedLot.highest_bid || selectedLot.base_price) + 50)}
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                                        >
                                            +$50
                                        </button>
                                        <button
                                            onClick={() => setBidAmount((selectedLot.highest_bid || selectedLot.base_price) + 100)}
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                                        >
                                            +$100
                                        </button>
                                        <button
                                            onClick={() => setBidAmount((selectedLot.highest_bid || selectedLot.base_price) + 500)}
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                                        >
                                            +$500
                                        </button>
                                    </div>

                                    <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.75rem' }}>
                                        Minimum bid: ${selectedLot.highest_bid ? (selectedLot.highest_bid + 1).toFixed(2) : selectedLot.base_price.toFixed(2)}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="fintech-card" style={{ textAlign: 'center', padding: '3rem' }}>
                                <Package size={40} color="#9CA3AF" style={{ marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1rem' }}>Select a Lot</h3>
                                <p style={{ color: '#666', fontSize: '0.85rem' }}>Choose a lot from the left to start bidding</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="fintech-card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <AlertCircle size={40} color="#9CA3AF" style={{ marginBottom: '1rem' }} />
                    <h3 style={{ fontSize: '1rem' }}>Auction House Closed</h3>
                    <p style={{ color: '#666', fontSize: '0.85rem' }}>Wait for the administrator to open the next auction</p>
                </div>
            )}

            {myLots.length > 0 && (
                <div className="fintech-card" style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                        <List size={16} /> My Listings
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {myLots.map(lot => {
                            const statusColor = lot.status === 'sold' ? '#16A34A' : lot.status === 'active' ? '#2563EB' : lot.status === 'cancelled' ? '#DC2626' : '#6B7280';
                            return (
                                <div key={lot.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '3px', fontSize: '0.85rem' }}>
                                    <span>
                                        <strong>{lot.asset_ticker}</strong> — Lot #{lot.lot_number} — {lot.quantity} units
                                        {lot.winner_username && <span style={{ color: '#6B7280', marginLeft: '0.5rem' }}>→ {lot.winner_username}</span>}
                                    </span>
                                    <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: statusColor }}>
                                        {lot.status}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <LotSchedule />
        </div>
    );
}
