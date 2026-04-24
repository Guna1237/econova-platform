import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getNews, getAllNewsAdmin, createNews, updateNews, deleteNews } from '../services/api';
import { Newspaper, Edit2, Trash2, Globe, Eye, EyeOff } from 'lucide-react';

function gameDate(item) {
    if (item.sim_year != null) {
        return item.sim_quarter ? `Y${item.sim_year} Q${item.sim_quarter}` : `Y${item.sim_year}`;
    }
    return new Date(item.published_at).toLocaleDateString();
}

export default function NewsTab({ user, marketState }) {
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isAdminMode, setIsAdminMode] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    const [formData, setFormData] = useState({
        title: '',
        content: '',
        source: 'Global News Network',
        is_published: true,
        image_url: '',
    });

    const fetchNews = async () => {
        try {
            setLoading(true);
            const data = user?.role === 'admin' && isAdminMode
                ? await getAllNewsAdmin()
                : await getNews();
            setNews(data);
        } catch {
            console.error('Failed to fetch news');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchNews(); }, [isAdminMode, user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                // Stamp with current sim year/quarter (backend will also default to this, but be explicit)
                sim_year: marketState?.current_year ?? null,
                sim_quarter: marketState?.current_quarter ?? null,
            };
            if (editingItem) {
                await updateNews(editingItem.id, payload);
                toast.success('News updated');
            } else {
                await createNews(payload);
                toast.success('News published');
            }
            setEditingItem(null);
            setFormData({ title: '', content: '', source: 'Global News Network', is_published: true, image_url: '' });
            fetchNews();
        } catch {
            toast.error('Failed to save news item');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this news item?')) return;
        try {
            await deleteNews(id);
            toast.success('News deleted');
            fetchNews();
        } catch {
            toast.error('Failed to delete news');
        }
    };

    const startEdit = (item) => {
        setEditingItem(item);
        setFormData({ title: item.title, content: item.content, source: item.source, is_published: item.is_published, image_url: item.image_url || '' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const simPeriod = marketState?.current_year != null
        ? `Y${marketState.current_year} Q${marketState.current_quarter ?? '?'}`
        : null;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ margin: 0, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Newspaper /> GLOBAL NEWS FEED
                </h2>
                {user?.role === 'admin' && (
                    <button onClick={() => setIsAdminMode(!isAdminMode)} className="btn"
                        style={{ background: isAdminMode ? '#000' : '#FFF', color: isAdminMode ? '#FFF' : '#000', border: '1px solid #000' }}>
                        {isAdminMode ? 'EXIT ADMIN MODE' : 'MANAGE NEWS'}
                    </button>
                )}
            </div>

            {isAdminMode ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
                    {/* EDITOR */}
                    <div className="fintech-card" style={{ height: 'fit-content' }}>
                        <h3 style={{ textTransform: 'uppercase', marginBottom: '1rem' }}>
                            {editingItem ? 'Edit News Item' : 'Publish News'}
                        </h3>
                        {simPeriod && (
                            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '1rem', padding: '0.4rem 0.6rem', background: '#f3f4f6', border: '1px solid #e5e7eb', fontFamily: 'Roboto Mono' }}>
                                Will be stamped: <strong>{simPeriod}</strong>
                            </div>
                        )}
                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">HEADLINE</label>
                                <input className="input-field" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">SOURCE</label>
                                <input className="input-field" value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">CONTENT</label>
                                <textarea className="input-field" rows={6} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} required style={{ resize: 'vertical' }} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="text-label">IMAGE URL (OPTIONAL)</label>
                                <input className="input-field" value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://..." />
                            </div>
                            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input type="checkbox" id="published" checked={formData.is_published} onChange={e => setFormData({ ...formData, is_published: e.target.checked })} />
                                <label htmlFor="published" style={{ fontWeight: 600 }}>PUBLISH IMMEDIATELY</label>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    {editingItem ? 'UPDATE NEWS' : 'PUBLISH NEWS'}
                                </button>
                                {editingItem && (
                                    <button type="button" onClick={() => { setEditingItem(null); setFormData({ title: '', content: '', source: 'Global News Network', is_published: true, image_url: '' }); }}
                                        className="btn" style={{ background: '#F3F4F6' }}>CANCEL</button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* LIST */}
                    <div>
                        <h3 style={{ textTransform: 'uppercase', marginBottom: '1rem' }}>All News Items</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {news.map(item => (
                                <div key={item.id} className="fintech-card" style={{ padding: '1rem', borderLeft: item.is_published ? '4px solid #10B981' : '4px solid #F59E0B' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {item.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
                                                {item.is_published ? 'PUBLISHED' : 'DRAFT'} • {gameDate(item)}
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{item.title}</h4>
                                            <p style={{ margin: 0, color: '#4B5563', fontSize: '0.9rem' }}>{item.content.substring(0, 100)}...</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => startEdit(item)} className="btn" style={{ padding: '0.3rem' }}><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(item.id)} className="btn" style={{ padding: '0.3rem', color: '#EF4444' }}><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
                    {loading ? null : news.length === 0 ? (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: '#666' }}>
                            No news updates available at this time.
                        </div>
                    ) : news.map(item => (
                        <div key={item.id} className="fintech-card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {item.image_url && (
                                <div style={{ height: '160px', overflow: 'hidden' }}>
                                    <img src={item.image_url} alt="News" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            )}
                            <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#D1202F', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <Globe size={12} /> {item.source.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#666', fontFamily: 'Roboto Mono', fontWeight: 600 }}>
                                        {gameDate(item)}
                                    </span>
                                </div>
                                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', lineHeight: '1.4' }}>{item.title}</h3>
                                <p style={{ margin: '0 0 1.5rem 0', color: '#4B5563', lineHeight: '1.6', fontSize: '0.95rem', flex: 1 }}>
                                    {item.content}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
