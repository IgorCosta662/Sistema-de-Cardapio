import React from 'react';

interface DishArtworkProps {
  imageKey: string;
  title: string;
  className?: string;
}

export const DishArtwork: React.FC<DishArtworkProps> = ({
  imageKey,
  title,
  className = 'w-full h-44',
}) => {
  const renderIllustration = () => {
    switch (imageKey) {
      case 'svg:picanha':
        return (
          <svg viewBox="0 0 400 300" className="w-full h-full object-cover" role="img" aria-label={title}>
            <defs>
              <linearGradient id="bg-picanha" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1c1917" />
                <stop offset="100%" stopColor="#292524" />
              </linearGradient>
              <linearGradient id="meat-crust" x1="0" y1="0" x2="1" y2="0.5">
                <stop offset="0%" stopColor="#78350f" />
                <stop offset="50%" stopColor="#991b1b" />
                <stop offset="100%" stopColor="#451a03" />
              </linearGradient>
            </defs>
            <rect width="400" height="300" fill="url(#bg-picanha)" />
            <ellipse cx="200" cy="165" rx="145" ry="88" fill="#0c0a09" stroke="#44403c" strokeWidth="2" />
            {/* Fat cap & grilled slices */}
            <path d="M95 145 Q200 85 295 145 Q285 205 195 215 Q105 205 95 145 Z" fill="url(#meat-crust)" />
            <path d="M105 135 Q200 82 285 135" fill="none" stroke="#fef3c7" strokeWidth="10" strokeLinecap="round" />
            <line x1="145" y1="115" x2="165" y2="195" stroke="#450a0a" strokeWidth="3" />
            <line x1="185" y1="110" x2="205" y2="200" stroke="#450a0a" strokeWidth="3" />
            <line x1="225" y1="115" x2="245" y2="195" stroke="#450a0a" strokeWidth="3" />
            {/* Chimichurri & Farofa bowls */}
            <circle cx="290" cy="115" r="24" fill="#14532d" stroke="#57534e" strokeWidth="3" />
            <circle cx="115" cy="195" r="22" fill="#d97706" stroke="#57534e" strokeWidth="3" />
          </svg>
        );
      case 'svg:risoto':
        return (
          <svg viewBox="0 0 400 300" className="w-full h-full object-cover" role="img" aria-label={title}>
            <rect width="400" height="300" fill="#1e293b" />
            <circle cx="200" cy="155" r="115" fill="#0f172a" stroke="#334155" strokeWidth="3" />
            <circle cx="200" cy="155" r="84" fill="#fef3c7" />
            <circle cx="180" cy="145" r="14" fill="#78350f" />
            <circle cx="220" cy="165" r="16" fill="#92400e" />
            <circle cx="205" cy="130" r="11" fill="#78350f" />
            <path d="M170 155 Q200 135 230 155" fill="none" stroke="#15803d" strokeWidth="4" strokeLinecap="round" />
          </svg>
        );
      case 'svg:pizza':
        return (
          <svg viewBox="0 0 400 300" className="w-full h-full object-cover" role="img" aria-label={title}>
            <rect width="400" height="300" fill="#27272a" />
            <circle cx="200" cy="150" r="112" fill="#d97706" stroke="#78350f" strokeWidth="6" />
            <circle cx="200" cy="150" r="94" fill="#b91c1c" />
            <circle cx="200" cy="150" r="34" fill="#fffbeb" />
            <circle cx="150" cy="120" r="14" fill="#fef3c7" />
            <circle cx="245" cy="125" r="15" fill="#fef3c7" />
            <circle cx="155" cy="185" r="16" fill="#fef3c7" />
            <circle cx="240" cy="185" r="14" fill="#fef3c7" />
            <circle cx="195" cy="105" r="8" fill="#15803d" />
            <circle cx="225" cy="160" r="8" fill="#15803d" />
            <circle cx="170" cy="155" r="8" fill="#15803d" />
          </svg>
        );
      case 'svg:drink':
      case 'svg:soda':
        return (
          <svg viewBox="0 0 400 300" className="w-full h-full object-cover" role="img" aria-label={title}>
            <rect width="400" height="300" fill="#0f172a" />
            <rect x="145" y="75" width="110" height="150" rx="12" fill="#1e293b" stroke="#64748b" strokeWidth="3" />
            <rect x="151" y="105" width="98" height="112" rx="6" fill={imageKey === 'svg:drink' ? '#d97706' : '#be123c'} fillOpacity="0.85" />
            <circle cx="200" cy="155" r="30" fill="#f8fafc" fillOpacity="0.35" />
            <line x1="215" y1="55" x2="185" y2="185" stroke="#15803d" strokeWidth="5" strokeLinecap="round" />
            <circle cx="240" cy="95" r="20" fill="#ea580c" stroke="#fed7aa" strokeWidth="3" />
          </svg>
        );
      case 'svg:dessert':
        return (
          <svg viewBox="0 0 400 300" className="w-full h-full object-cover" role="img" aria-label={title}>
            <rect width="400" height="300" fill="#18181b" />
            <ellipse cx="200" cy="175" rx="135" ry="70" fill="#27272a" stroke="#52525b" strokeWidth="2" />
            <rect x="135" y="115" width="70" height="62" rx="10" fill="#2e1065" />
            <path d="M140 120 H200 V175 H140 Z" fill="#3b0764" />
            <path d="M170 165 Q205 195 235 190" fill="none" stroke="#451a03" strokeWidth="14" strokeLinecap="round" />
            <circle cx="245" cy="150" r="28" fill="#fef9c3" />
            <circle cx="245" cy="120" r="7" fill="#dc2626" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 400 300" className="w-full h-full object-cover" role="img" aria-label={title}>
            <rect width="400" height="300" fill="#1c1917" />
            <ellipse cx="200" cy="160" rx="125" ry="75" fill="#292524" stroke="#57534e" strokeWidth="2" />
            <circle cx="165" cy="155" r="22" fill="#b45309" />
            <circle cx="205" cy="145" r="22" fill="#d97706" />
            <circle cx="235" cy="162" r="22" fill="#b45309" />
          </svg>
        );
    }
  };

  return (
    <div className={`relative overflow-hidden bg-slate-900 select-none ${className}`}>
      {renderIllustration()}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex items-end p-3">
        <span className="text-xs font-medium text-white/90 truncate">{title}</span>
      </div>
    </div>
  );
};
