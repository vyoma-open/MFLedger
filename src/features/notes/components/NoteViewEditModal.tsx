import React, { useState, useEffect, useRef } from 'react';
import { StickyNote, Pin, Trash2, X, Tag, Check } from 'lucide-react';
import { db } from '@/db/schema';
import type { Note } from '@/db/schema';
import { formatDate } from '@/utils/fiscalYear';
import { useToast } from '@/contexts/ToastContext';

interface NoteViewEditModalProps {
  note: Note;
  linkedAccount: { name: string } | undefined;
  accounts: { id: string; name: string; type: string; emoji?: string; color?: string; icon?: string }[];
  onClose: () => void;
  onPin: (id: string, pinned: number) => void;
  onDelete: (id: string) => void;
}

export function NoteViewEditModal({ note, linkedAccount, accounts, onClose, onPin, onDelete }: NoteViewEditModalProps) {
  const { toast } = useToast();
  const [title,     setTitle]     = useState(note.title);
  const [content,   setContent]   = useState(note.content);
  const [tags,      setTags]      = useState(note.tags ?? '');
  const [accountId, setAccountId] = useState(note.account_id ?? '');
  const [saving,    setSaving]    = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const isPinned = note.pinned === 1;

  // Track changes dynamically
  const dirty =
    title !== note.title ||
    content !== note.content ||
    tags !== (note.tags ?? '') ||
    accountId !== (note.account_id ?? '');

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty]); // re-bind when dirty changes so handleClose captures latest state

  async function handleSave() {
    if (!title.trim()) { toast('Title is required.', 'error'); return; }
    setSaving(true);
    try {
      const rawTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      const normTags = [...new Set(rawTags)].join(', ');
      await db.notes.update(note.id, {
        title: title.trim(),
        content: content.trim(),
        tags: normTags || undefined,
        account_id: accountId || undefined,
        updated_at: Date.now(),
      });
      toast('Note saved.', 'success');
    } catch {
      toast('Failed to save note.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    if (dirty) {
      await handleSave();
    }
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1200 }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="modal slide-up"
        style={{ maxWidth: 560, width: '92%', padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}
      >
        {/* ── Modal header bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 10, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StickyNote size={16} color="var(--blue)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {formatDate(note.created_at)}
            </span>
            {dirty && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                color: 'var(--orange)', background: 'rgba(245,158,11,0.12)',
                padding: '1px 7px', borderRadius: 5, textTransform: 'uppercase',
              }}>
                Unsaved
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Pin toggle */}
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => onPin(note.id, note.pinned)}
              aria-label={isPinned ? 'Unpin' : 'Pin to top'}
              title={isPinned ? 'Unpin' : 'Pin to top'}
              style={{
                width: 30, height: 30,
                color: isPinned ? 'var(--orange)' : 'var(--text-tertiary)',
                background: isPinned ? 'rgba(245,158,11,0.10)' : 'transparent',
              }}
            >
              <Pin size={14} fill={isPinned ? 'var(--orange)' : 'none'} />
            </button>
            {/* Delete */}
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => onDelete(note.id)}
              aria-label="Delete note"
              style={{ width: 30, height: 30, color: 'var(--red)' }}
            >
              <Trash2 size={14} />
            </button>
            {/* Save (shown when dirty) */}
            {dirty && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={saving}
                style={{ borderRadius: 8, padding: '4px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Check size={12} /> {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            {/* Close */}
            <button
              className="btn btn-ghost btn-icon"
              onClick={handleClose}
              aria-label="Close"
              style={{ width: 30, height: 30 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Editable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title */}
          <input
            ref={titleRef}
            id="note-edit-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Note title"
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              outline: 'none',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--text-primary)',
              width: '100%',
              padding: '0 0 10px 0',
              fontFamily: 'var(--font-sans)',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--blue)')}
            onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--border-subtle)')}
          />

          {/* Link to account */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Portfolio
            </label>
            <select
              id="note-edit-account"
              className="form-select"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              style={{ fontSize: 12, flex: 1, padding: '4px 28px 4px 8px' }}
            >
              <option value="">— General Note (No Portfolio) —</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Content textarea — auto-expands */}
          <textarea
            id="note-edit-content"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your note here…"
            rows={10}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 14,
              lineHeight: 1.7,
              color: 'var(--text-primary)',
              width: '100%',
              fontFamily: 'var(--font-sans)',
              flex: 1,
              minHeight: 200,
            }}
          />

          {/* Tags */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              id="note-edit-tags"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="Tags — comma-separated (e.g. ca, loan, sip)"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 12,
                color: 'var(--text-secondary)',
                width: '100%',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
        </div>

        {/* ── Footer hint ── */}
        <div style={{
          padding: '8px 24px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 11,
          color: 'var(--text-tertiary)',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>Click outside or press Esc to close{dirty ? ' — unsaved changes will be saved automatically' : ''}</span>
          {linkedAccount && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--blue)', fontWeight: 600 }}>
              🔗 {linkedAccount.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
