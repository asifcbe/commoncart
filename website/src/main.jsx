import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { applyTheme } from './utils/theme';

applyTheme(); // inject CSS variables from shop.config.js before first paint

// Let ScrollToTop own scroll position on navigation — the browser's own
// "manual/auto" restoration otherwise races it and lands mid-page.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
