import React from 'react';

/** Product page placeholder: still blocks in the shape of the real page (photo, small photos, name, price, buttons), no shimmer. */
export const ShimmerPDP: React.FC = () => {
  return (
    <div className="bg-surface" role="status" aria-label="Loading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 sm:mx-auto sm:w-full sm:max-w-xl lg:mx-0 lg:max-w-none lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-12">
          <div className="min-w-0 lg:flex lg:gap-3">
            <div className="hidden lg:grid content-start gap-3 w-20 shrink-0">
              {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] bg-sunken" />)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="-mx-4 sm:mx-0 aspect-[4/5] bg-sunken" />
              <div className="mt-2.5 flex gap-3 lg:hidden">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="w-14 aspect-[4/5] bg-sunken" />)}
              </div>
            </div>
          </div>
          <div className="min-w-0 pt-[18px] lg:pt-1">
            <div className="h-3 w-20 bg-sunken" />
            <div className="mt-2.5 h-5 w-11/12 bg-sunken" />
            <div className="mt-2 h-5 w-2/3 bg-sunken" />
            <div className="mt-3.5 h-7 w-2/5 bg-sunken" />
            <div className="mt-2.5 h-3.5 w-1/2 bg-sunken" />
            <div className="mt-5 h-[60px] w-full bg-sunken" />
            <div className="mt-6 flex gap-2">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[38px] w-11 border border-line" />)}
            </div>
            <div className="mt-[22px] h-[52px] w-full bg-sunken-deep" />
            <div className="mt-2.5 h-[52px] w-full border border-line" />
          </div>
        </div>
      </div>
    </div>
  );
};
