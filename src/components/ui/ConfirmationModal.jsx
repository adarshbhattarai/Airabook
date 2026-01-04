import React from 'react';
import { Button } from '@/components/ui/button';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, description }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg text-center">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        <p className="mt-2 text-gray-600">{description}</p>
        <div className="mt-6 flex justify-center space-x-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
