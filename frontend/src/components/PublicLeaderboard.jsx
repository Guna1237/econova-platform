import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPublicLeaderboard } from '../services/api';

const MEDAL_COLORS = [
    { border: '#FFD700', glow: 'rgba(255,215,0,0.35)', bg: 'rgba(255,215,0,0.08)', text: '#B8860B' },
    { border: '#C0C0C0', glow: 'rgba(192,192,192,0.3)', bg: 'rgba(192,192,192,0.07)', text: '#888' },
    { border: '#CD7F32', glow: 'rgba(205,127,50,0.3)', bg: 'rgba(205,127,50,0.07)', text: '#8B5E2D' },
];
const MEDALS = ['🥇', '🥈', '🥉'];

function CountUp({ value, duration = 800 }) {
    const [display, setDisplay] = useState(value);
    const prev = useRef(value);
    useEffect(() => {
        if (prev.current === value) return;
        const start = prev.current;
        const end = value;
        const startTime = performance.now();
        const tick = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(start + (end - start) * eased));
            if (progress < 1) requestAnimationFrame(tick);
            else { setDisplay(end); prev.current = end; }
        };
        requestAnimationFrame(tick);
    }, [value, duration]);
    return <span>${display.toLocaleString()}</span>;
}

function NetWorthBar({ value, max }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', width: '100%', marginTop: '6px' }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{ height: '100%', background: 'linear-gradient(90deg, #D1202F, #ff6b6b)', borderRadius: '2px' }}
            />
        </div>
    );
}

export default function PublicLeaderboard({ user, marketState, onClose }) {
    const [data, setData] = useState([]);
    const [clock, setClock] = useState(new Date());
    const [lastRefreshed, setLastRefreshed] = useState(null);

    const load = async () => {
        try {
            const d = await getPublicLeaderboard();
            setData(d.filter(t => !t.username.startsWith('market_maker_')));
            setLastRefreshed(new Date());
        } catch (_) {}
    };

    useEffect(() => {
        load();
        const dataInterval = setInterval(load, 8000);
        const clockInterval = setInterval(() => setClock(new Date()), 1000);
        return () => { clearInterval(dataInterval); clearInterval(clockInterval); };
    }, []);

    const isAdmin = user?.role === 'admin' || user?.role === 'sub_admin';
    const maxNetWorth = data.length > 0 ? Math.max(...data.map(t => t.net_worth)) : 1;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'radial-gradient(ellipse at 50% 0%, rgba(209,32,47,0.15) 0%, rgba(0,0,0,0.95) 60%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                overflowY: 'auto', padding: '2rem 1rem',
                fontFamily: "'Inter', sans-serif",
            }}
        >
            {/* Animated background particles */}
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
                {[...Array(12)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{ y: [0, -80, 0], opacity: [0.03, 0.08, 0.03] }}
                        transition={{ duration: 6 + i * 0.7, repeat: Infinity, delay: i * 0.5 }}
                        style={{
                            position: 'absolute',
                            left: `${(i * 8.3) % 100}%`,
                            top: `${20 + (i * 13) % 70}%`,
                            width: 2, height: 2,
                            background: '#D1202F', borderRadius: '50%',
                        }}
                    />
                ))}
            </div>

            <div style={{ width: '100%', maxWidth: '720px', position: 'relative', zIndex: 1 }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <motion.div
                        initial={{ y: -30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                    >
                        <div style={{ fontSize: '0.7rem', letterSpacing: '0.25em', color: '#D1202F', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                            ECONOVA ENTERPRISE — Y{marketState?.current_year} Q{marketState?.current_quarter}
                        </div>
                        <h1 style={{
                            margin: 0, fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                            fontWeight: 900, letterSpacing: '-0.04em',
                            color: '#FFFFFF',
                            textShadow: '0 0 60px rgba(209,32,47,0.4)',
                        }}>
                            LEADERBOARD
                        </h1>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                            {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            {lastRefreshed && (
                                <span style={{ marginLeft: '1rem' }}>
                                    Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Admin close button */}
                {isAdmin && onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            position: 'fixed', top: '1.5rem', right: '1.5rem',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                            color: 'rgba(255,255,255,0.6)', padding: '0.4rem 0.9rem',
                            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
                            cursor: 'pointer', borderRadius: '4px', textTransform: 'uppercase',
                            zIndex: 10,
                        }}
                    >
                        CLOSE
                    </button>
                )}

                {/* Team rows */}
                {data.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', paddingTop: '4rem', fontSize: '1rem' }}>
                        No teams registered yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <AnimatePresence>
                            {data.map((team, idx) => {
                                const isTop3 = idx < 3;
                                const isLeader = idx === 0;
                                const medal = isTop3 ? MEDAL_COLORS[idx] : null;

                                return (
                                    <motion.div
                                        key={team.id}
                                        layout
                                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: idx * 0.06, duration: 0.4, ease: 'easeOut' }}
                                        style={{
                                            background: isTop3
                                                ? `linear-gradient(135deg, ${medal.bg} 0%, rgba(255,255,255,0.03) 100%)`
                                                : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${isTop3 ? medal.border : 'rgba(255,255,255,0.08)'}`,
                                            borderRadius: '12px',
                                            padding: '1rem 1.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            boxShadow: isTop3 ? `0 4px 32px ${medal.glow}` : 'none',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {/* Leader shimmer line */}
                                        {isLeader && (
                                            <motion.div
                                                animate={{ x: ['-100%', '200%'] }}
                                                transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
                                                style={{
                                                    position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                                                    background: 'linear-gradient(90deg, transparent, #FFD700, transparent)',
                                                    pointerEvents: 'none',
                                                }}
                                            />
                                        )}

                                        {/* Rank */}
                                        <div style={{
                                            minWidth: '42px', textAlign: 'center',
                                            fontSize: isTop3 ? '1.8rem' : '1.1rem',
                                            fontWeight: 900,
                                            color: isTop3 ? medal.text : 'rgba(255,255,255,0.25)',
                                            lineHeight: 1, flexShrink: 0,
                                        }}>
                                            {isTop3 ? MEDALS[idx] : `#${team.rank}`}
                                        </div>

                                        {/* Team info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                                <span style={{
                                                    fontWeight: 800, fontSize: isLeader ? '1.05rem' : '0.9rem',
                                                    color: isTop3 ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
                                                    textTransform: 'uppercase', letterSpacing: '0.03em',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {team.username}
                                                </span>
                                                {team.is_frozen && (
                                                    <span style={{ fontSize: '0.6rem', background: 'rgba(209,32,47,0.2)', color: '#D1202F', padding: '1px 6px', borderRadius: '3px', fontWeight: 700, flexShrink: 0 }}>
                                                        FROZEN
                                                    </span>
                                                )}
                                                {isLeader && (
                                                    <span style={{ fontSize: '0.6rem', background: 'rgba(255,215,0,0.15)', color: '#FFD700', padding: '1px 6px', borderRadius: '3px', fontWeight: 700, flexShrink: 0 }}>
                                                        LEADER
                                                    </span>
                                                )}
                                            </div>
                                            <NetWorthBar value={team.net_worth} max={maxNetWorth} />
                                            <div style={{ display: 'flex', gap: '1rem', marginTop: '6px' }}>
                                                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>
                                                    Cash ${team.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: 'rgba(100,220,120,0.7)' }}>
                                                    Portfolio ${team.portfolio_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </span>
                                                {team.debt > 0 && (
                                                    <span style={{ fontSize: '0.68rem', color: 'rgba(209,32,47,0.7)' }}>
                                                        Debt ${team.debt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Net worth */}
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.08em' }}>
                                                Net Worth
                                            </div>
                                            <div style={{
                                                fontFamily: "'Roboto Mono', 'Courier New', monospace",
                                                fontSize: isLeader ? '1.2rem' : '1rem',
                                                fontWeight: 900,
                                                color: isTop3 ? (isLeader ? '#FFD700' : medal.text) : 'rgba(255,255,255,0.8)',
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>
                                                <CountUp value={team.net_worth} />
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}

                {/* Footer */}
                <div style={{ textAlign: 'center', marginTop: '2rem', color: 'rgba(255,255,255,0.15)', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                    ECONOVA ENTERPRISE · LIVE RANKINGS
                </div>
            </div>
        </motion.div>
    );
}
