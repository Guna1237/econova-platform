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
            const errorMsg = error.response?.data?.detail || 'Failed to submit consent';
            if (errorMsg === 'Already consented') {
                toast.success('Consent already recorded');
                onConsentAccepted();
            } else {
                console.error("Consent Error:", error.response?.data);
                toast.error(errorMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = () => {
        sessionStorage.setItem('econova_consent_skipped', 'true');
        toast.info('You can provide consent later from the Settings tab');
        onConsentAccepted();
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F3F4F6 100%)',
            overflowY: 'auto',
            padding: '2rem',
            zIndex: 9999
        }}>
            <div style={{
                maxWidth: '800px',
                width: '100%',
                background: '#FFFFFF',
                border: '3px solid #000000',
                boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                margin: '2rem auto'
            }}>
                {/* Header with Logos */}
                <div style={{
                    background: '#FFFFFF',
                    borderBottom: '3px solid #000000',
                    padding: '2rem 3rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <img src={univLogo} alt="Mahindra University" style={{ height: '80px', objectFit: 'contain' }} />
                        <div style={{ height: '60px', width: '3px', background: '#E5E7EB' }}></div>
                        <div>
                            <h1 style={{ fontSize: '2rem', margin: 0, color: '#D1202F', lineHeight: 1, fontWeight: 800 }}>ECONOVA</h1>
                            <p style={{ fontSize: '0.9rem', margin: '0.5rem 0 0 0', color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                                Research Participation
                            </p>
                        </div>
                    </div>
                    <img src={clubLogo} alt="Finance Club" style={{ height: '80px', objectFit: 'contain' }} />
                </div>

                {/* Content */}
                <div style={{ padding: '3rem' }}>
                    <div style={{ marginBottom: '2.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#000', fontWeight: 700 }}>
                            Research Participation (Optional)
                        </h2>
                        <p style={{ fontSize: '1.1rem', lineHeight: '1.7', color: '#374151', marginBottom: '1.5rem' }}>
                            We are conducting research on <strong>team decision-making in financial markets</strong>.
                            Your participation would help us understand how teams navigate economic challenges and opportunities.
                        </p>

                        <div style={{
                            background: '#F9FAFB',
                            border: '1px solid #E5E7EB',
                            padding: '1.5rem',
                            marginBottom: '2rem',
                            borderRadius: '8px'
                        }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#000' }}>
                                What We Track:
                            </h3>
                            <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '1rem', lineHeight: '1.8', color: '#4B5563' }}>
                                <li>Trading decisions and market participation</li>
                                <li>Team collaboration and strategy</li>
                                <li>Decision timing and patterns</li>
                                <li>Basic demographics (kept anonymous)</li>
                            </ul>
                        </div>

                        <div style={{
                            background: '#FEF2F2',
                            border: '1px solid #FEE2E2',
                            padding: '1.5rem',
                            marginBottom: '2rem',
                            borderRadius: '8px'
                        }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#B91C1C' }}>
                                Your Rights:
                            </h3>
                            <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '1rem', lineHeight: '1.8', color: '#4B5563' }}>
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
                            padding: '2rem',
                            marginBottom: '2rem'
                        }}>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                                Team Leader Information
                            </h3>

                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                <div>
                                    <label className="text-label" style={{ color: '#000', marginBottom: '0.75rem', display: 'block', fontSize: '1rem' }}>
                                        Full Name *
                                    </label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        style={{ width: '100%', borderRadius: 0, border: '1px solid #000', padding: '0.75rem', fontSize: '1rem' }}
                                    />
                                </div>

                                <div>
                                    <label className="text-label" style={{ color: '#000', marginBottom: '0.75rem', display: 'block', fontSize: '1rem' }}>
                                        Email Address *
                                    </label>
                                    <input
                                        type="email"
                                        className="input-field"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        required
                                        style={{ width: '100%', borderRadius: 0, border: '1px solid #000', padding: '0.75rem', fontSize: '1rem' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label className="text-label" style={{ color: '#000', marginBottom: '0.75rem', display: 'block', fontSize: '1rem' }}>
                                            Age * (16+)
                                        </label>
                                        <input
                                            type="number"
                                            className="input-field mono-num"
                                            value={formData.age}
                                            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                            required
                                            min="16"
                                            style={{ width: '100%', borderRadius: 0, border: '1px solid #000', padding: '0.75rem', fontSize: '1rem' }}
                                        />
                                    </div>

                                    <div>
                                        <label className="text-label" style={{ color: '#000', marginBottom: '0.75rem', display: 'block', fontSize: '1rem' }}>
                                            Team Size *
                                        </label>
                                        <input
                                            type="number"
                                            className="input-field mono-num"
                                            value={formData.teamSize}
                                            onChange={(e) => setFormData({ ...formData, teamSize: e.target.value })}
                                            required
                                            min="1"
                                            max="10"
                                            style={{ width: '100%', borderRadius: 0, border: '1px solid #000', padding: '0.75rem', fontSize: '1rem' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn"
                                style={{
                                    flex: 2,
                                    background: '#000000',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    padding: '1rem',
                                    fontSize: '1.1rem',
                                    fontWeight: 700,
                                    cursor: loading ? 'wait' : 'pointer'
                                }}
                            >
                                {loading ? 'SUBMITTING...' : 'I CONSENT & CONTINUE'}
                            </button>

                            <button
                                type="button"
                                onClick={handleSkip}
                                className="btn"
                                style={{
                                    flex: 1,
                                    background: 'transparent',
                                    color: '#666',
                                    border: '2px solid #E5E7EB',
                                    padding: '1rem',
                                    fontSize: '1rem',
                                    fontWeight: 600
                                }}
                            >
                                SKIP FOR NOW
                            </button>
                        </div>
                        <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#9CA3AF', fontSize: '0.9rem' }}>
                            By clicking continue, you agree to participate in the study under the terms above.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
