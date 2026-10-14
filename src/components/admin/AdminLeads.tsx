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
  Trash2
} from 'lucide-react';
import { Lead } from '../../types';
import { EmptyState, KeyNumbers, PageTitle, Pill, adminUi } from './PaymentBadge';

const SOURCE_LABEL: Record<string, string> = { newsletter: 'Newsletter', contact: 'Contact form', direct: 'Direct' };

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
  // The ones not messaged yet come first; inside each group the order stays as it was
  const shownLeads = [...filteredLeads].sort((a, b) => Number(Boolean(a.offerSent)) - Number(Boolean(b.offerSent)));

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
    // Every value quoted, so a name or message with a comma or quote stays in its own column; only the leads shown are exported
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [['Email', 'Name', 'Phone', 'Source', 'Date', 'Offer Sent'].map(cell).join(',')]
      .concat(shownLeads.map((l) => [l.email, l.name || '', l.phone || '', SOURCE_LABEL[l.source] || l.source, l.createdAt, l.offerSent ? 'Yes' : 'No'].map(cell).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sag_leads_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const sourceBadge = (source: string) => (
    <Pill tone={source === 'direct' ? 'muted' : 'plain'} className="shrink-0">
      {SOURCE_LABEL[source] || source}
    </Pill>
  );

  const statusBadge = (lead: Lead) => lead.offerSent ? (
    <Pill tone="muted">
      <CheckCircle2 className="w-3.5 h-3.5" />
      Message sent
    </Pill>
  ) : (
    <Pill tone="good">
      <Clock className="w-3.5 h-3.5" />
      Not messaged yet
    </Pill>
  );

  const actions = (lead: Lead) => (
    <div className="flex items-center justify-end gap-1.5">
      {lead.phone && (
        <button
          onClick={() => handleSendWhatsAppOffer(lead)}
          className={lead.offerSent ? adminUi.outlineSmall : adminUi.primarySmall}
        >
          <MessageSquare className="w-4 h-4" />
          <span>{lead.offerSent ? 'Message again' : 'Message on WhatsApp'}</span>
        </button>
      )}
      <button
        onClick={() => { if (window.confirm('Delete this lead?')) deleteLead(lead.id).then(() => showToast('Lead deleted.', 'info')).catch(() => showToast('Could not delete the lead.', 'error')); }}
        className="w-11 h-11 md:w-10 md:h-10 shrink-0 flex items-center justify-center text-danger hover:bg-danger-tint rounded-full transition-colors cursor-pointer"
        title="Delete lead"
        aria-label="Delete lead"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  const waiting = leads.filter(l => !l.offerSent).length;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Leads"
        line="People who joined the newsletter or wrote through the contact form. Message them from your own WhatsApp."
        actions={
          <button className={`${adminUi.outline} flex-1 sm:flex-none`} onClick={exportLeadsCsv}>
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        }
      />

      <KeyNumbers
        label="Leads at a glance"
        items={[
          { label: 'Not messaged', value: waiting, highlight: waiting > 0, note: waiting ? 'Waiting to hear from you' : 'Everyone was messaged' },
          { label: 'Messaged', value: leads.filter(l => l.offerSent).length, note: 'You opened WhatsApp for them' },
          { label: 'All leads', value: leads.length, note: 'Everyone who left their details' },
        ]}
      />

      {/* Search and source */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-muted pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            aria-label="Search leads"
            placeholder="Search by name, email or phone"
            className={adminUi.search}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative w-full sm:w-56">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-muted pointer-events-none" />
          <select
            aria-label="Filter by source"
            className={`${adminUi.select} pl-10`}
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

      {shownLeads.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title={leads.length === 0 ? 'No leads yet' : 'No lead matches your search'}
          line={leads.length === 0 ? 'Newsletter sign-ups and contact messages appear here.' : undefined}
        />
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="md:hidden space-y-2.5">
            {shownLeads.map((lead) => (
              <li key={lead.id} className="sag-card p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] leading-5 font-semibold text-ink truncate">{lead.name || 'No name given'}</p>
                    <p className="text-xs leading-4 text-ink-muted">{formatDate(lead.createdAt)}</p>
                  </div>
                  {sourceBadge(lead.source)}
                </div>
                <div className="space-y-1 text-sm leading-5 text-ink">
                  <p className="flex items-center gap-2.5 break-all"><Mail className="w-4 h-4 shrink-0 text-ink-muted" />{lead.email}</p>
                  {lead.phone && <p className="flex items-center gap-2.5 sag-num"><Phone className="w-4 h-4 shrink-0 text-ink-muted" />{lead.phone}</p>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-line">
                  {statusBadge(lead)}
                  {actions(lead)}
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <div className={`hidden md:block ${adminUi.panelFlush}`}>
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="w-full text-left text-[13px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={`${adminUi.th} pl-5`}>Lead</th>
                    <th className={adminUi.th}>Source</th>
                    <th className={adminUi.th}>Received</th>
                    <th className={adminUi.th}>Status</th>
                    <th className={`${adminUi.th} pr-5 text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td]:border-b [&>tr>td]:border-line [&>tr:last-child>td]:border-b-0">
                  {shownLeads.map((lead) => (
                    <tr key={lead.id} className={adminUi.row}>
                      <td className={`${adminUi.td} pl-5`}>
                        <p className="text-sm font-semibold text-ink">{lead.name || 'No name given'}</p>
                        <div className="mt-0.5 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                            <Mail className="w-3.5 h-3.5" />
                            {lead.email}
                          </div>
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-ink-muted sag-num">
                              <Phone className="w-3.5 h-3.5" />
                              {lead.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={adminUi.td}>{sourceBadge(lead.source)}</td>
                      <td className={`${adminUi.td} text-ink-muted whitespace-nowrap`}>{formatDate(lead.createdAt)}</td>
                      <td className={adminUi.td}>{statusBadge(lead)}</td>
                      <td className={`${adminUi.td} pr-5 text-right`}>{actions(lead)}</td>
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
