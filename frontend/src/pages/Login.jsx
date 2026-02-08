import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Lock, ArrowRight, Loader2, Zap, BarChart3, Globe } from 'lucide-react';
import { login } from '../services/api';
import univLogo from '../assets/ip.png';
import clubLogo from '../assets/image.png';
import { Toaster, toast } from 'sonner';

const Marquee = () => (
    <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '200%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        opacity: 0.05,
        pointerEvents: 'none',
        transform: 'rotate(-15deg) scale(1.5)',
        zIndex: 0
    }}>
        {[...Array(20)].map((_, i) => (
            <div key={i} style={{
                whiteSpace: 'nowrap',
                fontSize: '4rem',
                fontWeight: 900,
                color: '#fff',
                transform: i % 2 === 0 ? 'translateX(-10%)' : 'translateX(-40%)'
            }}>
                ECONOVA FINANCIAL TERMINAL // MARKET SIMULATION // ALGORITHMIC TRADING // INSTITUTIONAL ACCESS //
            </div>
        ))}
    </div>
);

export default function Login() {
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username || !password) {
            toast.error("Credentials Required");
            return;
        }
        setLoading(true);
        try {
            await login(username, password);
            toast.success("Identity Verified", { duration: 1500 });
            setTimeout(() => navigate('/dashboard'), 800);
        } catch (err) {
            toast.error('Access Denied', { description: 'Invalid terminal credentials.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>
            <Toaster position="top-right" theme="light" toastOptions={{ style: { background: '#000', color: '#fff', border: '1px solid #D1202F' } }} />

            {/* LEFT PANEL - DYNAMIC BACKGROUND */}
            <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '55%' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    background: '#09090b',
                    color: '#FFF',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0 6rem'
                }}
            >
                <Marquee />

                <div style={{ zIndex: 10, position: 'relative' }}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}
                    >
                        <span style={{ background: '#D1202F', padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 700 }}>V6.0.4 STABLE</span>
                        <span style={{ color: '#666', fontSize: '0.8rem', fontWeight: 600 }}>SYSTEMS ONLINE</span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        style={{ fontSize: '6rem', fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.04em', margin: 0, color: '#FFF' }}
                    >
                        ECO<br />
                        <span style={{ color: '#D1202F' }}>NOVA</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        style={{ marginTop: '2rem', fontSize: '1.2rem', color: '#888', maxWidth: '500px', lineHeight: 1.5 }}
                    >
                        The advanced financial simulation platform for the next generation of market leaders. Real-time analytics, competitive trading engines, and institutional-grade execution.
                    </motion.p>
                </div>

                <div style={{ position: 'absolute', bottom: '3rem', left: '6rem', zIndex: 10, display: 'flex', gap: '2rem', opacity: 0.5 }}>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.2rem' }}>MARKET STATUS</div>
                        <div style={{ color: '#FFF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%' }}></div> ACTIVE</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.2rem' }}>LATENCY</div>
                        <div style={{ color: '#FFF', fontWeight: 700 }}>12ms</div>
                    </div>
                </div>
            </motion.div>

            {/* RIGHT PANEL - LOGIN */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.4 }}
                style={{
                    flex: 1,
                    background: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '4rem',
                    position: 'relative'
                }}
            >
                {/* Logos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '3rem' }}>
                    <img src={univLogo} style={{ height: '80px' }} alt="Mahindra University" />
                    <div style={{ height: '50px', width: '2px', background: '#f3f4f6' }}></div>
                    {/* Displaying original logo without inversion */}
                    <img src={clubLogo} style={{ height: '80px' }} alt="Finance & Economics Club" />
                </div>

                <div className="login-container">
                    <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
                        <h2 className="login-header">
                            ACCESS TERMINAL
                        </h2>
                        <p className="login-subtext">Authorized personnel only. Secure connection.</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="login-input-group">
                            <label className="login-label">
                                USERNAME ID
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="Enter your credentials"
                                className="login-input"
                            />
                            <User size={18} className="login-icon" />
                        </div>

                        <div className="login-input-group">
                            <label className="login-label">
                                PASSWORD
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Enter your security key"
                                className="login-input"
                            />
                            <Lock size={18} className="login-icon" />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-login"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <>Access Terminal <ArrowRight size={16} /></>}
                        </button>
                    </form>

                    <div style={{ marginTop: '2.5rem', borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ background: '#fee2e2', padding: '0.5rem', borderRadius: '50%' }}><Zap size={16} color="#D1202F" /></div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#666' }}>FAST</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ background: '#f3f4f6', padding: '0.5rem', borderRadius: '50%' }}><BarChart3 size={16} color="#000" /></div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#666' }}>LIVE</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ background: '#f3f4f6', padding: '0.5rem', borderRadius: '50%' }}><Globe size={16} color="#000" /></div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#666' }}>GLOBAL</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
