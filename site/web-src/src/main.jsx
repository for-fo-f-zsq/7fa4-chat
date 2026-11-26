import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'misans/lib/Normal/MiSansVF.min.css';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
