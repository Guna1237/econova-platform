import { useState } from 'react';
import { nudgePrice, getAssets } from '../services/api';
import { toast } from 'sonner';
import { useEffect } from 'react';

export default function AdminPriceNudge() {
    const [assets, setAssets] = useState([]);
    const [selectedTicker, setSelectedTicker] = useState('');
    const [adjustmentType, setAdjustmentType] = useState('percent'); // 'percent' or 'absolute'
    const [adjustmentValue, setAdjustmentValue] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadAssets();
    }, []);

    const loadAssets = async () => {
        try {
            const data = await getAssets();
            setAssets(data);
            if (data.length > 0) {
                setSelectedTicker(data[0].ticker);
            }
        } catch (error) {
            toast.error('Failed to load assets');
        }
    };

    const handleNudge = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const adjustmentPct = adjustmentType === 'percent' ? parseFloat(adjustmentValue) : null;
            const adjustmentAbs = adjustmentType === 'absolute' ? parseFloat(adjustmentValue) : null;

            const result = await nudgePrice(selectedTicker, adjustmentPct, adjustmentAbs);

            toast.success(
                `${result.ticker} price adjusted from $${result.old_price.toFixed(2)} to $${result.new_price.toFixed(2)}`
            );

            setAdjustmentValue('');
            await loadAssets(); // Refresh asset list
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to nudge price');
        } finally {
            setLoading(false);
        }
    };

    const selectedAsset = assets.find(a => a.ticker === selectedTicker);

    return (
        <div className="fintech-card">
            <div style={{ borderBottom: '2px solid #000', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', margin: 0 }}>PRICE CONTROL</h2>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0 0 0' }}>
                    Adjust asset prices to simulate market conditions
                </p>
            </div>

            <form onSubmit={handleNudge}>
                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">Asset</label>
                    <select
                        className="input-field"
                        value={selectedTicker}
                        onChange={(e) => setSelectedTicker(e.target.value)}
                        style={{ cursor: 'pointer' }}
                    >
                        {assets.map(asset => (
                            <option key={asset.ticker} value={asset.ticker}>
                                {asset.ticker} - {asset.name}
                            </option>
                        ))}
                    </select>
                </div>

                {selectedAsset && (
                    <div className="fintech-card" style={{ background: '#f9f9f9', marginBottom: '1rem', padding: '1rem' }}>
                        <div className="flex-between">
                            <span className="text-label" style={{ marginBottom: 0 }}>Current Price</span>
                            <span className="mono-num" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                                ${selectedAsset.current_price.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex-between" style={{ marginTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#666' }}>Base Price</span>
                            <span className="mono-num" style={{ fontSize: '0.85rem', color: '#666' }}>
                                ${selectedAsset.base_price.toFixed(2)}
                            </span>
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">Adjustment Type</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                            type="button"
                            className={adjustmentType === 'percent' ? 'btn btn-primary' : 'btn btn-secondary'}
                            onClick={() => setAdjustmentType('percent')}
                            style={{ padding: '0.5rem' }}
                        >
                            PERCENTAGE
                        </button>
                        <button
                            type="button"
                            className={adjustmentType === 'absolute' ? 'btn btn-primary' : 'btn btn-secondary'}
                            onClick={() => setAdjustmentType('absolute')}
                            style={{ padding: '0.5rem' }}
                        >
                            ABSOLUTE
                        </button>
                    </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label className="text-label">
                        {adjustmentType === 'percent' ? 'Percentage Change (%)' : 'Absolute Change ($)'}
                    </label>
                    <input
                        type="number"
                        className="input-field"
                        value={adjustmentValue}
                        onChange={(e) => setAdjustmentValue(e.target.value)}
                        required
                        step="0.01"
                        placeholder={adjustmentType === 'percent' ? 'e.g., 10 or -5' : 'e.g., 500 or -200'}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                        {adjustmentType === 'percent'
                            ? 'Positive values increase price, negative values decrease'
                            : 'Enter dollar amount to add or subtract from current price'
                        }
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setAdjustmentValue('')}
                        disabled={loading}
                    >
                        CLEAR
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading || !adjustmentValue}
                    >
                        {loading ? 'APPLYING...' : 'APPLY CHANGE'}
                    </button>
                </div>
            </form>
        </div>
    );
}
