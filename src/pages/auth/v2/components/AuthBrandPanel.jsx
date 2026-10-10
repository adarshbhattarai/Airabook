import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, User } from 'lucide-react';

const AuthBrandPanel = ({ enterprise = false }) => (
  <section className="relative hidden min-h-[640px] overflow-hidden bg-[linear-gradient(145deg,#ede9fe_0%,#e0e7ff_50%,#dbeafe_100%)] px-10 py-10 lg:flex lg:w-[47%] lg:flex-col lg:justify-between xl:px-14">
    <div className="absolute -left-24 top-36 h-72 w-72 rounded-full bg-white/55 blur-3xl" />
    <div className="absolute -right-20 bottom-16 h-80 w-80 rounded-full bg-violet-300/30 blur-3xl" />
    <div className="absolute right-10 top-14 h-3 w-3 rounded-full bg-violet-500/50" />
    <div className="absolute left-24 top-24 h-2 w-2 rounded-full bg-indigo-400/60" />

    <Link to="/v2/login" className="relative z-10 flex w-fit items-center gap-2 text-xl font-bold tracking-tight text-slate-950">
      <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-violet-600 text-white">
        <Sparkles className="h-4 w-4" />
      </span>
      Airabook
    </Link>

    <div className="relative z-10 max-w-lg">
      <div className="mb-5 inline-flex items-center gap-2 rounded-[8px] border border-violet-200/70 bg-white/45 px-3 py-1.5 text-sm font-semibold uppercase tracking-[0.16em] text-violet-700 backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
        {enterprise ? 'Enterprise workspace' : 'One place for your story'}
      </div>
      <h1 className="max-w-md text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 xl:text-5xl">
        {enterprise ? 'Intelligence at scale.' : 'Your ideas, beautifully organized.'}
      </h1>
      <p className="mt-5 max-w-md text-base leading-6 text-slate-600 xl:text-base">
        {enterprise
          ? 'Bring your team, creative assets, and knowledge into one secure workspace built to move ideas forward.'
          : 'Capture memories, build books, and keep every part of your creative life close at hand.'}
      </p>

      <div className="relative mt-10 max-w-md rounded-[8px] border border-white/90 bg-white/60 p-4 shadow-2xl shadow-indigo-300/20 backdrop-blur-md">
        <div className="flex items-center gap-1.5 border-b border-slate-200/70 pb-3">
          <span className="h-2 w-2 rounded-full bg-rose-300" />
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          <span className="ml-2 h-2 w-20 rounded-full bg-slate-200/80" />
        </div>
        <div className="mt-4 grid grid-cols-[1.3fr_1fr_1fr] gap-2">
          <div className="h-12 rounded-[8px] bg-violet-500/15 p-2">
            <div className="h-1.5 w-14 rounded-full bg-violet-500/50" />
            <div className="mt-2 h-1.5 w-20 rounded-full bg-violet-300/70" />
          </div>
          <div className="h-12 rounded-[8px] bg-white/75" />
          <div className="h-12 rounded-[8px] bg-white/55" />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm font-medium text-slate-600"><span>{enterprise ? 'Workspace health' : 'Your creative space'}</span><span className="rounded-[8px] bg-emerald-100 px-2 py-0.5 text-emerald-700">Ready</span></div>
      </div>
    </div>

    <div className="relative z-10 flex items-center gap-3 text-sm text-slate-600">
      <div className="flex -space-x-2">
        {['bg-violet-300', 'bg-sky-300', 'bg-amber-200'].map((color) => (
          <span key={color} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/80 ${color}`}>
            <User className="h-4 w-4 text-slate-600/70" />
          </span>
        ))}
      </div>
      <span><strong className="font-semibold text-slate-800">A place for your ideas</strong><br />Create with Airabook.</span>
    </div>
  </section>
);

export default AuthBrandPanel;
