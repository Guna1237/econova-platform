import { useState } from 'react';
import { updateAdminCredentials } from '../services/api';
import { toast } from 'sonner';

export default function AdminCredentials() {
    const [formData, setFormData] = useState({
        newUsername: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (!formData.newUsername && !formData.newPassword) {
            toast.error('Enter at least one field to update');
            return;
        }

        setLoading(true);

        try {
            const result = await updateAdminCredentials(
                formData.newUsername || null,
                formData.newPassword || null
            );

            toast.success('Credentials updated successfully');

            // Clear form
            setFormData({
                newUsername: '',
                newPassword: '',
                confirmPassword: ''
            });

            // If username changed, suggest re-login
            if (formData.newUsername) {
                toast.info('Please log in again with your new credentials');
            }
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to update credentials');
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
                <h2 style={{ fontSize: '1rem', margin: 0 }}>ADMIN CREDENTIALS</h2>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0 0 0' }}>
                    Update admin username or password
                </p>
            </div>

            <div className="fintech-card" style={{ background: '#FEF3C7', border: '1px solid #F59E0B', marginBottom: '1.5rem', padding: '1rem' }}>
                <p style={{ fontSize: '0.8rem', margin: 0, color: '#92400E' }}>
                    <strong>Security Notice:</strong> Changing these credentials will affect admin access.
                    Make sure to store new credentials securely.
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">New Username (Optional)</label>
                    <input
                        type="text"
                        className="input-field"
                        value={formData.newUsername}
                        onChange={(e) => setFormData({ ...formData, newUsername: e.target.value })}
                        placeholder="Leave blank to keep current"
                    />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label className="text-label">New Password (Optional)</label>
                    <div style={{ position: 'relative' }}>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            className="input-field"
                            value={formData.newPassword}
                            onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                            placeholder="Leave blank to keep current"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                                position: 'absolute',
                                right: '0.75rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#666'
                            }}
                        >
                            {showPassword ? 'HIDE' : 'SHOW'}
                        </button>
                    </div>
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

                {formData.newPassword && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label className="text-label">Confirm New Password</label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            className="input-field"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            placeholder="Re-enter new password"
                        />
                    </div>
                )}

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || (!formData.newUsername && !formData.newPassword)}
                    style={{ width: '100%' }}
                >
                    {loading ? 'UPDATING...' : 'UPDATE CREDENTIALS'}
                </button>
            </form>
        </div>
    );
}
