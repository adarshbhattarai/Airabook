import React from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const getIcon = (status) => {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === 'error') return <AlertCircle className="h-4 w-4 text-red-600" />;
  return <Loader2 className="h-4 w-4 text-app-iris animate-spin" />;
};

const PlannerProgressTimeline = ({ events = [] }) => {
  if (!Array.isArray(events) || events.length === 0) {
    return (
      <div className="rounded-lg border border-app-gray-200 bg-white px-3 py-4 text-sm text-app-gray-600">
        Waiting for progress updates...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event, index) => (
        <div
          key={event.id || `${event.type || 'event'}-${index}`}
          className="rounded-lg border border-app-gray-200 bg-white px-3 py-2"
        >
          <div className="flex items-center gap-2">
            {getIcon(event.status)}
            <div className="text-sm font-medium text-app-gray-800">
              {event.message || event.type || 'Processing'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PlannerProgressTimeline;
