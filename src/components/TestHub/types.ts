// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------
export type PrimaryTab = 'overview' | 'evaluation' | 'inspector';
export type OverviewSub = 'dashboard' | 'search';
export type EvalSub = 'retrieval' | 'quality';


// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------
export interface DbStats {
  documents: {
    total: number;
    by_type: Record<string, { count: number; processed: number }>;
    list: { id: string; name: string; type: string; processed: boolean; created: string }[];
  };
  chunks: { document_chunks: number; faq_chunks: number; total: number };
  faq_sources: string[];
  faq_pair_count: number;
}

export interface SearchResult {
  similarity: number;
  content_score: number;
  norm_content_score: number;
  final_score: number;
  source_type: string;
  title: string;
  body_preview: string;
  matched_via: string;
  category: string;
  faq_id: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  raw_count: number;
  timing: { embedding_ms: number; search_ms: number; total_ms: number };
}

export interface EvalResult {
  id: string;
  query: string;
  difficulty: string;
  category: string;
  hit_at_1: boolean;
  hit_at_n: boolean;
  rank: number | null;
  reciprocal_rank: number;
  num_results: number;
  latency_ms: number;
  error: string | null;
  match_details: { rank: number; source_type: string; title: string; score: number } | null;
}

export interface EvalSummary {
  metrics: {
    total: number;
    top_n: number;
    hit_rate_1: number;
    hit_rate_n: number;
    mrr: number;
    error_count: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
  };
  breakdowns: {
    by_difficulty: Record<string, { count: number; hit_rate_1: number; hit_rate_n: number; mrr: number }>;
  };
  gaps: {
    missed: { id: string; query: string }[];
    zero_results: { id: string; query: string }[];
    low_rank: { id: string; query: string; rank: number }[];
  };
  saved_to?: string;
  params?: Record<string, any>;
  run_id?: string;
}

export interface GenerationSummary {
  generation_run_id: string;
  total_test_cases: number;
  faq_sourced: number;
  document_sourced: number;
  by_difficulty: Record<string, number>;
}

export interface BaseHistoryRun {
  id: string;
  run_at: string;
  total: number;
  status?: string;
  completed_count?: number;
  total_count?: number;
}

export interface HistoryRun extends BaseHistoryRun {
  hit_rate_1: number;
  hit_rate_n: number;
  mrr: number;
  avg_latency_ms: number;
}

// ---------------------------------------------------------------------------
// Quality eval types
// ---------------------------------------------------------------------------
export interface QualityGroundedClaim {
  claim: string;
  source_chunk: number;
  supported: boolean;
}

export interface QualityUngroundedClaim {
  claim: string;
  explanation: string;
}

export interface QualityChunkSummary {
  index: number;
  title: string;
  file_name: string;
  source_type: string;
  score: number;
  content_preview: string;
}

export interface QualityEvalResult {
  id: string;
  query: string;
  difficulty: string;
  category: string;
  latency_ms: number;
  num_chunks: number;
  generated_answer: string;
  chunks_summary: QualityChunkSummary[];
  error: string | null;
  relevance_score: number;
  completeness: string;
  completeness_score: number;
  useful_chunks: number[];
  noise_chunks: number[];
  noise_ratio: number;
  answer_quality: string;
  faithfulness_score: number;
  grounded_claims: QualityGroundedClaim[];
  ungrounded_claims: QualityUngroundedClaim[];
  reasoning: string;
  utility: number;
}

export interface QualityEvalSummary {
  metrics: {
    total: number;
    avg_relevance: number;
    avg_completeness_score: number;
    avg_noise_ratio: number;
    avg_faithfulness: number;
    avg_utility: number;
    error_count: number;
  };
  breakdowns: {
    by_difficulty: Record<string, { count: number; avg_relevance: number; avg_faithfulness: number; avg_noise_ratio: number; avg_utility: number }>;
    by_category: Record<string, { count: number; avg_relevance: number; avg_faithfulness: number; avg_noise_ratio: number; avg_utility: number }>;
  };
  params?: Record<string, any>;
  run_id?: string;
}

export interface QualityHistoryRun extends BaseHistoryRun {
  avg_relevance: number;
  avg_completeness_score: number;
  avg_noise_ratio: number;
  avg_faithfulness: number;
  avg_utility: number;
}

// ---------------------------------------------------------------------------
// Filter types & constants
// ---------------------------------------------------------------------------
export type StatusFilter = 'all' | 'hit1' | 'hitN' | 'miss';
export type QualityFilter = 'all' | 'high' | 'medium' | 'low';
export const MODAL_PAGE_SIZE = 50;
