import React from 'react';
import { Link } from 'react-router-dom';

const AuthFooter = () => (
  <div className="flex shrink-0 items-center justify-center gap-5 border-t border-slate-100 pt-5 text-sm text-slate-500">
    <Link to="/" className="hover:text-violet-700">Privacy</Link>
    <Link to="/" className="hover:text-violet-700">Terms</Link>
    <span>© Airabook</span>
  </div>
);

export default AuthFooter;
