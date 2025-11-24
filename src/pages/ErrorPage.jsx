import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

const ErrorPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-app-gray-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-appCard p-8 text-center space-y-6">
                <div className="mx-auto h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-red-500" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-app-gray-900">We hit a snag</h1>
                    <p className="text-app-gray-600">
                        The feature may still be in development. Please reach out to us directly at our email at{' '}
                        <a href="mailto:requests@airabook.com" className="text-app-iris hover:underline">
                            requests@airabook.com
                        </a>
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button
                        variant="outline"
                        onClick={() => window.location.reload()}
                        className="w-full sm:w-auto"
                    >
                        Try Again
                    </Button>
                    <Button
                        variant="appPrimary"
                        onClick={() => navigate('/dashboard')}
                        className="w-full sm:w-auto"
                    >
                        Go to Dashboard
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ErrorPage;
