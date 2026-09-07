import React from 'react';

interface SortableHeaderProps<T extends string> {
  label: string;
  field: T;
  currentSortBy: T | null;
  currentSortOrder: 'asc' | 'desc' | null;
  onSort: (field: T) => void;
  align?: 'left' | 'right';
  className?: string;
}

export function SortableHeader<T extends string>({
  label,
  field,
  currentSortBy,
  currentSortOrder,
  onSort,
  align = 'left',
  className = '',
}: SortableHeaderProps<T>) {
  const isActive = currentSortBy === field && currentSortOrder !== null;
  const isRight = align === 'right' || className.split(' ').includes('r');
  return (
    <th
      onClick={() => onSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: isRight ? 'right' : 'left' }}
      className={`sortable-th ${isRight ? 'r' : ''} ${className}`.trim()}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: isRight ? 'flex-end' : 'flex-start', width: '100%' }}>
        <span>{label}</span>
        {isActive && currentSortOrder ? (
          <span style={{ color: 'var(--blue)', fontSize: 10 }}>{currentSortOrder === 'asc' ? '▲' : '▼'}</span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)', opacity: 0.3, fontSize: 10 }}>↕</span>
        )}
      </div>
    </th>
  );
}
