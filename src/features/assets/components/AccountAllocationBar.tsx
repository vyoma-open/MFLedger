import React from 'react';

interface Segment {
  name: string;
  paise: number;
  color?: string;
}

interface AccountAllocationBarProps {
  segments: Segment[];
}

export function AccountAllocationBar({ segments }: AccountAllocationBarProps) {
  const total = segments.reduce((s, seg) => s + Math.abs(seg.paise), 0);
  if (total === 0) return null;

  const colors = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--red)', '#7C4DFF', '#00BCD4'];

  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        {segments.map((seg, i) => {
          const pct = ((Math.abs(seg.paise) / total) * 100).toFixed(2);
          return (
            <div
              key={seg.name}
              title={`${seg.name}: ${pct}%`}
              style={{
                width: `${(Math.abs(seg.paise) / total) * 100}%`,
                background: seg.color || colors[i % colors.length],
                transition: 'width 0.4s ease',
                minWidth: 2,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 8 }}>
        {segments.map((seg, i) => (
          <div key={seg.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color || colors[i % colors.length] }} />
            <span style={{ fontWeight: 500 }}>{seg.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {((Math.abs(seg.paise) / total) * 100).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
