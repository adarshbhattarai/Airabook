import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { functions, auth, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { AppInput } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import TwoColumnLayout from '@/layouts/TwoColumnLayout';
import InfoCard from '@/components/app/InfoCard';
import SummaryCard from '@/components/app/SummaryCard';
import BookCardPreview from '@/components/previews/BookCardPreview';
import { ArrowLeft, Upload, X, Image as ImageIcon } from 'lucide-react';

const CreateBook = () => {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [creationType, setCreationType] = useState(0); // 0 = auto-generate, 1 = start blank
  const [promptMode, setPromptMode] = useState(false); // false = baby journal, true = custom prompt
  const [prompt, setPrompt] = useState('');
  const [layoutMode, setLayoutMode] = useState('standard'); // 'standard', 'a4', 'scrapbook'
  const [coverImageFile, setCoverImageFile] = useState(null);
  const [coverImagePreview, setCoverImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({ title: "Error", description: "Image size should be less than 5MB.", variant: "destructive" });
        return;
      }
      setCoverImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setCoverImageFile(null);
    setCoverImagePreview(null);
  };

  const handleCreateBook = async (e) => {
    e.preventDefault();
    console.log("🚀 CreateBook: Starting book creation process");
    console.log("👤 User:", user ? user.uid : "No user");
    console.log("📝 Book title:", title);
    console.log("🔧 Creation type:", creationType);

    if (!title.trim()) {
      toast({ title: "Error", description: "Book title cannot be empty.", variant: "destructive" });
      return;
    }

    // Validate prompt if prompt mode is enabled
    if (creationType === 0 && promptMode && !prompt.trim()) {
      toast({ title: "Error", description: "Please provide a prompt or disable prompt mode.", variant: "destructive" });
      return;
    }

    if (creationType === 0 && promptMode && prompt.length > 500) {
      toast({ title: "Error", description: "Prompt cannot exceed 500 characters.", variant: "destructive" });
      return;
    }

    if (!user) {
      toast({ title: "Error", description: "You must be logged in to create a book.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      console.log("📞 CreateBook: Calling Firebase function...");
      // console.log("🔧 Functions instance:", functions);
      // console.log("🌐 Functions region:", functions.app.options.region);
      //
      // // Debug: Check current user and token
      // console.log("🔐 Current Firebase User:", auth.currentUser);
      // console.log("🔐 User UID:", auth.currentUser?.uid);
      // console.log("🔐 User Email:", auth.currentUser?.email);

      // Force refresh the ID token
      const idToken = await auth.currentUser.getIdToken(true);
      console.log("🎫 Fresh ID Token obtained:", idToken ? "Token exists" : "No token");
      console.log("🎫 Token length:", idToken?.length);

      let coverImageUrl = null;
      if (coverImageFile) {
        try {
          const filename = `${Date.now()}_${coverImageFile.name}`;
          const storageRef = ref(storage, `${user.uid}/covers/${filename}`);
          console.log("📤 Uploading cover image...");
          const snapshot = await uploadBytes(storageRef, coverImageFile);
          coverImageUrl = await getDownloadURL(snapshot.ref);
          console.log("✅ Cover image uploaded:", coverImageUrl);
        } catch (uploadError) {
          console.error("❌ Error uploading cover image:", uploadError);
          toast({ title: "Warning", description: "Failed to upload cover image. Book will be created without it.", variant: "destructive" });
          // Continue without cover image
        }
      }

      const createBookFunction = httpsCallable(functions, 'createBook');
      console.log("✅ CreateBook: Function reference created");

      const payload = {
        title: title,
        subtitle: subtitle.trim() || undefined,
        creationType: creationType,
        promptMode: creationType === 0 ? promptMode : false,
        prompt: (creationType === 0 && promptMode && prompt.trim()) ? prompt : undefined,
        coverImageUrl: coverImageUrl,
        layoutMode
      };
      console.log("📦 CreateBook: Payload:", payload);

      const functionStartTime = performance.now();
      const result = await createBookFunction(payload);
      const functionEndTime = performance.now();
      console.log("✅ CreateBook: Function call successful, result:", result);
      console.log(`⏱️ Function call took: ${(functionEndTime - functionStartTime).toFixed(2)}ms`);

      const bookId = result.data.bookId;
      if (!bookId) {
        throw new Error("Function did not return a book ID.");
      }

      // Navigate immediately with prefetched data to avoid slow Firestore queries
      const navStartTime = performance.now();
      console.log("🚀 Navigating to book detail page with prefetched data...");

      const navState = {
        prefetchedBook: {
          id: bookId,
          babyName: title.trim(), // Ensure this matches BookDetail expectation
          subtitle: subtitle.trim() || null,
          titleLower: title.trim().toLowerCase(),
          description: result.data.description,
          chapterCount: result.data.chaptersCount || 0,
          ownerId: user.uid,
          isPublic: false,
          coverImageUrl: coverImageUrl,
          createdAt: new Date().toISOString(),
          ownerId: user.uid, // Ensure isOwner check passes in BookDetail
          members: { [user.uid]: 'Owner' }, // Important for permission checks
          layoutMode,
          templateType: creationType === 0 && !promptMode ? 'babyJournalPage' : null
        },
        prefetchedChapters: (result.data.chapters || []).map(ch => ({
          id: ch.id,
          title: ch.title,
          order: ch.order,
          pagesSummary: [], // CRITICAL: Initialize so sidebar renders immediately
          ownerId: user.uid
        })),
        skipFetch: true,
      };

      console.log("📦 Navigation State:", navState);

      navigate(`/book/${bookId}`, {
        state: navState
      });
      const navEndTime = performance.now();
      console.log(`⏱️ Navigation took: ${(navEndTime - navStartTime).toFixed(2)}ms`);

      // Show toast after navigation
      toast({
        title: "Book created",
        description: `"${title}" has been successfully created.`,
      });

    } catch (error) {
      console.error("❌ CreateBook: Error creating book via function:", error);
      console.error("❌ CreateBook: Error code:", error.code);
      console.error("❌ CreateBook: Error message:", error.message);
      console.error("❌ CreateBook: Error details:", error.details);

      toast({
        title: "Error",
        description: `Book could not be created: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-6 lg:py-10">
      <TwoColumnLayout
        left={
          <div className="space-y-6">
            <div>
              <h1 className="text-[28px] font-semibold text-app-gray-900 leading-tight">
                Create a new book
              </h1>
              <p className="mt-2 text-sm text-app-gray-600 leading-relaxed">
                Answer a few questions to personalize your book. You can change this later.
              </p>
            </div>

            <InfoCard>
              <form className="space-y-6" onSubmit={handleCreateBook}>
                <div className="space-y-4">
                  {/* Cover Image Upload */}
                  <div>
                    <label className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide block mb-2">
                      Cover Image (Optional)
                    </label>
                    <div className="flex items-start gap-4">
                      <div className="relative group">
                        <div className={`w-24 h-32 rounded-lg border-2 border-dashed border-app-gray-300 flex flex-col items-center justify-center overflow-hidden bg-app-gray-50 transition-colors ${!coverImagePreview ? 'hover:bg-app-gray-100 hover:border-app-violet/50' : 'border-solid border-app-gray-200'}`}>
                          {coverImagePreview ? (
                            <img src={coverImagePreview} alt="Cover preview" className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-center p-2">
                              <ImageIcon className="w-6 h-6 text-app-gray-400 mx-auto mb-1" />
                              <span className="text-[10px] text-app-gray-500">Upload</span>
                            </div>
                          )}

                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            title={coverImagePreview ? "Change cover image" : "Upload cover image"}
                          />
                        </div>

                        {coverImagePreview && (
                          <button
                            type="button"
                            onClick={removeImage}
                            className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border border-app-gray-200 text-app-gray-500 hover:text-red-500 transition-colors"
                            title="Remove image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 text-xs text-app-gray-500 pt-2">
                        <p>Add a personal touch with a cover photo.</p>
                        <p className="mt-1">Recommended size: Portrait (3:4 ratio).</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="book-title"
                      className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide"
                    >
                      Book title
                    </label>
                    <div className="mt-2">
                      <AppInput
                        id="book-title"
                        name="book-title"
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., Lily's Journey, My Book, etc."
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="book-subtitle"
                        className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide"
                      >
                        Subtitle (optional)
                      </label>
                      <span className="text-xs text-app-gray-600">
                        A short phrase to add flavor.
                      </span>
                    </div>
                    <div className="mt-2">
                      <AppInput
                        id="book-subtitle"
                        name="book-subtitle"
                        type="text"
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="A cozy story about bedtime adventures"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="creation-type"
                      className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide"
                    >
                      How would you like to start?
                    </label>
                    <div className="mt-3 inline-flex rounded-pill bg-app-gray-100 p-1">
                      <Button
                        type="button"
                        variant={creationType === 0 ? 'appPrimary' : 'appGhost'}
                        size="sm"
                        className="h-8 px-4 text-xs rounded-pill"
                        onClick={() => {
                          setCreationType(0);
                        }}
                      >
                        Auto-generate Chapters
                      </Button>
                      <Button
                        type="button"
                        variant={creationType === 1 ? 'appPrimary' : 'appGhost'}
                        size="sm"
                        className="h-8 px-4 text-xs rounded-pill"
                        onClick={() => {
                          setCreationType(1);
                          setPromptMode(false); // Reset prompt mode when switching to blank
                        }}
                      >
                        Start Blank
                      </Button>
                    </div>
                  </div>

                  {/* Layout Selection */}
                  {/*<div>*/}
                  {/*  <label*/}
                  {/*    htmlFor="layout-mode"*/}
                  {/*    className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide"*/}
                  {/*  >*/}
                  {/*    Book Layout*/}
                  {/*  </label>*/}
                  {/*  <div className="mt-3 grid grid-cols-3 gap-3">*/}
                  {/*    <button*/}
                  {/*      type="button"*/}
                  {/*      onClick={() => setLayoutMode('standard')}*/}
                  {/*      className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${layoutMode === 'standard' ? 'border-app-iris bg-app-iris/5' : 'border-app-gray-200 hover:border-app-gray-300'}`}*/}
                  {/*    >*/}
                  {/*      <div className="w-full aspect-[4/3] bg-app-gray-200 rounded mb-2 border border-app-gray-300 shadow-sm" />*/}
                  {/*      <span className="text-xs font-medium text-app-gray-900">Standard</span>*/}
                  {/*      <span className="text-[10px] text-app-gray-500">Responsive</span>*/}
                  {/*    </button>*/}

                  {/*    /!*<button*!/*/}
                  {/*    /!*  type="button"*!/*/}
                  {/*    /!*  onClick={() => setLayoutMode('a4')}*!/*/}
                  {/*    /!*  className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${layoutMode === 'a4' ? 'border-app-iris bg-app-iris/5' : 'border-app-gray-200 hover:border-app-gray-300'}`}*!/*/}
                  {/*    /!*>*!/*/}
                  {/*    /!*  <div className="h-10 w-[min(100%,30px)] aspect-[210/297] bg-white rounded-sm mb-2 border border-app-gray-300 shadow-sm" />*!/*/}
                  {/*    /!*  <span className="text-xs font-medium text-app-gray-900">A4 Print</span>*!/*/}
                  {/*    /!*  <span className="text-[10px] text-app-gray-500">Fixed Page</span>*!/*/}
                  {/*    /!*</button>*!/*/}

                  {/*    /!*<button*!/*/}
                  {/*    /!*  type="button"*!/*/}
                  {/*    /!*  onClick={() => setLayoutMode('scrapbook')}*!/*/}
                  {/*    /!*  className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${layoutMode === 'scrapbook' ? 'border-app-iris bg-app-iris/5' : 'border-app-gray-200 hover:border-app-gray-300'}`}*!/*/}
                  {/*    /!*>*!/*/}
                  {/*    /!*  <div className="w-10 h-10 bg-white rounded-sm mb-2 border border-app-gray-300 shadow-sm" />*!/*/}
                  {/*    /!*  <span className="text-xs font-medium text-app-gray-900">Scrapbook</span>*!/*/}
                  {/*    /!*  <span className="text-[10px] text-app-gray-500">Square 1:1</span>*!/*/}
                  {/*    /!*</button>*!/*/}
                  {/*  </div>*/}
                  {/*</div>*/}

                  {/* Prompt Section - Only shown when Auto-generate is selected */}
                  {creationType === 0 && (
                    <div className="p-4 bg-app-violet/5 rounded-xl border border-app-violet/20 transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide">
                          Chapter generation mode
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${!promptMode ? 'text-app-gray-900 font-medium' : 'text-app-gray-600'}`}>
                            Baby Journal
                          </span>
                          <Switch
                            id="prompt-mode"
                            checked={promptMode}
                            onCheckedChange={setPromptMode}
                          />
                          <span className={`text-xs ${promptMode ? 'text-app-gray-900 font-medium' : 'text-app-gray-600'}`}>
                            Custom Prompt
                          </span>
                        </div>
                      </div>

                      {!promptMode && (
                        <div className="mt-3 p-3 bg-white/60 rounded-md border border-app-violet/10">
                          <p className="text-xs text-app-gray-600">
                            Chapters will be auto-generated for a baby journal (Pre-birth, First Month, Second Month, etc.)
                          </p>
                        </div>
                      )}

                      {promptMode && (
                        <div className="mt-3 transition-all">
                          <label htmlFor="prompt" className="text-xs font-semibold text-app-gray-600 mb-2 block">
                            Describe your book idea
                          </label>
                          <div className="relative">
                            <Textarea
                              id="prompt"
                              value={prompt}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value.length <= 500) {
                                  setPrompt(value);
                                }
                              }}
                              placeholder="Describe your book idea, characters, plot, or theme... (e.g., A young wizard discovers he's a wizard on his 11th birthday...)"
                              className="min-h-[100px] pr-16 rounded-xl border-app-gray-300"
                              maxLength={500}
                            />
                            <span className="absolute bottom-2 right-3 text-xs text-app-gray-600">
                              {prompt.length}/500
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-4 flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="appGhost"
                    className="text-sm"
                    onClick={() => navigate('/dashboard')}
                    disabled={loading}
                  >
                    Skip for now
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="appGhost"
                      className="hidden sm:inline-flex text-sm"
                      onClick={() => navigate(-1)}
                      disabled={loading}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="submit"
                      variant="appSuccess"
                      className="text-sm"
                      disabled={!title.trim() || loading}
                    >
                      {loading ? 'Creating…' : 'Continue'}
                    </Button>
                  </div>
                </div>
              </form>
            </InfoCard>
          </div>
        }
        right={
          <div className="space-y-6">
            <BookCardPreview title={title} subtitle={subtitle} coverImage={coverImagePreview} />
            <SummaryCard
              title="What we'll set up"
              rows={[
                { label: 'Book title', value: title.trim() || 'Not set yet' },
                {
                  label: 'Mode',
                  value: creationType === 0
                    ? (promptMode ? 'AI-assisted (Custom)' : 'AI-assisted (Baby Journal)')
                    : 'Start Blank'
                },
                { label: 'Est. chapters', value: creationType === 0 ? '8–12 (editable later)' : 'Add manually' },
              ]}
            />
          </div>
        }
      />
    </div>
  );
};

export default CreateBook;
