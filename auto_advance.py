import re

with open('frontend/src/pages/Dashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add states for Auto-Advance
state_block = """    const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(false);
    const [autoAdvanceMin, setAutoAdvanceMin] = useState(3);
    const [timeRemainingDisplay, setTimeRemainingDisplay] = useState(0);
    const autoAdvanceTimerRef = useRef(null);
    const timeRemainingRef = useRef(0);"""

content = re.sub(r'    const \[notifications, setNotifications\] = useState\(\{', state_block + '\n\n    const [notifications, setNotifications] = useState({', content)

# Add effect for Auto-Advance
effect_block = """    useEffect(() => {
        if (autoAdvanceEnabled && user?.role === 'admin') {
            timeRemainingRef.current = autoAdvanceMin * 60;
            setTimeRemainingDisplay(timeRemainingRef.current);
            autoAdvanceTimerRef.current = setInterval(() => {
                timeRemainingRef.current -= 1;
                setTimeRemainingDisplay(timeRemainingRef.current);
                if (timeRemainingRef.current <= 0) {
                    handleNextQuarter();
                    timeRemainingRef.current = autoAdvanceMin * 60;
                }
            }, 1000);
        } else {
            if (autoAdvanceTimerRef.current) {
                clearInterval(autoAdvanceTimerRef.current);
            }
        }
        return () => clearInterval(autoAdvanceTimerRef.current);
    }, [autoAdvanceEnabled, autoAdvanceMin, user?.role]);"""

content = re.sub(r'    const fetchAdminStats = async \(\) => \{', effect_block + '\n\n    const fetchAdminStats = async () => {', content) # if fetchAdminStats not found, we use another anchor
if 'fetchAdminStats' not in content:
    content = re.sub(r'    const fetchData = async \(\) => \{', effect_block + '\n\n    const fetchData = async () => {', content)

# Add UI
ui_block = """                                                                            <div style={{ marginTop: '1.5rem', background: '#f8f9fa', padding: '1rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                                                    <h3 style={{ fontSize: '0.9rem', margin: 0, color: '#000', fontWeight: 600 }}>AUTO-ADVANCE QUARTER</h3>
                                                                                    <label className="toggle-switch">
                                                                                        <input type="checkbox" checked={autoAdvanceEnabled} onChange={(e) => setAutoAdvanceEnabled(e.target.checked)} />
                                                                                        <span className="slider round"></span>
                                                                                    </label>
                                                                                </div>
                                                                                {autoAdvanceEnabled && (
                                                                                    <div>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                                                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Interval (Minutes):</span>
                                                                                            <input type="number" min="1" max="60" value={autoAdvanceMin} onChange={(e) => setAutoAdvanceMin(parseInt(e.target.value) || 1)} style={{ width: '60px', padding: '0.25rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                                                                                        </div>
                                                                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#D1202F', textAlign: 'center' }}>
                                                                                            {Math.floor(timeRemainingDisplay / 60)}:{(timeRemainingDisplay % 60).toString().padStart(2, '0')}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>"""

content = re.sub(r'(<button onClick=\{handleNextQuarter\}.*?</button>)', r'\1\n' + ui_block, content)

with open('frontend/src/pages/Dashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
