import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { createPrivateOffer, getMyOffers, acceptOffer, rejectOffer, getTransactions, getAllTeams } from '../services/api';
import { RefreshCw, ArrowRight, ArrowLeft, Check, X, Clock, History } from 'lucide-react';

export default function PrivateTrading({ user, marketState, assets }) {
    const [activeTab, setActiveTab] = useState('new_offer');
    const [offers, setOffers] = useState({ sent: [], received: [], open_market: [] });
    const [transactions, setTransactions] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        asset_ticker: '',
        offer_type: 'BUY',
        quantity: '',
        price_per_unit: '',
        to_username: '',
        listing_type: 'FIXED'
    });

    const fetchData = async () => {
        try {
            const [offersData, txData, teamsData] = await Promise.all([
                getMyOffers(),
                getTransactions(),
                getAllTeams()
            ]);
            setOffers(offersData);
            setTransactions(txData);
            setTeams(teamsData);
        } catch (error) {
            console.error("Failed to fetch trading data:", error);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    // Set initial asset
    useEffect(() => {
        if (assets.length > 0 && !formData.asset_ticker) {
            setFormData(prev => ({ ...prev, asset_ticker: assets[0].ticker }));
        }
    }, [assets]);

    const handleCreateOffer = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const isAuction = !formData.to_username && formData.offer_type === 'SELL' && formData.listing_type === 'AUCTION';
            const payload = {
                ...formData,
                to_username: formData.to_username || null,
                quantity: parseInt(formData.quantity),
                price_per_unit: parseFloat(formData.price_per_unit),
                listing_type: (!formData.to_username && formData.offer_type === 'SELL') ? formData.listing_type : 'FIXED'
            };

            const result = await createPrivateOffer(payload);
            if (isAuction) {
                toast.success(result.message || 'Lot submitted — admin will open it for bidding when ready.');
            } else {
                toast.success('Offer created successfully');
            }
            setFormData({ ...formData, quantity: '', price_per_unit: '', to_username: '' });
            await fetchData();
            setActiveTab('my_offers');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to create offer');
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async (offerId) => {
        try {
            await acceptOffer(offerId);
            toast.success('Offer accepted and trade executed!');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to accept offer');
        }
    };

    const handleReject = async (offerId) => {
        try {
            await rejectOffer(offerId);
            toast.info('Offer rejected');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to reject offer');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, textTransform: 'uppercase' }}>Private Trading Network</h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => setActiveTab('new_offer')}
                        className={activeTab === 'new_offer' ? 'btn btn-primary' : 'btn'}
                        style={activeTab !== 'new_offer' ? { background: '#FFF', border: '1px solid #E5E7EB' } : {}}
                    >
                        NEW OFFER
                    </button>
                    <button
                        onClick={() => setActiveTab('open_market')}
                        className={activeTab === 'open_market' ? 'btn btn-primary' : 'btn'}
                        style={activeTab !== 'open_market' ? { background: '#FFF', border: '1px solid #E5E7EB' } : {}}
                    >
                        OPEN MARKET {offers.open_market?.length > 0 ? `(${offers.open_market.length})` : ''}
                    </button>
                    <button
                        onClick={() => setActiveTab('my_offers')}
                        className={activeTab === 'my_offers' ? 'btn btn-primary' : 'btn'}
                        style={activeTab !== 'my_offers' ? { background: '#FFF', border: '1px solid #E5E7EB' } : {}}
                    >
                        {(() => {
                            const pendingCount = offers.received.filter(o => o.status === 'pending').length;
                            return pendingCount > 0 ? `OFFERS (${pendingCount})` : 'OFFERS';
                        })()}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={activeTab === 'history' ? 'btn btn-primary' : 'btn'}
                        style={activeTab !== 'history' ? { background: '#FFF', border: '1px solid #E5E7EB' } : {}}
                    >
                        HISTORY
                    </button>
                </div>
            </div>

            <div className="fintech-card">
                {!marketState?.marketplace_open && (
                    <div style={{
                        background: '#FEF2F2', border: '1px solid #F87171', color: '#B91C1C',
                        padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                        <Clock size={18} />
                        <strong>MARKET CLOSED:</strong> Private trading is currently suspended by administrators.
                    </div>
                )}

                {activeTab === 'new_offer' && (
                    <form onSubmit={handleCreateOffer} style={{ maxWidth: '600px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label className="text-label">I WANT TO...</label>
                                <div style={{ display: 'flex', border: '1px solid #000' }}>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, offer_type: 'BUY' })}
                                        style={{
                                            flex: 1, padding: '0.75rem', border: 'none', fontWeight: 700,
                                            background: formData.offer_type === 'BUY' ? '#D1202F' : '#FFF',
                                            color: formData.offer_type === 'BUY' ? '#FFF' : '#000'
                                        }}
                                    >
                                        BUY
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, offer_type: 'SELL' })}
                                        style={{
                                            flex: 1, padding: '0.75rem', border: 'none', fontWeight: 700,
                                            background: formData.offer_type === 'SELL' ? '#D1202F' : '#FFF',
                                            color: formData.offer_type === 'SELL' ? '#FFF' : '#000'
                                        }}
                                    >
                                        SELL
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-label">ASSET TO TRADE</label>
                                <select
                                    className="input-field"
                                    value={formData.asset_ticker}
                                    onChange={(e) => setFormData({ ...formData, asset_ticker: e.target.value })}
                                    style={{ width: '100%', borderRadius: 0, border: '1px solid #000' }}
                                >
                                    {assets.map(a => (
                                        <option key={a.id} value={a.ticker}>{a.ticker} ({a.name})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label className="text-label">QUANTITY</label>
                                <input
                                    type="number"
                                    className="input-field mono-num"
                                    required
                                    min="1"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                    style={{ width: '100%', borderRadius: 0, border: '1px solid #000' }}
                                />
                            </div>
                            <div>
                                <label className="text-label">PRICE PER UNIT ($)</label>
                                <input
                                    type="number"
                                    className="input-field mono-num"
                                    required
                                    min="0.01"
                                    step="0.01"
                                    value={formData.price_per_unit}
                                    onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                                    style={{ width: '100%', borderRadius: 0, border: '1px solid #000' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label className="text-label">COUNTERPARTY (OPTIONAL)</label>
                            <select
                                className="input-field"
                                value={formData.to_username}
                                onChange={(e) => setFormData({ ...formData, to_username: e.target.value })}
                                style={{ width: '100%', borderRadius: 0, border: '1px solid #000' }}
                            >
                                <option value="">-- OPEN OFFER (ANYONE CAN ACCEPT) --</option>
                                {teams.filter(t => t.username !== user.username).map(t => (
                                    <option key={t.id} value={t.username}>
                                        Team {t.username}
                                    </option>
                                ))}
                            </select>
                            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                                * If "OPEN OFFER" is selected, ANY team can accept this offer.
                            </p>
                        </div>

                        {!formData.to_username && formData.offer_type === 'SELL' && (
                            <div style={{ marginBottom: '1.5rem', background: '#F9FAFB', padding: '1.5rem', border: '1px solid #E5E7EB' }}>
                                <label className="text-label" style={{ display: 'block', marginBottom: '1rem' }}>LISTING METHOD</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <label style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                                        padding: '1rem', border: formData.listing_type === 'FIXED' ? '2px solid #000' : '1px solid #D1D5DB',
                                        background: '#FFF', cursor: 'pointer'
                                    }}>
                                        <input
                                            type="radio"
                                            name="listing_type"
                                            value="FIXED"
                                            checked={formData.listing_type === 'FIXED'}
                                            onChange={(e) => setFormData({ ...formData, listing_type: e.target.value })}
                                            style={{ marginTop: '0.25rem' }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: 700 }}>Fixed Price Board</div>
                                            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>List on the Open Market for any team to buy instantly at your specified price.</div>
                                        </div>
                                    </label>

                                    <label style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                                        padding: '1rem', border: formData.listing_type === 'AUCTION' ? '2px solid #000' : '1px solid #D1D5DB',
                                        background: '#FFF', cursor: 'pointer'
                                    }}>
                                        <input
                                            type="radio"
                                            name="listing_type"
                                            value="AUCTION"
                                            checked={formData.listing_type === 'AUCTION'}
                                            onChange={(e) => setFormData({ ...formData, listing_type: e.target.value })}
                                            style={{ marginTop: '0.25rem' }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: 700 }}>Auction House</div>
                                            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>Send to the main auction. <span style={{ color: '#D1202F', fontWeight: 600 }}>FEE: 20% tax on capital gains (or mandatory $500 listing fee if sold at a loss/cancelled).</span> Admin controls when this lot goes live.</div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}

                        <div style={{
                            background: '#F9FAFB', padding: '1rem', marginBottom: '1.5rem',
                            borderLeft: '4px solid #000', fontSize: '0.9rem'
                        }}>
                            <strong>TOTAL VALUE:</strong> {' '}
                            <span className="mono-num" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                                ${((parseInt(formData.quantity) || 0) * (parseFloat(formData.price_per_unit) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '1rem', fontSize: '1rem' }}
                        >
                            {loading ? 'CREATING...' : 'CREATE PRIVATE OFFER'}
                        </button>
                    </form>
                )}

                {activeTab === 'open_market' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div>
                            <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '0.5rem', marginBottom: '1rem' }}>OPEN MARKET (AVAILABLE TO ANYONE)</h3>
                            {!offers.open_market || offers.open_market.length === 0 ? (
                                <p style={{ color: '#666', fontStyle: 'italic' }}>No open offers available right now.</p>
                            ) : (
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    {offers.open_market.map(offer => (
                                        <div key={offer.id} style={{ border: '1px solid #E5E7EB', padding: '1rem', background: '#FFF' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem', fontWeight: 600 }}>
                                                        OFFER FROM TEAM #{offer.from_user_id}
                                                    </div>
                                                    <span style={{
                                                        background: offer.offer_type === 'buy' ? '#D1202F' : '#10B981',
                                                        color: '#FFF', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 700
                                                    }}>
                                                        THEY WANT TO {offer.offer_type.toUpperCase()}
                                                    </span>
                                                    <div style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                                                        {offer.quantity}x {offer.asset_ticker} @ ${offer.price_per_unit}
                                                    </div>
                                                </div>
                                                <div className="mono-num" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                                                    ${offer.total_value.toLocaleString()}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleAccept(offer.id)}
                                                    className="btn"
                                                    disabled={!marketState?.marketplace_open}
                                                    style={{ background: '#000', color: '#FFF', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                                >
                                                    ACCEPT DEAL
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'my_offers' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {/* INCOMING OFFERS */}
                        <div>
                            <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '0.5rem', marginBottom: '1rem' }}>INCOMING OFFERS</h3>
                            {offers.received.filter(o => o.status === 'pending').length === 0 ? (
                                <p style={{ color: '#666', fontStyle: 'italic' }}>No pending offers received.</p>
                            ) : (
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    {offers.received.filter(o => o.status === 'pending').map(offer => (
                                        <div key={offer.id} style={{ border: '1px solid #E5E7EB', padding: '1rem', background: '#FFF' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                <div>
                                                    <span style={{
                                                        background: offer.offer_type === 'buy' ? '#D1202F' : '#10B981',
                                                        color: '#FFF', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 700
                                                    }}>
                                                        THEY WANT TO {offer.offer_type.toUpperCase()}
                                                    </span>
                                                    <div style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                                                        {offer.quantity}x {offer.asset_ticker} @ ${offer.price_per_unit}
                                                    </div>
                                                </div>
                                                <div className="mono-num" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                                                    ${offer.total_value.toLocaleString()}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleReject(offer.id)}
                                                    className="btn"
                                                    style={{ background: '#F3F4F6', color: '#000', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                                >
                                                    REJECT
                                                </button>
                                                <button
                                                    onClick={() => handleAccept(offer.id)}
                                                    className="btn"
                                                    disabled={!marketState?.marketplace_open}
                                                    style={{ background: '#000', color: '#FFF', padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                                >
                                                    ACCEPT DEAL
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* OUTGOING OFFERS */}
                        <div>
                            <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '0.5rem', marginBottom: '1rem' }}>SENT OFFERS</h3>
                            {offers.sent.length === 0 ? (
                                <p style={{ color: '#666', fontStyle: 'italic' }}>No offers sent.</p>
                            ) : (
                                <table style={{ width: '100%', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F9FAFB', textAlign: 'left' }}>
                                            <th style={{ padding: '0.5rem' }}>TYPE</th>
                                            <th style={{ padding: '0.5rem' }}>ASSET</th>
                                            <th style={{ padding: '0.5rem' }}>DETAILS</th>
                                            <th style={{ padding: '0.5rem' }}>TO</th>
                                            <th style={{ padding: '0.5rem' }}>STATUS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {offers.sent.map(offer => (
                                            <tr key={offer.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: offer.offer_type === 'buy' ? '#D1202F' : '#10B981' }}>
                                                    {offer.offer_type.toUpperCase()}
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{offer.asset_ticker}</td>
                                                <td className="mono-num" style={{ padding: '0.75rem 0.5rem' }}>{offer.quantity} @ ${offer.price_per_unit}</td>
                                                <td style={{ padding: '0.75rem 0.5rem' }}>{offer.to_user_id ? `Team #${offer.to_user_id}` : 'ANYONE'}</td>
                                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                                    <span style={{
                                                        padding: '0.2rem 0.5rem',
                                                        background: offer.status === 'pending' ? '#FEF3C7' : offer.status === 'accepted' ? '#D1FAE5' : '#F3F4F6',
                                                        color: offer.status === 'pending' ? '#D97706' : offer.status === 'accepted' ? '#059669' : '#6B7280',
                                                        fontSize: '0.75rem', fontWeight: 700
                                                    }}>
                                                        {offer.status.toUpperCase()}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div style={{ overflowX: 'auto' }}>
                        <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#000' }}>
                            TRANSACTION HISTORY
                        </h3>
                        <table style={{ width: '100%', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#000', color: '#FFF' }}>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>TIME</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>BUYER</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>SELLER</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>ASSET</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>PRICE</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length === 0 ? (
                                    <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No transactions recorded yet.</td></tr>
                                ) : (
                                    transactions.map(txn => (
                                        <tr key={txn.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                            <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                                                {new Date(txn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td style={{ padding: '0.75rem', fontWeight: 600 }}>{txn.buyer_username}</td>
                                            <td style={{ padding: '0.75rem', fontWeight: 600 }}>{txn.seller_username}</td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <span style={{ background: '#F3F4F6', padding: '0.2rem 0.5rem', fontWeight: 600 }}>
                                                    {txn.quantity}x {txn.asset_ticker}
                                                </span>
                                            </td>
                                            <td className="mono-num" style={{ padding: '0.75rem', textAlign: 'right' }}>${txn.price_per_unit.toFixed(2)}</td>
                                            <td className="mono-num" style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>${txn.total_value.toLocaleString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
