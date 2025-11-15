import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { functions, auth } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Book, Sparkles, ArrowLeft } from 'lucide-react';

const CreateBook = () => {
  const [babyName, setBabyName] = useState('');
  const [creationType, setCreationType] = useState(0);
  const [promptMode, setPromptMode] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, entitlements } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const canWriteBooks = entitlements?.canWriteBooks;

  const handleCreateBook = async (e) => {
    e.preventDefault();
    console.log("🚀 CreateBook: Starting book creation process");
    console.log("👤 User:", user ? user.uid : "No user");
    console.log("📝 Book title:", babyName);
    console.log("🔧 Creation type:", creationType);
    
    if (!babyName.trim()) {
      toast({ title: "Error", description: "Book title cannot be empty.", variant: "destructive" });
      return;
    }

    if (!canWriteBooks) {
      toast({
        title: "Upgrade required",
        description: "Writing tools are unlocked on supporter plans. Visit the Donate page to upgrade.",
        variant: "destructive",
      });
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
      console.log("🔧 Functions instance:", functions);
      console.log("🌐 Functions region:", functions.app.options.region);
      
      // Debug: Check current user and token
      console.log("🔐 Current Firebase User:", auth.currentUser);
      console.log("🔐 User UID:", auth.currentUser?.uid);
      console.log("🔐 User Email:", auth.currentUser?.email);
      
      // Force refresh the ID token
      const idToken = await auth.currentUser.getIdToken(true);
      console.log("🎫 Fresh ID Token obtained:", idToken ? "Token exists" : "No token");
      console.log("🎫 Token length:", idToken?.length);
      
      const createBookFunction = httpsCallable(functions, 'createBook');
      console.log("✅ CreateBook: Function reference created");
      
      const payload = {
        title: babyName,
        creationType: creationType,
        promptMode: creationType === 0 ? promptMode : false,
        prompt: (creationType === 0 && promptMode && prompt.trim()) ? prompt : undefined,
      };
      console.log("📦 CreateBook: Payload:", payload);
      
      const result = await createBookFunction(payload);
      console.log("✅ CreateBook: Function call successful, result:", result);

      const bookId = result.data.bookId;
      if (!bookId) {
        throw new Error("Function did not return a book ID.");
      }
      
      toast({
        title: "Book created",
        description: `"${babyName}" has been successfully created.`,
      });

      navigate(`/book/${bookId}`);

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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create a New Book
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Let's get started on a new adventure for your little one.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 space-y-6">
          {!canWriteBooks && (
            <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50 text-sm text-yellow-800 space-y-3">
              <p className="font-semibold">Writing is unlocked on paid plans.</p>
              <p>
                Browse every book for free, but to create new stories you need at least the supporter plan. Your contribution keeps the service running.
              </p>
              <Button type="button" className="bg-[#3498db] hover:bg-[#2c82c9]" onClick={() => navigate('/donate')}>
                View plans
              </Button>
            </div>
          )}
          <form className="space-y-6" onSubmit={handleCreateBook}>
            <div>
              <label htmlFor="baby-name" className="block text-sm font-medium text-gray-700">
                Book Title
              </label>
              <div className="mt-1">
                <Input
                  id="baby-name"
                  name="baby-name"
                  type="text"
                  required
                  value={babyName}
                  onChange={(e) => setBabyName(e.target.value)}
                  placeholder="e.g., Lily's Journey, My Book, etc."
                />
              </div>
            </div>

            <div>
            <label htmlFor="creation-type" className="block text-sm font-medium text-gray-700 mb-2">
                How would you like to start?
              </label>
              <ToggleGroup type="single" value={creationType.toString()} onValueChange={(value) => {
                if(value) {
                  setCreationType(parseInt(value));
                  // Reset prompt mode when switching to Start Blank
                  if (parseInt(value) === 1) {
                    setPromptMode(false);
                  }
                }
              }} className="grid grid-cols-2 gap-2">
                            <ToggleGroupItem value="0" className="flex flex-col h-20">
                              <Sparkles className="h-5 w-5 mb-1" />
                              Auto-generate Chapters
                            </ToggleGroupItem>
                            <ToggleGroupItem value="1" className="flex flex-col h-20">
                              <Book className="h-5 w-5 mb-1" />
                              Start Blank
                            </ToggleGroupItem>
                          </ToggleGroup>
            </div>

            {/* Prompt Section - Only shown when Auto-generate is selected */}
            {creationType === 0 && (
              <div className="p-4 bg-violet-50 rounded-lg border border-violet-200 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">
                    Chapter generation mode:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${!promptMode ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      Baby Journal
                    </span>
                    <Switch
                      id="prompt-mode"
                      checked={promptMode}
                      onCheckedChange={setPromptMode}
                    />
                    <span className={`text-xs ${promptMode ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      Custom Prompt
                    </span>
                  </div>
                </div>
                
                {!promptMode && (
                  <div className="mt-3 p-3 bg-white/60 rounded-md border border-violet-100">
                    <p className="text-xs text-gray-600">
                      Chapters will be auto-generated for a baby journal (Pre-birth, First Month, Second Month, etc.)
                    </p>
                  </div>
                )}
                
                {promptMode && (
                  <div className="mt-3 transition-all">
                    <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
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
                        className="min-h-[100px] pr-16"
                        maxLength={500}
                      />
                      <span className="absolute bottom-2 right-3 text-xs text-gray-400">
                        {prompt.length}/500
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500" disabled={loading}>
                {loading ? 'Creating Book...' : 'Create Book'}
              </Button>
              <Button variant="outline" type="button" className="w-full" onClick={() => navigate(-1)} disabled={loading}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateBook;