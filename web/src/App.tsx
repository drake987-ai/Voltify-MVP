import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { initialApiConfig, useApp } from './data/store';
import { OverviewPage } from './pages/OverviewPage';

// The map library is only loaded by the console.
const ConsolePage = lazy(() => import('./pages/ConsolePage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const IntegrationPage = lazy(() => import('./pages/IntegrationPage'));

export function App() {
  const connect = useApp((s) => s.connect);
  useEffect(() => {
    connect(initialApiConfig());
    return () => useApp.getState().source?.stop();
  }, [connect]);

  return (
    <HashRouter>
      <Shell>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/driver" element={<DriverPage />} />
            <Route path="/console" element={<ConsolePage />} />
            <Route path="/integration" element={<IntegrationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </HashRouter>
  );
}
