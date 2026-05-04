export default function UpLogo({ color = '#EF8827', textColor, size = 1 }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 8 * size,
      height: 40 * size,
    }}>
      <span style={{
        fontFamily: "'Pacifico', 'Brush Script MT', cursive",
        fontSize: 38 * size,
        fontWeight: 400,
        color: color,
        lineHeight: 1,
        letterSpacing: '-0.04em',
        transform: 'translateY(2px)',
      }}>up</span>
      <span style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 20 * size,
        fontWeight: 300,
        color: textColor || '#11202A',
        letterSpacing: '0.04em',
        lineHeight: 1,
      }}>Technologies</span>
    </span>
  );
}
