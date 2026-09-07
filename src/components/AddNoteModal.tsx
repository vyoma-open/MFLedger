import React, { useState, useRef, useEffect } from 'react';
import { X, StickyNote, Pin } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { generateId } from '../utils/ids';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { playSuccessSound, playCancelSound, triggerConfetti } from '../utils/whimsy';
import { useAccount } from '../contexts/AccountContext';

interface AddNoteModalProps {
  onClose: () => void;
  defaultAccountId?: string;
}

const TEMPLATES = {
  contact: {
    name: '📞 Contact Details',
    emoji: '📞',
    title: '📞 Contact Details',
    content: `Contact Person: \nPhone Number: \nEmail: \nWorking Hours: \nNotes: `
  },
  folio: {
    name: '📋 Folio & AMC Details',
    emoji: '📋',
    title: '📋 Folio & AMC Details',
    content: `Folio Number: \nAMC / Fund House: \nScheme Name: \nLinked Bank Account: \nNominee Name: \nCustomer Care / Email: \nNotes: `
  },
  investment: {
    name: '📈 Investment Strategy',
    emoji: '📈',
    title: '📈 Investment Strategy',
    content: `Target Goal: \nTarget Amount: ₹\nTime Horizon: years\nAsset Allocation: Equity: %, Debt: %, Gold: %\nMonthly SIP Target: ₹\nRebalancing Rules: `
  },
  reminder: {
    name: '🔔 Important Reminder',
    emoji: '🔔',
    title: '🔔 Reminder',
    content: `Due Date / Frequency: \nTask/Action Details: \nAuto-debit details: `
  }
};


export function AddNoteModal({ onClose, defaultAccountId }: AddNoteModalProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { selectedAccountId } = useAccount();

  const initialAccountId = defaultAccountId || (selectedAccountId !== 'ALL' ? selectedAccountId : '');
  const [form, setForm] = useState({ title: '', content: '', account_id: initialAccountId, tags: '', pinned: false });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load active accounts list reactively, excluding system accounts
  const accounts = useLiveQuery(
    () => db.accounts.where('deleted_at').equals(0).filter(a => !['INCOME', 'EXPENSE', 'EQUITY_OPENING'].includes(a.type)).toArray(),
    []
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleTemplateSelect = async (key: string) => {
    if (!key) return;
    const tpl = TEMPLATES[key as keyof typeof TEMPLATES];
    if (tpl) {
      if (form.title.trim() || form.content.trim()) {
        const ok = await confirm({
          title: 'Overwrite Draft',
          message: 'This will overwrite your current note draft. Do you want to continue?',
          confirmText: 'Overwrite',
          cancelText: 'Cancel',
          danger: true,
        });
        if (!ok) {
          // Reset the select dropdown to empty value
          const selectEl = document.getElementById('note-modal-template') as HTMLSelectElement;
          if (selectEl) selectEl.value = '';
          return;
        }
      }
      // Auto-suggest a tag based on template type
      const tagMap: Record<string, string> = {
        contact: 'contact',
        loan: 'loan',
        investment: 'investment',
        reminder: 'reminder',
      };
      setForm(f => ({
        ...f,
        title: tpl.title,
        content: tpl.content,
        tags: f.tags || (tagMap[key] ?? ''),
      }));
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;

    setLoading(true);
    try {
      const now = Date.now();
      // Normalise tags: lowercase, strip extra spaces, deduplicate
      const rawTags = form.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      const normalisedTags = [...new Set(rawTags)].join(', ');
      await db.notes.add({
        id: generateId('note'),
        title: form.title.trim(),
        content: form.content.trim(),
        pinned: form.pinned ? 1 : 0,
        account_id: form.account_id || undefined,
        tags: normalisedTags || undefined,
        created_at: now,
        updated_at: now,
        deleted_at: 0,
      });

      playSuccessSound();
      triggerConfetti();
      toast('Note saved.', 'success');
      onClose();
    } catch (err) {
      toast('Failed to save note.', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 560, width: '92%', padding: '24px' }}>
        <div className="modal-header" style={{ marginBottom: 20 }}>
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 }}>
            <StickyNote size={20} color="var(--blue)" /> Create Note
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Template Selector */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="note-modal-template">Use Template</label>
            <select
              id="note-modal-template"
              className="form-select"
              defaultValue=""
              onChange={e => handleTemplateSelect(e.target.value)}
              style={{ fontSize: 13 }}
            >
              <option value="">-- Select Note Template (Optional) --</option>
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <option key={key} value={key}>{tpl.name}</option>
              ))}
            </select>
          </div>

          {/* Title Field */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="note-modal-title">Title *</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id="note-modal-title"
                ref={inputRef}
                className="form-input"
                placeholder="Enter note title..."
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => setForm(f => ({ ...f, pinned: !f.pinned }))}
                style={{
                  width: 38,
                  height: 38,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 10,
                  borderColor: form.pinned ? 'var(--orange)' : 'var(--border-subtle)',
                  background: form.pinned ? 'var(--orange-glow, rgba(249, 115, 22, 0.15))' : 'var(--surface-2)',
                  color: form.pinned ? 'var(--orange)' : 'var(--text-tertiary)',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                title={form.pinned ? "Pinned to Top" : "Pin to Top"}
              >
                <Pin size={16} fill={form.pinned ? "var(--orange)" : "none"} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
          </div>

          {/* Link to Portfolio Account Field */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="note-modal-account">Portfolio Account (Optional)</label>
            <select
              id="note-modal-account"
              className="form-select"
              value={form.account_id}
              onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}
              style={{ fontSize: 13 }}
            >
              <option value="">-- General Note (No Portfolio Linked) --</option>
              {accounts?.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Content Textarea */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="note-modal-content">Content</label>
            <textarea
              id="note-modal-content"
              className="form-textarea"
              placeholder="Write note description or details..."
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={5}
              style={{ resize: 'vertical', minHeight: 110, padding: '10px 12px', fontSize: 13 }}
            />
          </div>

          {/* Tags Field */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="note-modal-tags">Tags <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(comma-separated)</span></label>
            <input
              id="note-modal-tags"
              className="form-input"
              placeholder="e.g. ca, loan, sip, ppf"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              style={{ fontSize: 13 }}
            />
          </div>



          {/* Footer Actions */}
          <div className="modal-footer" style={{ marginTop: 8, padding: 0, borderTop: 'none', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => { playCancelSound(); onClose(); }} style={{ borderRadius: 10, padding: '8px 16px', fontSize: 13 }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                background: 'var(--blue)',
                borderColor: 'var(--blue)',
                color: '#fff',
                borderRadius: 10,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              {loading ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
