import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext.jsx';

const LicenseContext = createContext(null);

export function useLicense() {
  return useContext(LicenseContext);
}

export function LicenseProvider({ children }) {
  const { token } = useAuth();
  const [license, setLicense] = useState({ status: 'free', plan: null, email: null, expires: null, hasKey: false });
  const [loading, setLoading] = useState(true);

  const fetchLicense = async () => {
    if (!token) {
      setLicense({ status: 'free', plan: null, email: null, expires: null, hasKey: false });
      setLoading(false);
      return;
    }
    try {
      const res = await axios.get('/api/license/status');
      setLicense(res.data);
    } catch (_) {
      setLicense({ status: 'free', plan: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLicense(); }, [token]);

  const isPro = license.status === 'active';

  const activate = async (licenseKey, email) => {
    const res = await axios.post('/api/license/activate', { licenseKey, email });
    await fetchLicense();
    return res.data;
  };

  const deactivate = async () => {
    await axios.post('/api/license/deactivate');
    await fetchLicense();
  };

  return (
    <LicenseContext.Provider value={{ license, isPro, loading, activate, deactivate, refresh: fetchLicense }}>
      {children}
    </LicenseContext.Provider>
  );
}
