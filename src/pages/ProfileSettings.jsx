import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { AppInput } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { defaultAvatars } from '@/constants/avatars';

const ProfileSettings = () => {
  const { user, appUser, updateUserProfile, changePassword } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [currentAvatar, setCurrentAvatar] = useState('');
  const [customAvatar, setCustomAvatar] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    const activeDisplayName = appUser?.displayName || user?.displayName || '';
    const activeEmail = appUser?.email || user?.email || '';
    const activeAvatar = user?.photoURL || '';

    setDisplayName(activeDisplayName);
    setEmail(activeEmail);
    setCurrentAvatar(activeAvatar);
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

  const handlePasswordSave = async (event) => {
    event.preventDefault();

    if (!password || password !== passwordConfirm) {
      toast({
        title: 'Passwords must match',
        description: 'Enter and confirm the same password to continue.',
        variant: 'destructive',
      });
      return;
    }

    setIsUpdatingPassword(true);

    try {
      await changePassword(password);
      setPassword('');
      setPasswordConfirm('');

      toast({
        title: 'Password updated',
        description: 'Your password has been changed successfully.',
      });
    } catch (error) {
      toast({
        title: 'Unable to change password',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update how you appear across Airäbook and keep your account secure.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-card border border-border rounded-2xl shadow-appCard p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Profile</h2>
                <p className="text-sm text-muted-foreground">Update your basic account information.</p>
              </div>
            </div>

            <form onSubmit={handleProfileSave} className="space-y-4">
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
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <Button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? 'Saving...' : 'Save changes'}
              </Button>
            </form>
          </section>

          <section className="bg-card border border-border rounded-2xl shadow-appCard p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Password</h2>
                <p className="text-sm text-muted-foreground">Choose a strong password to protect your account.</p>
              </div>
            </div>

            <form onSubmit={handlePasswordSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">New password</label>
                <AppInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Confirm new password</label>
                <AppInput
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button type="submit" disabled={isUpdatingPassword}>
                {isUpdatingPassword ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-card border border-border rounded-2xl shadow-appCard p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Avatar</h2>
                <p className="text-sm text-muted-foreground">Pick a preset or upload your own photo.</p>
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
                <p className="text-xs">Upload a new image to override the presets.</p>
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
                  className="flex items-center gap-3 p-2 rounded-xl border border-border hover:border-primary transition-colors"
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
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Or use an image URL</label>
                <AppInput
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={customAvatar}
                  onChange={(e) => setCustomAvatar(e.target.value)}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;
