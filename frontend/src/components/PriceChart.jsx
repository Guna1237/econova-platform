import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getPriceHistory } from '../services/api';

export default function PriceChart({ asset }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (asset) {
            setLoading(true);
            setError(null);
            getPriceHistory(asset.id)
                .then(history => {
                    setData(history);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Failed to load price history:', err);
                    setError(err.message);
                    setLoading(false);
                });
        }
    }, [asset?.id]);

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

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                        <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#D1202F" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#D1202F" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                        dataKey="year"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#000', fontSize: 11, fontFamily: 'Roboto Mono', fontWeight: 500 }}
                        padding={{ left: 10, right: 10 }}
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
                            border: '2px solid #000',
                            borderRadius: '0px',
                            boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                            padding: '0.75rem',
                            backgroundColor: '#FFF'
                        }}
                        itemStyle={{ color: '#D1202F', fontWeight: 700, fontFamily: 'Roboto Mono', fontSize: '0.9rem' }}
                        labelStyle={{ color: '#000', fontWeight: 700, marginBottom: '0.25rem', fontFamily: 'Inter' }}
                        formatter={(value) => [`$${value.toFixed(2)}`, 'PRICE']}
                        labelFormatter={(label) => `Year ${label}`}
                        cursor={{ stroke: '#D1202F', strokeWidth: 1, strokeDasharray: '5 5' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#D1202F"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#000', strokeWidth: 2, stroke: '#FFF' }}
                        activeDot={{ r: 6, fill: '#D1202F', strokeWidth: 2, stroke: '#FFF' }}
                        animationDuration={1500}
                        animationEasing="ease-in-out"
                        fill="url(#priceGradient)"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
