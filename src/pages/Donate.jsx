import React, { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { functions } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  getCreditBalance,
  getBillingPlanLabel,
  getIncludedCreditsMonthly,
  hasSpeechTranslationAccess,
  hasVoiceAssistantAccess,
  isBillingRecoverable,
  isCanceledButStillActive,
  isCreditDepleted,
  isProTier,
  normalizePlanState,
} from '@/lib/billing';
import { BILLING_PLANS, COMMON_CREDIT_ESTIMATES, CREDIT_PACKS, HOW_CREDITS_WORK } from '@/lib/billingCatalog';
import { Crown, Loader2, RefreshCw, Sparkles, Volume2, Wallet } from 'lucide-react';

const formatDate = (value) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const BillingPage = () => {
  const navigate = useNavigate();
  const { billing } = useAuth();
  const { toast } = useToast();

  const [loadingAction, setLoadingAction] = useState('');

  const planState = normalizePlanState(billing);
  const isProSubscriber = isProTier(billing);
  const hasVoiceAccess = hasVoiceAssistantAccess(billing);
  const hasTranslationAccess = hasSpeechTranslationAccess(billing);
  const planLabel = getBillingPlanLabel(billing);
  const creditBalance = getCreditBalance(billing);
  const includedCreditsMonthly = getIncludedCreditsMonthly(billing);
  const renewsOn = formatDate(billing?.currentPeriodEnd);
  const showRefresh = isBillingRecoverable(billing) || (!billing?.planTier || planState === 'inactive');

  const statusCopy = useMemo(() => {
    if (isCanceledButStillActive(billing) && renewsOn) {
      return `Your Pro access stays active until ${renewsOn}.`;
    }
    if (planState === 'past_due' || planState === 'unpaid') {
      return 'Your subscription needs attention before Pro features can continue.';
    }
    if (planState === 'incomplete' || planState === 'inactive') {
      return 'We are still confirming your billing details.';
    }
    if (isProSubscriber && renewsOn) {
      return `Your plan renews on ${renewsOn}.`;
    }
    return 'Upgrade for more monthly credits, voice-enabled writing, storage, and AI-triggered workflows.';
  }, [isProSubscriber, planState, renewsOn]);

  const startSubscriptionCheckout = async (tier) => {
    setLoadingAction(`subscription:${tier}`);
    try {
      const callable = httpsCallable(functions, 'createSubscriptionCheckoutSession');
      const response = await callable({
        tier,
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: `${window.location.origin}/billing`,
      });

      if (!response?.data?.checkoutUrl) {
        throw new Error('Stripe subscription checkout URL was not returned.');
      }
      window.location.href = response.data.checkoutUrl;
    } catch (error) {
      toast({
        title: 'Unable to start subscription checkout',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
      setLoadingAction('');
    }
  };

  const startCreditPackCheckout = async (packId) => {
    setLoadingAction(`pack:${packId}`);
    try {
      const callable = httpsCallable(functions, 'createCreditPackCheckoutSession');
      const response = await callable({
        packId,
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: `${window.location.origin}/billing`,
      });

      if (!response?.data?.checkoutUrl) {
        throw new Error('Stripe credit pack checkout URL was not returned.');
      }
      window.location.href = response.data.checkoutUrl;
    } catch (error) {
      toast({
        title: 'Unable to start credit pack checkout',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
      setLoadingAction('');
    }
  };

  const planCards = [
    {
      tier: 'free',
      title: 'Free',
      price: '$0',
      subtitle: `${BILLING_PLANS.free.includedCreditsMonthly} starter credits with lightweight workspace limits`,
      features: [
        `${BILLING_PLANS.free.books} books, up to ${BILLING_PLANS.free.pages} total pages`,
        `${BILLING_PLANS.free.storageMb} MB storage cap`,
        'Basic AI help until credits run out',
        'Manual writing and reading always available',
      ],
    },
    {
      tier: 'creator',
      title: 'Creator',
      price: '$7/month',
      subtitle: 'Voice-enabled writing with room for multiple active books',
      features: [
        `${BILLING_PLANS.creator.includedCreditsMonthly.toLocaleString()} monthly credits`,
        `${BILLING_PLANS.creator.books} books, up to ${BILLING_PLANS.creator.pages.toLocaleString()} total pages`,
        `${BILLING_PLANS.creator.storageMb} MB storage cap`,
        'Voice-enabled writing, speech translation, and 625 credit rollover',
      ],
    },
    {
      tier: 'pro',
      title: 'Pro',
      price: '$15/month',
      subtitle: 'For larger libraries and heavier AI-driven production',
      features: [
        `${BILLING_PLANS.pro.includedCreditsMonthly.toLocaleString()} monthly credits`,
        `${BILLING_PLANS.pro.books} books, up to ${BILLING_PLANS.pro.pages.toLocaleString()} total pages`,
        `${Math.floor(BILLING_PLANS.pro.storageMb / 1024)} GB storage cap`,
        'Credits apply to AI, voice, images, and automations',
        '1,750 credit rollover cap',
      ],
    },
    {
      tier: 'premium',
      title: 'Premium',
      price: '$25/month',
      subtitle: 'For media-rich libraries and the highest-volume usage',
      features: [
        `${BILLING_PLANS.premium.includedCreditsMonthly.toLocaleString()} monthly credits`,
        `${BILLING_PLANS.premium.books} books, up to ${BILLING_PLANS.premium.pages.toLocaleString()} total pages`,
        `${Math.floor(BILLING_PLANS.premium.storageMb / 1024)} GB storage cap`,
        'Priority queues and 4,000 credit rollover',
      ],
    },
  ];

  const openBillingPortal = async () => {
    setLoadingAction('portal');
    try {
      const callable = httpsCallable(functions, 'createBillingPortalSession');
      const response = await callable({
        returnUrl: `${window.location.origin}/billing`,
      });

      if (!response?.data?.url) {
        throw new Error('Stripe billing portal URL was not returned.');
      }
      window.location.href = response.data.url;
    } catch (error) {
      toast({
        title: 'Unable to open billing portal',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
      setLoadingAction('');
    }
  };

  const refreshBilling = async () => {
    setLoadingAction('refresh');
    try {
      const callable = httpsCallable(functions, 'refreshBillingState');
      await callable();
      toast({
        title: 'Billing refreshed',
        description: 'Your latest Stripe billing state has been synced.',
      });
    } catch (error) {
      toast({
        title: 'Unable to refresh billing',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingAction('');
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-[32px] border border-app-gray-200 bg-white p-6 shadow-appSoft sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-app-iris/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-app-iris">
                <Sparkles className="h-3.5 w-3.5" />
                Billing
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-app-gray-900">Plans & Credits</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-app-gray-600">
                  Each plan has hard workspace caps for books, pages, and storage, plus a monthly
                  credit pool that meters AI writing, voice usage, storage retention, and
                  automation.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-app-gray-200 bg-app-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-app-gray-600">Current plan</p>
              <p className="mt-1 text-lg font-semibold text-app-gray-900">{planLabel}</p>
              <p className="mt-1 text-sm text-app-gray-600">{statusCopy}</p>
              <p className="mt-2 text-sm font-medium text-app-gray-900">
                {creditBalance.toLocaleString()} credits remaining
              </p>
              <p className="text-xs text-app-gray-600">
                {includedCreditsMonthly.toLocaleString()} included monthly credits
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr,0.7fr]">
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {planCards.map((plan) => (
                <div key={plan.tier} className="billing-plan-card rounded-[28px] border border-app-gray-200 bg-white p-6 shadow-appSoft">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div
                        className={cn(
                          'billing-plan-badge inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em]',
                          plan.tier === 'free'
                            ? 'billing-plan-badge-free'
                            : 'billing-plan-badge-paid'
                        )}
                      >
                        <Crown className="h-3.5 w-3.5" />
                        {plan.title}
                      </div>
                      <h2 className="mt-4 text-2xl font-semibold text-app-gray-900">{plan.price}</h2>
                      <p className="mt-2 text-sm text-app-gray-600">{plan.subtitle}</p>
                    </div>
                    <div className="billing-plan-icon-shell rounded-2xl bg-app-iris/10 p-3 text-app-iris">
                      <Volume2 className="h-6 w-6" />
                    </div>
                  </div>

                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="text-sm text-app-gray-600">
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {plan.tier === 'free' ? (
                      <Button type="button" variant="outline" onClick={() => navigate('/login')}>
                        Start free
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => startSubscriptionCheckout(plan.tier)}
                        disabled={loadingAction !== '' && loadingAction !== `subscription:${plan.tier}`}
                      >
                        {loadingAction === `subscription:${plan.tier}` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Choose {plan.title}
                      </Button>
                    )}
                    {normalizePlanState(billing) !== 'inactive' && hasVoiceAccess && plan.tier !== 'free' ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openBillingPortal}
                        disabled={loadingAction !== '' && loadingAction !== 'portal'}
                      >
                        {loadingAction === 'portal' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Manage
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[28px] border border-app-gray-200 bg-app-gray-50 p-6 shadow-appSoft sm:p-8">
              <h2 className="text-xl font-semibold text-app-gray-900">How credits work</h2>
              <div className="mt-4 space-y-3">
                {HOW_CREDITS_WORK.map((item) => (
                  <p key={item} className="text-sm leading-relaxed text-app-gray-600">
                    {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-app-gray-200 bg-white p-6 shadow-appSoft sm:p-8">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-app-iris/10 p-3 text-app-iris">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-app-gray-900">Credit packs</h2>
                  <p className="text-sm text-app-gray-600">
                    Buy extra credits without changing your subscription.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {CREDIT_PACKS.map((pack) => (
                  <div key={pack.id} className="rounded-2xl border border-app-gray-200 p-4">
                    <p className="text-sm font-semibold text-app-gray-900">{pack.label}</p>
                    <p className="mt-1 text-sm text-app-gray-600">{pack.priceLabel}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => startCreditPackCheckout(pack.id)}
                      disabled={loadingAction !== '' && loadingAction !== `pack:${pack.id}`}
                    >
                      {loadingAction === `pack:${pack.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Buy pack
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-app-gray-200 bg-white p-6 shadow-appSoft sm:p-8">
              <h2 className="text-xl font-semibold text-app-gray-900">Common credit costs</h2>
              <div className="mt-4 space-y-3">
                {COMMON_CREDIT_ESTIMATES.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-app-gray-200 px-4 py-3">
                    <p className="text-sm text-app-gray-700">{item.label}</p>
                    <p className="text-sm font-semibold text-app-gray-900">{item.credits}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {showRefresh && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={refreshBilling}
                    disabled={loadingAction !== '' && loadingAction !== 'refresh'}
                  >
                    {loadingAction === 'refresh' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh billing
                  </Button>
                )}
                {(hasVoiceAccess || hasTranslationAccess) ? (
                  <Button
                    type="button"
                    onClick={openBillingPortal}
                    disabled={loadingAction !== '' && loadingAction !== 'portal'}
                  >
                    {loadingAction === 'portal' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Manage subscription
                  </Button>
                ) : null}
                {isProSubscriber && renewsOn ? (
                  <p className="self-center text-sm text-app-gray-600">Renews on {renewsOn}</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-[28px] border border-app-gray-200 bg-white p-6 shadow-appSoft sm:p-8">
              <h2 className="text-xl font-semibold text-app-gray-900">Usage status</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-app-gray-200 px-4 py-3">
                  <p className="text-sm font-semibold text-app-gray-900">Voice access</p>
                  <p className="mt-1 text-sm text-app-gray-600">
                    {hasVoiceAccess ? 'Enabled on your account.' : 'Unlocked on Creator and above when credits are available.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-app-gray-200 px-4 py-3">
                  <p className="text-sm font-semibold text-app-gray-900">Speech translation</p>
                  <p className="mt-1 text-sm text-app-gray-600">
                    {hasTranslationAccess ? 'Enabled on your account.' : 'Uses the same credit wallet as voice.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-app-gray-200 px-4 py-3">
                  <p className="text-sm font-semibold text-app-gray-900">Credit state</p>
                  <p className="mt-1 text-sm text-app-gray-600">
                    {isCreditDepleted(billing) ? 'Credits are exhausted. Buy a pack or wait for the next cycle.' : `${creditBalance.toLocaleString()} credits remaining.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default BillingPage;
