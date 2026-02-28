import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { AppInput } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { defaultAvatars } from '@/constants/avatars';
import { PROFILE_LIMITS } from '@/constants/profileLimits';

const ProfileSettings = () => {
  const { user, appUser, updateUserProfile, changePassword } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [currentAvatar, setCurrentAvatar] = useState('');
  const [customAvatar, setCustomAvatar] = useState('');
  const [writingContext, setWritingContext] = useState('');
  const [language, setLanguage] = useState('English');
  const [useLanguageForBooks, setUseLanguageForBooks] = useState(false);

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [initialProfile, setInitialProfile] = useState(null);

  useEffect(() => {
    const activeDisplayName = (appUser?.displayName || user?.displayName || '').slice(0, PROFILE_LIMITS.displayName);
    const activeEmail = appUser?.email || user?.email || '';
    const activeAvatar = user?.photoURL || '';
    const activeWritingContext = (appUser?.writingContext || '').slice(0, PROFILE_LIMITS.writingContext);
    const activeLanguage = appUser?.language || 'English';
    const activeUseLanguageForBooks = appUser?.useLanguageForBooks || false;

    setDisplayName(activeDisplayName);
    setEmail(activeEmail);
    setCurrentAvatar(activeAvatar);
    setWritingContext(activeWritingContext);
    setLanguage(activeLanguage);
    setUseLanguageForBooks(activeUseLanguageForBooks);
    setCustomAvatar('');
    setInitialProfile({
      displayName: activeDisplayName,
      writingContext: activeWritingContext,
      language: activeLanguage,
      useLanguageForBooks: activeUseLanguageForBooks,
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
      language !== initialProfile.language ||
      useLanguageForBooks !== initialProfile.useLanguageForBooks ||
      (selectedAvatar || '') !== (initialProfile.avatar || '')
    );
  }, [displayName, writingContext, language, useLanguageForBooks, selectedAvatar, initialProfile]);

  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsUploading(true);
      // Create a reference to 'userId/avatars/timestamp_filename'
      const timestamp = Date.now();
      const storagePath = `${user.uid}/avatars/${timestamp}_${file.name}`;
      const storageRef = ref(storage, storagePath);

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
    setLanguage(initialProfile.language);
    setUseLanguageForBooks(initialProfile.useLanguageForBooks);
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
        language,
        useLanguageForBooks,
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
        language,
        useLanguageForBooks,
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

  const languages = [
    "English", "Nepalese", "Spanish", "French", "German", "Italian", "Portuguese",
    "Dutch", "Russian", "Chinese", "Japanese", "Korean", "Hindi", "Arabic",
  ];

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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Preferred Writing Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                    {languages.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                      ))}
                    </select>
                  </div>
                <div className="space-y-2 flex flex-col justify-end">
                  <label className="block text-sm font-medium text-foreground">Language preference</label>
                  <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                    <span className={`text-sm ${!useLanguageForBooks ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      Default (English)
                    </span>
                    <Switch
                      checked={useLanguageForBooks}
                      onCheckedChange={setUseLanguageForBooks}
                    />
                    <span className={`text-sm ${useLanguageForBooks ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      Use selected
                    </span>
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
