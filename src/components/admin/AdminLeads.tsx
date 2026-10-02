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
import { AdminPageHeader, tone, ui } from './kidsToysShared';

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
    <span className={`shrink-0 capitalize ${ui.badge} ${source === 'direct' ? tone.muted : tone.neutral}`}>
      {source}
    </span>
  );

  const statusBadge = (lead: Lead) => lead.offerSent ? (
    <span className={`${ui.badge} ${tone.ok}`}>
      <CheckCircle2 className="w-3.5 h-3.5" />
      Message sent
    </span>
  ) : (
    <span className={`${ui.badge} ${tone.warn}`}>
      <Clock className="w-3.5 h-3.5" />
      Not messaged yet
    </span>
  );

  const actions = (lead: Lead) => (
    <div className="flex items-center justify-end gap-1.5">
      {lead.phone && (
        <button
          onClick={() => handleSendWhatsAppOffer(lead)}
          className={`${lead.offerSent ? ui.outline : ui.primary} whitespace-nowrap`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>{lead.offerSent ? 'Message again' : 'Message on WhatsApp'}</span>
        </button>
      )}
      <button
        onClick={() => { if (window.confirm('Delete this lead?')) deleteLead(lead.id).then(() => showToast('Lead deleted.', 'info')).catch(() => showToast('Could not delete the lead.', 'error')); }}
        className="w-11 h-11 md:w-9 md:h-9 shrink-0 flex items-center justify-center text-danger hover:bg-danger-tint rounded-full transition-colors cursor-pointer"
        title="Delete lead"
        aria-label="Delete lead"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  const stats = [
    { label: 'All leads', value: leads.length },
    { label: 'Messaged', value: leads.filter(l => l.offerSent).length },
    { label: 'Not messaged', value: leads.filter(l => !l.offerSent).length },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="Sales"
        title="Leads"
        icon={<MessageSquare />}
        description="People who joined the newsletter or wrote through the contact form. Message them from your own WhatsApp."
        actions={
          <button className={`${ui.outline} flex-1 sm:flex-none`} onClick={exportLeadsCsv}>
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        }
      />

      <dl className="grid grid-cols-3 gap-2.5">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 bg-white rounded-2xl border border-line px-3 py-2.5 sm:px-4">
            <dt className={ui.eyebrow}>{stat.label}</dt>
            <dd className={ui.stat}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      {/* Search and source */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-muted pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            aria-label="Search leads"
            placeholder="Search by name, email or phone"
            className={ui.search}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative w-full sm:w-56">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-muted pointer-events-none" />
          <select
            aria-label="Filter by source"
            className={`${ui.select} pl-10`}
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as any)}
          >
            <option value="all">All sources</option>
            <option value="newsletter">Newsletter</option>
            <option value="contact">Contact form</option>
            <option value="direct">Direct</option>
          </select>
        </div>
      </div>

      {filteredLeads.length === 0 ? (
        <div className={ui.empty}>
          <MessageSquare className="mx-auto w-6 h-6 text-ink-muted mb-2" aria-hidden="true" />
          <p className="text-sm leading-5 text-ink-muted">{leads.length === 0 ? 'No leads yet. Newsletter sign-ups and contact messages appear here.' : 'No lead matches your search.'}</p>
        </div>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="md:hidden space-y-2.5">
            {filteredLeads.map((lead) => (
              <li key={lead.id} className="bg-white rounded-2xl border border-line p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] leading-5 font-semibold text-ink truncate">{lead.name || 'No name given'}</p>
                    <p className="text-xs leading-4 text-ink-muted">{formatDate(lead.createdAt)}</p>
                  </div>
                  {sourceBadge(lead.source)}
                </div>
                <div className="space-y-1 text-sm leading-5 text-ink">
                  <p className="flex items-center gap-2.5 break-all"><Mail className="w-4 h-4 shrink-0 text-ink-muted" />{lead.email}</p>
                  {lead.phone && <p className="flex items-center gap-2.5"><Phone className="w-4 h-4 shrink-0 text-ink-muted" />{lead.phone}</p>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-line">
                  {statusBadge(lead)}
                  {actions(lead)}
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <div className={`hidden md:block ${ui.panel}`}>
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className={ui.thead}>
                    <th className="pl-5 pr-3 py-2.5 font-semibold">Lead</th>
                    <th className="px-3 py-2.5 font-semibold">Source</th>
                    <th className="px-3 py-2.5 font-semibold">Received</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="pl-3 pr-5 py-2.5 font-semibold text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-page transition-colors">
                      <td className="pl-5 pr-3 py-3">
                        <p className="text-sm font-semibold text-ink">{lead.name || 'No name given'}</p>
                        <div className="mt-0.5 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                            <Mail className="w-3.5 h-3.5" />
                            {lead.email}
                          </div>
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                              <Phone className="w-3.5 h-3.5" />
                              {lead.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">{sourceBadge(lead.source)}</td>
                      <td className="px-3 py-3 text-ink-muted whitespace-nowrap">{formatDate(lead.createdAt)}</td>
                      <td className="px-3 py-3">{statusBadge(lead)}</td>
                      <td className="pl-3 pr-5 py-3 text-right">{actions(lead)}</td>
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
