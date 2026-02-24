import { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, Area, AreaChart } from 'recharts';
import { getPriceHistory } from '../services/api';
import { ZoomIn, ZoomOut, BarChart3, TrendingUp } from 'lucide-react';

export default function PriceChart({ asset, lastUpdate }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('yearly'); // 'yearly' or 'quarterly'
    const [zoomDomain, setZoomDomain] = useState(null);

    const fetchHistory = useCallback(() => {
        if (!asset) return;
        setLoading(true);
        setError(null);
        getPriceHistory(asset.id, viewMode === 'quarterly')
            .then(history => {
                const formatted = history.map(h => ({
                    ...h,
                    label: h.quarter && h.quarter > 0 ? `Y${h.year} Q${h.quarter}` : `Y${h.year}`,
                    price: parseFloat(h.price.toFixed(2))
                }));
                setData(formatted);
                setZoomDomain(null);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load price history:', err);
                setError(err.message);
                setLoading(false);
            });
    }, [asset?.id, viewMode, lastUpdate]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const handleZoomIn = () => {
        if (data.length < 4) return;
        const mid = Math.floor(data.length / 2);
        const range = Math.max(Math.floor(data.length / 4), 2);
        setZoomDomain({ start: Math.max(0, mid - range), end: Math.min(data.length - 1, mid + range) });
    };

    const handleZoomOut = () => {
        setZoomDomain(null);
    };

    if (error) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', gap: '0.5rem', color: '#D1202F' }}>
            <span style={{ fontFamily: 'Roboto Mono', fontSize: '0.8rem', letterSpacing: '0.05em' }}>FEED ERROR: {error}</span>
        </div>
    );

    if (loading || !data || data.length === 0) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', gap: '0.5rem', color: '#9ca3af' }}>
            <div className="animate-spin" style={{ width: '20px', height: '20px', border: '2px solid #D1202F', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
            <span style={{ fontFamily: 'Roboto Mono', fontSize: '0.8rem', letterSpacing: '0.05em' }}>INITIALIZING FEED...</span>
        </div>
    );

    const displayData = zoomDomain ? data.slice(zoomDomain.start, zoomDomain.end + 1) : data;
    const isTBill = asset?.ticker === 'TBILL';

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                        onClick={() => setViewMode('yearly')}
                        style={{
                            padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'Roboto Mono',
                            background: viewMode === 'yearly' ? '#000' : '#F3F4F6', color: viewMode === 'yearly' ? '#FFF' : '#000',
                            border: '1px solid #000', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <BarChart3 size={12} /> YEARLY
                    </button>
                    <button
                        onClick={() => setViewMode('quarterly')}
                        style={{
                            padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'Roboto Mono',
                            background: viewMode === 'quarterly' ? '#000' : '#F3F4F6', color: viewMode === 'quarterly' ? '#FFF' : '#000',
                            border: '1px solid #000', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <TrendingUp size={12} /> QUARTERLY
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={handleZoomIn} title="Zoom In"
                        style={{ padding: '0.25rem', background: '#F3F4F6', border: '1px solid #D1D5DB', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <ZoomIn size={14} />
                    </button>
                    <button onClick={handleZoomOut} title="Zoom Out / Reset"
                        style={{ padding: '0.25rem', background: '#F3F4F6', border: '1px solid #D1D5DB', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <ZoomOut size={14} />
                    </button>
                </div>
            </div>

            {/* Chart */}
            <div style={{ flex: 1, minHeight: '300px' }}>
                <ResponsiveContainer>
                    <AreaChart data={displayData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <defs>
                            <linearGradient id={`priceGrad-${asset.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={isTBill ? '#059669' : '#D1202F'} stopOpacity={0.2} />
                                <stop offset="95%" stopColor={isTBill ? '#059669' : '#D1202F'} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#000', fontSize: 10, fontFamily: 'Roboto Mono', fontWeight: 500 }}
                            padding={{ left: 10, right: 10 }}
                            interval={viewMode === 'quarterly' && displayData.length > 12 ? Math.floor(displayData.length / 8) : 0}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#000', fontSize: 11, fontFamily: 'Roboto Mono', fontWeight: 500 }}
                            domain={['auto', 'auto']}
                            tickFormatter={(value) => `$${value.toFixed(0)}`}
                            width={60}
                        />
                        <Tooltip
                            contentStyle={{
                                border: '2px solid #000', borderRadius: '0px',
                                boxShadow: '4px 4px 0px rgba(0,0,0,0.1)', padding: '0.75rem', backgroundColor: '#FFF'
                            }}
                            itemStyle={{ color: isTBill ? '#059669' : '#D1202F', fontWeight: 700, fontFamily: 'Roboto Mono', fontSize: '0.9rem' }}
                            labelStyle={{ color: '#000', fontWeight: 700, marginBottom: '0.25rem', fontFamily: 'Inter' }}
                            formatter={(value) => [`$${value.toFixed(2)}`, 'PRICE']}
                            labelFormatter={(label) => label}
                            cursor={{ stroke: isTBill ? '#059669' : '#D1202F', strokeWidth: 1, strokeDasharray: '5 5' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="price"
                            stroke={isTBill ? '#059669' : '#D1202F'}
                            strokeWidth={2.5}
                            fill={`url(#priceGrad-${asset.id})`}
                            dot={{ r: displayData.length > 20 ? 0 : 3, fill: '#000', strokeWidth: 2, stroke: '#FFF' }}
                            activeDot={{ r: 5, fill: isTBill ? '#059669' : '#D1202F', strokeWidth: 2, stroke: '#FFF' }}
                            animationDuration={800}
                            animationEasing="ease-in-out"
                        />
                        {data.length > 10 && !zoomDomain && (
                            <Brush
                                dataKey="label"
                                height={20}
                                stroke="#D1D5DB"
                                fill="#F9FAFB"
                                tickFormatter={() => ''}
                            />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
