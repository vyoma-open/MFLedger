/**
 * Utility to compute and apply the active account's accent color
 * dynamically to CSS custom properties on document.documentElement.
 */
export function applyAccountAccentColor(hexColor?: string | null) {
  if (typeof document === 'undefined') return;

  if (!hexColor || hexColor === 'ALL') {
    // Default Zerodha/MFLedger emerald green
    document.documentElement.style.setProperty('--accent', '#00B386');
    document.documentElement.style.setProperty('--accent-dim', '#008F6C');
    document.documentElement.style.setProperty('--accent-glow', 'rgba(0, 179, 134, 0.16)');
    document.documentElement.style.setProperty('--shadow-glow-accent', '0 0 20px rgba(0, 179, 134, 0.28)');
    return;
  }

  const cleanHex = hexColor.trim();

  // Parse RGB
  let r = 0;
  let g = 0;
  let b = 0;

  if (cleanHex.startsWith('#')) {
    if (cleanHex.length === 7) {
      r = parseInt(cleanHex.slice(1, 3), 16) || 0;
      g = parseInt(cleanHex.slice(3, 5), 16) || 0;
      b = parseInt(cleanHex.slice(5, 7), 16) || 0;
    } else if (cleanHex.length === 4) {
      r = parseInt(cleanHex[1] + cleanHex[1], 16) || 0;
      g = parseInt(cleanHex[2] + cleanHex[2], 16) || 0;
      b = parseInt(cleanHex[3] + cleanHex[3], 16) || 0;
    }
  }

  // Darker shade for hover states (reduce luminance by ~18%)
  const dimR = Math.max(0, Math.floor(r * 0.82));
  const dimG = Math.max(0, Math.floor(g * 0.82));
  const dimB = Math.max(0, Math.floor(b * 0.82));
  const dimHex = `#${dimR.toString(16).padStart(2, '0')}${dimG.toString(16).padStart(2, '0')}${dimB.toString(16).padStart(2, '0')}`;

  const glow = `rgba(${r}, ${g}, ${b}, 0.18)`;
  const shadowGlow = `0 0 20px rgba(${r}, ${g}, ${b}, 0.32)`;

  document.documentElement.style.setProperty('--accent', cleanHex);
  document.documentElement.style.setProperty('--accent-dim', dimHex);
  document.documentElement.style.setProperty('--accent-glow', glow);
  document.documentElement.style.setProperty('--shadow-glow-accent', shadowGlow);
}
