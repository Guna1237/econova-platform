import { useState } from 'react';
import { Edit2, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';

export default function TeamManagement({ teams, onUpdate }) {
    const [editingTeam, setEditingTeam] = useState(null);
    const [editForm, setEditForm] = useState({ username: '', password: '' });
    const [loading, setLoading] = useState(false);

    const startEdit = (team) => {
        setEditingTeam(team.id);
        setEditForm({ username: team.username, password: '' });
    };

    const cancelEdit = () => {
        setEditingTeam(null);
        setEditForm({ username: '', password: '' });
    };

    const handleSaveEdit = async (teamId) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (editForm.username) params.append('new_username', editForm.username);
            if (editForm.password) params.append('new_password', editForm.password);

            await api.put(`/admin/teams/${teamId}/credentials`, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            toast.success('Team credentials updated');
            setEditingTeam(null);
            setEditForm({ username: '', password: '' });
            onUpdate();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to update team');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (team) => {
        if (!confirm(`Are you sure you want to delete team "${team.username}"? This will permanently delete all their data including holdings, orders, loans, and activity logs.`)) {
            return;
        }

        setLoading(true);
        try {
            await api.delete(`/admin/teams/${team.id}`);
            toast.success(`Team "${team.username}" deleted`);
            onUpdate();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to delete team');
        } finally {
            setLoading(false);
        }
    };

    const handleFreeze = async (teamId) => {
        try {
            // FIXED: Updated to match backend endpoint /admin/users/{id}/freeze
            await api.post(`/admin/users/${teamId}/freeze`);
            toast.info('Team status updated');
            onUpdate();
        } catch (error) {
            toast.error('Failed to toggle freeze');
        }
    };

    const handleLiquidate = async (team) => {
        if (!confirm(`LIQUIDATION WARNING:\n\nAre you sure you want to LIQUIDATE all assets for team "${team.username}"?\n\nThis will sell ALL their holdings at current market prices and convert them to CASH. This action cannot be undone.`)) {
            return;
        }
        try {
            const res = await api.post(`/admin/users/${team.id}/liquidate`);
            toast.success('Liquidation Successful', { description: res.data.message });
            onUpdate();
        } catch (error) {
            toast.error('Failed to liquidate assets');
        }
    };

    return (
        <div className="fintech-card">
            <div className="text-label" style={{ marginBottom: '1rem' }}>ACTIVE TEAMS</div>

            {teams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                    No teams registered yet
                </div>
            ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {teams.map(team => (
                        <div
                            key={team.id}
                            style={{
                                padding: '0.75rem',
                                borderBottom: '1px solid #eee',
                                background: editingTeam === team.id ? '#F9FAFB' : 'transparent'
                            }}
                        >
                            {editingTeam === team.id ? (
                                // Edit Mode
                                <div>
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <label className="text-label" style={{ fontSize: '0.7rem' }}>Username</label>
                                        <input
                                            className="input-field"
                                            style={{ fontSize: '0.85rem', padding: '0.4rem' }}
                                            value={editForm.username}
                                            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                                            placeholder={team.username}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <label className="text-label" style={{ fontSize: '0.7rem' }}>New Password (optional)</label>
                                        <input
                                            className="input-field"
                                            style={{ fontSize: '0.85rem', padding: '0.4rem' }}
                                            type="password"
                                            value={editForm.password}
                                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                            placeholder="Leave blank to keep current"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => handleSaveEdit(team.id)}
                                            className="btn btn-primary"
                                            style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem', flex: 1 }}
                                            disabled={loading}
                                        >
                                            <Check size={14} /> SAVE
                                        </button>
                                        <button
                                            onClick={cancelEdit}
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem', flex: 1 }}
                                            disabled={loading}
                                        >
                                            <X size={14} /> CANCEL
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // View Mode
                                <div className="flex-between">
                                    <div>
                                        <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{team.username}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                            Cash: ${team.cash.toLocaleString()}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span
                                            style={{
                                                fontSize: '0.65rem',
                                                color: team.is_frozen ? '#B91C1C' : '#10B981',
                                                fontWeight: 700,
                                                padding: '0.2rem 0.4rem',
                                                background: team.is_frozen ? '#FEE2E2' : '#D1FAE5',
                                                borderRadius: '2px'
                                            }}
                                        >
                                            {team.is_frozen ? 'FROZEN' : 'ACTIVE'}
                                        </span>
                                        <button
                                            onClick={() => handleLiquidate(team)}
                                            className="btn"
                                            style={{
                                                fontSize: '0.65rem',
                                                padding: '0.3rem 0.5rem',
                                                background: '#000',
                                                color: '#FFF',
                                                border: '1px solid #000'
                                            }}
                                            title="Liquidate Assets"
                                        >
                                            LIQUIDATE
                                        </button>
                                        <button
                                            onClick={() => handleFreeze(team.id)}
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.65rem', padding: '0.3rem 0.5rem' }}
                                        >
                                            {team.is_frozen ? 'UNFREEZE' : 'FREEZE'}
                                        </button>
                                        <button
                                            onClick={() => startEdit(team)}
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.65rem', padding: '0.3rem 0.5rem' }}
                                            title="Edit credentials"
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(team)}
                                            className="btn"
                                            style={{
                                                fontSize: '0.65rem',
                                                padding: '0.3rem 0.5rem',
                                                background: '#FEE2E2',
                                                color: '#B91C1C',
                                                border: '1px solid #B91C1C'
                                            }}
                                            title="Delete team"
                                            disabled={loading}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
