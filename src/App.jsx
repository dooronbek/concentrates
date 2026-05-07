import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Warehouse from './pages/Warehouse.jsx';
import Production from './pages/Production.jsx';
import Shift from './pages/Shift.jsx';
import BatchJournal from './pages/BatchJournal.jsx';
import Recipes from './pages/Recipes.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/warehouse" element={<Warehouse />} />
          <Route path="/production" element={<Production />} />
          <Route path="/shift" element={<Shift />} />
          <Route path="/journal" element={<BatchJournal />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
