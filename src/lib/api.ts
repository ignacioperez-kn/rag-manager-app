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

// FAQ API Types
export interface FAQAnalyzeResponse {
  detection_method: 'programmatic' | 'ai' | 'failed';
  columns: string[];
  detected_mapping: {
    question_column: string | null;
    answer_column: string | null;
    category_column: string | null;
    confidence: 'high' | 'medium' | 'low' | null;
  };
  preview_rows: Record<string, string | null>[];
  total_rows: number;
  temp_file_id: string;
  filename: string;
  link_column: string | null;
  link_columns: string[];
  rows_with_urls: number;
}

export interface FAQUploadOptions {
  replaceExisting?: boolean;
  questionCol?: string;
  answerCol?: string;
  categoryCol?: string;
  linkCol?: string;
  linkCols?: string[];
  tempFileId?: string;
}

export interface LinkAnalysis {
  url: string;
  label: string | null;
  type: 'web' | 'pdf' | 'skip';
  source_row: number;
}

export interface AnalyzeLinksResponse {
  total_links: number;
  unique_ingestible: number;
  unique_skipped: number;
  ingestible: LinkAnalysis[];
  skipped: LinkAnalysis[];
}

export interface FAQUploadResponse {
  message: string;
  count: number;
  chunks_created: number;
  detected_columns?: {
    question_column: string;
    answer_column: string;
    category_column: string | null;
    confidence: string;
    notes: string;
  };
}

// FAQ API methods
export const faqApi = {
  analyze: (file: File, options?: { useAi?: boolean }) => {
    const formData = new FormData();
    formData.append('file', file);
    const params: Record<string, any> = {};
    if (options?.useAi) params.use_ai = true;
    return api.post<FAQAnalyzeResponse>('/faq/analyze', formData, { params });
  },

  upload: (file: File | null, options: FAQUploadOptions = {}) => {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }

    const params: Record<string, any> = {
      replace_existing: options.replaceExisting || false,
    };

    // If using temp file from analyze step, don't auto-detect
    if (options.tempFileId) {
      params.temp_file_id = options.tempFileId;
      params.auto_detect = false;
    } else {
      params.auto_detect = true;
    }

    if (options.questionCol) params.question_col = options.questionCol;
    if (options.answerCol) params.answer_col = options.answerCol;
    if (options.categoryCol) params.category_col = options.categoryCol;
    if (options.linkCol) params.link_col = options.linkCol;
    if (options.linkCols?.length) params.link_cols = options.linkCols.join(',');

    return api.post<FAQUploadResponse>('/faq/upload', formData, { params });
  },

  analyzeLinks: (tempFileId: string, linkCols: string[]) =>
    api.post<AnalyzeLinksResponse>('/faq/analyze-links', null, {
      params: { temp_file_id: tempFileId, link_cols: linkCols.join(',') }
    }),

  getSources: () => api.get('/faq/sources'),

  getStats: () => api.get('/faq/stats'),

  list: (sourceFile?: string) =>
    api.get('/faq', { params: sourceFile ? { source_file: sourceFile } : {} }),

  deleteSource: (sourceFile: string) =>
    api.delete(`/faq/source/${encodeURIComponent(sourceFile)}`),

  delete: (faqId: string) => api.delete(`/faq/${faqId}`),

  create: (data: { question: string; answer: string; category?: string }) =>
    api.post('/faq', data),

  update: (faqId: string, data: { question: string; answer: string; category?: string }) =>
    api.put(`/faq/${faqId}`, data),
};

// MD Analysis Types & API
export interface MDChunkPreview {
  index: number;
  title: string;
  body_preview: string;
  char_count: number;
}

export interface MDStrategy {
  id: string;
  label: string;
}

export interface MDAnalyzeResponse {
  filename: string;
  detection_method: 'programmatic' | 'ai';
  strategy: string;
  description: string;
  stats: {
    total_chars: number;
    total_lines: number;
    separator_count: number;
    heading_count: number;
    heading_levels: number[];
    sections_with_titles: number;
  };
  chunk_count: number;
  preview: MDChunkPreview[];
  available_strategies: MDStrategy[];
}

export const mdApi = {
  analyze: (file: File, options?: { useAi?: boolean }) => {
    const formData = new FormData();
    formData.append('file', file);
    const params: Record<string, any> = {};
    if (options?.useAi) params.use_ai = true;
    return api.post<MDAnalyzeResponse>('/md/analyze', formData, { params });
  },
};

// Search API
export const searchApi = {
  search: (query: string, limit = 5, threshold = 0.5) =>
    api.get<{ results: Array<{ title: string; content: string; file_name: string; source_type: string; score: number; source_location: string }> }>(
      '/search', { params: { query_text: query, limit, match_threshold: threshold, include_faq: true } }
    ),
};

// URL Ingestion API
export const ingestApi = {
  ingestUrls: (urls: string[], sourceFaqFile?: string) =>
    api.post<{ job_id: string; urls_to_process: number; urls_skipped: number }>(
      '/ingest/urls',
      { urls, source_faq_file: sourceFaqFile }
    ),

  ingestTxt: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{
      job_id: string | null;
      urls_found: number;
      urls_to_process: number;
      urls_skipped: number;
      message?: string;
    }>('/ingest/txt', formData);
  },
};

// Migration API — SSE streaming re-embed
export async function startReEmbed(
  onProgress: (data: {
    phase: string;
    embedded?: number;
    skipped?: number;
    errors?: number;
    documents?: { embedded: number; skipped: number; errors: number };
    faq?: { embedded: number; errors: number };
  }) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) { onError('Not authenticated'); return; }

  const baseUrl = (api.defaults.baseURL || '').replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/migrate/re-embed`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok || !res.body) { onError(`HTTP ${res.status}`); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const parsed = JSON.parse(line.slice(6));
        onProgress(parsed);
        if (parsed.phase === 'done') { onDone(); return; }
      }
    }
  }
  onDone();
}