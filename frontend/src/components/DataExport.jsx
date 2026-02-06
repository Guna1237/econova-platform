import { useState, useEffect } from 'react';
import { exportActivityData, exportTeamData, getResearchSummary } from '../services/api';
import { toast } from 'sonner';

export default function DataExport() {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exportingActivity, setExportingActivity] = useState(false);
    const [exportingTeams, setExportingTeams] = useState(false);

    useEffect(() => {
        loadSummary();
    }, []);

    const loadSummary = async () => {
        setLoading(true);
        try {
            const data = await getResearchSummary();
            setSummary(data);
        } catch (error) {
            toast.error('Failed to load research summary');
        } finally {
            setLoading(false);
        }
    };

    const handleExportActivity = async () => {
        setExportingActivity(true);
        try {
            const blob = await exportActivityData();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Activity data exported');
        } catch (error) {
            toast.error('Failed to export activity data');
        } finally {
            setExportingActivity(false);
        }
    };

    const handleExportTeams = async () => {
        setExportingTeams(true);
        try {
            const blob = await exportTeamData();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `team_info_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Team data exported');
        } catch (error) {
            toast.error('Failed to export team data');
        } finally {
            setExportingTeams(false);
        }
    };

    return (
        <div className="fintech-card">
            <div style={{ borderBottom: '2px solid #000', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', margin: 0 }}>RESEARCH DATA EXPORT</h2>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0 0 0' }}>
                    Download collected data for analysis
                </p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <p style={{ color: '#666' }}>Loading summary...</p>
                </div>
            ) : summary && (
                <>
                    <div className="fintech-card" style={{ background: '#f9f9f9', marginBottom: '1.5rem', padding: '1.25rem' }}>
                        <h3 style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>DATA SUMMARY</h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <span className="text-label" style={{ marginBottom: '0.25rem' }}>Total Users</span>
                                <div className="mono-num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                    {summary.total_users}
                                </div>
                            </div>
                            <div>
                                <span className="text-label" style={{ marginBottom: '0.25rem' }}>Consented</span>
                                <div className="mono-num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                    {summary.consented_users}
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                            <span className="text-label" style={{ marginBottom: '0.25rem' }}>Total Actions Logged</span>
                            <div className="mono-num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                {summary.total_actions_logged.toLocaleString()}
                            </div>
                        </div>

                        {summary.actions_by_type && Object.keys(summary.actions_by_type).length > 0 && (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                                <span className="text-label" style={{ marginBottom: '0.75rem' }}>Actions by Type</span>
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    {Object.entries(summary.actions_by_type).map(([type, count]) => (
                                        <div key={type} className="flex-between" style={{ fontSize: '0.8rem' }}>
                                            <span style={{ color: '#666' }}>{type}</span>
                                            <span className="mono-num" style={{ fontWeight: 600 }}>{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
                            <span style={{ fontSize: '0.7rem', color: '#999' }}>
                                Generated: {new Date(summary.generated_at).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        <button
                            onClick={handleExportActivity}
                            className="btn btn-primary"
                            disabled={exportingActivity}
                            style={{ width: '100%', justifyContent: 'space-between', padding: '1rem 1.25rem' }}
                        >
                            <span>{exportingActivity ? 'EXPORTING...' : 'EXPORT ACTIVITY LOGS'}</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>CSV</span>
                        </button>

                        <button
                            onClick={handleExportTeams}
                            className="btn btn-primary"
                            disabled={exportingTeams}
                            style={{ width: '100%', justifyContent: 'space-between', padding: '1rem 1.25rem' }}
                        >
                            <span>{exportingTeams ? 'EXPORTING...' : 'EXPORT TEAM INFORMATION'}</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>CSV</span>
                        </button>

                        <button
                            onClick={loadSummary}
                            className="btn btn-secondary"
                            disabled={loading}
                            style={{ width: '100%' }}
                        >
                            REFRESH SUMMARY
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
