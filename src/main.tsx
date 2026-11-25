import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import {
  migrateLegacyHashUrlBeforeBoot,
  resolveApplicationBasePath,
} from './config/routes';
import './index.css';

// Synchronously migrate recognized legacy hash-fragment routes to clean History API URLs
// before BrowserRouter initializes so no flash, redirect loop, or extra history entry occurs.
migrateLegacyHashUrlBeforeBoot();

const applicationBasePath =
  typeof window !== 'undefined'
    ? resolveApplicationBasePath(window.location.hostname, window.location.pathname)
    : '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={applicationBasePath || undefined}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
