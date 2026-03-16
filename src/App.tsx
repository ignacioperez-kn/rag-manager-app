import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { supabase, api, setApiBaseUrl, startReEmbed } from './lib/api';
import Login from './components/Login';
import { Upload } from './components/Upload';
import { DocList } from './components/DocList';
import { DocDetail } from './components/DocDetail';
import { Chat } from './components/Chat';
import { Search } from './components/Search';
import { FAQList } from './components/FAQList';
const TestHub = lazy(() => import('./components/TestHub').then(m => ({ default: m.TestHub })));
import { Card } from './components/ui/Card';

type ApiEnv = 'production' | 'local';
type ApiStatus = 'healthy' | 'unhealthy' | 'checking';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'search' | 'faq' | 'test-hub'>('chat');
  const [docs, setDocs] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [apiEnv, setApiEnv] = useState<ApiEnv>(() => (localStorage.getItem('apiEnv') as ApiEnv) || 'production');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [faqRefreshTrigger, setFaqRefreshTrigger] = useState(0);
  const [docListExpanded, setDocListExpanded] = useState(false);
  const [reEmbedStatus, setReEmbedStatus] = useState<string | null>(null);
  const [reEmbedRunning, setReEmbedRunning] = useState(false);

  const handleReEmbed = useCallback(() => {
    if (reEmbedRunning) return;
    if (!confirm('Re-embed ALL document and FAQ chunks with the current embedding model? This may take a while.')) return;
    setReEmbedRunning(true);
    setReEmbedStatus('Starting...');
    startReEmbed(
      (data) => {
        if (data.phase === 'documents') {
          setReEmbedStatus(`Docs: ${data.embedded} embedded, ${data.skipped} skipped, ${data.errors} errors`);
        } else if (data.phase === 'faq') {
          setReEmbedStatus(`FAQs: ${data.embedded} embedded, ${data.errors} errors`);
        } else if (data.phase === 'done') {
          const d = data.documents!;
          const f = data.faq!;
          setReEmbedStatus(`Done — Docs: ${d.embedded} ok / ${d.errors} err | FAQs: ${f.embedded} ok / ${f.errors} err`);
        }
      },
      () => setReEmbedRunning(false),
      (err) => { setReEmbedStatus(`Error: ${err}`); setReEmbedRunning(false); },
    );
  }, [reEmbedRunning]);

  useEffect(() => {
    const checkApiHealth = async (env: ApiEnv) => {
      setApiStatus('checking');
      setApiBaseUrl(env);
      try {
        const baseUrl = (env === 'local' ? import.meta.env.VITE_API_URL_LOCAL : import.meta.env.VITE_API_URL).replace(/\/+$/, '');
        await fetch(`${baseUrl}/health`);
        setApiStatus('healthy');
        setApiEnv(env);
        localStorage.setItem('apiEnv', env);
      } catch (error) {
        console.error(`API health check failed for ${env}:`, error);
        setApiStatus('unhealthy');
        // Revert to the other env if possible, or just show error
        const otherEnv = env === 'production' ? 'local' : 'production';
        setApiBaseUrl(otherEnv); // Revert base URL
        alert(`Failed to connect to the ${env} environment. Please check if the server is running.`);
      }
    };
    checkApiHealth(apiEnv);
  }, [apiEnv]);

  const handleEnvChange = (newEnv: ApiEnv) => {
    if (newEnv !== apiEnv) {
      setApiEnv(newEnv);
    }
  };

  const fetchDocs = async () => {
    if (apiStatus !== 'healthy') return;
    setLoadingDocs(true);
    try {
      const { data } = await api.get('/documents');
      setDocs(data.documents);
    } catch(e) { console.error(e) }
    finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (apiStatus === 'healthy' && session) {
      fetchDocs();
    }
  }, [apiStatus, session, faqRefreshTrigger]); // refetch docs when api becomes healthy, session exists, or FAQ uploaded

  const handleSelectDoc = (doc: any) => {
    setSelectedDoc(doc);
  };

  const handleBack = () => {
    setSelectedDoc(null);
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-accent">Loading...</div>;
  if (!session) return <Login />;

  if (selectedDoc) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <DocDetail doc={selectedDoc} onBack={handleBack} />
      </div>
    );
  }

  const getButtonClass = (env: ApiEnv) => {
    const isActive = apiEnv === env;
    let baseClass = 'px-3 py-1 rounded-md text-xs font-medium transition-all';
    
    if (isActive) {
      if (apiStatus === 'checking') return `${baseClass} bg-yellow-500/20 text-yellow-200 animate-pulse`;
      let activeColorClass = 'bg-blue-600 text-white'; // Default active color
      if (apiStatus === 'healthy') {
        activeColorClass = 'bg-green-600 text-white'; // Green for active and healthy
      }
      if (apiStatus === 'unhealthy') {
        return `${baseClass} ${activeColorClass} outline outline-1 outline-red-400`; // Red outline for unhealthy active
      }
      return `${baseClass} ${activeColorClass}`;
    }
    return `${baseClass} bg-gray-700 text-gray-300 hover:bg-gray-600`;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <header className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">KN RAG Manager</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Env:</span>
            <button
              onClick={() => handleEnvChange('production')}
              className={getButtonClass('production')}
            >
              Prod
            </button>
            <button
              onClick={() => handleEnvChange('local')}
              className={getButtonClass('local')}
            >
              Local
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReEmbed}
              disabled={reEmbedRunning}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${reEmbedRunning ? 'bg-yellow-500/20 text-yellow-200 animate-pulse cursor-wait' : 'bg-purple-600/20 text-purple-300 hover:bg-purple-600/30'}`}
            >
              {reEmbedRunning ? 'Re-embedding...' : 'Re-embed All'}
            </button>
            {reEmbedStatus && (
              <span className="text-xs text-gray-400 max-w-xs truncate" title={reEmbedStatus}>{reEmbedStatus}</span>
            )}
          </div>
          <button onClick={() => supabase.auth.signOut()} className="px-4 py-1.5 rounded-lg bg-red-500/10 text-red-300 text-xs hover:bg-red-500/20">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* EXPANDED DOC LIST: Full width */}
        {docListExpanded && (
          <div className="lg:col-span-12">
            <Card title="Stored Documents" badge={`${docs.length} docs`} className="h-[calc(100vh-160px)]">
              <DocList docs={docs} fetchDocs={fetchDocs} onSelectDoc={handleSelectDoc} loadingDocs={loadingDocs} expanded={docListExpanded} onToggleExpand={() => setDocListExpanded(e => !e)} />
            </Card>
          </div>
        )}

        {/* LEFT COLUMN */}
        {!docListExpanded && (
          <div className="lg:col-span-4 space-y-6">
            <Card title="Upload Document" badge="POST /upload">
              <Upload onUploadComplete={() => { fetchDocs(); setFaqRefreshTrigger(t => t + 1); }} />
            </Card>

            <Card title="Stored Documents" badge={`${docs.length} docs`} className="h-[600px]">
              <DocList docs={docs} fetchDocs={fetchDocs} onSelectDoc={handleSelectDoc} loadingDocs={loadingDocs} expanded={docListExpanded} onToggleExpand={() => setDocListExpanded(e => !e)} />
            </Card>
          </div>
        )}

        {/* RIGHT COLUMN: Tabbed Interface */}
        {!docListExpanded && <div className="lg:col-span-8">
           <Card className="h-full min-h-[600px]">
             {/* Custom Tab Header inside Card */}
             <div className="flex items-center gap-4 mb-6 border-b border-white/10 pb-4">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'chat' ? 'bg-accent/20 text-blue-100 border border-accent/20' : 'text-muted hover:text-white'}`}
                >
                  Chat Assistant
                </button>
                <button
                  onClick={() => setActiveTab('search')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'search' ? 'bg-accent/20 text-blue-100 border border-accent/20' : 'text-muted hover:text-white'}`}
                >
                  Semantic Search
                </button>
                <button
                  onClick={() => setActiveTab('faq')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'faq' ? 'bg-accent/20 text-blue-100 border border-accent/20' : 'text-muted hover:text-white'}`}
                >
                  FAQ Management
                </button>
                <button
                  onClick={() => setActiveTab('test-hub')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'test-hub' ? 'bg-accent/20 text-blue-100 border border-accent/20' : 'text-muted hover:text-white'}`}
                >
                  Test Hub
                </button>
             </div>

             {/* Content Area */}
             <div className="h-[calc(100%-80px)]">
               {activeTab === 'chat' && <Chat />}
               {activeTab === 'search' && <Search />}
               {activeTab === 'faq' && (
                 <div className="space-y-6 h-full overflow-y-auto">
                   <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                     <h3 className="text-white font-medium mb-4">FAQ Library</h3>
                     <p className="text-muted text-sm mb-4">Upload FAQ Excel files using the main upload area on the left.</p>
                     <FAQList refreshTrigger={faqRefreshTrigger} />
                   </div>
                 </div>
               )}
               {activeTab === 'test-hub' && (
                 <Suspense fallback={<div className="text-muted text-sm p-8 text-center">Loading Test Hub...</div>}>
                   <TestHub />
                 </Suspense>
               )}
             </div>
           </Card>
        </div>}

      </div>
    </div>
  );
}

export default App;