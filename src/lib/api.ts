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

// FAQ API methods
export const faqApi = {
  upload: (file: File, options: { replaceExisting?: boolean; questionCol?: string; answerCol?: string; categoryCol?: string } = {}) => {
    const formData = new FormData();
    formData.append('file', file);

    // Build params - only include if explicitly set (let backend auto-detect)
    const params: Record<string, any> = {
      replace_existing: options.replaceExisting || false,
      auto_detect: true
    };
    if (options.questionCol) params.question_col = options.questionCol;
    if (options.answerCol) params.answer_col = options.answerCol;
    if (options.categoryCol) params.category_col = options.categoryCol;

    return api.post('/faq/upload', formData, { params });
  },

  getSources: () => api.get('/faq/sources'),

  getStats: () => api.get('/faq/stats'),

  list: (sourceFile?: string) =>
    api.get('/faq', { params: sourceFile ? { source_file: sourceFile } : {} }),

  deleteSource: (sourceFile: string) =>
    api.delete(`/faq/source/${encodeURIComponent(sourceFile)}`),

  delete: (faqId: string) => api.delete(`/faq/${faqId}`)
};