export default function Icon({ name, size = 24, stroke = 'currentColor' }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke, strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'help': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9 9 a3 3 0 0 1 6 0 c0 2-3 2-3 4"/><circle cx="12" cy="17" r="0.5" fill={stroke}/></svg>;
    case 'compass': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M16 8 L 13 13 L 8 16 L 11 11 Z"/></svg>;
    case 'clock': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7 L 12 12 L 16 14"/></svg>;
    case 'network': return <svg {...props}><circle cx="12" cy="6" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 8.5 L 6 16 M 12 8.5 L 18 16"/></svg>;
    case 'flag': return <svg {...props}><path d="M5 22 L 5 4 L 18 4 L 14 9 L 18 14 L 5 14"/></svg>;
    case 'cpu': return <svg {...props}><rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9" y="9" width="6" height="6"/><path d="M9 3 L 9 6 M 12 3 L 12 6 M 15 3 L 15 6 M 9 18 L 9 21 M 12 18 L 12 21 M 15 18 L 15 21 M 3 9 L 6 9 M 3 12 L 6 12 M 3 15 L 6 15 M 18 9 L 21 9 M 18 12 L 21 12 M 18 15 L 21 15"/></svg>;
    case 'sectors': return <svg {...props}><path d="M12 3 L 21 8 L 12 13 L 3 8 Z"/><path d="M3 12 L 12 17 L 21 12"/><path d="M3 16 L 12 21 L 21 16"/></svg>;
    case 'project': return <svg {...props}><path d="M4 7 L 4 20 L 20 20 L 20 7"/><path d="M4 7 L 12 3 L 20 7"/><path d="M9 20 L 9 13 L 15 13 L 15 20"/></svg>;
    case 'arrow': return <svg {...props}><path d="M5 12 L 19 12 M 13 6 L 19 12 L 13 18"/></svg>;
    case 'arrow-down': return <svg {...props}><path d="M12 5 L 12 19 M 6 13 L 12 19 L 18 13"/></svg>;
    case 'mail': return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 7 L 12 13 L 21 7"/></svg>;
    case 'linkedin': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10 L 8 17 M 8 7.5 L 8 7.6 M 12 17 L 12 10 M 12 13 Q 12 10, 15 10 Q 17 10, 17 13 L 17 17"/></svg>;
    case 'lock': return <svg {...props}><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11 L 8 7 Q 8 4, 12 4 Q 16 4, 16 7 L 16 11"/></svg>;
    case 'unlock': return <svg {...props}><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11 L 8 7 Q 8 4, 12 4 Q 16 4, 16 7"/></svg>;
    case 'search': return <svg {...props}><circle cx="11" cy="11" r="6"/><path d="M16 16 L 20 20"/></svg>;
    case 'pin': return <svg {...props}><path d="M12 22 C 6 14, 5 11, 5 8 a 7 7 0 0 1 14 0 c 0 3-1 6-7 14 z"/><circle cx="12" cy="8" r="2.5"/></svg>;
    case 'check': return <svg {...props}><path d="M5 12 L 10 17 L 19 7"/></svg>;
    case 'plus': return <svg {...props}><path d="M12 5 L 12 19 M 5 12 L 19 12"/></svg>;
    case 'circuit': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="1.5"/><rect x="6.5" y="6.5" width="4.5" height="4.5" rx="0.5"/><rect x="13" y="6.5" width="4.5" height="3" rx="0.5"/><rect x="13" y="11.5" width="4.5" height="6" rx="0.5"/><path d="M6.5 14 L 11 14 M 6.5 17 L 11 17"/></svg>;
    case 'gear': return <svg {...props}><circle cx="12" cy="12" r="3.2"/><path d="M12 3 L 12 6 M 12 18 L 12 21 M 3 12 L 6 12 M 18 12 L 21 12 M 5.6 5.6 L 7.7 7.7 M 16.3 16.3 L 18.4 18.4 M 5.6 18.4 L 7.7 16.3 M 16.3 7.7 L 18.4 5.6"/></svg>;
    case 'engine': return <svg {...props}><rect x="5" y="9" width="14" height="9" rx="1"/><rect x="9" y="4" width="6" height="5" rx="0.5"/><path d="M8.5 12.5 L 15.5 12.5 M 8.5 15 L 15.5 15"/><path d="M3 14 L 5 14 M 19 14 L 21 14"/></svg>;
    case 'sliders': return <svg {...props}><path d="M4 7 L 20 7 M 4 12 L 20 12 M 4 17 L 20 17"/><circle cx="9" cy="7" r="1.6" fill={stroke}/><circle cx="15" cy="12" r="1.6" fill={stroke}/><circle cx="11" cy="17" r="1.6" fill={stroke}/></svg>;
    case 'wifi': return <svg {...props}><path d="M3.5 11 Q 12 3, 20.5 11"/><path d="M6.5 13.5 Q 12 8, 17.5 13.5"/><path d="M9.5 16 Q 12 13.5, 14.5 16"/><circle cx="12" cy="19" r="0.9" fill={stroke}/></svg>;
    default: return null;
  }
}
