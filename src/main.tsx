import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safety guard for window.fetch override attempts in restricted environments
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  try {
    Object.defineProperty(window, 'fetch', {
      get: () => originalFetch,
      set: () => { 
        console.warn('Blocked attempt to override native fetch');
      },
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    // Already defined as non-configurable, which is fine
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
