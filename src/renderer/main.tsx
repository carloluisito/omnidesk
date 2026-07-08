import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { TouchModeProvider } from './hooks/useTouchMode';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TouchModeProvider>
      <App />
    </TouchModeProvider>
  </React.StrictMode>
);
