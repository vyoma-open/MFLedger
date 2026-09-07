import React from 'react';

export function SectionLabel({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.07em', color: 'var(--text-tertiary)',
      marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {icon}{label}
    </div>
  );
}
