import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const LicenseContext = createContext(null);

export function useLicense() {
  return useContext(LicenseContext);
}

export function LicenseProvider({ children }) {
  const [license, setLicense] = useState({ status: 'free', plan: null, email: null, expires: null, hasKey: false });
  const [loading, setLoading] = useState(true);

  const fetchLicense = async () => {
    // Only fetch if we have an auth token
    const token = localStorage.getItem('nixpanel_token');
    if (!token) {
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

  useEffect(() => { fetchLicense(); }, []);

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
