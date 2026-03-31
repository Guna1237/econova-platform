import { useState } from 'react';
import { Edit2, Trash2, X, Check, PlusCircle, MinusCircle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { addCashToTeam, penalizeTeam, getTeamPortfolio } from '../services/api';

export default function TeamManagement({ teams, onUpdate }) {
    const [editingTeam, setEditingTeam] = useState(null);
    const [editForm, setEditForm] = useState({ username: '', password: '' });
    const [loading, setLoading] = useState(false);

    // Portfolio modal state
    const [portfolioTeam, setPortfolioTeam] = useState(null);
    const [portfolio, setPortfolio] = useState(null);
    const [portfolioLoading, setPortfolioLoading] = useState(false);

    // Inline cap/penalty state
    const [capTeam, setCapTeam] = useState(null); // teamId for active cap input
    const [penaltyTeam, setPenaltyTeam] = useState(null); // teamId for active penalty input
    const [capAmount, setCapAmount] = useState('');
    const [capReason, setCapReason] = useState('');
    const [penaltyAmount, setPenaltyAmount] = useState('');
    const [penaltyReason, setPenaltyReason] = useState('');

    const startEdit = (team) => {
        setEditingTeam(team.id);
        setEditForm({ username: team.username, password: '' });
        setCapTeam(null);
        setPenaltyTeam(null);
    };

    const handleViewPortfolio = async (team) => {
        setPortfolioTeam(team);
        setPortfolio(null);
        setPortfolioLoading(true);
        try {
            const data = await getTeamPortfolio(team.id);
            setPortfolio(data);
        } catch (e) {
            toast.error('Failed to load portfolio');
            setPortfolioTeam(null);
        } finally {
            setPortfolioLoading(false);
        }
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

            await api.put(`/admin/teams/${teamId}/credentials?${params.toString()}`);

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

    const handleAddCap = async (teamId) => {
        const amt = parseFloat(capAmount);
        if (!amt || amt <= 0) { toast.error('Enter a valid positive amount'); return; }
        setLoading(true);
        try {
            const res = await addCashToTeam(teamId, amt, capReason);
            toast.success(res.message || 'Cash added');
            setCapTeam(null); setCapAmount(''); setCapReason('');
            onUpdate();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to add cash');
        } finally { setLoading(false); }
    };

    const handlePenalty = async (teamId) => {
        const amt = parseFloat(penaltyAmount);
        if (!amt || amt <= 0) { toast.error('Enter a valid positive amount'); return; }
        if (!confirm(`Apply penalty of $${amt.toLocaleString()} to this team?`)) return;
        setLoading(true);
        try {
            const res = await penalizeTeam(teamId, amt, penaltyReason);
            toast.warning(res.message || 'Penalty applied');
            setPenaltyTeam(null); setPenaltyAmount(''); setPenaltyReason('');
            onUpdate();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to apply penalty');
        } finally { setLoading(false); }
    };

    return (
        <div className="fintech-card">
            {/* Portfolio Modal */}
            {portfolioTeam && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.55)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '6px', width: '100%', maxWidth: '760px',
                        maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem', position: 'relative'
                    }}>
                        <button
                            onClick={() => { setPortfolioTeam(null); setPortfolio(null); }}
                            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            <X size={20} />
                        </button>

                        <h3 style={{ marginBottom: '0.25rem' }}>Portfolio: {portfolioTeam.username}</h3>

                        {portfolioLoading ? (
                            <p style={{ color: '#666' }}>Loading...</p>
                        ) : portfolio ? (
                            <>
                                {/* Summary */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem', marginTop: '1rem' }}>
                                    {[['Cash', `$${portfolio.cash?.toLocaleString()}`],
                                      ['Portfolio', `$${portfolio.portfolio_value?.toLocaleString()}`],
                                      ['Debt', `$${portfolio.debt?.toLocaleString()}`],
                                      ['Net Worth', `$${portfolio.net_worth?.toLocaleString()}`]
                                    ].map(([label, val]) => (
                                        <div key={label} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '0.75rem', borderRadius: '4px' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#6B7280', textTransform: 'uppercase' }}>{label}</div>
                                            <div className="mono-num" style={{ fontWeight: 700, fontSize: '1rem' }}>{val}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Holdings */}
                                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', textTransform: 'uppercase', color: '#6B7280' }}>Holdings</h4>
                                {portfolio.holdings.length === 0 ? (
                                    <p style={{ color: '#9CA3AF', fontSize: '0.85rem', marginBottom: '1rem' }}>No holdings.</p>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                                                {['Ticker', 'Qty', 'Avg Cost', 'Price', 'Market Val', 'P&L'].map(h => (
                                                    <th key={h} style={{ padding: '0.4rem 0.5rem', color: '#6B7280', fontWeight: 600 }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {portfolio.holdings.map(h => (
                                                <tr key={h.ticker} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700 }}>{h.ticker}</td>
                                                    <td style={{ padding: '0.4rem 0.5rem' }} className="mono-num">{h.quantity}</td>
                                                    <td style={{ padding: '0.4rem 0.5rem' }} className="mono-num">${h.avg_cost}</td>
                                                    <td style={{ padding: '0.4rem 0.5rem' }} className="mono-num">${h.current_price}</td>
                                                    <td style={{ padding: '0.4rem 0.5rem' }} className="mono-num">${h.market_value?.toLocaleString()}</td>
                                                    <td style={{ padding: '0.4rem 0.5rem', color: h.unrealized_pnl >= 0 ? '#16A34A' : '#DC2626', fontWeight: 600 }} className="mono-num">
                                                        {h.unrealized_pnl >= 0 ? '+' : ''}${h.unrealized_pnl?.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {/* Loans */}
                                {portfolio.loans.length > 0 && (
                                    <>
                                        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', textTransform: 'uppercase', color: '#6B7280' }}>Active Loans</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                            {portfolio.loans.map(loan => (
                                                <div key={loan.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: loan.role === 'borrower' ? '#FFF5F5' : '#F0FDF4', borderRadius: '4px', fontSize: '0.85rem' }}>
                                                    <span>
                                                        <strong>{loan.role === 'borrower' ? 'Borrowing from' : 'Lending to'}:</strong> {loan.counterparty}
                                                    </span>
                                                    <span className="mono-num">
                                                        ${loan.remaining_balance?.toLocaleString()} @ {loan.interest_rate}%
                                                        {loan.missed_quarters > 0 && <span style={{ color: '#DC2626', marginLeft: '0.5rem' }}>⚠ {loan.missed_quarters} missed</span>}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* Recent Activity */}
                                {portfolio.recent_activity.length > 0 && (
                                    <>
                                        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', textTransform: 'uppercase', color: '#6B7280' }}>Recent Activity</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {portfolio.recent_activity.map((a, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.5rem', background: '#F9FAFB', borderRadius: '3px', fontSize: '0.78rem' }}>
                                                    <span style={{ fontWeight: 600 }}>{a.action_type}</span>
                                                    <span style={{ color: '#6B7280' }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        ) : null}
                    </div>
                </div>
            )}

            <div className="text-label" style={{ marginBottom: '1rem' }}>ACTIVE TEAMS</div>

            {teams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                    No teams registered yet
                </div>
            ) : (
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
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
                                <div>
                                    {/* Team Info Row */}
                                    <div className="flex-between" style={{ marginBottom: capTeam === team.id || penaltyTeam === team.id ? '0.6rem' : 0 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{team.username}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                                Cash: ${team.cash?.toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                            <span style={{
                                                fontSize: '0.65rem',
                                                color: team.is_frozen ? '#B91C1C' : '#10B981',
                                                fontWeight: 700,
                                                padding: '0.2rem 0.4rem',
                                                background: team.is_frozen ? '#FEE2E2' : '#D1FAE5',
                                                borderRadius: '2px'
                                            }}>
                                                {team.is_frozen ? 'FROZEN' : 'ACTIVE'}
                                            </span>

                                            {/* +CAP button */}
                                            <button
                                                id={`cap-btn-${team.id}`}
                                                onClick={() => { setCapTeam(capTeam === team.id ? null : team.id); setPenaltyTeam(null); }}
                                                className="btn"
                                                style={{
                                                    fontSize: '0.65rem', padding: '0.3rem 0.5rem',
                                                    background: capTeam === team.id ? '#059669' : '#10B981',
                                                    color: '#FFF', border: 'none'
                                                }}
                                                title="Add Capital"
                                            >
                                                <PlusCircle size={12} style={{ marginRight: '2px' }} /> CAP
                                            </button>

                                            {/* PENALTY button */}
                                            <button
                                                id={`penalty-btn-${team.id}`}
                                                onClick={() => { setPenaltyTeam(penaltyTeam === team.id ? null : team.id); setCapTeam(null); }}
                                                className="btn"
                                                style={{
                                                    fontSize: '0.65rem', padding: '0.3rem 0.5rem',
                                                    background: penaltyTeam === team.id ? '#D97706' : '#F59E0B',
                                                    color: '#FFF', border: 'none'
                                                }}
                                                title="Apply Penalty"
                                            >
                                                <MinusCircle size={12} style={{ marginRight: '2px' }} /> PENALTY
                                            </button>

                                            <button
                                                onClick={() => handleViewPortfolio(team)}
                                                className="btn btn-secondary"
                                                style={{ fontSize: '0.65rem', padding: '0.3rem 0.5rem' }}
                                                title="View Portfolio"
                                            >
                                                <Eye size={12} />
                                            </button>
                                            <button
                                                onClick={() => handleLiquidate(team)}
                                                className="btn"
                                                style={{
                                                    fontSize: '0.65rem', padding: '0.3rem 0.5rem',
                                                    background: '#000', color: '#FFF', border: '1px solid #000'
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
                                                    fontSize: '0.65rem', padding: '0.3rem 0.5rem',
                                                    background: '#FEE2E2', color: '#B91C1C', border: '1px solid #B91C1C'
                                                }}
                                                title="Delete team"
                                                disabled={loading}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* CAP inline panel */}
                                    {capTeam === team.id && (
                                        <div style={{
                                            background: '#ECFDF5', border: '1px solid #10B981',
                                            borderRadius: '4px', padding: '0.6rem', marginTop: '0.5rem'
                                        }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', marginBottom: '0.4rem' }}>
                                                ADD CAPITAL TO {team.username.toUpperCase()}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                                <input
                                                    className="input-field"
                                                    type="number"
                                                    min="1"
                                                    placeholder="Amount ($)"
                                                    value={capAmount}
                                                    onChange={e => setCapAmount(e.target.value)}
                                                    style={{ flex: 1, fontSize: '0.78rem', padding: '0.3rem' }}
                                                />
                                                <input
                                                    className="input-field"
                                                    placeholder="Reason (optional)"
                                                    value={capReason}
                                                    onChange={e => setCapReason(e.target.value)}
                                                    style={{ flex: 2, fontSize: '0.78rem', padding: '0.3rem' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button
                                                    onClick={() => handleAddCap(team.id)}
                                                    disabled={loading}
                                                    style={{
                                                        background: '#059669', color: '#fff', border: 'none',
                                                        padding: '0.35rem 0.75rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                                                    }}
                                                >
                                                    CONFIRM ADD
                                                </button>
                                                <button
                                                    onClick={() => { setCapTeam(null); setCapAmount(''); setCapReason(''); }}
                                                    style={{
                                                        background: 'none', border: '1px solid #9CA3AF', color: '#6B7280',
                                                        padding: '0.35rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer'
                                                    }}
                                                >
                                                    CANCEL
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* PENALTY inline panel */}
                                    {penaltyTeam === team.id && (
                                        <div style={{
                                            background: '#FFFBEB', border: '1px solid #F59E0B',
                                            borderRadius: '4px', padding: '0.6rem', marginTop: '0.5rem'
                                        }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#D97706', marginBottom: '0.4rem' }}>
                                                APPLY PENALTY TO {team.username.toUpperCase()}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                                <input
                                                    className="input-field"
                                                    type="number"
                                                    min="1"
                                                    placeholder="Amount ($)"
                                                    value={penaltyAmount}
                                                    onChange={e => setPenaltyAmount(e.target.value)}
                                                    style={{ flex: 1, fontSize: '0.78rem', padding: '0.3rem' }}
                                                />
                                                <input
                                                    className="input-field"
                                                    placeholder="Reason (optional)"
                                                    value={penaltyReason}
                                                    onChange={e => setPenaltyReason(e.target.value)}
                                                    style={{ flex: 2, fontSize: '0.78rem', padding: '0.3rem' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button
                                                    onClick={() => handlePenalty(team.id)}
                                                    disabled={loading}
                                                    style={{
                                                        background: '#D97706', color: '#fff', border: 'none',
                                                        padding: '0.35rem 0.75rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                                                    }}
                                                >
                                                    CONFIRM PENALTY
                                                </button>
                                                <button
                                                    onClick={() => { setPenaltyTeam(null); setPenaltyAmount(''); setPenaltyReason(''); }}
                                                    style={{
                                                        background: 'none', border: '1px solid #9CA3AF', color: '#6B7280',
                                                        padding: '0.35rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer'
                                                    }}
                                                >
                                                    CANCEL
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
