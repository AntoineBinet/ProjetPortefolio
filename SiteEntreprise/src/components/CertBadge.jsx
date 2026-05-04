export default function CertBadge({ kind, size = 90 }) {
  const s = size;

  const isoGlobe = (color, version) => (
    <svg width={s} height={s} viewBox="0 0 120 120">
      <g fill="none" stroke={color} strokeWidth="1.4">
        <circle cx="60" cy="46" r="32"/>
        <ellipse cx="60" cy="46" rx="10" ry="32"/>
        <ellipse cx="60" cy="46" rx="22" ry="32"/>
        <ellipse cx="60" cy="46" rx="32" ry="10"/>
        <ellipse cx="60" cy="46" rx="32" ry="22"/>
        <line x1="60" y1="14" x2="60" y2="78"/>
        <line x1="28" y1="46" x2="92" y2="46"/>
      </g>
      <text x="60" y="98" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="22" fill={color} letterSpacing="-0.02em">ISO</text>
      <text x="60" y="116" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="13" fill={color} letterSpacing="0.02em">{version}</text>
    </svg>
  );

  switch (kind) {
    case 'iso9001': return isoGlobe('#1B6FB8', '9001:2015');
    case 'iso14001': return isoGlobe('#3F8B3F', '14001');
    case 'iso27001': return isoGlobe('#1B4F8C', '27001');

    case 'ecovadis':
      return (
        <svg width={s} height={s} viewBox="0 0 120 120">
          <defs>
            <linearGradient id="ev-silver" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#D5DBE0"/>
              <stop offset="50%" stopColor="#A8B2BD"/>
              <stop offset="100%" stopColor="#7C8794"/>
            </linearGradient>
          </defs>
          <path d="M 36 8 L 60 56 L 48 56 L 30 18 Z" fill="#9AAEC1"/>
          <path d="M 84 8 L 60 56 L 72 56 L 90 18 Z" fill="#7A8FA4"/>
          <circle cx="60" cy="76" r="36" fill="url(#ev-silver)"/>
          <circle cx="60" cy="76" r="30" fill="#E2E6EA" stroke="#9AAEC1" strokeWidth="0.8"/>
          <circle cx="60" cy="76" r="26" fill="none" stroke="#7A8FA4" strokeWidth="0.5" strokeDasharray="1.5 1.5"/>
          <text x="60" y="68" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="9" fill="#11202A" letterSpacing="0.5">ECOVADIS</text>
          <text x="60" y="84" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="11" fill="#7A8FA4" letterSpacing="2">SILVER</text>
          <g fill="#7A8FA4">
            <path d="M 46 92 L 47 95 L 50 95 L 47.5 97 L 48.5 100 L 46 98 L 43.5 100 L 44.5 97 L 42 95 L 45 95 Z"/>
            <path d="M 60 93 L 61 96 L 64 96 L 61.5 98 L 62.5 101 L 60 99 L 57.5 101 L 58.5 98 L 56 96 L 59 96 Z"/>
            <path d="M 74 92 L 75 95 L 78 95 L 75.5 97 L 76.5 100 L 74 98 L 71.5 100 L 72.5 97 L 70 95 L 73 95 Z"/>
          </g>
        </svg>
      );

    case 'cir':
      return (
        <svg width={s} height={s} viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#C8242C" strokeWidth="3"/>
          <circle cx="60" cy="60" r="48" fill="none" stroke="#C8242C" strokeWidth="0.8"/>
          <defs>
            <path id="cir-top" d="M 60 60 m -42 0 a 42 42 0 0 1 84 0" fill="none"/>
            <path id="cir-bot" d="M 60 60 m -42 0 a 42 42 0 0 0 84 0" fill="none"/>
          </defs>
          <text fontFamily="Arial, sans-serif" fontWeight="700" fontSize="9" fill="#C8242C" letterSpacing="1.5">
            <textPath href="#cir-top" startOffset="50%" textAnchor="middle">CRÉDIT D'IMPÔT</textPath>
          </text>
          <text fontFamily="Arial, sans-serif" fontWeight="700" fontSize="9" fill="#C8242C" letterSpacing="1.5">
            <textPath href="#cir-bot" startOffset="50%" textAnchor="middle">RECHERCHE</textPath>
          </text>
          <rect x="34" y="46" width="52" height="28" fill="#1B4F8C" rx="2"/>
          <text x="60" y="68" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="22" fill="#fff" letterSpacing="0.05em">CIR</text>
          <text x="60" y="40" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="6" fill="#1B4F8C" letterSpacing="1">AGRÉMENT</text>
        </svg>
      );

    case 'tftp':
      return (
        <svg width={s} height={s} viewBox="0 0 120 120">
          <g fill="#1F8A88">
            <path d="M 38 46 C 50 38, 70 38, 82 46 C 78 52, 70 56, 60 56 C 50 56, 42 52, 38 46 Z" opacity="0.95"/>
            <path d="M 32 60 C 46 52, 74 52, 88 60 C 84 66, 72 70, 60 70 C 48 70, 36 66, 32 60 Z" opacity="0.85" fill="#249B99"/>
            <path d="M 28 76 C 42 68, 78 68, 92 76 C 86 84, 74 88, 60 88 C 46 88, 34 84, 28 76 Z" opacity="0.8" fill="#2DA9A6"/>
          </g>
          <text x="60" y="108" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="9" fill="#11202A" fontStyle="italic">
            Time for the Planet
          </text>
        </svg>
      );

    default: return null;
  }
}
