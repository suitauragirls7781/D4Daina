import React from 'react';
import { motion } from 'motion/react';

export const ShimmerPDP: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        <div className="lg:col-span-7 aspect-[3/4] rounded-md overflow-hidden bg-[#2A0710]/10 relative">
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-[#2A0710]/20 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          />
        </div>
        <div className="lg:col-span-5 space-y-6">
          <div className="h-8 w-3/4 bg-[#2A0710]/20 rounded-lg" />
          <div className="h-6 w-1/2 bg-[#2A0710]/20 rounded-lg" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-[#2A0710]/20 rounded-lg" />
            <div className="h-4 w-full bg-[#2A0710]/20 rounded-lg" />
            <div className="h-4 w-2/3 bg-[#2A0710]/20 rounded-lg" />
          </div>
          <div className="h-12 w-full bg-[#2A0710]/20 rounded" />
        </div>
      </div>
    </div>
  );
};
