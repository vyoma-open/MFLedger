import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { RecurringTemplate, AssetClass, Frequency } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { parseDateStr } from '@/utils/fiscalYear';
import { DatePicker } from '@/components/ui/DatePicker';
import { MF_LABELS } from './AddLotModal';

interface EditSIPModalProps {
  sip: RecurringTemplate;
  onClose: () => void;
  onUpdate?: () => void;
}

export function EditSIPModal({ sip, onClose, onUpdate }: EditSIPModalProps) {
  const { toast } = useToast();
  const accounts = useLiveQuery(() => db.accounts.where('deleted_at').equals(0).filter(a => a.type === 'MF').toArray(), []);

  const initialSymbol = sip.name.replace(/ SIP$/i, '').trim().toUpperCase();

  const [form, setForm] = useState({
    account_id: sip.to_account_id || '',
    symbol: initialSymbol,
    name: (sip.description || sip.name).replace(/^SIP investment in /i, '').trim(),
    sip_amount: (sip.amount_paise / 100).toString(),
    sip_frequency: sip.frequency,
    sip_start_date: (() => {
      const d = new Date(sip.next_execution);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    })(),
    asset_class: (sip as any).asset_class || 'EQUITY_MF' as AssetClass,
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountPaise = Math.round(parseFloat(form.sip_amount) * 100);
    if (!form.account_id || !form.symbol || isNaN(amountPaise) || amountPaise <= 0) {
      toast('Fill required SIP fields.', 'error');
      return;
    }
    setLoading(true);
    try {
      await db.recurring_templates.update(sip.id, {
        name: `${form.symbol.toUpperCase()} SIP`,
        frequency: form.sip_frequency as any,
        amount_paise: amountPaise,
        to_account_id: form.account_id,
        description: `SIP investment in ${form.name.trim() || form.symbol.toUpperCase()}`,
        next_execution: parseDateStr(form.sip_start_date),
        updated_at: Date.now(),
        version: sip.version + 1,
        asset_class: form.asset_class,
      });
      toast('SIP Schedule updated successfully!', 'success');
      if (onUpdate) onUpdate();
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to update SIP.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 420 }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Edit SIP Schedule</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ padding: 4 }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">MF Account *</label>
              <select className="form-select" value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))} required>
                <option value="">Select…</option>
                {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Asset Class</label>
              <select className="form-select" value={form.asset_class} onChange={e => setForm(f => ({ ...f, asset_class: e.target.value as AssetClass }))}>
                {['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF'].map(c => (
                  <option key={c} value={c}>{MF_LABELS[c as AssetClass]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Symbol / ISIN *</label>
            <input className="form-input" placeholder="e.g. AMFI:122639" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Fund Scheme Name</label>
            <input className="form-input" placeholder="Leave blank to use symbol" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">SIP Installment Amount (₹) *</label>
            <div className="amount-input-wrapper">
              <span className="amount-input-prefix">₹</span>
              <input type="number" className="form-input amount-input" placeholder="0.00" value={form.sip_amount} onChange={e => setForm(f => ({ ...f, sip_amount: e.target.value }))} required />
            </div>
          </div>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">SIP Frequency *</label>
              <select className="form-select" value={form.sip_frequency} onChange={e => setForm(f => ({ ...f, sip_frequency: e.target.value as Frequency }))} required>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Next Due Date *</label>
              <DatePicker className="form-input" value={form.sip_start_date} onChange={(val: string) => setForm(f => ({ ...f, sip_start_date: val }))} required />
            </div>
          </div>
          <div className="modal-footer" style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
