import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { AppInput } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { defaultAvatars } from '@/constants/avatars';

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

  useEffect(() => {
    const activeDisplayName = appUser?.displayName || user?.displayName || '';
    const activeEmail = appUser?.email || user?.email || '';
    const activeAvatar = user?.photoURL || '';
    const activeWritingContext = appUser?.writingContext || '';
    const activeLanguage = appUser?.language || 'English';
    const activeUseLanguageForBooks = appUser?.useLanguageForBooks || false;

    setDisplayName(activeDisplayName);
    setEmail(activeEmail);
    setCurrentAvatar(activeAvatar);
    setWritingContext(activeWritingContext);
    setLanguage(activeLanguage);
    setUseLanguageForBooks(activeUseLanguageForBooks);
  }, [appUser, user]);

  const selectedAvatar = useMemo(() => customAvatar || currentAvatar, [customAvatar, currentAvatar]);

  const handleAvatarFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        setCustomAvatar(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setIsSavingProfile(true);

    try {
      await updateUserProfile({
        displayName,
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update how you appear across Airäbook and keep your account secure.
        </p>
      </div>

      <form onSubmit={handleProfileSave}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-card border border-border rounded-2xl shadow-appCard p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Profile</h2>
                  <p className="text-sm text-muted-foreground">Update your basic account information.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Display name</label>
                    <AppInput
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      required
                    />
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
                    onChange={(e) => setWritingContext(e.target.value)}
                    placeholder="Describe your writing style, preferred genres, or any context for the AI..."
                    className="w-full min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Preferred Book Writing Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {languages.map(lang => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-end pt-8 gap-3">
                    <span className={`text-sm ${!useLanguageForBooks ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      Default (English)
                    </span>
                    <Switch
                      checked={useLanguageForBooks}
                      onCheckedChange={setUseLanguageForBooks}
                    />
                    <span className={`text-sm ${useLanguageForBooks ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      Use Selected Language
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-card border border-border rounded-2xl shadow-appCard p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Avatar</h2>
                  <p className="text-sm text-muted-foreground">Pick a preset.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="h-16 w-16 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border">
                  {selectedAvatar ? (
                    <img src={selectedAvatar} alt="Selected avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-muted-foreground">No photo</span>
                  )}
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Current avatar preview</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {defaultAvatars.map((avatar) => (
                  <button
                    type="button"
                    key={avatar.url}
                    onClick={() => {
                      setCurrentAvatar(avatar.url);
                      setCustomAvatar('');
                    }}
                    className={`flex items-center gap-3 p-2 rounded-xl border transition-colors ${currentAvatar === avatar.url ? 'border-primary bg-primary/5' : 'border-border hover:border-primary'
                      }`}
                  >
                    <img src={avatar.url} alt={avatar.label} className="h-10 w-10 rounded-lg object-cover" />
                    <span className="text-sm text-foreground">{avatar.label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Upload a photo</label>
                  <AppInput type="file" accept="image/*" onChange={handleAvatarFile} />
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            type="submit"
            disabled={isSavingProfile}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[200px]"
          >
            {isSavingProfile ? 'Saving Changes...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProfileSettings;
