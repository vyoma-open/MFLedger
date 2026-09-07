import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Pin, Search, Tag, StickyNote } from 'lucide-react';
import { db } from '@/db/schema';
import type { Note } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Topbar } from '@/components/Topbar/Topbar';
import { AddNoteModal } from '@/components/AddNoteModal';
import { SectionLabel } from './SectionLabel';
import { NoteCard } from './NoteCard';
import { NoteViewEditModal } from './NoteViewEditModal';
import { useAccount } from '@/contexts/AccountContext';
import { AccountIcon } from '@/components/AccountIcon';

// ─── NoteCard layout configuration ──────────────────────────────────────────
// Cards now have natural heights and use CSS line-clamp for content truncation.

export default function Notes() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { selectedAccountId } = useAccount();

  const [showForm, setShowForm]       = useState(false);
  const [search, setSearch]           = useState('');
  const [activeTag, setActiveTag]     = useState<string | null>(null);
  const [portfolioFilter, setPortfolioFilter] = useState<string>(selectedAccountId);
  const [openNote, setOpenNote]       = useState<Note | null>(null);

  // Sync if topbar switches
  React.useEffect(() => {
    setPortfolioFilter(selectedAccountId);
  }, [selectedAccountId]);

  const notes = useLiveQuery(
    () => db.notes.where('deleted_at').equals(0).toArray(),
    []
  );

  const accounts = useLiveQuery(
    () => db.accounts
      .where('deleted_at')
      .equals(0)
      .filter(a => !['INCOME', 'EXPENSE', 'EQUITY_OPENING'].includes(a.type))
      .toArray(),
    []
  );

  async function togglePin(id: string, pinned: number) {
    await db.notes.update(id, { pinned: pinned ? 0 : 1, updated_at: Date.now() });
    // Refresh openNote if we toggled while it's open
    if (openNote?.id === id) {
      setOpenNote(prev => prev ? { ...prev, pinned: prev.pinned ? 0 : 1 } : prev);
    }
  }

  async function deleteNote(id: string) {
    const ok = await confirm({
      title: 'Delete Note',
      message: 'Delete this note?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    await db.notes.update(id, { deleted_at: Date.now() });
    toast('Note deleted.', 'info');
    if (openNote?.id === id) setOpenNote(null);
  }

  // Sorted: pinned first, then newest
  const sorted = useMemo(
    () => [...(notes ?? [])].sort((a, b) => b.pinned - a.pinned || b.created_at - a.created_at),
    [notes]
  );

  // Collect unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    sorted.forEach(n => {
      n.tags?.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
    });
    return [...tagSet].sort();
  }, [sorted]);

  // Search + tag + portfolio filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter(n => {
      const matchesSearch = !q || n.title.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q);
      const matchesTag    = !activeTag || n.tags?.split(',').map(t => t.trim()).includes(activeTag);
      const matchesPortfolio = portfolioFilter === 'ALL' || n.account_id === portfolioFilter;
      return matchesSearch && matchesTag && matchesPortfolio;
    });
  }, [sorted, search, activeTag, portfolioFilter]);

  const hasPinned   = filtered.some(n => n.pinned === 1);
  const hasUnpinned = filtered.some(n => n.pinned === 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Topbar
        title="Notes"
        actions={
          <button id="add-note-btn" className="btn btn-primary btn-sm hide-mobile" onClick={() => setShowForm(true)}>
            <Plus size={13} /> New Note
          </button>
        }
      />
      <div className="page animate-fade-in" style={{ overflowY: 'auto' }}>

        {/* Create modal */}
        {showForm && <AddNoteModal onClose={() => setShowForm(false)} defaultAccountId={portfolioFilter !== 'ALL' ? portfolioFilter : undefined} />}

        {/* View/edit modal */}
        {openNote && (
          <NoteViewEditModal
            note={openNote}
            linkedAccount={accounts?.find(a => a.id === openNote.account_id)}
            accounts={accounts ?? []}
            onClose={() => setOpenNote(null)}
            onPin={togglePin}
            onDelete={deleteNote}
          />
        )}

        {/* ─── Filter Bar ─────────────────────────────────── */}
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative', maxWidth: 400 }}>
            <Search size={14} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)', pointerEvents: 'none'
            }} />
            <input
              id="notes-search"
              type="search"
              className="form-input"
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, fontSize: 13 }}
            />
          </div>

          {/* Portfolio Filter Row */}
          {accounts && accounts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2 }}>
                Portfolio:
              </span>
              <button
                type="button"
                onClick={() => setPortfolioFilter('ALL')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 99,
                  border: `1px solid ${portfolioFilter === 'ALL' ? 'var(--green)' : 'var(--border)'}`,
                  background: portfolioFilter === 'ALL' ? 'rgba(5, 150, 105, 0.12)' : 'var(--surface-2)',
                  color: portfolioFilter === 'ALL' ? 'var(--green)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                All Portfolios
              </button>
              {accounts.map(acc => {
                const isSelected = portfolioFilter === acc.id;
                const c = acc.color || 'var(--green)';
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setPortfolioFilter(acc.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 99,
                      border: `1px solid ${isSelected ? c : 'var(--border)'}`,
                      background: isSelected ? (c.startsWith('#') ? `${c}1c` : 'rgba(5, 150, 105, 0.12)') : 'var(--surface-2)',
                      color: isSelected ? c : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <AccountIcon icon={acc.icon} size={11} color={isSelected ? c : 'var(--text-tertiary)'} />
                    <span>{acc.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {allTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Tag size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              {allTags.map(tag => {
                const isActive = activeTag === tag;
                return (
                  <button key={tag} onClick={() => setActiveTag(isActive ? null : tag)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                    border: `1px solid ${isActive ? 'var(--blue)' : 'var(--border)'}`,
                    background: isActive ? 'var(--blue-glow)' : 'var(--surface-2)',
                    color: isActive ? 'var(--blue)' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    textTransform: 'lowercase', letterSpacing: '0.02em',
                  }}>
                    #{tag}
                  </button>
                );
              })}
              {activeTag && (
                <button onClick={() => setActiveTag(null)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 11, padding: '3px 8px', borderRadius: 99,
                  border: '1px solid var(--border-subtle)', background: 'transparent',
                  color: 'var(--text-tertiary)', cursor: 'pointer',
                }}>
                  <X size={10} /> Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* ─── Notes Grid ─────────────────────────────────── */}
        {!filtered.length ? (
          <div className="empty-state">
            <div className="empty-state-title">
              {search || activeTag ? 'No matching notes' : 'No notes yet'}
            </div>
            <p className="empty-state-desc">
              {search || activeTag
                ? 'Try a different search term or tag.'
                : 'Store emergency contacts, insurance details, CA info, and more.'}
            </p>
          </div>
        ) : (
          <>
            {hasPinned && (
              <>
                <SectionLabel icon={<Pin size={10} color="var(--orange)" fill="var(--orange)" style={{ transform: 'rotate(45deg)' }} />} label="Pinned" />
                <div className="grid grid-2" style={{ gap: 12, marginBottom: hasUnpinned ? 24 : 0 }}>
                  {filtered.filter(n => n.pinned === 1).map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      linkedAccount={accounts?.find(a => a.id === note.account_id)}
                      onOpen={() => setOpenNote(note)}
                      onTogglePin={togglePin}
                      onDelete={deleteNote}
                    />
                  ))}
                </div>
              </>
            )}

            {hasUnpinned && (
              <>
                {hasPinned && <SectionLabel label="Notes" />}
                <div className="grid grid-2" style={{ gap: 12 }}>
                  {filtered.filter(n => n.pinned === 0).map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      linkedAccount={accounts?.find(a => a.id === note.account_id)}
                      onOpen={() => setOpenNote(note)}
                      onTogglePin={togglePin}
                      onDelete={deleteNote}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
