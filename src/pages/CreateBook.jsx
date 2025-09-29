import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, writeBatch, collection } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

const CreateBook = () => {
  const [babyName, setBabyName] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, appUser } = useAuth();
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
      // Use a batch write to perform multiple operations atomically
      const batch = writeBatch(firestore);

      // 1. Create the new book document
      const bookRef = doc(collection(firestore, 'books'));
      batch.set(bookRef, {
        babyName: babyName,
        ownerId: user.uid,
        members: {
          [user.uid]: 'Owner' // Can be 'Father', 'Mother', etc.
        },
        createdAt: new Date(),
      });

      // 2. Update the user's document with the new book ID
      const userRef = doc(firestore, 'users', user.uid);
      const newBookIds = [...(appUser.accessibleBookIds || []), bookRef.id];
      batch.update(userRef, { accessibleBookIds: newBookIds });

      // Commit the batch
      await batch.commit();

      toast({ title: "Success!", description: `"${babyName}'s Book" has been created.` });

      // Navigate to the new book's detail page
      navigate(`/book/${bookRef.id}`);

    } catch (error) {
      console.error("Error creating book: ", error);
      toast({ title: "Error", description: "Failed to create book. Please try again.", variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-10 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-violet-100">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create a New Baby Book
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            A special place for a special someone.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleCreateBook}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <Input
                id="baby-name"
                name="baby-name"
                type="text"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Baby's Name"
                value={babyName}
                onChange={(e) => setBabyName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Button type="submit" disabled={loading} className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              {loading ? 'Creating...' : 'Create Book'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateBook;
