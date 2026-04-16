import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, TrendingDown, Wallet, ArrowUpRight, RefreshCw } from 'lucide-react';
import { getLeaderboard } from '../services/api';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function MiniBar({ value, max, color }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div style={{ height: '4px', background: '#f0f0f0', borderRadius: '2px', width: '100%' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
        </div>
    );
}

export default function AdminLeaderboard() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    const load = async () => {
        try {
            setLoading(true);
            const d = await getLeaderboard();
            setData(d);
            setLastUpdated(new Date());
        } catch (e) {
            console.error('Leaderboard fetch failed', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        const interval = setInterval(load, 15000);
        return () => clearInterval(interval);
    }, []);

    const filteredData = data.filter(t => !t.username.startsWith('market_maker_'));
    const maxNetWorth = filteredData.length > 0 ? Math.max(...filteredData.map(t => t.net_worth)) : 1;

    return (
        <div style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '1.5rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #D1202F, #ff6b6b)',
                        borderRadius: '10px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Trophy size={20} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#111' }}>
                            TEAM LEADERBOARD
                        </h2>
                        {lastUpdated && (
                            <span style={{ fontSize: '0.7rem', color: '#999', fontFamily: 'monospace' }}>
                                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    style={{
                        background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px',
                        padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        color: '#555', fontSize: '0.8rem', fontWeight: 600,
                        opacity: loading ? 0.5 : 1
                    }}
                >
                    <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    Refresh
                </button>
            </div>

            {loading && data.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                    <div style={{ fontSize: '0.9rem' }}>Loading leaderboard...</div>
                </div>
            ) : data.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏁</div>
                    <div style={{ fontSize: '0.9rem' }}>No teams registered yet.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {filteredData.map((team, idx) => {
                        const isTop3 = idx < 3;
                        const isLeader = idx === 0;
                        return (
                            <motion.div
                                key={team.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05, duration: 0.35 }}
                                style={{
                                    background: isLeader
                                        ? 'linear-gradient(135deg, #fff8f8 0%, #fff 100%)'
                                        : '#ffffff',
                                    border: isLeader ? '1.5px solid #f0c0c4' : '1px solid #f0f0f0',
                                    borderRadius: '12px',
                                    padding: '1rem 1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    boxShadow: isLeader ? '0 4px 24px rgba(209,32,47,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Rank indicator */}
                                <div style={{
                                    minWidth: '36px', textAlign: 'center',
                                    fontSize: isTop3 ? '1.5rem' : '1.1rem',
                                    fontWeight: 800,
                                    color: isTop3 ? '#D1202F' : '#999',
                                    lineHeight: 1
                                }}>
                                    {isTop3 ? RANK_MEDALS[idx] : `#${team.rank}`}
                                </div>

                                {/* Team info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                            {team.username}
                                        </span>
                                        {team.is_frozen && (
                                            <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#D1202F', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                FROZEN
                                            </span>
                                        )}
                                        {isLeader && (
                                            <span style={{ fontSize: '0.65rem', background: '#fef9c3', color: '#92400e', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                LEADER
                                            </span>
                                        )}
                                    </div>
                                    <MiniBar value={team.net_worth} max={maxNetWorth} color={isLeader ? '#D1202F' : '#9ca3af'} />
                                    <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.4rem' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#555', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <Wallet size={10} /> ${team.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <TrendingUp size={10} /> ${team.portfolio_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </span>
                                        {team.debt > 0 && (
                                            <span style={{ fontSize: '0.7rem', color: '#D1202F', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <TrendingDown size={10} /> -${team.debt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Net worth badge */}
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '0.65rem', color: '#aaa', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Net Worth</div>
                                    <div style={{
                                        fontFamily: "'Roboto Mono', monospace",
                                        fontSize: '1rem',
                                        fontWeight: 800,
                                        color: isLeader ? '#D1202F' : '#111'
                                    }}>
                                        ${team.net_worth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                </div>

                                {/* Shimmer bar for leader */}
                                {isLeader && (
                                    <div style={{
                                        position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                                        background: 'linear-gradient(90deg, #D1202F, #ff6b6b, #D1202F)',
                                    }} />
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
