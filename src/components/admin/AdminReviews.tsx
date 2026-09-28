import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { 
  MessageSquare, 
  Star, 
  Check, 
  EyeOff, 
  Trash2, 
  Reply, 
  ShieldCheck, 
  MapPin, 
  X, 
  Save,
  Filter,
  Plus,
  Image as ImageIcon,
  Edit2,
  Calendar,
  User,
  ShoppingBag,
  CheckCircle
} from 'lucide-react';
import { Review } from '../../types';

export const AdminReviews: React.FC = () => {
  const { reviewsList = [], updateReviewStatus, updateReview, replyToReview, deleteReview, addReview } = useAdmin();
  const { showToast } = useShop();

  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Omit<Review, 'id'>>({
    userName: '',
    rating: 5,
    comment: '',
    productName: '',
    location: 'Artisan, India',
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    status: 'approved',
    verifiedPurchase: true,
    imageUrl: ''
  });

  const handleOpenReply = (review: Review) => {
    setReplyingReviewId(review.id);
    setReplyText(review.adminReply || '');
  };

  const handleSaveReply = (id: string) => {
    if (!replyText.trim()) {
      showToast('Reply text cannot be empty.', 'error');
      return;
    }
    replyToReview(id, replyText.trim());
    setReplyingReviewId(null);
    showToast('Admin response published to review.', 'success');
  };

  const handleAddNew = async () => {
    if (!formData.userName || !formData.comment) {
      showToast('Name and Review Comment are required.', 'error');
      return;
    }
    await addReview(formData);
    setIsAddingNew(false);
    resetForm();
    showToast('Custom verified review added successfully.', 'success');
  };

  const handleStartEdit = (review: Review) => {
    setEditingReviewId(review.id);
    setFormData({
      userName: review.userName,
      rating: review.rating,
      comment: review.comment,
      productName: review.productName || '',
      location: review.location || 'Artisan, India',
      date: review.date || '',
      status: review.status || 'approved',
      verifiedPurchase: review.verifiedPurchase ?? true,
      imageUrl: review.imageUrl || '',
      adminReply: review.adminReply || ''
    });
  };

  const handleUpdate = async () => {
    if (!editingReviewId) return;
    await updateReview(editingReviewId, formData);
    setEditingReviewId(null);
    resetForm();
    showToast('Review updated successfully.', 'success');
  };

  const resetForm = () => {
    setFormData({
      userName: '',
      rating: 5,
      comment: '',
      productName: '',
      location: 'Artisan, India',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: 'approved',
      verifiedPurchase: true,
      imageUrl: ''
    });
  };

  const filteredReviews = reviewsList.filter((r) => {
    if (selectedStatus === 'all') return true;
    return (r.status || 'approved') === selectedStatus;
  });

  return (
    <div id="admin-reviews-page" className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FAF7F2] p-5 rounded-2xl border border-rose-100 shadow-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B2635]">
            Social Proof & Feedback
          </span>
          <h2 className="font-serif text-2xl font-bold text-gray-900">
            Customer Reviews CMS ({reviewsList.length})
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-[#D8C8B8]/40 p-1 rounded-xl border border-rose-100 text-[11px] font-bold">
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                selectedStatus === 'all' ? 'bg-[#241D1B] text-[#211C1A] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedStatus('approved')}
              className={`px-3 py-1.5 rounded-lg transition ${
                selectedStatus === 'approved' ? 'bg-[#241D1B] text-[#211C1A] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setSelectedStatus('pending')}
              className={`px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 ${
                selectedStatus === 'pending' ? 'bg-[#241D1B] text-[#211C1A] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>Pending</span>
              {reviewsList.filter(r => (r.status || 'approved') === 'pending').length > 0 && (
                <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-amber-500 text-white animate-pulse">
                  {reviewsList.filter(r => (r.status || 'approved') === 'pending').length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => {
              resetForm();
              setIsAddingNew(true);
            }}
            className="px-4 py-2 bg-[#241D1B] text-[#211C1A] rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#8B2635] shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Insert Custom Review</span>
          </button>
        </div>
      </div>

      {/* Review Edit/Add Modal Overlay */}
      {(isAddingNew || editingReviewId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden border border-rose-100 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-[#241D1B] p-4 text-[#211C1A] flex items-center justify-between">
              <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                {isAddingNew ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                {isAddingNew ? 'Insert Custom Review' : 'Edit Review'}
              </h3>
              <button 
                onClick={() => {
                  setIsAddingNew(false);
                  setEditingReviewId(null);
                }} 
                className="p-1 hover:bg-white/20 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[80vh] space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <User className="w-3 h-3" /> Customer Name *
                  </label>
                  <input 
                    type="text"
                    value={formData.userName}
                    onChange={(e) => setFormData({...formData, userName: e.target.value})}
                    placeholder="e.g. Radhika Sharma"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-[#241D1B] outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" /> Location
                  </label>
                  <input 
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    placeholder="e.g. Mumbai, Maharashtra"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <ShoppingBag className="w-3 h-3" /> Outfit Name
                  </label>
                  <input 
                    type="text"
                    value={formData.productName}
                    onChange={(e) => setFormData({...formData, productName: e.target.value})}
                    placeholder="e.g. Sanganeri Print Cotton Suit"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Review Date
                  </label>
                  <input 
                    type="text"
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    placeholder="e.g. 15 Sep 2026"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <Star className="w-3 h-3" /> Rating (1-5)
                  </label>
                  <select 
                    value={formData.rating}
                    onChange={(e) => setFormData({...formData, rating: Number(e.target.value)})}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  >
                    {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} Stars</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" /> Verified Status
                  </label>
                  <select 
                    value={formData.verifiedPurchase ? 'yes' : 'no'}
                    onChange={(e) => setFormData({...formData, verifiedPurchase: e.target.value === 'yes'})}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="yes">Verified Buyer Badge</option>
                    <option value="no">Unverified</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                  <ImageIcon className="w-3 h-3" /> Photo URL (Verified Review Image)
                </label>
                <input 
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                  placeholder="Paste direct image link here (Unsplash, Cloudinary, etc.)"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                />
                {formData.imageUrl && (
                  <div className="mt-2 w-20 h-20 rounded-lg border border-gray-200 overflow-hidden">
                    <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Review Comment *</label>
                <textarea 
                  rows={3}
                  value={formData.comment}
                  onChange={(e) => setFormData({...formData, comment: e.target.value})}
                  placeholder="Write the customer's feedback here..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-[#241D1B] outline-none"
                />
              </div>

              <button 
                onClick={isAddingNew ? handleAddNew : handleUpdate}
                className="w-full py-3 bg-[#241D1B] text-[#211C1A] rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-[#8B2635] transition"
              >
                {isAddingNew ? 'Publish Verified Review' : 'Update Review Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviews List */}
      <div className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="bg-[#FAF7F2] p-12 rounded-2xl border border-rose-100 text-center text-gray-500">
            No reviews matching the selected filter.
          </div>
        ) : (
          filteredReviews.map((review) => {
            const currentStatus = review.status || 'approved';
            return (
              <div
                key={review.id}
                className="bg-[#FAF7F2] rounded-2xl border border-rose-100 p-5 sm:p-6 shadow-xs space-y-4"
              >
                {/* Top meta row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-gray-100 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#D8C8B8]/20 text-[#211C1A] font-bold flex items-center justify-center shrink-0">
                      {review.userName[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-900 text-sm">{review.userName}</h4>
                        {review.verifiedPurchase && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold flex items-center gap-0.5">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified Buyer
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {review.productName ? `Item: ${review.productName} • ` : ''}
                        {review.location || 'Artisan, India'} • {review.date}
                      </p>
                      
                      <div className="flex items-center text-black mt-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${i < review.rating ? 'fill-black text-black' : 'text-gray-200'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {review.imageUrl && (
                      <div className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                        <img src={review.imageUrl} alt="Review" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      currentStatus === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : currentStatus === 'pending'
                        ? 'bg-amber-100 text-black'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {currentStatus}
                    </span>
                  </div>
                </div>

                {/* Comment Body */}
                <p className="text-xs sm:text-sm text-gray-700 leading-relaxed italic bg-[#FFFDFC] p-3 rounded-xl border border-rose-50">
                  "{review.comment}"
                </p>

                {/* Existing Admin Response */}
                {review.adminReply && (
                  <div className="p-3.5 bg-[#D8C8B8]/60 rounded-xl border border-rose-100 text-xs space-y-1">
                    <span className="font-bold text-[#211C1A] flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                      <Reply className="w-3.5 h-3.5" /> Official Store Response:
                    </span>
                    <p className="text-gray-700">{review.adminReply}</p>
                  </div>
                )}

                {/* Reply Form */}
                {replyingReviewId === review.id && (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 text-xs">
                    <label className="block font-bold text-gray-800 uppercase text-[11px]">
                      Post Official Admin Response
                    </label>
                    <textarea
                      rows={2}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Thank the customer or address their query..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-[#FAF7F2]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setReplyingReviewId(null)}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveReply(review.id)}
                        className="px-4 py-1.5 bg-[#241D1B] text-[#211C1A] rounded-lg font-bold flex items-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" /> Publish Reply
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenReply(review)}
                      className="px-3 py-1.5 bg-[#D8C8B8]/20 hover:bg-[#D8C8B8]/40 text-[#211C1A] rounded-lg font-bold inline-flex items-center gap-1.5 transition"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>{review.adminReply ? 'Edit Response' : 'Reply'}</span>
                    </button>
                    <button
                      onClick={() => handleStartEdit(review)}
                      className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg font-bold inline-flex items-center gap-1.5 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Review</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {currentStatus !== 'approved' && (
                      <button
                        onClick={() => {
                          updateReviewStatus(review.id, 'approved');
                          showToast('Review approved for public display.', 'success');
                        }}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-bold inline-flex items-center gap-1 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    )}

                    {currentStatus !== 'hidden' && (
                      <button
                        onClick={() => {
                          updateReviewStatus(review.id, 'hidden');
                          showToast('Review hidden from storefront.', 'info');
                        }}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold inline-flex items-center gap-1 transition"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this review?')) {
                          deleteReview(review.id);
                          showToast('Review removed.', 'info');
                        }
                      }}
                      className="p-1.5 hover:bg-[#D8C8B8]/20 text-gray-400 hover:text-[#8B2635] rounded-lg transition"
                      title="Delete Review"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
