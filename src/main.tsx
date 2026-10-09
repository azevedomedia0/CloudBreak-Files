import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Development builds only: the in-app self-test (see src/selftest.ts). Stripped from release bundles.
if (import.meta.env.DEV) {
  void import('./selftest').then(m => m.maybeRunSelfTest());
}
