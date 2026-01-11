import { ReactNode } from "react";

interface CardProps {
  title?: string;
  badge?: string; // e.g. "GET /search"
  children: ReactNode;
  className?: string;
}

export const Card = ({ title, badge, children, className = "" }: CardProps) => {
  return (
    <div className={`flex flex-col bg-white/5 border border-white/10 backdrop-blur-sm rounded-xl overflow-hidden shadow-2xl ${className}`}>
      {(title || badge) && (
        <div className="flex items-center justify-between px-5 py-4 bg-black/20 border-b border-white/5">
          {title && <h2 className="font-semibold text-sm tracking-wide text-white/90">{title}</h2>}
          {badge && (
            <span className="px-2.5 py-1 text-[10px] font-mono rounded-full bg-white/5 border border-white/10 text-muted">
              {badge}
            </span>
          )}
        </div>
      )}
      <div className="p-5 flex-1">
        {children}
      </div>
    </div>
  );
};