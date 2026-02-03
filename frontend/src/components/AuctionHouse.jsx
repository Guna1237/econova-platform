import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gavel, TrendingUp, AlertCircle, Play, CheckCircle } from 'lucide-react';
import { scanBids, placeBid, openAuction, resolveAuction, getMarketState } from '../services/api';
import { toast } from 'sonner';

export default function AuctionHouse({ user, marketState, onUpdate }) {
    const [bids, setBids] = useState([]);
    const [bidAmount, setBidAmount] = useState(marketState?.active_auction_asset ? 0 : 0);
    const [loading, setLoading] = useState(false);

    const isActive = marketState?.phase === 'AUCTION';
    const currentTicker = marketState?.active_auction_asset;

    useEffect(() => {
        let interval;
        if (isActive && currentTicker) {
            const fetchBids = async () => {
                try {
                    const data = await scanBids();
                    setBids(data);
                    if (data.length > 0 && bidAmount === 0) {
                        setBidAmount(data[0].amount + 50); // Suggest next bid
                    }
                } catch (e) {
                    console.error("Bid scan failed", e);
                }
            };

            fetchBids();
            interval = setInterval(fetchBids, 2000); // Poll every 2s
        }
        return () => clearInterval(interval);
    }, [isActive, currentTicker]);

    const handlePlaceBid = async () => {
        try {
            setLoading(true);
            await placeBid(parseFloat(bidAmount));
            toast.success("Bid Placed!");
            // Force immediate refresh
            const data = await scanBids();
            setBids(data);
        } catch (err) {
            toast.error("Bid Failed", { description: err.response?.data?.detail });
        } finally {
            setLoading(false);
        }
    };

    const AdminControl = () => {
        const [openingAuction, setOpeningAuction] = useState(false);
        const [resolvingAuction, setResolvingAuction] = useState(false);

        return (
            <div className="fintech-card" style={{ marginBottom: '1rem', border: '1px solid #b91c1c', backgroundColor: '#fef2f2' }}>
                <h3 style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Gavel size={20} /> Auctioneer Console
                </h3>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    {!currentTicker ? (
                        <>
                            {['GOLD', 'TECH', 'OIL', 'REAL', 'BOND'].map(ticker => (
                                <button
                                    key={ticker}
                                    onClick={async () => {
                                        try {
                                            setOpeningAuction(true);
                                            console.log('[Auction] Opening auction for', ticker);
                                            await openAuction(ticker);
                                            toast.success(`Auction opened for ${ticker}`);
                                            await onUpdate(); // Refresh market state
                                        } catch (err) {
                                            console.error('[Auction] Failed to open:', err);
                                            toast.error(`Failed to open ${ticker}`, {
                                                description: err.response?.data?.detail || err.message
                                            });
                                        } finally {
                                            setOpeningAuction(false);
                                        }
                                    }}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.8rem' }}
                                    disabled={openingAuction}
                                >
                                    {openingAuction ? 'Opening...' : `Open ${ticker}`}
                                </button>
                            ))}
                        </>
                    ) : (
                        <button
                            onClick={async () => {
                                try {
                                    setResolvingAuction(true);
                                    console.log('[Auction] Resolving auction for', currentTicker);
                                    const res = await resolveAuction();
                                    toast.success(res.message || 'Auction resolved');
                                    await onUpdate();
                                } catch (err) {
                                    console.error('[Auction] Failed to resolve:', err);
                                    toast.error('Failed to resolve auction', {
                                        description: err.response?.data?.detail || err.message
                                    });
                                } finally {
                                    setResolvingAuction(false);
                                }
                            }}
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                            disabled={resolvingAuction}
                        >
                            {resolvingAuction ? 'PROCESSING...' : 'HAMMER DOWN (SOLD)'}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    if (!isActive && user.role !== 'admin') return null;

    return (
        <div className="animate-fade-in">
            {user.role === 'admin' && <AdminControl />}

            {isActive ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    {/* Left: Asset on Block */}
                    <div className="fintech-card" style={{ textAlign: 'center', paddingTop: '3rem', paddingBottom: '3rem', borderLeft: '5px solid #D1202F' }}>
                        <div className="text-label" style={{ fontSize: '1rem' }}>ON THE BLOCK</div>
                        <h1 style={{ fontSize: '4rem', margin: '1rem 0', color: '#D1202F' }}>{currentTicker || "WAITING..."}</h1>
                        <div style={{ fontSize: '1.2rem', color: '#6B7280' }}>
                            {currentTicker === 'TECH' ? 'Tech Growth ETF' : currentTicker === 'GOLD' ? 'Gold Reserves' : 'Asset Class'}
                        </div>
                        <div className="pill pill-red" style={{ marginTop: '1rem', fontSize: '1rem' }}>LIVE AUCTION</div>
                    </div>

                    {/* Right: Bidding */}
                    <div>
                        <div className="fintech-card" style={{ marginBottom: '1rem' }}>
                            <div className="flex-between">
                                <div>
                                    <div className="text-label">CURRENT HIGHEST BID</div>
                                    <div className="mono-num" style={{ fontSize: '2.5rem', fontWeight: 700 }}>
                                        ${bids.length > 0 ? bids[0].amount.toLocaleString() : "---"}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="text-label">LEADER</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                                        {bids.length > 0 ? `User #${bids[0].user_id}` : "No Bids"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="fintech-card">
                            <div className="text-label">PLACE YOUR BID</div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <input
                                    type="number"
                                    className="input-field mono-num"
                                    style={{ fontSize: '1.5rem', fontWeight: 700 }}
                                    value={bidAmount}
                                    onChange={e => setBidAmount(e.target.value)}
                                />
                                <button
                                    onClick={handlePlaceBid}
                                    disabled={loading}
                                    className="btn btn-primary"
                                    style={{ fontSize: '1.2rem', padding: '0 2rem' }}
                                >
                                    BID
                                </button>
                            </div>
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Recent Bids</h4>
                            {bids.slice(0, 5).map((b, i) => (
                                <div key={b.id} className="flex-between" style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee', opacity: i === 0 ? 1 : 0.6 }}>
                                    <span className="mono-num" style={{ fontWeight: 600 }}>${b.amount.toLocaleString()}</span>
                                    <span style={{ fontSize: '0.8rem' }}>User #{b.user_id}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="fintech-card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <AlertCircle size={40} color="#9CA3AF" style={{ marginBottom: '1rem' }} />
                    <h3>Auction House Closed</h3>
                    <p style={{ color: '#6B7280' }}>Wait for the Administrator to open the next lot.</p>
                </div>
            )}
        </div>
    );
}
