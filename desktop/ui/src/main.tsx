import React from 'react';
import ReactDOM from 'react-dom/client';
import { EngineApp } from '@/components/engine/engine-app';
import { Toaster } from '@/components/ui/toaster';
import '../../../src/app/globals.css';

window.__KILRUN_ENGINE__ = true;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EngineApp user={{ username: 'Editor', role: 'admin' }} />
    <Toaster />
  </React.StrictMode>
);
