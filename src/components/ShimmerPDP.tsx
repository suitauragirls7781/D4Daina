import React from 'react';

/** Product page placeholder: still shapes in the layout of the real page (photo, small photos, name, price, sizes, buttons), no shimmer. */
export const ShimmerPDP: React.FC = () => {
  const bar = 'rounded-[3px] bg-sunken-deep';
  return (
    <div role="status" aria-label="Loading">
      <div className="max-w-[1160px] mx-auto lg:px-6 pb-12">
        <div className="grid grid-cols-1 sm:mx-auto sm:w-full sm:max-w-xl lg:mx-0 lg:max-w-none lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-x-14 lg:items-start lg:pt-4">
          <div className="min-w-0">
            <div className="aspect-[4/5] sm:rounded-[10px] bg-sunken" />
            <div className="mt-3 flex h-4 items-center justify-center gap-1.5">
              <span className="h-0.5 w-8 bg-control" />
              {[0, 1, 2].map((i) => <span key={i} className="h-0.5 w-[18px] bg-line" />)}
            </div>
            <div className="mt-2 flex justify-center gap-2 overflow-hidden px-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="shrink-0 w-[54px] aspect-[4/5] rounded-[4px] bg-sunken" />)}
            </div>
          </div>
          <div className="min-w-0 px-4 pt-6 lg:px-0 lg:pt-0">
            <div className={`h-3 w-24 ${bar}`} />
            <div className={`mt-3.5 h-8 w-11/12 ${bar}`} />
            <div className={`mt-2 h-8 w-2/3 ${bar}`} />
            <div className={`mt-4 h-7 w-2/5 ${bar}`} />
            <div className={`mt-3 h-3.5 w-1/2 ${bar}`} />
            <div className="my-[22px] h-px bg-line" />
            <div className={`h-3 w-16 ${bar}`} />
            <div className="mt-3 h-[52px] w-full rounded-lg border border-line bg-surface" />
            <div className="mt-[22px] grid grid-cols-2 gap-2.5">
              <div className="h-[52px] rounded-lg border border-control" />
              <div className="h-[52px] rounded-lg bg-sunken-deep" />
            </div>
            <div className="sag-glass mt-4 h-[168px]" />
          </div>
        </div>
      </div>
    </div>
  );
};
