import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../services/api';

export default function LoginStatus() {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStatus();
        const interval = setInterval(loadStatus, 10000); // Refresh every 10 seconds
        return () => clearInterval(interval);
    }, []);

    const loadStatus = async () => {
        try {
            const response = await api.get('/admin/login-status');
            setTeams(response.data);
        } catch (error) {
            console.error('Failed to load login status:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatLastLogin = (lastLogin) => {
        if (!lastLogin) return 'Never';
        const date = new Date(lastLogin);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    return (
        <div className="fintech-card">
            <div style={{ borderBottom: '2px solid #000', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
                <div className="flex-between">
                    <div>
                        <h2 style={{ fontSize: '1rem', margin: 0 }}>TEAM LOGIN STATUS</h2>
                        <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0 0 0' }}>
                            Real-time team activity monitoring
                        </p>
                    </div>
                    <button
                        onClick={loadStatus}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem' }}
                        disabled={loading}
                    >
                        {loading ? 'REFRESHING...' : 'REFRESH'}
                    </button>
                </div>
            </div>

            {teams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                    No teams registered yet
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {teams.map(team => (
                        <div
                            key={team.id}
                            className="fintech-card"
                            style={{
                                background: team.is_online ? '#F0FDF4' : '#F9FAFB',
                                border: `1px solid ${team.is_online ? '#10B981' : '#E5E7EB'}`,
                                padding: '1rem'
                            }}
                        >
                            <div className="flex-between">
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div
                                            style={{
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '50%',
                                                background: team.is_online ? '#10B981' : '#9CA3AF'
                                            }}
                                        ></div>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{team.username}</div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                                        Last seen: {formatLastLogin(team.last_login)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        {team.is_frozen && (
                                            <span className="pill" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: '0.7rem' }}>
                                                FROZEN
                                            </span>
                                        )}
                                        {team.has_consented && (
                                            <span className="pill" style={{ background: '#DBEAFE', color: '#1E40AF', fontSize: '0.7rem' }}>
                                                CONSENTED
                                            </span>
                                        )}
                                        <span
                                            className="pill"
                                            style={{
                                                background: team.is_online ? '#D1FAE5' : '#F3F4F6',
                                                color: team.is_online ? '#065F46' : '#6B7280',
                                                fontSize: '0.7rem',
                                                fontWeight: 700
                                            }}
                                        >
                                            {team.is_online ? 'ONLINE' : 'OFFLINE'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                <div className="flex-between" style={{ fontSize: '0.75rem', color: '#666' }}>
                    <span>Total Teams: {teams.length}</span>
                    <span>Online: {teams.filter(t => t.is_online).length}</span>
                    <span>Consented: {teams.filter(t => t.has_consented).length}</span>
                </div>
            </div>
        </div>
    );
}
