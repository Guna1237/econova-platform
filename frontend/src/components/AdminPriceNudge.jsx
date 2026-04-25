import { useState, useEffect } from 'react';
import { nudgePrice, getAssets, getAutoNewsConfig, setAutoNewsConfig, deleteAutoNewsConfig, getShockNewsConfig, setShockNewsConfig, deleteShockNewsConfig } from '../services/api';
import { toast } from 'sonner';

const SHOCK_KEY_LABELS = {
    INFLATION_HINT:    'Inflation — Hint',
    INFLATION_WARNING: 'Inflation — Warning',
    INFLATION_CRASH:   'Inflation — Crash',
    RECESSION_HINT:    'Recession — Hint',
    RECESSION_WARNING: 'Recession — Warning',
    RECESSION_CRASH:   'Recession — Crash',
    INFLATION_RECOVERY:'Inflation — Recovery',
    RECESSION_RECOVERY:'Recession — Recovery',
};

export default function AdminPriceNudge() {
    const [assets, setAssets] = useState([]);
    const [selectedTicker, setSelectedTicker] = useState('');
    const [adjustmentType, setAdjustmentType] = useState('percent');
    const [adjustmentValue, setAdjustmentValue] = useState('');
    const [loading, setLoading] = useState(false);

    // News mode for nudge: 'auto' | 'custom' | 'skip'
    const [newsMode, setNewsMode] = useState('auto');
    const [customNewsTitle, setCustomNewsTitle] = useState('');
    const [customNewsContent, setCustomNewsContent] = useState('');

    // Price auto-news template config
    const [showNewsConfig, setShowNewsConfig] = useState(false);
    const [newsConfig, setNewsConfig] = useState({});
    const [defaults, setDefaults] = useState({});
    const [editTicker, setEditTicker] = useState('');
    const [upTemplates, setUpTemplates] = useState([]);
    const [downTemplates, setDownTemplates] = useState([]);
    const [savingNews, setSavingNews] = useState(false);

    // Shock news template config
    const [showShockConfig, setShowShockConfig] = useState(false);
    const [shockConfig, setShockConfig] = useState({});
    const [shockDefaults, setShockDefaults] = useState({});
    const [editShockKey, setEditShockKey] = useState('');
    const [shockTemplates, setShockTemplates] = useState([]);
    const [savingShock, setSavingShock] = useState(false);

    useEffect(() => { loadAssets(); }, []);

    const loadAssets = async () => {
        try {
            const data = await getAssets();
            const filtered = data.filter(a => a.ticker !== 'TBILL');
            setAssets(filtered);
            if (filtered.length > 0) setSelectedTicker(filtered[0].ticker);
        } catch {
            toast.error('Failed to load assets');
        }
    };

    const loadNewsConfig = async () => {
        try {
            const data = await getAutoNewsConfig();
            setNewsConfig(data.config || {});
            setDefaults(data.defaults || {});
        } catch {
            toast.error('Failed to load auto-news config');
        }
    };

    const loadShockConfig = async () => {
        try {
            const data = await getShockNewsConfig();
            setShockConfig(data.config || {});
            setShockDefaults(data.defaults || {});
        } catch {
            toast.error('Failed to load shock news config');
        }
    };

    const handleNudge = async (e) => {
        e.preventDefault();
        if (newsMode === 'custom' && (!customNewsTitle.trim() || !customNewsContent.trim())) {
            toast.error('Custom news requires both title and content');
            return;
        }
        setLoading(true);
        try {
            const adjPct = adjustmentType === 'percent' ? parseFloat(adjustmentValue) : null;
            const adjAbs = adjustmentType === 'absolute' ? parseFloat(adjustmentValue) : null;
            const result = await nudgePrice(selectedTicker, adjPct, adjAbs, newsMode, customNewsTitle, customNewsContent);
            let msg = `${result.ticker}: $${result.old_price.toFixed(2)} → $${result.new_price.toFixed(2)}`;
            if (result.auto_news) msg += ` — News: "${result.auto_news}"`;
            toast.success(msg);
            setAdjustmentValue('');
            if (newsMode === 'custom') { setCustomNewsTitle(''); setCustomNewsContent(''); }
            await loadAssets();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to nudge price');
        } finally {
            setLoading(false);
        }
    };

    // --- Price auto-news template helpers ---
    const openNewsEditor = (ticker) => {
        setEditTicker(ticker);
        const existing = newsConfig[ticker];
        const tickerDefaults = defaults[ticker] || defaults['_default'] || {};
        setUpTemplates(existing ? existing.up?.map(t => ({ ...t })) : (tickerDefaults.up?.map(t => ({ ...t })) || []));
        setDownTemplates(existing ? existing.down?.map(t => ({ ...t })) : (tickerDefaults.down?.map(t => ({ ...t })) || []));
    };

    const handleSaveNewsConfig = async () => {
        if (!editTicker) return;
        setSavingNews(true);
        try {
            await setAutoNewsConfig(editTicker, upTemplates, downTemplates);
            toast.success(`Auto-news templates saved for ${editTicker}`);
            await loadNewsConfig();
            setEditTicker('');
        } catch { toast.error('Failed to save auto-news config'); }
        finally { setSavingNews(false); }
    };

    const handleDeleteNewsConfig = async (ticker) => {
        try {
            await deleteAutoNewsConfig(ticker);
            toast.success(`Templates reset to defaults for ${ticker}`);
            await loadNewsConfig();
            if (editTicker === ticker) setEditTicker('');
        } catch { toast.error('Failed to remove config'); }
    };

    const addTemplate = (setter, arr) => setter([...arr, { title: '', content: '', source: '', image_url: '' }]);
    const removeTemplate = (setter, arr, i) => { const a = [...arr]; a.splice(i, 1); setter(a); };
    const updateTemplate = (setter, arr, i, field, val) => { const a = [...arr]; a[i] = { ...a[i], [field]: val }; setter(a); };

    // --- Shock news template helpers ---
    const openShockEditor = (key) => {
        setEditShockKey(key);
        const existing = shockConfig[key];
        setShockTemplates(existing ? existing.map(t => ({ ...t })) : (shockDefaults[key]?.map(t => ({ ...t })) || []));
    };

    const handleSaveShockConfig = async () => {
        if (!editShockKey) return;
        setSavingShock(true);
        try {
            await setShockNewsConfig(editShockKey, shockTemplates);
            toast.success(`Shock news templates saved for ${SHOCK_KEY_LABELS[editShockKey] || editShockKey}`);
            await loadShockConfig();
            setEditShockKey('');
        } catch { toast.error('Failed to save shock news config'); }
        finally { setSavingShock(false); }
    };

    const handleDeleteShockConfig = async (key) => {
        try {
            await deleteShockNewsConfig(key);
            toast.success(`Reset to defaults for ${SHOCK_KEY_LABELS[key] || key}`);
            await loadShockConfig();
            if (editShockKey === key) setEditShockKey('');
        } catch { toast.error('Failed to reset config'); }
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
                    <select className="input-field" value={selectedTicker} onChange={e => setSelectedTicker(e.target.value)} style={{ cursor: 'pointer' }}>
                        {assets.map(a => <option key={a.ticker} value={a.ticker}>{a.ticker} — {a.name}</option>)}
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

                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">{adjustmentType === 'percent' ? 'Percentage Change (%)' : 'Absolute Change ($)'}</label>
                    <input type="number" className="input-field" value={adjustmentValue} onChange={e => setAdjustmentValue(e.target.value)} required step="0.01"
                        placeholder={adjustmentType === 'percent' ? 'e.g. 10 or -5' : 'e.g. 500 or -200'} />
                </div>

                {/* News mode */}
                <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: '#f9f9f9', border: '1px solid #e5e7eb' }}>
                    <label className="text-label" style={{ marginBottom: '0.5rem' }}>News After Nudge</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: newsMode === 'custom' ? '0.75rem' : 0 }}>
                        {['auto', 'custom', 'skip'].map(mode => (
                            <button key={mode} type="button"
                                onClick={() => setNewsMode(mode)}
                                style={{
                                    padding: '0.35rem', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'Roboto Mono',
                                    background: newsMode === mode ? '#000' : '#F3F4F6',
                                    color: newsMode === mode ? '#FFF' : '#000',
                                    border: '1px solid #000', cursor: 'pointer'
                                }}>
                                {mode === 'auto' ? 'AUTO' : mode === 'custom' ? 'CUSTOM' : 'SKIP'}
                            </button>
                        ))}
                    </div>
                    {newsMode === 'auto' && <p style={{ fontSize: '0.7rem', color: '#666', margin: 0 }}>Random template picked from configured set</p>}
                    {newsMode === 'skip' && <p style={{ fontSize: '0.7rem', color: '#666', margin: 0 }}>No news item will be posted</p>}
                    {newsMode === 'custom' && (
                        <div>
                            <input type="text" className="input-field" placeholder="News headline" value={customNewsTitle}
                                onChange={e => setCustomNewsTitle(e.target.value)}
                                style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }} />
                            <textarea className="input-field" placeholder="News body text" rows={3} value={customNewsContent}
                                onChange={e => setCustomNewsContent(e.target.value)}
                                style={{ fontSize: '0.8rem', resize: 'vertical' }} />
                        </div>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setAdjustmentValue('')} disabled={loading}>CLEAR</button>
                    <button type="submit" className="btn btn-primary" disabled={loading || !adjustmentValue}>{loading ? 'APPLYING...' : 'APPLY CHANGE'}</button>
                </div>
            </form>

            {/* --- Price Auto-News Templates Config --- */}
            <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '1rem', marginBottom: '0.5rem' }}>
                <button type="button" className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.8rem', padding: '0.6rem' }}
                    onClick={() => { setShowNewsConfig(!showNewsConfig); if (!showNewsConfig) loadNewsConfig(); }}>
                    {showNewsConfig ? 'HIDE' : 'CONFIGURE'} PRICE AUTO-NEWS TEMPLATES
                </button>

                {showNewsConfig && (
                    <div style={{ marginTop: '1rem' }}>
                        <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>
                            Placeholders: <code>{'{ticker}'}</code> <code>{'{asset_name}'}</code> <code>{'{change_pct}'}</code> <code>{'{old_price}'}</code> <code>{'{new_price}'}</code>
                        </p>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            {auctionableTickers.map(t => (
                                <button key={t} type="button" className={editTicker === t ? 'btn btn-primary' : 'btn btn-secondary'}
                                    style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', position: 'relative' }}
                                    onClick={() => openNewsEditor(t)}>
                                    {t}
                                    {newsConfig[t] && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />}
                                </button>
                            ))}
                        </div>

                        {editTicker && (
                            <div style={{ border: '1px solid #e5e5e5', padding: '1rem', borderRadius: '4px' }}>
                                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.85rem' }}>{editTicker} Templates</h4>
                                    {newsConfig[editTicker] && (
                                        <button type="button" style={{ fontSize: '0.7rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                            onClick={() => handleDeleteNewsConfig(editTicker)}>Reset to Defaults</button>
                                    )}
                                </div>
                                {[['up', upTemplates, setUpTemplates, '#16a34a', '#f0fdf4', '#bbf7d0'], ['down', downTemplates, setDownTemplates, '#dc2626', '#fef2f2', '#fecaca']].map(([dir, arr, setter, color, bg, border]) => (
                                    <div key={dir} style={{ marginBottom: '1rem' }}>
                                        <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color }}>PRICE {dir.toUpperCase()}</span>
                                            <button type="button" onClick={() => addTemplate(setter, arr)}
                                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: bg, border: `1px solid ${border}`, borderRadius: 3, cursor: 'pointer' }}>+ ADD</button>
                                        </div>
                                        {arr.map((t, i) => (
                                            <div key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, position: 'relative' }}>
                                                <button type="button" onClick={() => removeTemplate(setter, arr, i)}
                                                    style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '0.8rem' }}>x</button>
                                                <input type="text" className="input-field" placeholder="Title template" value={t.title}
                                                    onChange={e => updateTemplate(setter, arr, i, 'title', e.target.value)}
                                                    style={{ marginBottom: '0.3rem', fontSize: '0.8rem' }} />
                                                <textarea className="input-field" placeholder="Content template" value={t.content}
                                                    onChange={e => updateTemplate(setter, arr, i, 'content', e.target.value)}
                                                    rows={2} style={{ fontSize: '0.75rem', resize: 'vertical', marginBottom: '0.3rem' }} />
                                                <input type="text" className="input-field" placeholder="Source (e.g. Reuters)" value={t.source || ''}
                                                    onChange={e => updateTemplate(setter, arr, i, 'source', e.target.value)}
                                                    style={{ marginBottom: '0.3rem', fontSize: '0.75rem' }} />
                                                <input type="text" className="input-field" placeholder="Image URL (optional)" value={t.image_url || ''}
                                                    onChange={e => updateTemplate(setter, arr, i, 'image_url', e.target.value)}
                                                    style={{ fontSize: '0.75rem' }} />
                                            </div>
                                        ))}
                                        {arr.length === 0 && <p style={{ fontSize: '0.75rem', color: '#999' }}>No templates — using built-in defaults</p>}
                                    </div>
                                ))}
                                <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={savingNews} onClick={handleSaveNewsConfig}>
                                    {savingNews ? 'SAVING...' : `SAVE ${editTicker} TEMPLATES`}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* --- Shock Auto-News Templates Config --- */}
            <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '1rem' }}>
                <button type="button" className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.8rem', padding: '0.6rem' }}
                    onClick={() => { setShowShockConfig(!showShockConfig); if (!showShockConfig) loadShockConfig(); }}>
                    {showShockConfig ? 'HIDE' : 'CONFIGURE'} SHOCK NEWS TEMPLATES
                </button>

                {showShockConfig && (
                    <div style={{ marginTop: '1rem' }}>
                        <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem' }}>
                            Posted automatically when admin triggers each shock stage.
                        </p>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            {Object.keys(SHOCK_KEY_LABELS).map(key => (
                                <button key={key} type="button"
                                    className={editShockKey === key ? 'btn btn-primary' : 'btn btn-secondary'}
                                    style={{ padding: '0.35rem 0.7rem', fontSize: '0.72rem', position: 'relative' }}
                                    onClick={() => openShockEditor(key)}>
                                    {SHOCK_KEY_LABELS[key]}
                                    {shockConfig[key] && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />}
                                </button>
                            ))}
                        </div>

                        {editShockKey && (
                            <div style={{ border: '1px solid #e5e5e5', padding: '1rem', borderRadius: '4px' }}>
                                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.85rem' }}>{SHOCK_KEY_LABELS[editShockKey] || editShockKey}</h4>
                                    {shockConfig[editShockKey] && (
                                        <button type="button" style={{ fontSize: '0.7rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                            onClick={() => handleDeleteShockConfig(editShockKey)}>Reset to Defaults</button>
                                    )}
                                </div>
                                <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#b45309' }}>TEMPLATES (one picked at random)</span>
                                    <button type="button" onClick={() => setShockTemplates([...shockTemplates, { title: '', content: '', source: '', image_url: '' }])}
                                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 3, cursor: 'pointer' }}>+ ADD</button>
                                </div>
                                {shockTemplates.map((t, i) => (
                                    <div key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, position: 'relative' }}>
                                        <button type="button" onClick={() => { const a = [...shockTemplates]; a.splice(i, 1); setShockTemplates(a); }}
                                            style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '0.8rem' }}>x</button>
                                        <input type="text" className="input-field" placeholder="Headline" value={t.title}
                                            onChange={e => { const a = [...shockTemplates]; a[i] = { ...a[i], title: e.target.value }; setShockTemplates(a); }}
                                            style={{ marginBottom: '0.3rem', fontSize: '0.8rem' }} />
                                        <textarea className="input-field" placeholder="News body" value={t.content}
                                            onChange={e => { const a = [...shockTemplates]; a[i] = { ...a[i], content: e.target.value }; setShockTemplates(a); }}
                                            rows={2} style={{ fontSize: '0.75rem', resize: 'vertical', marginBottom: '0.3rem' }} />
                                        <input type="text" className="input-field" placeholder="Source (e.g. Reuters)" value={t.source || ''}
                                            onChange={e => { const a = [...shockTemplates]; a[i] = { ...a[i], source: e.target.value }; setShockTemplates(a); }}
                                            style={{ marginBottom: '0.3rem', fontSize: '0.75rem' }} />
                                        <input type="text" className="input-field" placeholder="Image URL (optional)" value={t.image_url || ''}
                                            onChange={e => { const a = [...shockTemplates]; a[i] = { ...a[i], image_url: e.target.value }; setShockTemplates(a); }}
                                            style={{ fontSize: '0.75rem' }} />
                                    </div>
                                ))}
                                {shockTemplates.length === 0 && <p style={{ fontSize: '0.75rem', color: '#999' }}>No templates — using built-in defaults</p>}
                                <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={savingShock} onClick={handleSaveShockConfig}>
                                    {savingShock ? 'SAVING...' : `SAVE TEMPLATES`}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
