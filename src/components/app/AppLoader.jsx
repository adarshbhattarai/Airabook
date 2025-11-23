import React from 'react';
import { Sparkles } from 'lucide-react';

const AppLoader = ({ message = "Loading..." }) => {
    return (
        <div className="flex flex-col justify-center items-center min-h-[60vh] space-y-4">
            <div className="relative">
                <div className="h-12 w-12 rounded-full border-4 border-app-iris/20 border-t-app-iris animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-app-iris animate-pulse" />
                </div>
            </div>
            <p className="text-sm font-medium text-app-gray-500 animate-pulse">
                {message}
            </p>
        </div>
    );
};

export default AppLoader;
