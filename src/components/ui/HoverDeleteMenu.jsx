import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { MoreVertical, Trash2 } from 'lucide-react';

const HoverDeleteMenu = ({ onDelete, side = 'left' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [isOpen]);

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 data-[state=open]:bg-violet-100"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div className={`absolute top-full mt-1 w-28 bg-white rounded-md shadow-2xl z-[9999] border ${side === 'right' ? 'right-0' : 'left-0'}`}>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 text-sm px-2 py-1.5"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={handleDeleteClick}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
};

export default HoverDeleteMenu;
