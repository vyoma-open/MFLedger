export interface HelpContent {
  title: string;
  sections: {
    heading?: string;
    body?: string;
    items?: { label: string; desc: string }[];
  }[];
}

export const PAGE_HELP: Record<string, HelpContent> = {
  '/': {
    title: 'Mutual Fund Portfolio',
    sections: [
      { body: 'Track your mutual fund investments with real-time AMFI NAV valuation and accurate FIFO lot accounting.' },
      {
        heading: 'Key Metrics',
        items: [
          { label: 'Invested Value', desc: 'Total cost basis across all active fund units.' },
          { label: 'Current Value', desc: 'Current valuation derived from live AMFI / MFAPI.in NAVs.' },
          { label: 'Unrealized Gain / P&L', desc: 'Total current profit or loss and overall percentage return.' },
          { label: 'Portfolio XIRR', desc: 'Annualized money-weighted rate of return across all SIP & lump-sum cashflows.' },
          { label: 'Monthly SIP', desc: 'Total committed monthly systematic investment installment.' },
        ],
      },
      { body: 'Switch between portfolio accounts (e.g., Zerodha Coin, Groww MF) or choose "All Portfolios" for a unified view.' },
    ],
  },
  '/trades': {
    title: 'Trade & Lot Audit History',
    sections: [
      { body: 'Audit all mutual fund purchase lots and FIFO redemptions/sales in chronological order.' },
      {
        heading: 'Filters & Actions',
        items: [
          { label: 'Period Selector', desc: 'Filter purchases and redemptions by Month, Last 3 Months, Current FY, Previous FY, or Custom range.' },
          { label: 'Export CSV', desc: 'Export all filtered buy/sell records for external accounting or tax auditing.' },
        ],
      },
    ],
  },
  '/tax': {
    title: 'Capital Gains Tax (Sec 112A / 111A)',
    sections: [
      { body: 'Estimated capital gains tax for Indian mutual funds under the current Fiscal Year (April–March).' },
      {
        heading: 'How it works',
        items: [
          { label: 'FIFO Accounting', desc: 'Oldest purchase lots are redeemed first, recording precise lot consumption events.' },
          { label: 'Holding Periods', desc: 'Equity MFs (> 12 months) and Debt MFs (> 36 months) are evaluated for LTCG vs STCG.' },
          { label: 'Section 112A Exemption', desc: 'Equity LTCG up to ₹1.25L per fiscal year is automatically exempt from tax.' },
          { label: 'Tax Harvesting', desc: 'Identify unrealized gains within the ₹1.25L exemption or harvest losses to offset taxable gains.' },
        ],
      },
      { body: 'Configure rates and thresholds anytime via the Tax Rules modal.' },
    ],
  },
  '/simulator': {
    title: 'SIP & Wealth Projection Simulator',
    sections: [
      { body: 'Model future portfolio wealth trajectories using compound interest and systematic investment step-ups.' },
      {
        heading: 'Simulation Modes',
        items: [
          { label: 'Portfolio Trajectory', desc: 'Projects current MF corpus growth combined with your active monthly SIP streams.' },
          { label: 'Custom SIP & Step-Up', desc: 'Model hypothetical scenarios with annual % step-up increments and customized expected return rates.' },
        ],
      },
    ],
  },
  '/notes': {
    title: 'Investment Notes & Portfolio Records',
    sections: [
      { body: 'Store important mutual fund records: Folio numbers, nominee details, AMC contacts, and investment mandates.' },
      { body: 'Pin important notes to the top for immediate access across devices.' },
    ],
  },
  '/settings': {
    title: 'Settings & Security',
    sections: [
      {
        heading: 'Portfolio Accounts',
        body: 'Manage your mutual fund portfolio accounts (e.g., Zerodha Coin, Groww MF).',
      },
      {
        heading: 'Importing Statements & NAVs',
        body: 'Import CAMS/KFintech Consolidated Account Statements (CAS PDF, Excel, CSV) or individual fund statement CSVs with auto-SIP detection.',
      },
      {
        heading: 'Backup & Restore',
        body: 'Export all portfolio data as an end-to-end encrypted .mfledger snapshot secured with AES-256-GCM and PBKDF2. Decrypt and restore anytime offline.',
      },
      {
        heading: 'Security & PIN Lock',
        body: 'Secure local IndexedDB data with zero-knowledge PBKDF2 encryption and session auto-lock.',
      },
    ],
  },
};
