import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Add this to the very top of src/main.tsx
console.log("Supabase URL:", import.meta.env.VITE_SUPABASE_URL);
console.log("Supabase Key:", import.meta.env.VITE_SUPABASE_ANON_KEY);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
