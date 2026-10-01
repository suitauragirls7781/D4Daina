import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import {
  MessageSquare,
  Search,
  Filter,
  Download,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  Trash2,
  Users,
  Zap
} from 'lucide-react';
import { Lead } from '../../types';

export const AdminLeads: React.FC = () => {
  const { leads, updateLeadOfferStatus, deleteLead } = useAdmin();
  const { showToast } = useShop();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'newsletter' | 'contact' | 'direct'>('all');

  const filteredLeads = leads.filter(lead => {
    const matchesSearch =
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.name && lead.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.phone && lead.phone.includes(searchTerm));

    const matchesSource = filterSource === 'all' || lead.source === filterSource;

    return matchesSearch && matchesSource;
  });

  const handleSendWhatsAppOffer = (lead: Lead) => {
    if (!lead.phone) {
      alert('This lead does not have a phone number.');
      return;
    }

    const cleanPhone = lead.phone.replace(/\D/g, '');
    const message = `Namaste ${lead.name || ''}! Thank you for showing interest in Suit Aura Girls. Browse our latest collection here: https://www.suitauragirls.in`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    updateLeadOfferStatus(lead.id, true).catch(() => showToast('Could not mark the offer as sent.', 'error'));
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const exportLeadsCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Email,Name,Phone,Source,Date,Offer Sent\n"
      + leads.map(l => `${l.email},${l.name || ''},${l.phone || ''},${l.source},${l.createdAt},${l.offerSent ? 'Yes' : 'No'}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sag_leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  const sourceBadge = (source: string) => (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${
      source === 'newsletter' ? 'bg-[#F3EEF8] text-[#4B1D3F]' :
      source === 'contact' ? 'bg-[#E6DDF0] text-[#4B1D3F]' :
      'bg-[#FBF7F3] border border-[#4B1D3F]/10 text-[#2A1A26]/75'
    }`}>
      {source}
    </span>
  );

  const statusBadge = (lead: Lead) => lead.offerSent ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
      <CheckCircle2 className="w-3.5 h-3.5" />
      Offer Sent
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FBF7F3] border border-[#C5A46D]/60 text-[#2A1A26]/80 text-[11px] font-semibold">
      <Clock className="w-3.5 h-3.5" />
      Pending
    </span>
  );

  const actions = (lead: Lead) => (
    <div className="flex items-center justify-end gap-2">
      {lead.phone && (
        <button
          onClick={() => handleSendWhatsAppOffer(lead)}
          className={`h-9 flex items-center gap-2 px-3.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            lead.offerSent
              ? 'bg-white border border-[#4B1D3F]/20 text-[#4B1D3F] hover:bg-[#F3EEF8]'
              : 'bg-[#4B1D3F] text-white hover:bg-[#3B1532]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{lead.offerSent ? 'Resend Offer' : 'Send WhatsApp Offer'}</span>
        </button>
      )}
      <button
        onClick={() => { if (window.confirm('Delete this lead?')) deleteLead(lead.id).then(() => showToast('Lead deleted.', 'info')).catch(() => showToast('Could not delete the lead.', 'error')); }}
        className="w-9 h-9 flex items-center justify-center text-[#2A1A26]/45 hover:text-rose-700 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
        title="Delete lead"
        aria-label="Delete lead"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  const stats = [
    { label: 'Total Leads', value: leads.length, icon: Users, tone: 'bg-[#F3EEF8] text-[#4B1D3F]' },
    { label: 'Offers Sent', value: leads.filter(l => l.offerSent).length, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Pending Conversion', value: leads.filter(l => !l.offerSent).length, icon: Zap, tone: 'bg-[#FBF7F3] border border-[#C5A46D]/40 text-[#9C7A45]' },
  ];

  return (
    <div className="space-y-5">
      {/* Header section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9C7A45]">Audience</p>
          <h2 className="mt-1 text-3xl sm:text-4xl font-serif font-semibold text-[#4B1D3F] leading-tight">Real-time Captured Leads</h2>
          <p className="text-sm text-[#2A1A26]/60 mt-1">Manage and convert newsletter subscribers & contact inquiries.</p>
        </div>
        <button
          className="self-start lg:self-auto h-10 flex items-center gap-2 px-4 bg-white border border-[#4B1D3F]/20 rounded-full text-[13px] font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer"
          onClick={exportLeadsCsv}
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-3.5 sm:p-5 rounded-2xl border border-[#4B1D3F]/10 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 ${stat.tone}`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#2A1A26]/55 uppercase tracking-[0.12em] leading-tight">{stat.label}</p>
              <h3 className="text-2xl font-serif font-semibold text-[#2A1A26] tabular-nums">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-3xl border border-[#4B1D3F]/10 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4B1D3F]/50" />
          <input
            type="text"
            placeholder="Search leads by name, email or phone..."
            className="w-full h-11 pl-11 pr-4 bg-[#FBF7F3] border border-[#4B1D3F]/15 rounded-full text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#4B1D3F]/10 focus:border-[#4B1D3F]/40 transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative w-full sm:w-56">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4B1D3F]/50 pointer-events-none" />
          <select
            className="w-full h-11 pl-10 pr-4 bg-white border border-[#4B1D3F]/15 rounded-full text-sm text-[#2A1A26] focus:outline-none focus:ring-4 focus:ring-[#4B1D3F]/10 focus:border-[#4B1D3F]/40 cursor-pointer"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as any)}
          >
            <option value="all">All Sources</option>
            <option value="newsletter">Newsletter</option>
            <option value="contact">Contact Form</option>
            <option value="direct">Direct</option>
          </select>
        </div>
      </div>

      {filteredLeads.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#4B1D3F]/10 py-14 px-6 text-center">
          <span className="mx-auto w-14 h-14 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center mb-3"><MessageSquare className="w-6 h-6" /></span>
          <p className="text-sm font-medium text-[#2A1A26]/65">No leads found matching your criteria.</p>
        </div>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="md:hidden space-y-3">
            {filteredLeads.map((lead) => (
              <li key={lead.id} className="bg-white rounded-2xl border border-[#4B1D3F]/10 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#2A1A26] truncate">{lead.name || 'Anonymous Lead'}</p>
                    <p className="text-[12px] text-[#2A1A26]/55 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(lead.createdAt)}</p>
                  </div>
                  {sourceBadge(lead.source)}
                </div>
                <div className="space-y-1 text-[13px] text-[#2A1A26]/75">
                  <p className="flex items-center gap-2 break-all"><Mail className="w-3.5 h-3.5 shrink-0 text-[#4B1D3F]/50" />{lead.email}</p>
                  {lead.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 shrink-0 text-[#4B1D3F]/50" />{lead.phone}</p>}
                </div>
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#4B1D3F]/[0.08]">
                  {statusBadge(lead)}
                  {actions(lead)}
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <div className="hidden md:block bg-white rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] overflow-hidden">
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#FBF7F3] border-b border-[#4B1D3F]/10 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/55">
                    <th className="pl-5 pr-3 py-3.5 font-semibold">Lead Info</th>
                    <th className="px-3 py-3.5 font-semibold">Source</th>
                    <th className="px-3 py-3.5 font-semibold">Captured At</th>
                    <th className="px-3 py-3.5 font-semibold">Status</th>
                    <th className="pl-3 pr-5 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#4B1D3F]/[0.06]">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-[#FBF7F3] transition-colors">
                      <td className="pl-5 pr-3 py-4">
                        <p className="text-sm font-semibold text-[#2A1A26]">{lead.name || 'Anonymous Lead'}</p>
                        <div className="mt-1 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-[12px] text-[#2A1A26]/60">
                            <Mail className="w-3.5 h-3.5 text-[#4B1D3F]/45" />
                            {lead.email}
                          </div>
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-[12px] text-[#2A1A26]/60">
                              <Phone className="w-3.5 h-3.5 text-[#4B1D3F]/45" />
                              {lead.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4">{sourceBadge(lead.source)}</td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-1.5 text-[12px] text-[#2A1A26]/60 whitespace-nowrap">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(lead.createdAt)}
                        </div>
                      </td>
                      <td className="px-3 py-4">{statusBadge(lead)}</td>
                      <td className="pl-3 pr-5 py-4 text-right">{actions(lead)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
