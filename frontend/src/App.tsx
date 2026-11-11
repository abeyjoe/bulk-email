import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { Campaigns } from './pages/Campaigns';
import { CreateCampaign } from './pages/CreateCampaign';
import { CampaignDetail } from './pages/CampaignDetail';
import { Recipients } from './pages/Recipients';
import { Templates } from './pages/Templates';
import { Suppression } from './pages/Suppression';
import { Settings } from './pages/Settings';
import { Providers } from './pages/Providers';
import { Unsubscribe } from './pages/Unsubscribe';
import { Login } from './pages/Login';

const ProtectedLayout: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 p-8 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/new" element={<CreateCampaign />} />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
            <Route path="/recipients" element={<Recipients />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/suppression" element={<Suppression />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
