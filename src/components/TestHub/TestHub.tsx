import { useState } from 'react';
import type { PrimaryTab, OverviewSub, EvalSub } from './types';
import { DashboardTab } from './tabs/DashboardTab';
import { SearchTab } from './tabs/SearchTab';
import { EvalTab } from './tabs/EvalTab';
import { QualityEvalTab } from './tabs/QualityEvalTab';
import { GapAnalysisTab } from './tabs/GapAnalysisTab';
import { InspectorTab } from './tabs/InspectorTab';

const primaryTabs: { key: PrimaryTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'evaluation', label: 'Evaluation' },
  { key: 'inspector', label: 'Inspector' },
];

const overviewTabs: { key: OverviewSub; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'search', label: 'Query Playground' },
];

const evalTabs: { key: EvalSub; label: string }[] = [
  { key: 'retrieval', label: 'Retrieval' },
  { key: 'quality', label: 'Quality' },
  { key: 'gap-analysis', label: 'Gap Analysis' },
];

export const TestHub = () => {
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('overview');
  const [overviewSub, setOverviewSub] = useState<OverviewSub>('dashboard');
  const [evalSub, setEvalSub] = useState<EvalSub>('retrieval');

  const renderContent = () => {
    if (primaryTab === 'overview') {
      return overviewSub === 'dashboard' ? <DashboardTab /> : <SearchTab />;
    }
    if (primaryTab === 'evaluation') {
      if (evalSub === 'retrieval') return <EvalTab />;
      if (evalSub === 'quality') return <QualityEvalTab />;
      return <GapAnalysisTab />;
    }
    return <InspectorTab />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Primary tabs — full width, evenly spaced */}
      <div className="flex border-b border-white/10 mb-0">
        {primaryTabs.map(t => (
          <button key={t.key} onClick={() => setPrimaryTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-all border-b-2 ${
              primaryTab === t.key
                ? 'text-blue-100 border-accent bg-accent/10'
                : 'text-muted hover:text-white border-transparent hover:bg-white/[0.03]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Secondary tabs — smaller, connected to parent */}
      {primaryTab === 'overview' && (
        <div className="flex border-b border-white/5 bg-white/[0.02]">
          {overviewTabs.map(t => (
            <button key={t.key} onClick={() => setOverviewSub(t.key)}
              className={`flex-1 py-2 text-xs font-medium transition-all border-b-2 ${
                overviewSub === t.key
                  ? 'text-blue-200 border-accent/60'
                  : 'text-muted hover:text-gray-300 border-transparent hover:bg-white/[0.02]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {primaryTab === 'evaluation' && (
        <div className="flex border-b border-white/5 bg-white/[0.02]">
          {evalTabs.map(t => (
            <button key={t.key} onClick={() => setEvalSub(t.key)}
              className={`flex-1 py-2 text-xs font-medium transition-all border-b-2 ${
                evalSub === t.key
                  ? 'text-blue-200 border-accent/60'
                  : 'text-muted hover:text-gray-300 border-transparent hover:bg-white/[0.02]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar pt-4">
        {renderContent()}
      </div>
    </div>
  );
};
