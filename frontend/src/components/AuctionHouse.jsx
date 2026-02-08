import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gavel, TrendingUp, AlertCircle, Play, CheckCircle, Package } from 'lucide-react';
import { getAuctionLots, placeLotBid, openAuction, resolveAuction } from '../services/api';
import { toast } from 'sonner';

export default function AuctionHouse({ user, marketState, onUpdate }) {
    const [lots, setLots] = useState([]);
    const [selectedLot, setSelectedLot] = useState(null);
    const [bidAmount, setBidAmount] = useState('');
    const [loading, setLoading] = useState(false);

    const isActive = marketState?.phase === 'AUCTION';
    const currentTicker = marketState?.active_auction_asset;

    useEffect(() => {
        let interval;
        if (isActive && currentTicker) {
            const fetchLots = async () => {
                try {
                    const data = await getAuctionLots();
                    setLots(data);
                    if (data.length > 0 && !selectedLot) {
                        setSelectedLot(data[0]);
                    }
                } catch (e) {
                    console.error("Failed to fetch lots", e);
                }
            };

            fetchLots();
            interval = setInterval(fetchLots, 2000); // Poll every 2s
        }
        return () => clearInterval(interval);
    }, [isActive, currentTicker, selectedLot]);

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
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Bid failed');
        } finally {
            setLoading(false);
        }
    };

    const AdminControl = () => {
        const [openingAuction, setOpeningAuction] = useState(false);
        const [resolvingAuction, setResolvingAuction] = useState(false);

        return (
            <div className="fintech-card" style={{ marginBottom: '1rem', border: '1px solid #b91c1c', backgroundColor: '#fef2f2' }}>
                <h3 style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <Gavel size={18} /> AUCTIONEER CONSOLE
                </h3>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    {!currentTicker ? (
                        <>
                            {['GOLD', 'TECH', 'OIL', 'REAL', 'BOND'].map(ticker => (
                                <button
                                    key={ticker}
                                    onClick={async () => {
                                        try {
                                            setOpeningAuction(true);
                                            await openAuction(ticker);
                                            toast.success(`Auction opened for ${ticker}`);
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
                    ) : (
                        <button
                            onClick={async () => {
                                try {
                                    setResolvingAuction(true);
                                    const res = await resolveAuction();
                                    toast.success(res.message || 'Auction resolved');
                                    await onUpdate();
                                } catch (err) {
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
                    {/* Left: Asset Info */}
                    <div>
                        <div className="fintech-card" style={{ textAlign: 'center', padding: '2rem', borderLeft: '5px solid #D1202F', marginBottom: '1rem' }}>
                            <div className="text-label" style={{ fontSize: '0.8rem' }}>ON THE BLOCK</div>
                            <h1 style={{ fontSize: '3rem', margin: '0.75rem 0', color: '#D1202F' }}>{currentTicker || "WAITING..."}</h1>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                {currentTicker === 'TECH' ? 'Tech Growth ETF' :
                                    currentTicker === 'GOLD' ? 'Gold Reserves' :
                                        currentTicker === 'OIL' ? 'Oil Futures' :
                                            currentTicker === 'REAL' ? 'Real Estate' :
                                                currentTicker === 'BOND' ? 'Government Bonds' : 'Asset Class'}
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
        </div>
    );
}
