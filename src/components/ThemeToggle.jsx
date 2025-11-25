import React, { useMemo } from 'react';
import { SunMedium, Binary } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

const themeOptions = [
  {
    value: 'light',
    label: 'Light',
    description: 'Original bright look',
    icon: SunMedium,
  },
  {
    value: 'matrix',
    label: 'Matrix',
    description: 'Green on dark',
    icon: Binary,
  },
];

const ThemeToggle = ({ align = 'end', variant = 'ghost', className }) => {
  const { theme, setTheme } = useTheme();

  const activeTheme = useMemo(
    () => themeOptions.find((option) => option.value === theme) ?? themeOptions[0],
    [theme],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          className={cn(
            'flex items-center gap-2 rounded-full px-3 text-sm font-medium',
            theme === 'matrix'
              ? 'bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 border border-emerald-400/30'
              : 'text-app-gray-900 hover:bg-app-gray-100',
            className,
          )}
        >
          <activeTheme.icon className="h-4 w-4" />
          <span>{activeTheme.label} mode</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60">
        <DropdownMenuLabel>Choose theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themeOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="flex items-center gap-3">
              <option.icon className={cn('h-4 w-4', theme === 'matrix' ? 'text-emerald-300' : 'text-app-gray-700')} />
              <div className="flex flex-col text-left">
                <span className="text-sm font-semibold leading-tight">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
