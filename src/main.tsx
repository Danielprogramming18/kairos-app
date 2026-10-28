import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Unregister any stale dev service workers that might cache old @vite/client scripts
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);
