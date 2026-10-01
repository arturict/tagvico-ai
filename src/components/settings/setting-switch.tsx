'use client';

import { Switch } from 'radix-ui';

export function SettingSwitch({
  checked,
  label,
  disabled = false,
  onCheckedChange
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return <Switch.Root
    className="switch"
    checked={checked}
    disabled={disabled}
    onCheckedChange={onCheckedChange}
    aria-label={label}
  />;
}
