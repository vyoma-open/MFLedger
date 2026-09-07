export interface HotkeyConfig {
  goToPortfolio: string;
  goToTrades: string;
  goToTax: string;
  goToSimulator: string;
  goToSettings: string;
  createLot: string;
  createNote: string;
}

export const DEFAULT_HOTKEYS: HotkeyConfig = {
  goToPortfolio: 'g p',
  goToTrades: 'g t',
  goToTax: 'g x',
  goToSimulator: 'g m',
  goToSettings: 'g s',
  createLot: 'c',
  createNote: 'n',
};

export function loadHotkeys(): HotkeyConfig {
  try {
    const saved = localStorage.getItem('mfledger_hotkeys');
    if (saved) {
      return { ...DEFAULT_HOTKEYS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error(e);
  }
  return DEFAULT_HOTKEYS;
}

export function saveHotkeys(config: HotkeyConfig) {
  try {
    localStorage.setItem('mfledger_hotkeys', JSON.stringify(config));
    window.dispatchEvent(new Event('hotkeys-updated'));
  } catch (e) {
    console.error(e);
  }
}
