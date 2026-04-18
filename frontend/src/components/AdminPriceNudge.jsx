import { useState, useEffect } from 'react';
import { nudgePrice, getAssets, getAutoNewsConfig, setAutoNewsConfig, deleteAutoNewsConfig } from '../services/api';
import { toast } from 'sonner';

export default function AdminPriceNudge() {
    const [assets, setAssets] = useState([]);
    const [selectedTicker, setSelectedTicker] = useState('');
    const [adjustmentType, setAdjustmentType] = useState('percent');
    const [adjustmentValue, setAdjustmentValue] = useState('');
    const [loading, setLoading] = useState(false);

    // Auto-news config state
    const [showNewsConfig, setShowNewsConfig] = useState(false);
    const [newsConfig, setNewsConfig] = useState({});
    const [defaults, setDefaults] = useState({});
    const [editTicker, setEditTicker] = useState('');
    const [upTemplates, setUpTemplates] = useState([]);
    const [downTemplates, setDownTemplates] = useState([]);
    const [savingNews, setSavingNews] = useState(false);

    useEffect(() => {
        loadAssets();
    }, []);

    const loadAssets = async () => {
        try {
            const data = await getAssets();
            setAssets(data);
            if (data.length > 0) setSelectedTicker(data[0].ticker);
        } catch (error) {
            toast.error('Failed to load assets');
        }
    };

    const loadNewsConfig = async () => {
        try {
            const data = await getAutoNewsConfig();
            setNewsConfig(data.config || {});
            setDefaults(data.defaults || {});
        } catch (error) {
            toast.error('Failed to load auto-news config');
        }
    };

    const handleNudge = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const adjustmentPct = adjustmentType === 'percent' ? parseFloat(adjustmentValue) : null;
            const adjustmentAbs = adjustmentType === 'absolute' ? parseFloat(adjustmentValue) : null;
            const result = await nudgePrice(selectedTicker, adjustmentPct, adjustmentAbs);
            let msg = `${result.ticker} price adjusted from $${result.old_price.toFixed(2)} to $${result.new_price.toFixed(2)}`;
            if (result.auto_news) msg += ` — News: "${result.auto_news}"`;
            toast.success(msg);
            setAdjustmentValue('');
            await loadAssets();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to nudge price');
        } finally {
            setLoading(false);
        }
    };

    const openNewsEditor = (ticker) => {
        setEditTicker(ticker);
        const existing = newsConfig[ticker];
        if (existing) {
            setUpTemplates(existing.up?.map(t => ({ ...t })) || []);
            setDownTemplates(existing.down?.map(t => ({ ...t })) || []);
        } else {
            // Pre-fill with defaults so admin can see placeholders
            setUpTemplates(defaults.up?.map(t => ({ ...t })) || []);
            setDownTemplates(defaults.down?.map(t => ({ ...t })) || []);
        }
    };

    const handleSaveNewsConfig = async () => {
        if (!editTicker) return;
        setSavingNews(true);
        try {
            await setAutoNewsConfig(editTicker, upTemplates, downTemplates);
            toast.success(`Auto-news templates saved for ${editTicker}`);
            await loadNewsConfig();
            setEditTicker('');
        } catch (error) {
            toast.error('Failed to save auto-news config');
        } finally {
            setSavingNews(false);
        }
    };

    const handleDeleteNewsConfig = async (ticker) => {
        try {
            await deleteAutoNewsConfig(ticker);
            toast.success(`Custom templates removed for ${ticker}. Using defaults.`);
            await loadNewsConfig();
            if (editTicker === ticker) setEditTicker('');
        } catch (error) {
            toast.error('Failed to remove config');
        }
    };

    const addTemplate = (direction) => {
        const setter = direction === 'up' ? setUpTemplates : setDownTemplates;
        const arr = direction === 'up' ? upTemplates : downTemplates;
        setter([...arr, { title: '', content: '' }]);
    };

    const removeTemplate = (direction, idx) => {
        const setter = direction === 'up' ? setUpTemplates : setDownTemplates;
        const arr = direction === 'up' ? [...upTemplates] : [...downTemplates];
        arr.splice(idx, 1);
        setter(arr);
    };

    const updateTemplate = (direction, idx, field, value) => {
        const setter = direction === 'up' ? setUpTemplates : setDownTemplates;
        const arr = direction === 'up' ? [...upTemplates] : [...downTemplates];
        arr[idx] = { ...arr[idx], [field]: value };
        setter(arr);
    };

    const selectedAsset = assets.find(a => a.ticker === selectedTicker);
    const auctionableTickers = assets.filter(a => a.ticker !== 'TBILL').map(a => a.ticker);

    return (
        <div className="fintech-card">
            <div style={{ borderBottom: '2px solid #000', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', margin: 0 }}>PRICE CONTROL</h2>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0 0 0' }}>
                    Adjust asset prices — auto-generates news when change &ge; 0.5%
                </p>
            </div>

            <form onSubmit={handleNudge}>
                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">Asset</label>
                    <select className="input-field" value={selectedTicker} onChange={(e) => setSelectedTicker(e.target.value)} style={{ cursor: 'pointer' }}>
                        {assets.map(asset => (
                            <option key={asset.ticker} value={asset.ticker}>{asset.ticker} - {asset.name}</option>
                        ))}
                    </select>
                </div>

                {selectedAsset && (
                    <div className="fintech-card" style={{ background: '#f9f9f9', marginBottom: '1rem', padding: '1rem' }}>
                        <div className="flex-between">
                            <span className="text-label" style={{ marginBottom: 0 }}>Current Price</span>
                            <span className="mono-num" style={{ fontSize: '1.1rem', fontWeight: 700 }}>${selectedAsset.current_price.toFixed(2)}</span>
                        </div>
                        <div className="flex-between" style={{ marginTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#666' }}>Base Price</span>
                            <span className="mono-num" style={{ fontSize: '0.85rem', color: '#666' }}>${selectedAsset.base_price.toFixed(2)}</span>
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">Adjustment Type</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button type="button" className={adjustmentType === 'percent' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setAdjustmentType('percent')} style={{ padding: '0.5rem' }}>PERCENTAGE</button>
                        <button type="button" className={adjustmentType === 'absolute' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setAdjustmentType('absolute')} style={{ padding: '0.5rem' }}>ABSOLUTE</button>
                    </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label className="text-label">{adjustmentType === 'percent' ? 'Percentage Change (%)' : 'Absolute Change ($)'}</label>
                    <input type="number" className="input-field" value={adjustmentValue} onChange={(e) => setAdjustmentValue(e.target.value)} required step="0.01" placeholder={adjustmentType === 'percent' ? 'e.g., 10 or -5' : 'e.g., 500 or -200'} />
                    <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                        {adjustmentType === 'percent' ? 'Positive values increase price, negative values decrease' : 'Enter dollar amount to add or subtract from current price'}
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setAdjustmentValue('')} disabled={loading}>CLEAR</button>
                    <button type="submit" className="btn btn-primary" disabled={loading || !adjustmentValue}>{loading ? 'APPLYING...' : 'APPLY CHANGE'}</button>
                </div>
            </form>

            {/* --- Auto-News Config Toggle --- */}
            <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '1rem' }}>
                <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.8rem', padding: '0.6rem' }}
                    onClick={() => { setShowNewsConfig(!showNewsConfig); if (!showNewsConfig) loadNewsConfig(); }}
                >
                    {showNewsConfig ? 'HIDE' : 'CONFIGURE'} AUTO-NEWS TEMPLATES
                </button>

                {showNewsConfig && (
                    <div style={{ marginTop: '1rem' }}>
                        <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>
                            Placeholders: <code>{'{ticker}'}</code> <code>{'{asset_name}'}</code> <code>{'{change_pct}'}</code> <code>{'{old_price}'}</code> <code>{'{new_price}'}</code>
                        </p>

                        {/* Ticker selector */}
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            {auctionableTickers.map(t => (
                                <button key={t} type="button" className={editTicker === t ? 'btn btn-primary' : 'btn btn-secondary'}
                                    style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', position: 'relative' }}
                                    onClick={() => openNewsEditor(t)}
                                >
                                    {t}
                                    {newsConfig[t] && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />}
                                </button>
                            ))}
                        </div>

                        {/* Template editor */}
                        {editTicker && (
                            <div style={{ border: '1px solid #e5e5e5', padding: '1rem', borderRadius: '4px' }}>
                                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.85rem' }}>{editTicker} Templates</h4>
                                    {newsConfig[editTicker] && (
                                        <button type="button" style={{ fontSize: '0.7rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                            onClick={() => handleDeleteNewsConfig(editTicker)}>
                                            Reset to Defaults
                                        </button>
                                    )}
                                </div>

                                {/* Price UP templates */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#16a34a' }}>PRICE UP</span>
                                        <button type="button" onClick={() => addTemplate('up')} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 3, cursor: 'pointer' }}>+ ADD</button>
                                    </div>
                                    {upTemplates.map((t, i) => (
                                        <div key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, position: 'relative' }}>
                                            <button type="button" onClick={() => removeTemplate('up', i)}
                                                style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '0.8rem' }}>x</button>
                                            <input type="text" className="input-field" placeholder="Title template" value={t.title}
                                                onChange={e => updateTemplate('up', i, 'title', e.target.value)}
                                                style={{ marginBottom: '0.3rem', fontSize: '0.8rem' }} />
                                            <textarea className="input-field" placeholder="Content template" value={t.content}
                                                onChange={e => updateTemplate('up', i, 'content', e.target.value)}
                                                rows={2} style={{ fontSize: '0.75rem', resize: 'vertical' }} />
                                        </div>
                                    ))}
                                    {upTemplates.length === 0 && <p style={{ fontSize: '0.75rem', color: '#999' }}>No templates — using built-in defaults</p>}
                                </div>

                                {/* Price DOWN templates */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>PRICE DOWN</span>
                                        <button type="button" onClick={() => addTemplate('down')} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 3, cursor: 'pointer' }}>+ ADD</button>
                                    </div>
                                    {downTemplates.map((t, i) => (
                                        <div key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, position: 'relative' }}>
                                            <button type="button" onClick={() => removeTemplate('down', i)}
                                                style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '0.8rem' }}>x</button>
                                            <input type="text" className="input-field" placeholder="Title template" value={t.title}
                                                onChange={e => updateTemplate('down', i, 'title', e.target.value)}
                                                style={{ marginBottom: '0.3rem', fontSize: '0.8rem' }} />
                                            <textarea className="input-field" placeholder="Content template" value={t.content}
                                                onChange={e => updateTemplate('down', i, 'content', e.target.value)}
                                                rows={2} style={{ fontSize: '0.75rem', resize: 'vertical' }} />
                                        </div>
                                    ))}
                                    {downTemplates.length === 0 && <p style={{ fontSize: '0.75rem', color: '#999' }}>No templates — using built-in defaults</p>}
                                </div>

                                <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={savingNews} onClick={handleSaveNewsConfig}>
                                    {savingNews ? 'SAVING...' : `SAVE ${editTicker} TEMPLATES`}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
