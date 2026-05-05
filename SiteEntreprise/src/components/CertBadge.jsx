import iso9001 from '../assets/cert-iso-9001.png';
import iso27001 from '../assets/cert-iso-27001.png';
import ecovadis from '../assets/cert-ecovadis.png';
import cir from '../assets/cert-cir.png';
import tftp from '../assets/cert-tftp.png';

const map = {
  iso9001: { src: iso9001,  alt: 'ISO 9001:2015' },
  iso14001:{ src: iso9001,  alt: 'ISO 14001' },
  iso27001:{ src: iso27001, alt: 'ISO 27001' },
  ecovadis:{ src: ecovadis, alt: 'EcoVadis' },
  cir:     { src: cir,      alt: "Crédit Impôt Recherche" },
  tftp:    { src: tftp,     alt: 'Time for the Planet' },
};

export default function CertBadge({ kind, size = 90 }) {
  const m = map[kind];
  if (!m) return null;
  return (
    <img
      src={m.src}
      alt={m.alt}
      style={{
        maxWidth: size,
        maxHeight: size,
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        display: 'block',
      }}
    />
  );
}
