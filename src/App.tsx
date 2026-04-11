'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppProvider, useAppContext } from './context/AppContext';
import { Auth } from './components/Auth';
import { MainLayout } from './components/MainLayout';

function AppContent() {
  const { isAuthenticated } = useAppContext();
  
  if (!isAuthenticated) {
    return <Auth />;
  }
  
  return <MainLayout />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
