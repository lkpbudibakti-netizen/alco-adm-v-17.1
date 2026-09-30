import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ApiKeyModal } from './components/common/ApiKeyModal.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ApiKeyModal />
  </StrictMode>,
);
