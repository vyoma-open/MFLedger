import React from 'react';
import type { Note } from '@/db/schema';
import { formatDate } from '@/utils/fiscalYear';
import { Pin, X, StickyNote } from 'lucide-react';
import { AccountIcon } from '@/components/AccountIcon';

interface NoteCardProps {
  note: Note;
  linkedAccount: { name: string; color?: string; emoji?: string; icon?: string } | undefined;
  onOpen: () => void;
  onTogglePin: (id: string, pinned: number) => void;
  onDelete: (id: string) => void;
}

export function NoteCard({ note, linkedAccount, onOpen, onTogglePin, onDelete }: NoteCardProps) {
  const isPinned = note.pinned === 1;
  const tags     = note.tags ? note.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  return (
    <div
      className="animate-fade-in"
      onClick={onOpen}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 16px 14px 16px',
        borderRadius: 'var(--radius-lg)',
        background: isPinned
          ? 'linear-gradient(135deg, rgba(245,158,11,0.03) 0%, var(--surface) 80%)'
          : 'var(--surface)',
        border: `1px solid ${isPinned ? 'var(--orange)' : 'var(--border-subtle)'}`,
        borderLeft: isPinned
          ? '3px solid var(--orange)'
          : linkedAccount?.color
          ? `3px solid ${linkedAccount.color}`
          : '1px solid var(--border-subtle)',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
        (e.currentTarget as HTMLDivElement).style.borderColor = isPinned ? 'var(--orange)' : 'var(--border)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.borderColor = isPinned ? 'var(--orange)' : 'var(--border-subtle)';
      }}
    >
      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, flexShrink: 0, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{
            fontWeight: 600, fontSize: 14, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          }}>
            {note.title}
          </span>
        </div>

        {/* Action buttons — stop propagation so they don't open the modal */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={e => { e.stopPropagation(); onTogglePin(note.id, note.pinned); }}
            aria-label={isPinned ? 'Unpin note' : 'Pin note'}
            style={{ opacity: 0.45, width: 24, height: 24, padding: 0 }}
            onMouseEnter={e => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.45'; }}
          >
            <Pin size={12} fill={isPinned ? 'var(--orange)' : 'none'} color={isPinned ? 'var(--orange)' : 'currentColor'} />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={e => { e.stopPropagation(); onDelete(note.id); }}
            aria-label="Delete note"
            style={{ opacity: 0.35, width: 24, height: 24, padding: 0 }}
            onMouseEnter={e => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.35'; }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* ── Meta row: linked account + tags ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, flexShrink: 0, minHeight: 18 }}>
        {linkedAccount && (
          <span style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: linkedAccount.color || 'var(--green)',
            background: linkedAccount.color ? `${linkedAccount.color}1a` : 'rgba(5, 150, 105, 0.12)',
            border: `1px solid ${linkedAccount.color ? `${linkedAccount.color}35` : 'rgba(5, 150, 105, 0.25)'}`,
            padding: '2px 8px',
            borderRadius: 8,
            letterSpacing: '0.03em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <AccountIcon icon={linkedAccount.icon} size={11} color={linkedAccount.color || 'var(--green)'} />
            <span>{linkedAccount.name}</span>
          </span>
        )}
        {tags.slice(0, 3).map(tag => (
          <span key={tag} style={{
            fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
            background: 'var(--surface-3)', color: 'var(--text-tertiary)', letterSpacing: '0.02em',
          }}>
            #{tag}
          </span>
        ))}
      </div>

      {/* ── Body preview ── */}
      <div style={{ flex: 1, minHeight: 0, marginBottom: 12 }}>
        <p style={{
          margin: 0,
          fontSize: 13,
          lineHeight: '1.55',
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: 5,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        } as any}>
          {note.content || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No content</span>}
        </p>
      </div>

      {/* ── Footer: timestamp ── */}
      <div style={{
        fontSize: 10, color: 'var(--text-tertiary)', marginTop: 'auto', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <StickyNote size={9} style={{ opacity: 0.5 }} />
        {formatDate(note.created_at)}
      </div>
    </div>
  );
}
