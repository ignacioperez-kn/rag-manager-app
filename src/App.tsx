import { useState, useEffect } from 'react';
import { supabase, api, setApiBaseUrl } from './lib/api';
import Login from './components/Login';
import { Upload } from './components/Upload';
import { DocList } from './components/DocList';
import { DocDetail } from './components/DocDetail';
import { Chat } from './components/Chat';
import { Search } from './components/Search';
import { Card } from './components/ui/Card';

type ApiEnv = 'production' | 'local';
type ApiStatus = 'healthy' | 'unhealthy' | 'checking';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'search'>('chat');
  const [docs, setDocs] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [apiEnv, setApiEnv] = useState<ApiEnv>(() => (localStorage.getItem('apiEnv') as ApiEnv) || 'production');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    const checkApiHealth = async (env: ApiEnv) => {
      setApiStatus('checking');
      setApiBaseUrl(env);
      try {
        await api.get('/health');
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
    if (apiStatus === 'healthy') {
      fetchDocs();
    }
    return () => subscription.unsubscribe();
  }, [apiStatus]); // refetch docs when api becomes healthy

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
          <button onClick={() => supabase.auth.signOut()} className="px-4 py-1.5 rounded-lg bg-red-500/10 text-red-300 text-xs hover:bg-red-500/20">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN */}
        <div className="lg:col-span-4 space-y-6">
          <Card title="Upload Document" badge="POST /upload">
            <Upload onUploadComplete={fetchDocs} />
          </Card>
          
          <Card title="Stored Documents" badge="GET /documents" className="h-[600px]">
            <DocList docs={docs} fetchDocs={fetchDocs} onSelectDoc={handleSelectDoc} loadingDocs={loadingDocs} />
          </Card>
        </div>

        {/* RIGHT COLUMN: Tabbed Interface */}
        <div className="lg:col-span-8">
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
             </div>

             {/* Content Area */}
             <div className="h-[calc(100%-80px)]">
               {activeTab === 'chat' ? <Chat /> : <Search />}
             </div>
           </Card>
        </div>

      </div>
    </div>
  );
}

export default App;