import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../services/api';

export default function LoginStatus() {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStatus();
        const interval = setInterval(loadStatus, 5000); // 5 seconds refresh for real-time feel
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
                            Real-time Command Center
                        </p>
                    </div>
                    <button
                        onClick={loadStatus}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem' }}
                        disabled={loading}
                    >
                        {loading ? 'SYNCING...' : 'REFRESH'}
                    </button>
                </div>
            </div>

            {teams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                    No active terminals detected.
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {teams.map(team => (
                        <div
                            key={team.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.75rem',
                                background: team.is_online ? '#F0FDF4' : '#F9FAFB',
                                borderLeft: `4px solid ${team.is_online ? '#22C55E' : '#9CA3AF'}`,
                                borderBottom: '1px solid #E5E7EB',
                                fontSize: '0.9rem'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: team.is_online ? '#22C55E' : '#9CA3AF',
                                    boxShadow: team.is_online ? '0 0 8px #22C55E' : 'none'
                                }} />
                                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{team.username.toUpperCase()}</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {team.has_consented && (
                                    <span style={{ fontSize: '0.7rem', color: '#2563EB', background: '#DBEAFE', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>VERIFIED</span>
                                )}
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>
                                    {team.is_online ? 'ACTIVE NOW' : formatLastLogin(team.last_seen || team.last_login)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                <div className="flex-between" style={{ fontSize: '0.75rem', color: '#666' }}>
                    <span>NODES: {teams.length}</span>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>ONLINE: {teams.filter(t => t.is_online).length}</span>
                </div>
            </div>
        </div>
    );
}
