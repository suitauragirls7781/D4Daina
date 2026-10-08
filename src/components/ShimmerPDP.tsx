import React from 'react';

/** Product page placeholder: still glass panels in the shape of the real page (photo, small photos, name, price, buttons), no shimmer. */
export const ShimmerPDP: React.FC = () => {
  const bar = 'rounded-full bg-sunken-deep';
  return (
    <div className="pt-3 md:pt-0" role="status" aria-label="Loading">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 sm:mx-auto sm:w-full sm:max-w-xl lg:mx-0 lg:max-w-none lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-8">
          <div className="min-w-0">
            <div className="sag-glass rounded-[28px]! p-2">
              <div className="aspect-[4/5] rounded-[22px] bg-sunken" />
              <div className="mt-1.5 p-[3px] flex gap-2 overflow-hidden">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="shrink-0 w-14 lg:w-16 aspect-[4/5] rounded-[14px] bg-sunken" />)}
              </div>
            </div>
          </div>
          <div className="min-w-0 pt-3 lg:pt-0">
            <div className="sag-glass p-4 lg:p-5">
              <div className={`h-3 w-20 ${bar}`} />
              <div className={`mt-2.5 h-5 w-11/12 ${bar}`} />
              <div className={`mt-2 h-5 w-2/3 ${bar}`} />
              <div className={`mt-3.5 h-7 w-2/5 ${bar}`} />
              <div className={`mt-2.5 h-3.5 w-1/2 ${bar}`} />
              <div className="mt-5 h-[60px] w-full rounded-[16px] bg-sunken" />
              <div className="mt-6 flex gap-2">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[38px] w-[46px] rounded-full bg-sunken-deep" />)}
              </div>
            </div>
            <div className="mt-3 h-[52px] w-full rounded-full bg-brand/30" />
            <div className="sag-glass rounded-full! shadow-none! mt-2.5 h-[52px] w-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
