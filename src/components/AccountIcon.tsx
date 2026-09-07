import React from 'react';
import {
  Wallet, Briefcase, TrendingUp, PiggyBank,
  Landmark, Building, Layers, PieChart,
  Coins, Folder, ShieldCheck, Compass,
  type LucideIcon
} from 'lucide-react';

export const PORTFOLIO_ICONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'Wallet', label: 'Wallet', icon: Wallet },
  { id: 'Briefcase', label: 'Briefcase', icon: Briefcase },
  { id: 'TrendingUp', label: 'Growth', icon: TrendingUp },
  { id: 'PiggyBank', label: 'Savings', icon: PiggyBank },
  { id: 'Landmark', label: 'Institution', icon: Landmark },
  { id: 'Building', label: 'Corporate', icon: Building },
  { id: 'Layers', label: 'Folio Stack', icon: Layers },
  { id: 'PieChart', label: 'Allocation', icon: PieChart },
  { id: 'Coins', label: 'Wealth', icon: Coins },
  { id: 'Folder', label: 'Dossier', icon: Folder },
  { id: 'ShieldCheck', label: 'Protected', icon: ShieldCheck },
  { id: 'Compass', label: 'Strategy', icon: Compass },
];

const ICON_MAP: Record<string, LucideIcon> = {
  Wallet,
  Briefcase,
  TrendingUp,
  PiggyBank,
  Landmark,
  Building,
  Layers,
  PieChart,
  Coins,
  Folder,
  ShieldCheck,
  Compass,
};

interface AccountIconProps {
  icon?: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function AccountIcon({ icon, size = 14, color, style, className }: AccountIconProps) {
  const IconComponent = (icon && ICON_MAP[icon]) || Wallet;
  return <IconComponent size={size} style={{ color: color ?? 'currentColor', ...style }} className={className} />;
}
