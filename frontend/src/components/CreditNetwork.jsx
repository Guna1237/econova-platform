import { useState, useEffect } from 'react';
import { getPendingLoans, offerLoan, acceptLoan, getAllTeams, getActiveLoans, repayLoan } from '../services/api';
import { ArrowRight, Check, X, DollarSign, Users, TrendingDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function CreditNetwork({ user }) {
    const [borrower, setBorrower] = useState('');
    const [principal, setPrincipal] = useState(10000);
    const [rate, setRate] = useState(5.0);
    const [pending, setPending] = useState([]);
    const [activeLoans, setActiveLoans] = useState([]);
    const [teams, setTeams] = useState([]);
    const [repaymentAmounts, setRepaymentAmounts] = useState({});

    const fetchData = async () => {
        try {
            const [pendingData, activeData, teamsData] = await Promise.all([
                getPendingLoans(),
                getActiveLoans(),
                getAllTeams()
            ]);
            setPending(pendingData);
            setActiveLoans(activeData);
            setTeams(teamsData);
        } catch (e) {
            console.error('Failed to fetch loan data:', e);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000); // Refresh every 3s
        return () => clearInterval(interval);
    }, []);

    const handleOffer = async () => {
        if (!borrower) {
            toast.error('Please select a borrower');
            return;
        }
        try {
            await offerLoan(borrower, parseFloat(principal), parseFloat(rate));
            toast.success(`Loan offer sent to ${borrower}`);
            setBorrower('');
            fetchData();
        } catch (err) {
            toast.error('Failed to send offer', { description: err.response?.data?.detail });
        }
    };

    const handleAccept = async (id) => {
        try {
            await acceptLoan(id);
            toast.success('Loan Accepted! Cash received.');
            fetchData();
        } catch (err) {
            toast.error('Failed', { description: err.response?.data?.detail });
        }
    };

    const handleRepay = async (loanId) => {
        const amount = parseFloat(repaymentAmounts[loanId] || 0);
        if (amount <= 0) {
            toast.error('Enter a valid amount');
            return;
        }
        try {
            const res = await repayLoan(loanId, amount);
            toast.success(res.message);
            setRepaymentAmounts({ ...repaymentAmounts, [loanId]: '' });
            fetchData();
        } catch (err) {
            toast.error('Repayment failed', { description: err.response?.data?.detail });
        }
    };

    return (
        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

            {/* Left Column: Extend Credit */}
            <div>
                <div className="fintech-card" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <DollarSign size={20} /> Extend Credit
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                        <div>
                            <label className="text-label">Borrower</label>
                            <select
                                className="input-field"
                                value={borrower}
                                onChange={e => setBorrower(e.target.value)}
                                style={{ borderRadius: 0 }}
                            >
                                <option value="">-- Select Team --</option>
                                {teams.map(t => (
                                    <option key={t.id} value={t.username}>{t.username}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label className="text-label">Principal ($)</label>
                                <input
                                    type="number"
                                    className="input-field mono-num"
                                    value={principal}
                                    onChange={e => setPrincipal(e.target.value)}
                                    style={{ borderRadius: 0 }}
                                />
                            </div>
                            <div>
                                <label className="text-label">Interest Rate (%/year)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="input-field mono-num"
                                    value={rate}
                                    onChange={e => setRate(e.target.value)}
                                    style={{ borderRadius: 0 }}
                                />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={handleOffer} disabled={!borrower}>
                            Send Offer <ArrowRight size={16} style={{ marginLeft: '5px' }} />
                        </button>
                    </div>
                </div>

                {/* Active Loans as Lender */}
                <div className="fintech-card">
                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Loans You Extended</h3>
                    {activeLoans.filter(l => l.is_lender).length === 0 ? (
                        <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>No active loans as lender.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {activeLoans.filter(l => l.is_lender).map(loan => (
                                <div key={loan.id} style={{ border: '1px solid #E5E7EB', padding: '0.75rem', backgroundColor: '#F9FAFB' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <div style={{ fontWeight: 600 }}>{loan.borrower_username}</div>
                                        <div className="mono-num" style={{ fontSize: '0.9rem', color: '#059669' }}>
                                            {loan.interest_rate}% APR
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                                        Principal: <span className="mono-num">${loan.principal.toLocaleString()}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                                        Remaining: <span className="mono-num" style={{ fontWeight: 600, color: '#000' }}>
                                            ${loan.remaining_balance.toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                                        Repaid: <span className="mono-num">${loan.total_repaid.toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Incoming Offers & Active Loans as Borrower */}
            <div>
                <div className="fintech-card" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={20} /> Incoming Loan Offers
                    </h3>
                    {pending.length === 0 ? (
                        <p style={{ color: '#6B7280', marginTop: '1rem', fontSize: '0.9rem' }}>No pending loan offers.</p>
                    ) : (
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {pending.map(loan => (
                                <div key={loan.id} style={{ border: '1px solid #E5E7EB', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFBEB' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>From: {loan.lender_username}</div>
                                        <div className="mono-num" style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.25rem' }}>
                                            ${loan.principal.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                                            @ {loan.interest_rate}% interest/year
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleAccept(loan.id)}
                                        className="btn"
                                        style={{ background: '#d1fae5', color: '#065f46', padding: '0.5rem 1rem', borderRadius: 0 }}
                                    >
                                        <Check size={16} style={{ marginRight: '4px' }} /> Accept
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Active Loans as Borrower */}
                <div className="fintech-card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', marginBottom: '1rem' }}>
                        <TrendingDown size={18} /> Your Active Debts
                    </h3>
                    {activeLoans.filter(l => l.is_borrower).length === 0 ? (
                        <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>No active debts.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {activeLoans.filter(l => l.is_borrower).map(loan => (
                                <div key={loan.id} style={{ border: '2px solid #FEE2E2', padding: '1rem', backgroundColor: '#FEF2F2' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>Lender</div>
                                            <div style={{ fontWeight: 600 }}>{loan.lender_username}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>Interest</div>
                                            <div className="mono-num" style={{ fontWeight: 600, color: '#DC2626' }}>
                                                {loan.interest_rate}%
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #FEE2E2' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                                            <span style={{ color: '#6B7280' }}>Original:</span>
                                            <span className="mono-num">${loan.principal.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                                            <span style={{ color: '#6B7280' }}>Repaid:</span>
                                            <span className="mono-num" style={{ color: '#059669' }}>${loan.total_repaid.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700 }}>
                                            <span>Remaining:</span>
                                            <span className="mono-num" style={{ color: '#DC2626' }}>
                                                ${loan.remaining_balance.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            type="number"
                                            className="input-field mono-num"
                                            placeholder="Amount"
                                            value={repaymentAmounts[loan.id] || ''}
                                            onChange={e => setRepaymentAmounts({ ...repaymentAmounts, [loan.id]: e.target.value })}
                                            style={{ flex: 1, fontSize: '0.9rem', borderRadius: 0 }}
                                        />
                                        <button
                                            onClick={() => handleRepay(loan.id)}
                                            className="btn btn-primary"
                                            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                                        >
                                            Repay
                                        </button>
                                    </div>
                                    {user.cash < loan.remaining_balance && (
                                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#FEE2E2', border: '1px solid #DC2626', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                            <AlertTriangle size={14} color="#DC2626" />
                                            <span style={{ color: '#DC2626', fontWeight: 600 }}>
                                                Insufficient cash for full repayment. Risk of bankruptcy!
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
