// src/components/ui/Modal.tsx
import React from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: any; // Can be a JSON object, string, or a React component
}

export const Modal = ({ isOpen, onClose, title, content }: ModalProps) => {
  if (!isOpen) return null;

  // The existing modal UI code
  const modalUI = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      {/* Click backdrop to close (optional, but good UX) */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <h3 className="text-white font-medium">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">&times;</button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-auto custom-scrollbar">
          {React.isValidElement(content) ? content : 
            <pre className="bg-black/30 p-4 rounded-lg font-mono text-xs text-green-300 whitespace-pre-wrap overflow-x-auto">
              {typeof content === 'object' ? JSON.stringify(content, null, 2) : content}
            </pre>
          }
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end bg-white/5">
          <button onClick={onClose} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // This is the magic part that breaks it out of the container
  return createPortal(modalUI, document.body);
};