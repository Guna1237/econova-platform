import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BankerDashboard from './components/BankerDashboard';
import SubAdminDashboard from './pages/SubAdminDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/banker" element={<BankerDashboard />} />
        <Route path="/subadmin" element={<SubAdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
