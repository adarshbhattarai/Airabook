import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ImageIcon, X } from 'lucide-react';
import { storage, functions } from '@/lib/firebase'; // Corrected import path
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/context/AuthContext';

const EditBookModal = ({ isOpen, onClose, book, onUpdate }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [coverImageFile, setCoverImageFile] = useState(null);
    const [coverImagePreview, setCoverImagePreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [imageRemoved, setImageRemoved] = useState(false);

    useEffect(() => {
        if (book && isOpen) {
            setTitle(book.babyName || book.title || '');
            setSubtitle(book.subtitle || '');
            setCoverImagePreview(book.coverImageUrl || null);
            setCoverImageFile(null);
            setImageRemoved(false);
        }
    }, [book, isOpen]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                toast({ title: "File too large", description: "Please select an image under 5MB.", variant: "destructive" });
                return;
            }
            setCoverImageFile(file);
            setImageRemoved(false);
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
        setImageRemoved(true);
    };

    const handleSave = async () => {
        if (!title.trim()) {
            toast({ title: "Error", description: "Book title cannot be empty.", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            let newCoverImageUrl = undefined;

            // Handle Image Upload
            if (coverImageFile) {
                const filename = `${Date.now()}_${coverImageFile.name}`;
                const storageRef = ref(storage, `${user.uid}/covers/${filename}`);
                const metadata = {
                    customMetadata: {
                        bookId: book.id
                    }
                };
                const snapshot = await uploadBytes(storageRef, coverImageFile, metadata);
                newCoverImageUrl = await getDownloadURL(snapshot.ref);
            } else if (imageRemoved) {
                newCoverImageUrl = null;
            }

            // Call Cloud Function
            const updateBookFn = httpsCallable(functions, 'updateBook');
            await updateBookFn({
                bookId: book.id,
                title: title.trim(),
                subtitle: subtitle.trim() || null,
                coverImageUrl: newCoverImageUrl
            });

            toast({ title: "Success", description: "Book updated successfully." });

            // Notify parent to refresh
            if (onUpdate) {
                onUpdate({
                    ...book,
                    babyName: title.trim(),
                    title: title.trim(),
                    subtitle: subtitle.trim() || null,
                    coverImageUrl: newCoverImageUrl !== undefined ? newCoverImageUrl : book.coverImageUrl
                });
            }
            onClose();
        } catch (error) {
            console.error("Error updating book:", error);
            toast({ title: "Error", description: "Failed to update book.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] bg-white rounded-2xl shadow-lg p-8">
                <DialogHeader>
                    <DialogTitle className="text-xl">Edit Book Details</DialogTitle>
                    <DialogDescription>
                        Update your book's title and cover image.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Title Input */}
                    <div className="space-y-3">
                        <Label htmlFor="title" className="text-base">Book Title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter book title"
                            className="h-11"
                        />
                    </div>

                    {/* Subtitle Input */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="subtitle" className="text-base">Subtitle</Label>
                            <span className="text-xs text-app-gray-500">Optional</span>
                        </div>
                        <Input
                            id="subtitle"
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            placeholder="A short phrase to add flavor"
                            className="h-11"
                        />
                    </div>

                    {/* Cover Image Upload */}
                    <div className="space-y-3">
                        <Label className="text-base">Cover Image</Label>
                        <div className="flex items-start gap-6">
                            <div className="relative group">
                                <div className={`w-32 h-44 rounded-xl border-2 border-dashed border-app-gray-300 flex flex-col items-center justify-center overflow-hidden bg-app-gray-50 transition-colors ${!coverImagePreview ? 'hover:bg-app-gray-100 hover:border-app-violet/50' : 'border-solid border-app-gray-200'}`}>
                                    {coverImagePreview ? (
                                        <img src={coverImagePreview} alt="Cover preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-center p-2">
                                            <ImageIcon className="w-8 h-8 text-app-gray-400 mx-auto mb-2" />
                                            <span className="text-xs text-app-gray-500 font-medium">Upload</span>
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
                                        className="absolute -top-2 -right-2 bg-white rounded-full p-1.5 shadow-md border border-app-gray-200 text-app-gray-500 hover:text-red-500 transition-colors"
                                        title="Remove image"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 text-sm text-app-gray-500 pt-2 space-y-2">
                                <p>Add a personal touch with a cover photo.</p>
                                <p>Recommended size: Portrait (3:4 ratio).</p>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default EditBookModal;
