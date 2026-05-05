import { useState, useEffect } from 'react';
import Icon from './Icon';
import { useAdmin, useEditable, getByPath } from '../admin/AdminContext';

/**
 * <IconPicker path="metiers.0.icon" size={32} stroke="#EF8827" />
 * Lecture : rend un <Icon name=… /> simple.
 * Édition : rend l'icône courante PLUS un petit bouton "✎" qui ouvre un
 *           popover listant toutes les icônes disponibles. Clic sur une
 *           tuile → setField(path, name) → l'icône est mise à jour partout.
 *
 * Liste des icônes synchronisée à la main avec components/Icon.jsx.
 */
const ICONS = [
  'help', 'compass', 'clock', 'network', 'flag', 'cpu',
  'sectors', 'project', 'arrow', 'arrow-down', 'mail', 'linkedin',
  'lock', 'unlock', 'search', 'pin', 'check', 'plus',
  'circuit', 'gear', 'engine', 'sliders', 'wifi',
];

export default function IconPicker({ path, size = 24, stroke = 'currentColor' }) {
  const { content, setField } = useAdmin();
  const isEdit = useEditable();
  const [open, setOpen] = useState(false);
  const current = (path ? getByPath(content, path) : null) || 'cpu';

  // Ferme le popover au clic à l'extérieur / Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!e.target.closest('.icon-picker')) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isEdit || !path) {
    return <Icon name={current} size={size} stroke={stroke} />;
  }

  const onPick = (name) => {
    setField(path, name);
    setOpen(false);
  };

  return (
    <span className={`icon-picker ${open ? 'is-open' : ''}`}>
      <Icon name={current} size={size} stroke={stroke} />
      <button
        type="button"
        className="icon-picker-edit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        title="Changer l'icône"
        aria-label="Changer l'icône"
      >✎</button>
      {open && (
        <div className="icon-picker-popover" role="listbox">
          <div className="icon-picker-grid">
            {ICONS.map((name) => (
              <button
                key={name}
                type="button"
                className={`icon-picker-tile ${name === current ? 'is-selected' : ''}`}
                onClick={() => onPick(name)}
                title={name}
                aria-label={name}
              >
                <Icon name={name} size={20} stroke="#11202A" />
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
