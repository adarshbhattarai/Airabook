import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { AppInput } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { functions, storage } from '@/lib/firebase';
import { defaultAvatars } from '@/constants/avatars';
import { PROFILE_LIMITS } from '@/constants/profileLimits';
import { getBillingPlanLabel, getCreditBalance, getIncludedCreditsMonthly, hasVoiceAssistantAccess, isBillingRecoverable, normalizePlanState } from '@/lib/billing';
import { ensureStorageUploadAuth, getStorageUploadDebugContext, logStorageUploadFailure } from '@/lib/storageUpload';

const SPEAKING_LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'Nepali', label: 'Nepali (नेपाली)' },
  { value: 'Korean', label: 'Korean (한국어)' },
];

const ProfileSettings = () => {
  const navigate = useNavigate();
  const { user, appUser, billing, updateUserProfile, changePassword } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [currentAvatar, setCurrentAvatar] = useState('');
  const [customAvatar, setCustomAvatar] = useState('');
  const [writingContext, setWritingContext] = useState('');
  const [agentSpeakingLanguage, setAgentSpeakingLanguage] = useState('English');
  const [userSpeakingLanguage, setUserSpeakingLanguage] = useState('English');

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [billingAction, setBillingAction] = useState('');
  const [initialProfile, setInitialProfile] = useState(null);

  useEffect(() => {
    const storedProfile = appUser?.profile || {};
    const activeDisplayName = (appUser?.displayName || user?.displayName || '').slice(0, PROFILE_LIMITS.displayName);
    const activeEmail = appUser?.email || user?.email || '';
    const activeAvatar = appUser?.photoURL || user?.photoURL || '';
    const activeWritingContext = (storedProfile.writingContext || appUser?.writingContext || '').slice(0, PROFILE_LIMITS.writingContext);
    const legacyLanguage = appUser?.language || 'English';
    const activeAgentSpeakingLanguage =
      storedProfile.agentSpeakingLanguage || appUser?.agentSpeakingLanguage || appUser?.userSpeakingLanguage || legacyLanguage;
    const activeUserSpeakingLanguage =
      storedProfile.userSpeakingLanguage || appUser?.userSpeakingLanguage || appUser?.agentSpeakingLanguage || legacyLanguage;

    setDisplayName(activeDisplayName);
    setEmail(activeEmail);
    setCurrentAvatar(activeAvatar);
    setWritingContext(activeWritingContext);
    setAgentSpeakingLanguage(activeAgentSpeakingLanguage);
    setUserSpeakingLanguage(activeUserSpeakingLanguage);
    setCustomAvatar('');
    setInitialProfile({
      displayName: activeDisplayName,
      writingContext: activeWritingContext,
      agentSpeakingLanguage: activeAgentSpeakingLanguage,
      userSpeakingLanguage: activeUserSpeakingLanguage,
      avatar: activeAvatar || '',
    });
  }, [appUser, user]);

  const selectedAvatar = useMemo(() => customAvatar || currentAvatar, [customAvatar, currentAvatar]);
  const displayNameCharsUsed = displayName.length;
  const writingContextCharsUsed = writingContext.length;

  const hasUnsavedChanges = useMemo(() => {
    if (!initialProfile) return false;
    return (
      displayName !== initialProfile.displayName ||
      writingContext !== initialProfile.writingContext ||
      agentSpeakingLanguage !== initialProfile.agentSpeakingLanguage ||
      userSpeakingLanguage !== initialProfile.userSpeakingLanguage ||
      (selectedAvatar || '') !== (initialProfile.avatar || '')
    );
  }, [displayName, writingContext, agentSpeakingLanguage, userSpeakingLanguage, selectedAvatar, initialProfile]);

  const [isUploading, setIsUploading] = useState(false);
  const planState = normalizePlanState(billing);
  const hasVoiceAccess = hasVoiceAssistantAccess(billing);
  const billingPlanLabel = getBillingPlanLabel(billing);
  const creditBalance = getCreditBalance(billing);
  const includedCreditsMonthly = getIncludedCreditsMonthly(billing);
  const billingEndDate = billing?.currentPeriodEnd?.toDate
    ? billing.currentPeriodEnd.toDate()
    : (billing?.currentPeriodEnd ? new Date(billing.currentPeriodEnd) : null);
  const formattedBillingEndDate = billingEndDate && !Number.isNaN(billingEndDate.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(billingEndDate)
    : '';

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    const timestamp = Date.now();
    const storagePath = `${user.uid}/avatars/${timestamp}_${file.name}`;

    try {
      setIsUploading(true);
      // Create a reference to 'userId/avatars/timestamp_filename'
      const storageRef = ref(storage, storagePath);
      await ensureStorageUploadAuth({
        storagePath,
        uploadSource: 'profile_avatar',
      });

      // Upload the file
      const snapshot = await uploadBytes(storageRef, file);

      // Get the download URL
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Update state with the new URL
      setCustomAvatar(downloadURL);
      setCurrentAvatar(''); // Clear preset selection if any

      toast({
        title: 'Avatar uploaded',
        description: 'Your new avatar is ready to be saved.',
      });
    } catch (error) {
      logStorageUploadFailure({
        error,
        storagePath,
        file,
        uploadSource: 'profile_avatar',
        userUid: user?.uid || '',
        extra: await getStorageUploadDebugContext(),
      });
      console.error("Error uploading avatar:", error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload avatar image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    if (!initialProfile) return;
    setDisplayName(initialProfile.displayName);
    setWritingContext(initialProfile.writingContext);
    setAgentSpeakingLanguage(initialProfile.agentSpeakingLanguage);
    setUserSpeakingLanguage(initialProfile.userSpeakingLanguage);
    setCurrentAvatar(initialProfile.avatar || '');
    setCustomAvatar('');
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    const normalizedDisplayName = displayName.trim();

    if (normalizedDisplayName.length === 0 || normalizedDisplayName.length > PROFILE_LIMITS.displayName) {
      toast({
        title: 'Invalid display name',
        description: `Display name must be between 1 and ${PROFILE_LIMITS.displayName} characters.`,
        variant: 'destructive',
      });
      return;
    }

    if (writingContext.length > PROFILE_LIMITS.writingContext) {
      toast({
        title: 'Writing context is too long',
        description: `Writing context cannot exceed ${PROFILE_LIMITS.writingContext} characters.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSavingProfile(true);

    try {
      await updateUserProfile({
        displayName: normalizedDisplayName,
        email,
        photoURL: selectedAvatar,
        writingContext,
        agentSpeakingLanguage,
        userSpeakingLanguage,
        language: agentSpeakingLanguage,
      });

      toast({
        title: 'Profile updated',
        description: 'Your profile details were saved successfully.',
      });
      setDisplayName(normalizedDisplayName);
      setCurrentAvatar(selectedAvatar || '');
      setCustomAvatar('');
      setInitialProfile({
        displayName: normalizedDisplayName,
        writingContext,
        agentSpeakingLanguage,
        userSpeakingLanguage,
        avatar: selectedAvatar || '',
      });
    } catch (error) {
      toast({
        title: 'Unable to update profile',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleManageSubscription = async () => {
    setBillingAction('portal');
    try {
      const callable = httpsCallable(functions, 'createBillingPortalSession');
      const response = await callable({
        returnUrl: `${window.location.origin}/settings`,
      });
      const url = response?.data?.url;
      if (!url) {
        throw new Error('Billing portal URL was not returned.');
      }
      window.location.href = url;
    } catch (error) {
      toast({
        title: 'Unable to open billing portal',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
      setBillingAction('');
    }
  };

  const handleRefreshBilling = async () => {
    setBillingAction('refresh');
    try {
      const callable = httpsCallable(functions, 'refreshBillingState');
      await callable();
      toast({
        title: 'Billing refreshed',
        description: 'Your latest billing state has been synced.',
      });
    } catch (error) {
      toast({
        title: 'Unable to refresh billing',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBillingAction('');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pb-24 pt-8 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Profile Settings</h1>
          {hasUnsavedChanges && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              Unsaved changes
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Update how you appear across Airäbook and keep your account secure.
        </p>
      </div>

      <form onSubmit={handleProfileSave} className="space-y-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-6 rounded-3xl border border-border bg-card p-6 shadow-appCard">
            <div className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
              Account
                </div>
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Display name</label>
                    <AppInput
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      maxLength={PROFILE_LIMITS.displayName}
                      required
                    />
                    <p className="mt-1 text-xs text-muted-foreground text-right">
                      {displayNameCharsUsed}/{PROFILE_LIMITS.displayName}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                    <AppInput
                      type="email"
                      value={email}
                      disabled
                      className="bg-muted text-muted-foreground cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Writing Context</label>
                  <textarea
                    value={writingContext}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= PROFILE_LIMITS.writingContext) {
                        setWritingContext(value);
                      }
                    }}
                    placeholder="Describe your writing style, preferred genres, or any context for the AI..."
                    maxLength={PROFILE_LIMITS.writingContext}
                  className="w-full min-h-[120px] rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <p className="mt-1 text-xs text-muted-foreground text-right">
                    {writingContextCharsUsed}/{PROFILE_LIMITS.writingContext}
                  </p>
                </div>

              <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Conversation languages</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose the language Airabook should speak back to you in, and the language you usually speak during talk mode.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">You speak in</label>
                    <select
                      value={userSpeakingLanguage}
                      onChange={(e) => setUserSpeakingLanguage(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {SPEAKING_LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      This helps Airabook expect the right language when you speak.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">Airabook replies in</label>
                    <select
                      value={agentSpeakingLanguage}
                      onChange={(e) => setAgentSpeakingLanguage(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {SPEAKING_LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      This sets the assistant&apos;s spoken response language.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            </section>

          <section className="space-y-6 rounded-3xl border border-border bg-card p-6 shadow-appCard">
            <div className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
              Avatar
              </div>

            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border">
                  {selectedAvatar ? (
                    <img src={selectedAvatar} alt="Selected avatar" className="h-full w-full object-cover" />
                  ) : (
                  <span className="text-xs text-muted-foreground">No photo</span>
                  )}
                </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Current avatar</p>
                <p>Choose a preset or upload a photo.</p>
                </div>
              </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Presets</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {defaultAvatars.map((avatar) => (
                  <button
                    type="button"
                    key={avatar.url}
                    onClick={() => {
                      setCurrentAvatar(avatar.url);
                      setCustomAvatar('');
                    }}
                    className={`flex items-center gap-3 rounded-2xl border p-2 transition-colors ${
                      currentAvatar === avatar.url && !customAvatar ? 'border-primary bg-primary/5' : 'border-border hover:border-primary'
                      }`}
                  >
                    <img src={avatar.url} alt={avatar.label} className="h-10 w-10 rounded-lg object-cover" />
                    <span className="text-sm text-foreground">{avatar.label}</span>
                  </button>
                ))}
              </div>
              </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Upload a photo</label>
                  <AppInput type="file" accept="image/*" onChange={handleAvatarFile} />
              {isUploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
              </div>
            </section>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-appCard">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                Billing
              </div>
              <h2 className="mt-3 text-xl font-semibold text-foreground">{billingPlanLabel}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasVoiceAccess
                  ? 'Pro voice features are active on your account.'
                  : 'Upgrade to Creator, Pro, or Premium to unlock voice and more monthly credits.'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Billing state: <span className="font-medium text-foreground">{planState}</span>
                {formattedBillingEndDate ? ` · ${billing?.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${formattedBillingEndDate}` : ''}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Credits: <span className="font-medium text-foreground">{creditBalance.toLocaleString()}</span>
                {includedCreditsMonthly ? ` · ${includedCreditsMonthly.toLocaleString()} included monthly` : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {hasVoiceAccess ? (
                <Button type="button" onClick={handleManageSubscription} disabled={billingAction !== '' && billingAction !== 'portal'}>
                  {billingAction === 'portal' ? 'Opening...' : 'Manage subscription'}
                </Button>
              ) : (
                <Button type="button" onClick={() => navigate('/billing')}>
                  Open billing
                </Button>
              )}

              {(isBillingRecoverable(billing) || planState === 'inactive') ? (
                <Button type="button" variant="outline" onClick={handleRefreshBilling} disabled={billingAction !== '' && billingAction !== 'refresh'}>
                  {billingAction === 'refresh' ? 'Refreshing...' : 'Refresh billing'}
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <div className="sticky bottom-4 left-0 right-0 rounded-2xl border border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-15px_45px_rgba(0,0,0,0.25)] flex flex-wrap items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={!hasUnsavedChanges || isSavingProfile || isUploading}
              className="min-w-[120px]"
            >
              Cancel
            </Button>
          <Button
            type="submit"
              disabled={!hasUnsavedChanges || isSavingProfile || isUploading}
              variant="appSuccess"
              className="min-w-[160px]"
          >
              {isSavingProfile ? (
                'Saving Changes...'
              ) : isUploading ? (
                'Uploading...'
              ) : (
                <span className="flex items-center gap-2">
                  Save changes
                  <span aria-hidden="true">&gt;</span>
                </span>
              )}
          </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ProfileSettings;
