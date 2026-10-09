import React from 'react';

/** Product page placeholder: still shapes in the layout of the real page (the round photo frame, small photos, name, price, the size pill, the two pill buttons). */
export const ShimmerPDP: React.FC = () => {
  const bar = 'rounded-full bg-sunken-deep';
  return (
    <div role="status" aria-label="Loading" data-aura="" className="pdp-page">
      <div className="pdp-w">
        <div className="pdp">
          <div className="pdp-g">
            <div className="pdp-gi">
              <div className="aura-sk aspect-[4/5] rounded-[26px]" />
              <div className="pdp-th">
                {[0, 1, 2, 3].map((i) => <div key={i} className="shrink-0 w-[58px] aspect-[3/4] rounded-[14px] bg-sunken" />)}
              </div>
            </div>
          </div>
          <div className="pdp-d">
            <div className={`h-3.5 w-24 ${bar}`} />
            <div className={`mt-4 h-9 w-11/12 ${bar}`} />
            <div className={`mt-2.5 h-9 w-2/3 ${bar}`} />
            <div className={`mt-5 h-9 w-2/5 ${bar}`} />
            <div className={`mt-3 h-3.5 w-1/2 ${bar}`} />
            <div className={`mt-8 h-3.5 w-16 ${bar}`} />
            <div className="mt-3 h-[54px] w-full rounded-full bg-surface" />
            <div className="mt-7 grid gap-2.5">
              <div className="h-[54px] rounded-full bg-sunken-deep" />
              <div className="h-[54px] rounded-full bg-surface" />
            </div>
            <div className="mt-7 h-[190px] rounded-[26px] bg-sunken" />
          </div>
        </div>
      </div>
    </div>
  );
};
