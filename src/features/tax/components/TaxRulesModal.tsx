import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Check, X, Trash2, Plus, Info, Receipt, RotateCcw } from 'lucide-react';
import { db, ASSET_CLASS_LABELS, type TaxRule, type AssetClass, type TaxMode } from '@/db/schema';
import { resetTaxRulesToDefaults } from '@/db/seed';
import { formatINR } from '@/utils/currency';
import { generateId } from '@/utils/ids';
import { useConfirm } from '@/contexts/ConfirmContext';

interface TaxRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TaxRulesModal({ isOpen, onClose }: TaxRulesModalProps) {
  const confirm = useConfirm();
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Live Query to get all tax rules
  const taxRules = useLiveQuery(async () => {
    return await db.tax_rules.toArray();
  }, []);

  // Request sort
  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Sort rules
  const sortedRules = useMemo(() => {
    if (!taxRules) return [];
    const sortableRules = [...taxRules];
    if (sortConfig !== null) {
      sortableRules.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.key) {
          case 'name':
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case 'asset_class':
            aValue = ASSET_CLASS_LABELS[a.asset_class].toLowerCase();
            bValue = ASSET_CLASS_LABELS[b.asset_class].toLowerCase();
            break;
          case 'holding_period':
            aValue = a.holding_period_months;
            bValue = b.holding_period_months;
            break;
          case 'stcg_mode':
            aValue = a.stcg_mode;
            bValue = b.stcg_mode;
            break;
          case 'stcg_rate':
            aValue = a.stcg_rate_bps;
            bValue = b.stcg_rate_bps;
            break;
          case 'ltcg_mode':
            aValue = a.ltcg_mode;
            bValue = b.ltcg_mode;
            break;
          case 'ltcg_rate':
            aValue = a.ltcg_rate_bps;
            bValue = b.ltcg_rate_bps;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableRules;
  }, [taxRules, sortConfig]);

  // Add a new tax rule with default values
  async function handleAddRule() {
    const newId = generateId('tax');
    const now = Date.now();
    const newRule: TaxRule = {
      id: newId,
      name: 'New Custom Rule',
      asset_class: 'EQUITY_MF',
      holding_period_months: 12,
      stcg_mode: 'FIXED_PERCENTAGE',
      stcg_rate_bps: 2000, // 20%
      ltcg_mode: 'FIXED_PERCENTAGE',
      ltcg_rate_bps: 1250, // 12.5%
      exemption_cap_paise: 12500000, // ₹1.25L exemption (Budget 2025-26)
      effective_from: now,
      effective_until: null,
      created_at: now,
      updated_at: now,
      version: 1,
    };

    await db.tax_rules.add(newRule);

    // Automatically start editing the new rule
    startEdit(newRule);
  }

  // Reset rules to official Budget 2025-26 statutory defaults
  async function handleResetDefaults() {
    const ok = await confirm({
      title: 'Reset to Budget 2025-26 Defaults',
      message: 'Are you sure you want to reset tax rules to official Budget 2025-26 statutory defaults? This will restore standard equity (20% STCG / 12.5% LTCG / ₹1.25L exemption), index funds, debt (slab rate), liquid, gold (24m / 12.5%), and pre-2024 legacy rules.',
      confirmText: 'Reset Defaults',
      cancelText: 'Cancel',
      danger: false,
    });
    if (!ok) return;
    await resetTaxRulesToDefaults();
    setEditingRowId(null);
    setEditForm(null);
  }

  // Edit inline trigger
  function startEdit(rule: TaxRule) {
    setEditingRowId(rule.id);
    setEditForm({
      name: rule.name,
      asset_class: rule.asset_class,
      holding_period_months: rule.holding_period_months,
      stcg_mode: rule.stcg_mode,
      stcg_rate_bps: (rule.stcg_rate_bps / 100).toFixed(2),
      ltcg_mode: rule.ltcg_mode,
      ltcg_rate_bps: (rule.ltcg_rate_bps / 100).toFixed(2),
      exemption_cap_paise: (rule.exemption_cap_paise / 100).toFixed(0),
      version: rule.version,
    });
  }

  // Save inline edits
  async function handleSaveInline() {
    if (!editingRowId || !editForm) return;

    const updates: Partial<TaxRule> = {
      name: editForm.name.trim() || 'Custom Rule',
      asset_class: editForm.asset_class,
      holding_period_months: Math.max(1, parseInt(editForm.holding_period_months) || 12),
      stcg_mode: editForm.stcg_mode,
      stcg_rate_bps: editForm.stcg_mode === 'SLAB_RATE' ? 0 : Math.round(parseFloat(editForm.stcg_rate_bps) * 100) || 0,
      ltcg_mode: editForm.ltcg_mode,
      ltcg_rate_bps: editForm.ltcg_mode === 'SLAB_RATE' ? 0 : Math.round(parseFloat(editForm.ltcg_rate_bps) * 100) || 0,
      exemption_cap_paise: Math.round(parseFloat(editForm.exemption_cap_paise) * 100) || 0,
      updated_at: Date.now(),
      version: (editForm.version || 1) + 1,
    };

    await db.tax_rules.update(editingRowId, updates);
    setEditingRowId(null);
    setEditForm(null);
  }

  // Cancel edit
  function handleCancelInline() {
    setEditingRowId(null);
    setEditForm(null);
  }

  // Delete rule
  async function handleDeleteRule(id: string, name: string) {
    const ok = await confirm({
      title: 'Delete Tax Rule',
      message: `Are you sure you want to delete the tax rule "${name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    await db.tax_rules.delete(id);
    if (editingRowId === id) {
      setEditingRowId(null);
      setEditForm(null);
    }
  }

  if (!isOpen) return null;

  const renderSortArrow = (key: string) => {
    if (sortConfig?.key === key) {
      return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    }
    return '';
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-xl animate-fade-in" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: '1200px', width: '96%' }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={18} color="var(--green)" />
            <span className="modal-title" style={{ fontSize: 16, fontWeight: 600 }}>
              Tax Rules Configurations
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleResetDefaults} style={{ gap: 4 }}>
              <RotateCcw size={13} /> Reset to Budget 2025-26
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAddRule} style={{ gap: 4 }}>
              <Plus size={14} /> Add Rule
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {/* Info header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
          <Info size={14} color="var(--blue)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Click table headers to sort rules. To modify a rule, click the Pencil icon at the end of the row, edit fields directly by typing in the table cells, and click Check to save.
          </span>
        </div>

        {/* Scrollable table view */}
        <div className="table-wrap" style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              {/* Row 1 Header */}
              <tr>
                <th
                  rowSpan={2}
                  style={{ cursor: 'pointer', userSelect: 'none', borderBottom: '2px solid var(--border)', verticalAlign: 'middle', minWidth: '180px' }}
                  onClick={() => requestSort('name')}
                >
                  Asset{renderSortArrow('name')}
                </th>
                <th
                  rowSpan={2}
                  style={{ cursor: 'pointer', userSelect: 'none', borderBottom: '2px solid var(--border)', verticalAlign: 'middle', minWidth: '120px' }}
                  onClick={() => requestSort('asset_class')}
                >
                  Type{renderSortArrow('asset_class')}
                </th>
                <th
                  colSpan={2}
                  style={{
                    borderLeft: '2px solid var(--orange)',
                    borderRight: '2px solid var(--orange)',
                    borderTop: '2px solid var(--orange)',
                    textAlign: 'center',
                    background: 'var(--orange-glow)',
                    color: 'var(--orange)',
                    fontSize: '10px',
                    fontWeight: '700',
                    borderBottom: '1px solid var(--orange)'
                  }}
                >
                  Short-Term Capital Gains (STCG)
                </th>
                <th
                  colSpan={2}
                  style={{
                    borderLeft: '2px solid var(--green)',
                    borderRight: '2px solid var(--green)',
                    borderTop: '2px solid var(--green)',
                    textAlign: 'center',
                    background: 'var(--green-glow)',
                    color: 'var(--green)',
                    fontSize: '10px',
                    fontWeight: '700',
                    borderBottom: '1px solid var(--green)'
                  }}
                >
                  Long-Term Capital Gains (LTCG)
                </th>
                <th rowSpan={2} style={{ borderBottom: '2px solid var(--border)', textAlign: 'center', verticalAlign: 'middle', width: 90, minWidth: '95px' }}>
                  Actions
                </th>
              </tr>
              {/* Row 2 Header */}
              <tr>
                <th
                  style={{
                    borderLeft: '2px solid var(--orange)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: 'var(--orange-glow)',
                    borderBottom: '2px solid var(--orange)',
                    fontSize: '9px',
                    minWidth: '115px'
                  }}
                  onClick={() => requestSort('stcg_mode')}
                >
                  Mode{renderSortArrow('stcg_mode')}
                </th>
                <th
                  style={{
                    borderRight: '2px solid var(--orange)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: 'var(--orange-glow)',
                    borderBottom: '2px solid var(--orange)',
                    fontSize: '9px',
                    textAlign: 'right',
                    minWidth: '100px'
                  }}
                  onClick={() => requestSort('stcg_rate')}
                >
                  Rate{renderSortArrow('stcg_rate')}
                </th>
                <th
                  style={{
                    borderLeft: '2px solid var(--green)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: 'var(--green-glow)',
                    borderBottom: '2px solid var(--green)',
                    fontSize: '9px',
                    minWidth: '115px'
                  }}
                  onClick={() => requestSort('ltcg_mode')}
                >
                  Mode{renderSortArrow('ltcg_mode')}
                </th>
                <th
                  style={{
                    borderRight: '2px solid var(--green)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: 'var(--green-glow)',
                    borderBottom: '2px solid var(--green)',
                    fontSize: '9px',
                    textAlign: 'right',
                    minWidth: '150px'
                  }}
                  onClick={() => requestSort('ltcg_rate')}
                >
                  Rate{renderSortArrow('ltcg_rate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((rule) => {
                const isEditing = editingRowId === rule.id;

                return (
                  <tr
                    key={rule.id}
                    style={{
                      background: isEditing ? 'var(--surface-3)' : undefined,
                    }}
                  >
                    {/* ASSET */}
                    <td style={{ verticalAlign: 'middle' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: 12, padding: '3px 8px', width: '100%' }}
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Holding period (m):</span>
                            <input
                              type="number"
                              className="form-input no-spinner"
                              style={{ fontSize: 11, padding: '1px 6px', width: 65 }}
                              value={editForm.holding_period_months}
                              onChange={e => setEditForm({ ...editForm, holding_period_months: e.target.value })}
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{rule.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            LTCG threshold: <strong className="num">{rule.holding_period_months}m</strong>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* TYPE / ASSET CLASS */}
                    <td style={{ verticalAlign: 'middle' }}>
                      {isEditing ? (
                        <select
                          className="form-select"
                          style={{ fontSize: 12, padding: '3px 6px', minWidth: '110px' }}
                          value={editForm.asset_class}
                          onChange={e => setEditForm({ ...editForm, asset_class: e.target.value as AssetClass })}
                        >
                          {Object.entries(ASSET_CLASS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge badge-purple" style={{ fontSize: 10 }}>
                          {ASSET_CLASS_LABELS[rule.asset_class]}
                        </span>
                      )}
                    </td>

                    {/* STCG MODE */}
                    <td
                      style={{
                        borderLeft: '2px solid var(--orange)',
                        background: 'rgba(245, 158, 11, 0.02)',
                        verticalAlign: 'middle'
                      }}
                    >
                      {isEditing ? (
                        <select
                          className="form-select"
                          style={{ fontSize: 12, padding: '3px 6px', minWidth: '100px' }}
                          value={editForm.stcg_mode}
                          onChange={e => setEditForm({ ...editForm, stcg_mode: e.target.value as TaxMode })}
                        >
                          <option value="FIXED_PERCENTAGE">Fixed %</option>
                          <option value="SLAB_RATE">Slab Rate</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: 12 }}>
                          {rule.stcg_mode === 'FIXED_PERCENTAGE' ? 'Fixed %' : 'Slab Rate'}
                        </span>
                      )}
                    </td>

                    {/* STCG RATE */}
                    <td
                      style={{
                        borderRight: '2px solid var(--orange)',
                        background: 'rgba(245, 158, 11, 0.02)',
                        textAlign: 'right',
                        verticalAlign: 'middle'
                      }}
                    >
                      {isEditing ? (
                        editForm.stcg_mode === 'FIXED_PERCENTAGE' ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                            <input
                              type="number"
                              step="0.1"
                              className="form-input num no-spinner"
                              style={{ fontSize: 12, padding: '3px 6px', width: 65, textAlign: 'right' }}
                              value={editForm.stcg_rate_bps}
                              onChange={e => setEditForm({ ...editForm, stcg_rate_bps: e.target.value })}
                            />
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>%</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 11, paddingRight: 8 }}>—</span>
                        )
                      ) : (
                        <span className="num" style={{ fontSize: 12, fontWeight: 500 }}>
                          {rule.stcg_mode === 'FIXED_PERCENTAGE' ? `${(rule.stcg_rate_bps / 100).toFixed(2)}%` : '—'}
                        </span>
                      )}
                    </td>

                    {/* LTCG MODE */}
                    <td
                      style={{
                        borderLeft: '2px solid var(--green)',
                        background: 'rgba(0, 179, 134, 0.02)',
                        verticalAlign: 'middle'
                      }}
                    >
                      {isEditing ? (
                        <select
                          className="form-select"
                          style={{ fontSize: 12, padding: '3px 6px', minWidth: '100px' }}
                          value={editForm.ltcg_mode}
                          onChange={e => setEditForm({ ...editForm, ltcg_mode: e.target.value as TaxMode })}
                        >
                          <option value="FIXED_PERCENTAGE">Fixed %</option>
                          <option value="SLAB_RATE">Slab Rate</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: 12 }}>
                          {rule.ltcg_mode === 'FIXED_PERCENTAGE' ? 'Fixed %' : 'Slab Rate'}
                        </span>
                      )}
                    </td>

                    {/* LTCG RATE & EXEMPTION */}
                    <td
                      style={{
                        borderRight: '2px solid var(--green)',
                        background: 'rgba(0, 179, 134, 0.02)',
                        textAlign: 'right',
                        verticalAlign: 'middle'
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          {editForm.ltcg_mode === 'FIXED_PERCENTAGE' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <input
                                type="number"
                                step="0.1"
                                className="form-input num no-spinner"
                                style={{ fontSize: 12, padding: '3px 6px', width: 65, textAlign: 'right' }}
                                value={editForm.ltcg_rate_bps}
                                onChange={e => setEditForm({ ...editForm, ltcg_rate_bps: e.target.value })}
                              />
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>%</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 11, paddingRight: 8 }}>—</span>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Exempt ₹:</span>
                            <input
                              type="number"
                              className="form-input num no-spinner"
                              style={{ fontSize: 11, padding: '1px 6px', width: 80, textAlign: 'right' }}
                              value={editForm.exemption_cap_paise}
                              onChange={e => setEditForm({ ...editForm, exemption_cap_paise: e.target.value })}
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="num" style={{ fontSize: 12, fontWeight: 500 }}>
                            {rule.ltcg_mode === 'FIXED_PERCENTAGE' ? `${(rule.ltcg_rate_bps / 100).toFixed(2)}%` : '—'}
                          </span>
                          {rule.exemption_cap_paise > 0 && (
                            <div className="num td-dim" style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                              Exempt: ₹{(rule.exemption_cap_paise / 100).toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* ACTIONS */ }
                <td style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ padding: 4 }}
                        onClick={handleSaveInline}
                        title="Save"
                      >
                        <Check size={14} color="var(--green)" />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ padding: 4 }}
                        onClick={handleCancelInline}
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ padding: 4 }}
                        onClick={() => startEdit(rule)}
                        title="Edit rule"
                      >
                        <Pencil size={12} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ padding: 4 }}
                        onClick={() => handleDeleteRule(rule.id, rule.name)}
                        title="Delete rule"
                      >
                        <Trash2 size={12} style={{ color: 'var(--red)' }} />
                      </button>
                    </div>
                  )}
                </td>
                  </tr>
            );
              })}

            {sortedRules.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px 0' }}>
                  No tax rules configured. Click "Add Rule" to define a tax rule.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Footer */}
      <div className="modal-footer" style={{ borderTop: 'none', padding: 0, marginTop: 4 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
    </div >
  );
}
