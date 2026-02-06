import { useState } from 'react';
import { toast } from 'sonner';
import api from '../services/api';

export default function TeamPasswordChange() {
    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [showPasswords, setShowPasswords] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.newPassword !== formData.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        if (formData.newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            const params = new URLSearchParams();
            params.append('current_password', formData.currentPassword);
            params.append('new_password', formData.newPassword);

            await api.post('/users/change-password', params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            toast.success('Password changed successfully');

            // Clear form
            setFormData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    const passwordStrength = (password) => {
        if (!password) return null;
        if (password.length < 6) return { level: 'weak', color: '#DC2626' };
        if (password.length < 10) return { level: 'medium', color: '#F59E0B' };
        return { level: 'strong', color: '#10B981' };
    };

    const strength = passwordStrength(formData.newPassword);

    return (
        <div className="fintech-card">
            <div style={{ borderBottom: '2px solid #000', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', margin: 0 }}>CHANGE PASSWORD</h2>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0 0 0' }}>
                    Update your account password
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">Current Password</label>
                    <input
                        type={showPasswords ? 'text' : 'password'}
                        className="input-field"
                        value={formData.currentPassword}
                        onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                        required
                    />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">New Password</label>
                    <input
                        type={showPasswords ? 'text' : 'password'}
                        className="input-field"
                        value={formData.newPassword}
                        onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                        required
                    />
                    {strength && (
                        <div style={{ marginTop: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem' }}>
                                <div style={{ flex: 1, height: '3px', background: strength.color, opacity: 1 }}></div>
                                <div style={{ flex: 1, height: '3px', background: strength.level !== 'weak' ? strength.color : '#E5E7EB', opacity: 1 }}></div>
                                <div style={{ flex: 1, height: '3px', background: strength.level === 'strong' ? strength.color : '#E5E7EB', opacity: 1 }}></div>
                            </div>
                            <p style={{ fontSize: '0.7rem', color: strength.color, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>
                                {strength.level} password
                            </p>
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label className="text-label">Confirm New Password</label>
                    <input
                        type={showPasswords ? 'text' : 'password'}
                        className="input-field"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        required
                    />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={showPasswords}
                            onChange={(e) => setShowPasswords(e.target.checked)}
                        />
                        Show passwords
                    </label>
                </div>

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ width: '100%' }}
                >
                    {loading ? 'UPDATING...' : 'CHANGE PASSWORD'}
                </button>
            </form>
        </div>
    );
}
