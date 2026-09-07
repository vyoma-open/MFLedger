import React, { useState } from 'react';
import { X } from 'lucide-react';
import { db } from '@/db/schema';
import type { RecurringTemplate } from '@/db/schema';
import { useToast } from '@/contexts/ToastContext';
import { todayStr, parseDateStr } from '@/utils/fiscalYear';
import { DatePicker } from '@/components/ui/DatePicker';
import { buyLot } from '@/engines/fifo';

interface AddSIPTransactionModalProps {
  sip: RecurringTemplate;
  symbol: string;
  onClose: () => void;
  onAdded?: () => void;
}

export function AddSIPTransactionModal({ sip, symbol, onClose, onAdded }: AddSIPTransactionModalProps) {
  const { toast } = useToast();

  const [form, setForm] = useState({
    units: '',
    price: '',
    fees: '',
    purchase_date: todayStr(),
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const units = parseFloat(form.units);
    const price = Math.round(parseFloat(form.price) * 100);
    const fees = form.fees ? Math.round(parseFloat(form.fees) * 100) : 0;

    if (isNaN(units) || isNaN(price)) {
      toast('Fill required fields.', 'error');
      return;
    }

    setLoading(true);
    try {
      const accountsList = await db.accounts.where('deleted_at').equals(0).toArray();
      const act = accountsList.find(a => a.id === sip.to_account_id);

      const assetClass = (sip as any).asset_class || 'EQUITY_MF';

      await buyLot({
        account_id: sip.to_account_id || '',
        profile_id: act?.profile_id || 'default',
        symbol: symbol,
        name: (sip.description || sip.name).replace(/^SIP investment in /i, '').trim() || symbol,
        asset_class: assetClass,
        purchase_date: parseDateStr(form.purchase_date),
        units,
        price_per_unit_paise: price,
        fees_paise: fees,
      });

      toast('SIP purchase transaction recorded successfully!', 'success');
      if (onAdded) onAdded();
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to record transaction.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 420 }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Record SIP Purchase</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ padding: 4 }}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div><strong>Fund:</strong> {(sip.description || sip.name).replace(/^SIP investment in /i, '').trim()} ({symbol})</div>
          </div>
          <div className="form-group">
            <label className="form-label">Units *</label>
            <input type="number" step="0.001" className="form-input" placeholder="e.g. 24.505" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Purchase NAV / Price (₹) *</label>
            <div className="amount-input-wrapper">
              <span className="amount-input-prefix">₹</span>
              <input type="number" step="0.01" className="form-input amount-input" placeholder="0.00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required />
            </div>
          </div>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Purchase Date *</label>
              <DatePicker className="form-input" value={form.purchase_date} onChange={(val: string) => setForm(f => ({ ...f, purchase_date: val }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Fees (₹)</label>
              <div className="amount-input-wrapper">
                <span className="amount-input-prefix">₹</span>
                <input type="number" step="0.01" className="form-input amount-input" placeholder="0.00" value={form.fees} onChange={e => setForm(f => ({ ...f, fees: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="modal-footer" style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Record Purchase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
