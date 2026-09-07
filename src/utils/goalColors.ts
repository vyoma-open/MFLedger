export interface GoalColorTheme {
  bg: string;
  color: string;
  border: string;
}

export function getGoalTagTheme(goalTag?: string): GoalColorTheme {
  if (!goalTag || !goalTag.trim()) {
    return { bg: 'var(--surface-3)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' };
  }

  const normalized = goalTag.trim().toLowerCase();

  if (normalized.includes('home') || normalized.includes('house') || normalized.includes('flat') || normalized.includes('property')) {
    return { bg: 'rgba(16, 185, 129, 0.14)', color: '#10B981', border: 'rgba(16, 185, 129, 0.3)' }; // Emerald
  }
  if (normalized.includes('vehicle') || normalized.includes('car') || normalized.includes('bike') || normalized.includes('auto')) {
    return { bg: 'rgba(59, 130, 246, 0.14)', color: '#3B82F6', border: 'rgba(59, 130, 246, 0.3)' }; // Blue
  }
  if (normalized.includes('retire') || normalized.includes('pension') || normalized.includes('fire')) {
    return { bg: 'rgba(13, 148, 136, 0.14)', color: '#0D9488', border: 'rgba(13, 148, 136, 0.3)' }; // Teal (distinct from purple Active SIP)
  }
  if (normalized.includes('education') || normalized.includes('child') || normalized.includes('school') || normalized.includes('college')) {
    return { bg: 'rgba(245, 158, 11, 0.14)', color: '#F59E0B', border: 'rgba(245, 158, 11, 0.3)' }; // Amber
  }
  if (normalized.includes('emergency') || normalized.includes('safety') || normalized.includes('rainy')) {
    return { bg: 'rgba(239, 68, 68, 0.14)', color: '#EF4444', border: 'rgba(239, 68, 68, 0.3)' }; // Rose Red
  }
  if (normalized.includes('wealth') || normalized.includes('corpus') || normalized.includes('growth')) {
    return { bg: 'rgba(6, 182, 212, 0.14)', color: '#06B6D4', border: 'rgba(6, 182, 212, 0.3)' }; // Cyan
  }
  if (normalized.includes('travel') || normalized.includes('vacation') || normalized.includes('trip') || normalized.includes('holiday')) {
    return { bg: 'rgba(236, 72, 153, 0.14)', color: '#EC4899', border: 'rgba(236, 72, 153, 0.3)' }; // Pink
  }

  // Dynamic hash palette for custom goals (excluding purple ~270 to reserve purple for Active SIPs)
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [160, 205, 35, 185, 330, 45, 130, 220];
  const hue = hues[Math.abs(hash) % hues.length];
  return {
    bg: `hsl(${hue}, 65%, 15%)`,
    color: `hsl(${hue}, 85%, 68%)`,
    border: `hsl(${hue}, 50%, 30%)`,
  };
}
