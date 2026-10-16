import React from 'react';
import { AppInput } from '@/components/ui/input';

const AuthField = ({ id, label, icon: Icon, ...props }) => (
  <div>
    <label htmlFor={id} className="mb-2 block text-sm font-semibold tracking-[0.01em] text-foreground">{label}</label>
    <div className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <AppInput id={id} required className="pl-11" {...props} />
    </div>
  </div>
);

export default AuthField;
