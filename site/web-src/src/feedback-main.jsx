import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'misans/lib/Normal/MiSansVF.min.css';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import FeedbackApp from './FeedbackApp';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FeedbackApp />
  </StrictMode>
);
