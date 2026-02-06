import { useState } from 'react';
import { toast } from 'sonner';
import { acceptConsent } from '../services/api';
import univLogo from '../assets/ip.png';
import clubLogo from '../assets/image.png';

export default function ConsentForm({ onConsentAccepted }) {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        age: '',
        teamSize: ''
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate age
        const age = parseInt(formData.age);
        if (age < 16) {
            toast.error('You must be at least 16 years old to participate');
            return;
        }

        setLoading(true);

        try {
            // Submit consent with team leader info in one call
            await acceptConsent({
                leader_name: formData.name,
                email: formData.email,
                age: age,
                team_size: parseInt(formData.teamSize)
            });

            toast.success('Thank you for participating in our research!');
            onConsentAccepted();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to submit consent');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)',
            overflowY: 'auto',
            padding: '2rem'
        }}>
            <div style={{
                maxWidth: '700px',
                width: '100%',
                background: '#FFFFFF',
                border: '2px solid #000000',
                boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                margin: '0 auto'
            }}>
                {/* Header with Logos */}
                <div style={{
                    background: '#FFFFFF',
                    borderBottom: '2px solid #000000',
                    padding: '1.5rem 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <img src={univLogo} alt="Mahindra University" style={{ height: '50px' }} />
                        <div style={{ height: '40px', width: '2px', background: '#E5E7EB' }}></div>
                        <div>
                            <h1 style={{ fontSize: '1.5rem', margin: 0, color: '#D1202F', lineHeight: 1 }}>ECONOVA</h1>
                            <p style={{ fontSize: '0.75rem', margin: '0.25rem 0 0 0', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Research Participation
                            </p>
                        </div>
                    </div>
                    <img src={clubLogo} alt="Finance Club" style={{ height: '50px' }} />
                </div>

                {/* Content */}
                <div style={{ padding: '2.5rem' }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#000' }}>
                            Research Study Consent
                        </h2>
                        <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#374151', marginBottom: '1rem' }}>
                            This simulation is part of a research study on financial decision-making and team behavior.
                            Your participation helps us understand how teams make economic decisions under different market conditions.
                        </p>

                        <div style={{
                            background: '#F9FAFB',
                            border: '1px solid #E5E7EB',
                            padding: '1.25rem',
                            marginBottom: '1.5rem'
                        }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: '#000' }}>
                                What We Collect:
                            </h3>
                            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', lineHeight: '1.8', color: '#4B5563' }}>
                                <li>Your trading decisions and auction bids</li>
                                <li>Team strategy and loan activities</li>
                                <li>Response times and decision patterns</li>
                                <li>Basic team information (anonymized)</li>
                            </ul>
                        </div>

                        <div style={{
                            background: '#FEF2F2',
                            border: '1px solid #FEE2E2',
                            padding: '1.25rem',
                            marginBottom: '1.5rem'
                        }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: '#B91C1C' }}>
                                Your Rights:
                            </h3>
                            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', lineHeight: '1.8', color: '#4B5563' }}>
                                <li>All data is anonymized and confidential</li>
                                <li>You can withdraw at any time</li>
                                <li>Data used only for academic research</li>
                                <li>No personal information shared publicly</li>
                            </ul>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div style={{
                            background: '#FFFFFF',
                            border: '2px solid #000000',
                            padding: '1.5rem',
                            marginBottom: '1.5rem'
                        }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Team Leader Information
                            </h3>

                            <div style={{ display: 'grid', gap: '1.25rem' }}>
                                <div>
                                    <label className="text-label" style={{ color: '#000', marginBottom: '0.5rem', display: 'block' }}>
                                        Full Name *
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        style={{ width: '100%', borderRadius: 0, border: '1px solid #000' }}
                                    />
                                </div>

                                <div>
                                    <label className="text-label" style={{ color: '#000', marginBottom: '0.5rem', display: 'block' }}>
                                        Email Address *
                                    </label>
                                    <input
                                        type="email"
                                        className="input-field"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        required
                                        style={{ width: '100%', borderRadius: 0, border: '1px solid #000' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label className="text-label" style={{ color: '#000', marginBottom: '0.5rem', display: 'block' }}>
                                            Age * (16+)
                                        </label>
                                        <input
                                            type="number"
                                            className="input-field mono-num"
                                            value={formData.age}
                                            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                            required
                                            min="16"
                                            style={{ width: '100%', borderRadius: 0, border: '1px solid #000' }}
                                        />
                                    </div>

                                    <div>
                                        <label className="text-label" style={{ color: '#000', marginBottom: '0.5rem', display: 'block' }}>
                                            Team Size *
                                        </label>
                                        <input
                                            type="number"
                                            className="input-field mono-num"
                                            value={formData.teamSize}
                                            onChange={(e) => setFormData({ ...formData, teamSize: e.target.value })}
                                            required
                                            min="1"
                                            style={{ width: '100%', borderRadius: 0, border: '1px solid #000' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{
                            background: '#F0FDF4',
                            border: '1px solid #10B981',
                            padding: '1rem',
                            marginBottom: '1.5rem',
                            fontSize: '0.85rem',
                            color: '#065F46',
                            textAlign: 'center'
                        }}>
                            By clicking "Accept & Continue", you consent to participate in this research study
                            and confirm that you are at least 16 years old.
                        </div>

                        <button
                            type="submit"
                            className="btn"
                            disabled={loading}
                            style={{
                                width: '100%',
                                background: '#D1202F',
                                color: '#FFFFFF',
                                padding: '1rem',
                                fontSize: '1rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                borderRadius: 0,
                                border: 'none'
                            }}
                        >
                            {loading ? 'SUBMITTING...' : 'ACCEPT & CONTINUE'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
