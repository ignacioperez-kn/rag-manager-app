import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: any; // Can be a JSON object, string, or a React component
}

export const Modal = ({ isOpen, onClose, title, content }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-panel border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <h3 className="text-white font-medium">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-white">&times;</button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-auto">
          {React.isValidElement(content) ? content : 
            <pre className="bg-black/30 font-mono text-xs text-green-300 whitespace-pre-wrap">
              {typeof content === 'object' ? JSON.stringify(content, null, 2) : content}
            </pre>
          }
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};