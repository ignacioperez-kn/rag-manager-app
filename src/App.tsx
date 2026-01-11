import { useState, useEffect } from 'react';
import { supabase } from './lib/api';
import Login from './components/Login';
import { Upload } from './components/Upload';
import { DocList } from './components/DocList';
import { Chat } from './components/Chat';
import { Search } from './components/Search'; // Import Search
import { Card } from './components/ui/Card';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'search'>('chat'); // Toggle state

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

  if (loading) return <div className="flex h-screen items-center justify-center text-accent">Loading...</div>;
  if (!session) return <Login />;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <header className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">VARMA Search Assistant</h1>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="px-4 py-1.5 rounded-lg bg-red-500/10 text-red-300 text-xs hover:bg-red-500/20">
          Logout
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN */}
        <div className="lg:col-span-4 space-y-6">
          <Card title="Upload Document" badge="POST /upload">
            <Upload onUploadComplete={() => window.location.reload()} />
          </Card>
          
          <Card title="Stored Documents" badge="GET /documents" className="h-[600px]">
            <DocList />
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