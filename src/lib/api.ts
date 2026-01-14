import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("CRITICAL ERROR: Supabase keys are missing! Check your .env file.");
}

// Initialize Supabase (handle missing keys gracefully to avoid white screen crash)
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co", 
  supabaseKey || "placeholder-key"
);

const PROD_API_URL = import.meta.env.VITE_API_URL;
const LOCAL_API_URL = import.meta.env.VITE_API_URL_LOCAL;

export const api = axios.create({
  baseURL: PROD_API_URL,
});

export const setApiBaseUrl = (type: 'production' | 'local') => {
  api.defaults.baseURL = type === 'local' ? LOCAL_API_URL : PROD_API_URL;
};

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});