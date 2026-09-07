import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Demo } from './Demo';
import { Landing } from './Landing';
import { HowItWorks } from './HowItWorks';
import '../app/styles.css';
import './demo.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <Landing />
    <Demo />
    <HowItWorks />
  </StrictMode>,
);
