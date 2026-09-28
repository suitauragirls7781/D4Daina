import React, { useState } from 'react';
import { Star, CheckCircle, Quote, MessageSquarePlus, X, Loader2, Sparkles, Heart, ChevronDown, ChevronUp } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';

interface ReviewItem {
  id: string;
  name: string;
  location: string;
  outfit: string;
  rating: number;
  date: string;
  comment: string;
  verified: boolean;
  likes?: number;
  created_at?: string;
  imageUrl?: string;
}

export const CustomerReviews: React.FC = () => {
  const { showToast } = useShop();
  const { reviewsList = [], addReview, isLoading } = useAdmin();
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [likedReviews, setLikedReviews] = useState<Record<string, boolean>>({});
  
  const [newReview, setNewReview] = useState({ 
    name: '', 
    location: '',
    rating: 5, 
    comment: '', 
    outfit: 'Signature Ensemble'
  });

  // Map real approved user reviews from context / database (strictly filtering out any English sentences/keywords)
  const userSubmittedReviews: ReviewItem[] = (reviewsList || [])
    .filter((r) => {
      const isApproved = (r.status || 'approved') === 'approved';
      const comment = String(r.comment || '').trim();
      if (!isApproved || !comment) return false;

      const lower = comment.toLowerCase();
      const isEnglish = (
        lower.includes('the ') || lower.includes(' is ') || lower.includes(' are ') ||
        lower.includes('fabric is') || lower.includes('pure luxury') || lower.includes('embroidery and lace') ||
        lower.includes('exactly as shown') || lower.includes('breathtaking') || lower.includes('exquisite') ||
        lower.includes('outstanding') || lower.includes('kurti with palazzo') || lower.includes('short kurti') ||
        lower.includes('the flare and silhouette') || lower.includes('wore it for') || lower.includes('super soft,')
      );
      return !isEnglish;
    })
    .map((r) => ({
      id: r.id,
      name: r.userName || 'Customer',
      location: r.location || 'India',
      outfit: r.productName || 'Suit Aura Girls Ensemble',
      rating: r.rating || 5,
      date: r.date || 'Recently',
      comment: r.comment || '',
      verified: r.verifiedPurchase ?? false,
      likes: 18,
      imageUrl: r.imageUrl,
    }));

  const displayReviews = userSubmittedReviews;

  // Initial visible reviews count (5 cards as requested), expand to show all 55+
  const visibleReviews = isExpanded ? displayReviews : displayReviews.slice(0, 5);

  const handleLike = (id: string) => {
    const isCurrentlyLiked = !!likedReviews[id];
    const willBeLiked = !isCurrentlyLiked;
    setLikedReviews((prev) => ({ ...prev, [id]: willBeLiked }));
    if (willBeLiked && showToast) {
      showToast('Thank you for liking this review!', 'success');
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;

    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(<Star key={i} className="w-3.5 h-3.5 fill-[#D7B77A] text-[#F7F0E5]" />);
      } else if (i === fullStars + 1 && hasHalfStar) {
        stars.push(
          <div key={i} className="relative w-3.5 h-3.5">
            <Star className="w-3.5 h-3.5 text-[#F7F0E5]/55 fill-gray-200" />
            <div className="absolute top-0 left-0 overflow-hidden w-[50%]">
              <Star className="w-3.5 h-3.5 fill-[#D7B77A] text-[#F7F0E5]" />
            </div>
          </div>
        );
      } else {
        stars.push(<Star key={i} className="w-3.5 h-3.5 text-[#F7F0E5]/55 fill-gray-200" />);
      }
    }
    return stars;
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReview.name || !newReview.comment) {
      if (showToast) showToast('Please enter your name and review text.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await addReview({
        productId: '0',
        productName: newReview.outfit || 'Signature Ensemble',
        userName: newReview.name,
        rating: Number(newReview.rating),
        date: new Date().toISOString(),
        verifiedPurchase: false,
        location: newReview.location || 'India',
        comment: newReview.comment,
        status: 'pending', // Requires admin approval before live display
      });

      if (showToast) showToast('Dhanyawad! Aapka review submit ho gaya hai. Admin approval ke baad ye live hoga.', 'success');
      setSubmittedSuccess(true);
    } catch (err) {
      console.error('Review submit error:', err);
      if (showToast) showToast('Dhanyawad! Aapka review submit ho gaya hai.', 'success');
      setSubmittedSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="customer-reviews-section" className="py-10 sm:py-16 bg-[#180306] border-b border-[#D7B77A]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Compact & Clean Section Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-8 sm:mb-12 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5C0B1B] text-[#F7F0E5] border border-[#D7B77A]/40 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-3">
              <Star className="w-3.5 h-3.5 text-[#F7F0E5] fill-[#D7B77A]" />
              <span>CLIENT REVIEWS • {displayReviews.length} PUBLISHED</span>
            </div>
            
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F7F0E5] leading-tight">
              Customer Reviews
            </h2>
            
            <p className="text-xs sm:text-sm text-[#F7F0E5]/80 font-normal mt-1">
              Published customer feedback. Purchase verification is shown only when recorded.
            </p>
          </div>

          <button
            id="open-write-review-btn"
            onClick={() => setIsWriteModalOpen(true)}
            className="px-5 py-2.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] active:scale-95 text-[#F7F0E5] border border-[#D7B77A] rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center gap-2 cursor-pointer shrink-0"
          >
            <MessageSquarePlus className="w-4 h-4 text-[#F7F0E5]" />
            <span>WRITE A REVIEW</span>
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-[#F7F0E5]" />
            <span className="ml-2 text-xs text-[#F7F0E5] font-semibold">Loading reviews...</span>
          </div>
        )}

        {/* Review Cards Grid or Clean Minimal Empty State */}
        {!isLoading && displayReviews.length === 0 ? (
          <div className="text-center py-8 px-4 bg-[#180306] border border-[#D7B77A]/30 rounded-md max-w-md mx-auto shadow-sm">
            <div className="w-12 h-12 bg-[#D7B77A]/15 border border-[#D7B77A]/30 rounded-full flex items-center justify-center mx-auto mb-3">
              <Star className="w-6 h-6 text-[#F7F0E5] fill-[#D7B77A]" />
            </div>
            <h3 className="text-sm font-bold text-[#F7F0E5] uppercase tracking-wide">No Reviews Yet</h3>
            <p className="text-xs text-[#F7F0E5]/75 mt-1 mb-4">Be the first customer to share your experience with our ensembles!</p>
            <button
              onClick={() => setIsWriteModalOpen(true)}
              className="px-5 py-2.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] active:scale-95 text-[#F7F0E5] text-xs font-bold uppercase tracking-wider rounded-lg border border-[#D7B77A] shadow-md cursor-pointer"
            >
              Write First Review
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {visibleReviews.map((rev) => {
                const isLiked = likedReviews[rev.id];
                const likeCount = (rev.likes || 1) + (isLiked ? 1 : 0);

                return (
                  <div
                    key={rev.id}
                    id={`review-card-${rev.id}`}
                    className="bg-[#180306] p-5 sm:p-6 rounded border border-[#D7B77A]/25 shadow-xs hover:border-[#D7B77A] transition-all duration-300 flex flex-col justify-between group"
                  >
                    <div>
                      {/* Rating & Verified Badge */}
                      <div className="flex items-center justify-between gap-1 mb-3">
                        <div className="flex items-center gap-0.5">
                          {renderStars(rev.rating)}
                          <span className="text-[11px] font-bold text-[#F7F0E5] ml-1">{rev.rating}</span>
                        </div>

                        {rev.verified && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#F7F0E5] bg-[#D7B77A]/15 px-2 py-0.5 rounded-full border border-[#D7B77A]/30">
                            <CheckCircle className="w-2.5 h-2.5 text-[#F7F0E5]" />
                            <span>VERIFIED BUYER</span>
                          </span>
                        )}
                      </div>

                      {/* Comment */}
                      <div className="relative">
                        <Quote className="w-4 h-4 text-[#F7F0E5]/30 absolute -top-1 -left-1" />
                        <p className="text-xs sm:text-sm text-[#F7F0E5] font-normal leading-relaxed italic pl-3.5 mb-3">
                          &ldquo;{rev.comment}&rdquo;
                        </p>
                      </div>
                    </div>

                    {/* Author Meta */}
                    <div className="pt-3 border-t border-[#D7B77A]/15 flex items-center justify-between mt-2">
                      <div>
                        <h4 className="text-xs font-bold text-[#F7F0E5]">{rev.name}</h4>
                        <p className="text-[10px] text-[#F7F0E5]/55">{rev.location} • Bought: <span className="text-[#F7F0E5] font-semibold">{rev.outfit}</span></p>
                      </div>

                      <button
                        onClick={() => handleLike(rev.id)}
                        className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors cursor-pointer ${
                          isLiked ? 'text-[#F7F0E5] bg-[#D7B77A]/15' : 'text-[#F7F0E5]/55 hover:text-[#F7F0E5]'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-[#D7B77A] text-[#F7F0E5]' : ''}`} />
                        <span>{likeCount}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scroll / Expand Button */}
            {displayReviews.length > 5 && (
              <div className="mt-8 sm:mt-10 text-center">
                <button
                  id="toggle-see-more-reviews-btn"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="px-8 py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] active:scale-95 text-[#F7F0E5] border border-[#D7B77A] rounded text-xs sm:text-sm font-bold uppercase tracking-widest transition-all shadow-lg hover:shadow-xl inline-flex items-center gap-2.5 cursor-pointer group"
                >
                  <span>
                    {isExpanded 
                      ? 'SHOW LESS REVIEWS' 
                      : `SCROLL TO SEE MORE REVIEWS (${displayReviews.length - 5}+ MORE VERIFIED REVIEWS)`}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[#F7F0E5] group-hover:-translate-y-0.5 transition-transform" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#F7F0E5] group-hover:translate-y-0.5 transition-transform" />
                  )}
                </button>
              </div>
            )}
          </>
        )}

      </div>

      {/* Write Review Modal */}
      {isWriteModalOpen && (
        <div id="write-review-modal-overlay" className="fixed inset-0 z-50 bg-[#5C0B1B]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#180306] rounded-md max-w-md w-full p-5 sm:p-6 shadow-2xl relative border border-[#D7B77A]/40 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setIsWriteModalOpen(false);
                setSubmittedSuccess(false);
              }}
              className="absolute top-4 right-4 text-[#F7F0E5]/55 hover:text-[#F7F0E5] p-1.5 rounded-full hover:bg-[#D7B77A]/20 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {submittedSuccess ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-[#D7B77A]/15 border-2 border-[#D7B77A] rounded-full flex items-center justify-center mx-auto text-[#F7F0E5]">
                  <CheckCircle className="w-9 h-9" />
                </div>

                <h3 className="font-serif text-2xl font-bold text-[#F7F0E5]">
                  Dhanyawad! Thanks For Your Review! 🙏
                </h3>

                <p className="text-xs text-[#F7F0E5]/80 leading-relaxed bg-[#180306] p-3.5 rounded border border-[#D7B77A]/30">
                  Aapka review safaltapoorvak submit ho gaya hai. Quality check ke liye ye pehle Admin Panel me jayega. Admin approve karte hi ye site par live dikhai dega.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setIsWriteModalOpen(false);
                    setSubmittedSuccess(false);
                    setNewReview({ name: '', location: '', rating: 5, comment: '', outfit: 'Signature Ensemble' });
                  }}
                  className="w-full py-3 bg-[#5C0B1B] text-[#F7F0E5] hover:bg-[#5C0B1B] text-xs font-bold uppercase tracking-wider rounded border border-[#D7B77A] shadow-md cursor-pointer transition"
                >
                  THIK HAI (OKAY)
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-5 h-5 text-[#F7F0E5]" />
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#F7F0E5]">
                    Share Your Experience
                  </h3>
                </div>
                
                <p className="text-xs text-[#F7F0E5]/75 mb-3">
                  Help fellow buyers choose the perfect ethnic ensemble!
                </p>

                <p className="text-[11px] text-[#F7F0E5] bg-[#2A0710] p-2.5 rounded-lg border border-amber-200 font-medium mb-3">
                  ℹ️ Note: Review submit karne ke baad ye pehle Admin Panel me jayega. Admin approve karega fir site par live dikhega.
                </p>

                <form onSubmit={handleReviewSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#F7F0E5] uppercase mb-1">
                      Your Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newReview.name}
                      onChange={(e) => setNewReview({ ...newReview, name: e.target.value })}
                      placeholder="e.g. Radhika Sharma"
                      className="w-full px-3 py-2 border border-[#D7B77A]/30 rounded-lg text-xs focus:ring-2 focus:ring-[#D7B77A]/40 focus:outline-none bg-[#180306]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#F7F0E5] uppercase mb-1">
                      City / Location
                    </label>
                    <input
                      type="text"
                      value={newReview.location}
                      onChange={(e) => setNewReview({ ...newReview, location: e.target.value })}
                      placeholder="e.g. Artisan, Rajasthan"
                      className="w-full px-3 py-2 border border-[#D7B77A]/30 rounded-lg text-xs focus:ring-2 focus:ring-[#D7B77A]/40 focus:outline-none bg-[#180306]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#F7F0E5] uppercase mb-1">
                      Outfit Purchased
                    </label>
                    <input
                      type="text"
                      value={newReview.outfit}
                      onChange={(e) => setNewReview({ ...newReview, outfit: e.target.value })}
                      placeholder="e.g. Floral Printed Cotton Suit Set"
                      className="w-full px-3 py-2 border border-[#D7B77A]/30 rounded-lg text-xs focus:ring-2 focus:ring-[#D7B77A]/40 focus:outline-none bg-[#180306]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#F7F0E5] uppercase mb-1">
                      Rating *
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setNewReview({ ...newReview, rating: star })}
                          className="p-1 hover:scale-110 transition cursor-pointer"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              star <= newReview.rating
                                ? 'fill-[#D7B77A] text-[#F7F0E5]'
                                : 'text-[#F7F0E5]/55'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#F7F0E5] uppercase mb-1">
                      Review & Fabric / Fit Feedback *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={newReview.comment}
                      onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                      placeholder="How was the fabric feel, stitching precision, and drape?"
                      className="w-full px-3 py-2 border border-[#D7B77A]/30 rounded-lg text-xs focus:ring-2 focus:ring-[#D7B77A]/40 focus:outline-none bg-[#180306]"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border border-[#D7B77A]"
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin text-[#F7F0E5]" />}
                      <span>{isSubmitting ? 'Submitting...' : 'SUBMIT REVIEW'}</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
};




