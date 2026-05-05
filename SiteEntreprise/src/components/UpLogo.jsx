import logoUrl from '../assets/logo-up.png';

export default function UpLogo({ size = 1, dark = false }) {
  const height = 36 * size;
  return (
    <span
      className={`up-logo${dark ? ' is-dark' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height,
      }}
    >
      <img
        src={logoUrl}
        alt="Up Technologies"
        style={{
          height,
          width: 'auto',
          display: 'block',
          filter: dark ? 'brightness(0) invert(1)' : 'none',
        }}
      />
    </span>
  );
}
