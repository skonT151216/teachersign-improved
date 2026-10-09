import React from 'react';
import { createRoot } from 'react-dom/client';
import StandaloneGate from './components/StandaloneGate';
import './index.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><StandaloneGate /></React.StrictMode>);
