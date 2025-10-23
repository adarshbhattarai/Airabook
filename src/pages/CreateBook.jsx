import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Book, Sparkles, ArrowLeft } from 'lucide-react';

const CreateBook = () => {
  const [babyName, setBabyName] = useState('');
  const [creationType, setCreationType] = useState('auto-generate');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCreateBook = async (e) => {
    e.preventDefault();
    if (!babyName.trim()) {
      toast({ title: "Error", description: "Baby's name cannot be empty.", variant: "destructive" });
      return;
    }
    if (!user) {
        toast({ title: "Error", description: "You must be logged in to create a book.", variant: "destructive" });
        return;
    }

    setLoading(true);

    try {
      const createBookFunction = httpsCallable(functions, 'createBook');
      const result = await createBookFunction({
        title: babyName,
        creationType: creationType,
      });

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
      console.error("Error creating book via function: ", error);
      toast({
        title: "Error",
        description: "Book could not be created.",
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
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleCreateBook}>
            <div>
              <label htmlFor="baby-name" className="block text-sm font-medium text-gray-700">
                Baby's Name
              </label>
              <div className="mt-1">
                <Input
                  id="baby-name"
                  name="baby-name"
                  type="text"
                  required
                  value={babyName}
                  onChange={(e) => setBabyName(e.target.value)}
                  placeholder="e.g., Lily, Tom, etc."
                />
              </div>
            </div>

            <div>
            <label htmlFor="creation-type" className="block text-sm font-medium text-gray-700 mb-2">
                How would you like to start?
              </label>
              <ToggleGroup type="single" value={creationType} onValueChange={(value) => {if(value) setCreationType(value)}} className="grid grid-cols-2 gap-2">
                            <ToggleGroupItem value="auto-generate" className="flex flex-col h-20">
                              <Sparkles className="h-5 w-5 mb-1" />
                              Auto-generate Chapters
                            </ToggleGroupItem>
                            <ToggleGroupItem value="blank" className="flex flex-col h-20">
                              <Book className="h-5 w-5 mb-1" />
                              Start Blank
                            </ToggleGroupItem>
                          </ToggleGroup>
            </div>

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