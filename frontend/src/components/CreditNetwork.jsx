import { useState, useEffect, useMemo } from 'react';
import { getPendingLoans, offerLoan, acceptLoan, getAllTeams, getActiveLoans, repayLoan, getMyMortgages, requestMortgage, repayMortgage } from '../services/api';
import { ArrowRight, Check, X, DollarSign, Users, TrendingDown, AlertTriangle, Lock, Shield, Landmark, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function CreditNetwork({ user, marketState, assets = [] }) {
    const [borrower, setBorrower] = useState('');
    const [principal, setPrincipal] = useState(10000);
    const [rate, setRate] = useState(5.0);
    const [pending, setPending] = useState([]);
    const [activeLoans, setActiveLoans] = useState([]);
    const [teams, setTeams] = useState([]);
    const [repaymentAmounts, setRepaymentAmounts] = useState({});

    // Mortgage State
    const [mortgages, setMortgages] = useState([]);
    const [mortgageForm, setMortgageForm] = useState({
        collateral_asset_ticker: '',
        collateral_quantity: 1,
        interest_rate: 5,
        maturity_quarters: 4
    });
    const [mortgageRepayAmounts, setMortgageRepayAmounts] = useState({});
    const [activeSection, setActiveSection] = useState('team_loans'); // team_loans | emergency

    // Filter tradeable assets (not TBILL)
    const mortgageableAssets = useMemo(() => assets.filter(a => a.ticker !== 'TBILL'), [assets]);

    // Compute estimated loan
    const selectedCollateralAsset = useMemo(() => {
        return assets.find(a => a.ticker === mortgageForm.collateral_asset_ticker);
    }, [assets, mortgageForm.collateral_asset_ticker]);

    const estimatedLoan = useMemo(() => {
        if (!selectedCollateralAsset) return null;
        const collateralValue = mortgageForm.collateral_quantity * selectedCollateralAsset.current_price;
        const loanAmount = collateralValue * 0.80;
        let totalDue = loanAmount;
        for (let i = 0; i < mortgageForm.maturity_quarters; i++) {
            totalDue *= (1 + mortgageForm.interest_rate / 100);
        }
        return { collateralValue, loanAmount, totalDue };
    }, [selectedCollateralAsset, mortgageForm]);


    const fetchData = async () => {
        try {
            const [pendingData, activeData, teamsData, mortgageData] = await Promise.all([
                getPendingLoans(),
                getActiveLoans(),
                getAllTeams(),
                getMyMortgages()
            ]);
            setPending(pendingData);
            setActiveLoans(activeData);
            setTeams(teamsData);
            setMortgages(mortgageData);
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

    const handleMortgageRequest = async () => {
        if (!mortgageForm.collateral_asset_ticker) {
            toast.error('Select a collateral asset');
            return;
        }
        try {
            const res = await requestMortgage(
                mortgageForm.collateral_asset_ticker,
                parseInt(mortgageForm.collateral_quantity),
                parseFloat(mortgageForm.interest_rate),
                parseInt(mortgageForm.maturity_quarters)
            );
            toast.success(res.message);
            setMortgageForm({ collateral_asset_ticker: '', collateral_quantity: 1, interest_rate: 5, maturity_quarters: 4 });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Mortgage request failed');
        }
    };

    const handleMortgageRepay = async (mortgageId) => {
        const amount = parseFloat(mortgageRepayAmounts[mortgageId] || 0);
        if (amount <= 0) {
            toast.error('Enter a valid amount');
            return;
        }
        try {
            const res = await repayMortgage(mortgageId, amount);
            toast.success(res.message);
            setMortgageRepayAmounts({ ...mortgageRepayAmounts, [mortgageId]: '' });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Repayment failed');
        }
    };

    const creditLocked = marketState && !marketState.credit_facility_open;

    const mortgageStatusColor = (status) => {
        switch (status) {
            case 'active': return '#3B82F6';
            case 'repaid': return '#10B981';
            case 'defaulted': return '#EF4444';
            case 'rejected': return '#6B7280';
            default: return '#F59E0B';
        }
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Credit Facility Lock Banner */}
            {creditLocked && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.5rem', background: '#FEF3C7', border: '2px solid #D97706',
                    borderRadius: '4px'
                }}>
                    <Lock size={22} color="#D97706" />
                    <div>
                        <div style={{ fontWeight: 700, color: '#92400E' }}>Credit Facility Locked</div>
                        <div style={{ fontSize: '0.85rem', color: '#78350F' }}>
                            Loan offers and acceptances are currently disabled by the admin. Please wait for the credit facility to open.
                        </div>
                    </div>
                </div>
            )}

            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #000' }}>
                <button
                    onClick={() => setActiveSection('team_loans')}
                    style={{
                        flex: 1, padding: '0.75rem 1rem', fontWeight: 700, fontSize: '0.85rem',
                        background: activeSection === 'team_loans' ? '#000' : '#FFF',
                        color: activeSection === 'team_loans' ? '#FFF' : '#000',
                        border: '1px solid #000', borderBottom: 'none', cursor: 'pointer',
                        textTransform: 'uppercase', letterSpacing: '0.03em'
                    }}
                >
                    <DollarSign size={16} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                    TEAM CREDIT
                </button>
                <button
                    onClick={() => setActiveSection('emergency')}
                    style={{
                        flex: 1, padding: '0.75rem 1rem', fontWeight: 700, fontSize: '0.85rem',
                        background: activeSection === 'emergency' ? '#D1202F' : '#FFF',
                        color: activeSection === 'emergency' ? '#FFF' : '#D1202F',
                        border: '1px solid #D1202F', borderBottom: 'none', cursor: 'pointer',
                        textTransform: 'uppercase', letterSpacing: '0.03em'
                    }}
                >
                    <Landmark size={16} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                    EMERGENCY LIQUIDATION
                    {mortgages.filter(m => m.status === 'active').length > 0 && (
                        <span style={{
                            marginLeft: '0.5rem', background: '#FFF', color: '#D1202F',
                            padding: '0.1rem 0.4rem', fontSize: '0.6rem', fontWeight: 800
                        }}>
                            {mortgages.filter(m => m.status === 'active').length} ACTIVE
                        </span>
                    )}
                </button>
            </div>

            {/* ────── TEAM LOANS SECTION ────── */}
            {activeSection === 'team_loans' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

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
            )}

            {/* ────── EMERGENCY LIQUIDATION SECTION ────── */}
            {activeSection === 'emergency' && (
                <div>
                    {/* Informational Banner */}
                    <div style={{
                        padding: '1.25rem', marginBottom: '1.5rem',
                        border: '2px solid #D1202F', background: '#FFF1F2'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <AlertTriangle size={18} color="#D1202F" />
                            <span style={{ fontWeight: 700, color: '#D1202F', textTransform: 'uppercase', fontSize: '0.85rem' }}>Emergency Liquidation Protocol</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#333', lineHeight: 1.5 }}>
                            Pledge your assets as collateral to the institutional bank in exchange for emergency cash.
                            <strong> Loan amount = 80% of asset market value.</strong> If you fail to repay by maturity,
                            your pledged assets will be <strong>permanently seized</strong> by the bank.
                            Interest rate minimum: 5% per quarter.
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* Request Form */}
                        <div className="fintech-card">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Landmark size={20} /> Request Mortgage Loan
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                                <div>
                                    <label className="text-label">Collateral Asset</label>
                                    <select
                                        className="input-field"
                                        value={mortgageForm.collateral_asset_ticker}
                                        onChange={e => setMortgageForm({ ...mortgageForm, collateral_asset_ticker: e.target.value })}
                                        style={{ borderRadius: 0 }}
                                    >
                                        <option value="">-- Select Asset --</option>
                                        {mortgageableAssets.map(a => (
                                            <option key={a.ticker} value={a.ticker}>{a.ticker} — {a.name} (${a.current_price.toFixed(2)})</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label className="text-label">Quantity to Pledge</label>
                                        <input
                                            type="number"
                                            min="1"
                                            className="input-field mono-num"
                                            value={mortgageForm.collateral_quantity}
                                            onChange={e => setMortgageForm({ ...mortgageForm, collateral_quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                            style={{ borderRadius: 0 }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-label">Interest Rate (% / Quarter)</label>
                                        <input
                                            type="number"
                                            min="5"
                                            max="50"
                                            step="0.5"
                                            className="input-field mono-num"
                                            value={mortgageForm.interest_rate}
                                            onChange={e => setMortgageForm({ ...mortgageForm, interest_rate: parseFloat(e.target.value) || 5 })}
                                            style={{ borderRadius: 0 }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-label">Maturity (Quarters: 1-8)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="8"
                                        className="input-field mono-num"
                                        value={mortgageForm.maturity_quarters}
                                        onChange={e => setMortgageForm({ ...mortgageForm, maturity_quarters: Math.min(8, Math.max(1, parseInt(e.target.value) || 1)) })}
                                        style={{ borderRadius: 0 }}
                                    />
                                </div>

                                {/* Loan Estimate */}
                                {estimatedLoan && (
                                    <div style={{ border: '1px solid #E5E7EB', padding: '1rem', background: '#F9FAFB' }}>
                                        <div className="text-label" style={{ marginBottom: '0.5rem' }}>LOAN ESTIMATE</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                                            <div>
                                                <span style={{ color: '#888' }}>Collateral Value</span>
                                                <div className="mono-num" style={{ fontWeight: 600 }}>${estimatedLoan.collateralValue.toLocaleString()}</div>
                                            </div>
                                            <div>
                                                <span style={{ color: '#888' }}>You Receive (80% LTV)</span>
                                                <div className="mono-num" style={{ fontWeight: 700, color: '#10B981', fontSize: '1.1rem' }}>${estimatedLoan.loanAmount.toLocaleString()}</div>
                                            </div>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <span style={{ color: '#D1202F', fontWeight: 600 }}>Total Due at Maturity</span>
                                                <div className="mono-num" style={{ fontWeight: 700, color: '#D1202F', fontSize: '1.1rem' }}>${estimatedLoan.totalDue.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    className="btn"
                                    onClick={handleMortgageRequest}
                                    disabled={!mortgageForm.collateral_asset_ticker}
                                    style={{
                                        background: '#D1202F', color: '#FFF', fontWeight: 700, fontSize: '0.85rem',
                                        border: 'none', padding: '0.75rem'
                                    }}
                                >
                                    <Shield size={16} style={{ marginRight: '0.3rem' }} />
                                    SUBMIT MORTGAGE REQUEST
                                </button>
                            </div>
                        </div>

                        {/* Active Mortgages */}
                        <div className="fintech-card">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', marginBottom: '1rem' }}>
                                <Clock size={18} /> Your Mortgage Loans
                            </h3>
                            {mortgages.length === 0 ? (
                                <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>No mortgage loans.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {mortgages.map(m => (
                                        <div key={m.id} style={{
                                            border: `2px solid ${mortgageStatusColor(m.status)}20`,
                                            padding: '1rem',
                                            background: `${mortgageStatusColor(m.status)}08`
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                <div>
                                                    <span style={{ fontWeight: 700 }}>{m.collateral_quantity} {m.collateral_ticker}</span>
                                                    <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: '0.5rem' }}>as collateral</span>
                                                </div>
                                                <span style={{
                                                    padding: '0.15rem 0.5rem', fontSize: '0.65rem', fontWeight: 700,
                                                    color: mortgageStatusColor(m.status),
                                                    background: `${mortgageStatusColor(m.status)}15`,
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {m.status}
                                                </span>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                                                <div>
                                                    <span style={{ color: '#888', fontSize: '0.7rem' }}>LOAN</span>
                                                    <div className="mono-num" style={{ fontWeight: 600 }}>${m.loan_amount?.toLocaleString()}</div>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#888', fontSize: '0.7rem' }}>RATE</span>
                                                    <div className="mono-num">{m.interest_rate}% / Q</div>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#888', fontSize: '0.7rem' }}>{m.status === 'active' ? 'QUARTERS LEFT' : 'MATURITY'}</span>
                                                    <div className="mono-num" style={{ fontWeight: 600, color: m.quarters_remaining <= 1 && m.status === 'active' ? '#EF4444' : 'inherit' }}>
                                                        {m.status === 'active' ? `${m.quarters_remaining}Q` : `${m.maturity_quarters}Q`}
                                                    </div>
                                                </div>
                                            </div>
                                            {m.status === 'active' && (
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                                                        <span style={{ color: '#888' }}>Remaining Balance</span>
                                                        <span className="mono-num" style={{ fontWeight: 700, color: '#D1202F' }}>${m.remaining_balance?.toLocaleString()}</span>
                                                    </div>
                                                    {/* Progress bar */}
                                                    <div style={{ height: '6px', background: '#E5E7EB', marginBottom: '0.75rem' }}>
                                                        <div style={{
                                                            height: '100%', background: '#10B981',
                                                            width: `${m.total_due > 0 ? Math.min(100, (m.total_repaid / m.total_due) * 100) : 0}%`,
                                                            transition: 'width 0.3s'
                                                        }} />
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <input
                                                            type="number"
                                                            className="input-field mono-num"
                                                            placeholder="Repay amount"
                                                            value={mortgageRepayAmounts[m.id] || ''}
                                                            onChange={e => setMortgageRepayAmounts({ ...mortgageRepayAmounts, [m.id]: e.target.value })}
                                                            style={{ flex: 1, fontSize: '0.9rem', borderRadius: 0 }}
                                                        />
                                                        <button
                                                            onClick={() => handleMortgageRepay(m.id)}
                                                            className="btn btn-primary"
                                                            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                                                        >
                                                            Repay
                                                        </button>
                                                    </div>
                                                    {m.quarters_remaining <= 1 && (
                                                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#FEE2E2', border: '1px solid #DC2626', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                                            <AlertTriangle size={14} color="#DC2626" />
                                                            <span style={{ color: '#DC2626', fontWeight: 600 }}>
                                                                CRITICAL: Mortgage defaults next quarter! Collateral will be seized.
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {m.status === 'defaulted' && (
                                                <div style={{ padding: '0.5rem', background: '#FEE2E2', border: '1px solid #DC2626', fontSize: '0.8rem', color: '#DC2626', fontWeight: 600 }}>
                                                    ⚠ DEFAULTED — Collateral ({m.collateral_quantity} {m.collateral_ticker}) seized by bank
                                                </div>
                                            )}
                                            {m.status === 'repaid' && (
                                                <div style={{ padding: '0.5rem', background: '#D1FAE5', border: '1px solid #10B981', fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                                                    ✓ Fully repaid — Collateral released
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
