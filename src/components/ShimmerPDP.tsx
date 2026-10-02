import React from 'react';

/** Product page placeholder: still blocks in the shape of the real page (photo, title, price, buttons), no shimmer. */
export const ShimmerPDP: React.FC = () => {
  return (
    <div className="bg-surface" role="status" aria-label="Loading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-12 grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-12">
        <div className="min-w-0">
          <div className="w-[84vw] sm:w-[58%] lg:w-full aspect-[4/5] rounded-control bg-sunken-deep" />
          <div className="mt-2 h-5" />
        </div>
        <div className="min-w-0 mt-2 lg:mt-0">
          <div className="h-11 flex items-center"><div className="h-6 w-3/4 bg-sunken-deep rounded-badge" /></div>
          <div className="h-5" />
          <div className="mt-2 h-8 w-1/2 bg-sunken-deep rounded-badge" />
          <div className="mt-6 space-y-3">
            <div className="h-4 w-full bg-sunken-deep rounded-badge" />
            <div className="h-4 w-full bg-sunken-deep rounded-badge" />
            <div className="h-4 w-2/3 bg-sunken-deep rounded-badge" />
          </div>
          <div className="mt-6 h-[52px] w-full bg-sunken-deep rounded-control" />
        </div>
      </div>
    </div>
  );
};
