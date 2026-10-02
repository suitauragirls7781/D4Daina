import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import {
  ShoppingBag,
  Search,
  Filter,
  Eye,
  Truck,
  CheckCircle2,
  Clock,
  CreditCard,
  User,
  MapPin,
  IndianRupee,
  Calendar,
  Phone,
  Mail,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { Order, AdminOrderStatus } from '../../types';
import { RETURN_STATUS_LABEL, isReturnOpen, returnRequestOf, returnStatusOf } from '../OrderProgress';
import { PaymentBadge, orderStatusTone } from './PaymentBadge';
import { formatOrderDate } from '../../utils/orderDate';

/** Filter value for orders that have a return / exchange request (open ones first in the badge count). */
const RETURNS_FILTER = '__returns';

const ORDER_STATUSES: AdminOrderStatus[] = [
  'Pending',
  'Processing',
  'Packed',
  'Shipped',
  'In Transit',
  'Out for Delivery',
  'Delivered',
  'Returned',
  'Cancelled',
  'Refund Requested',
  'Refunded',
];

export const AdminOrders: React.FC = () => {
  const { orders = [], updateOrderStatus } = useAdmin();
  const { showToast } = useShop();
  const { openAdminOrderDetails } = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  // Checkout attempts that were never paid are hidden unless asked for.
  const [showUnpaid, setShowUnpaid] = useState(false);

  const changeStatus = async (order: Order, next: AdminOrderStatus) => {
    if (next === 'Cancelled' && !window.confirm(`Cancel order ${order.orderNumber}? Its stock will be returned to inventory.`)) return;
    try {
      await updateOrderStatus(order.orderNumber, next);
      showToast(`Order ${order.orderNumber} updated to ${next}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update the order.', 'error');
    }
  };

  const getStatusBadge = (status: AdminOrderStatus) => orderStatusTone(status).badge;

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerMobile.includes(searchQuery);

    // Returns filter: every order with a request, including the oldest ones saved only as the status 'Refund Requested'.
    const matchesStatus = selectedStatus === 'All'
      || (selectedStatus === RETURNS_FILTER ? returnStatusOf(order) !== null : order.status === selectedStatus);
    const isUnpaidAttempt = order.paymentStatus === 'Unpaid' && order.status === 'Pending';

    return matchesSearch && matchesStatus && (showUnpaid || !isUnpaidAttempt);
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const unpaidCount = orders.filter((order) => order.paymentStatus === 'Unpaid' && order.status === 'Pending').length;
  const cancelRequestCount = orders.filter((order) => order.cancelRequest && !order.cancelRequest.handledAt).length;
  const openReturnCount = orders.filter((order) => isReturnOpen(order)).length;

  const quickFilters: { value: string; label: string }[] = [
    { value: 'All', label: 'All' },
    { value: 'Processing', label: 'Processing' },
    { value: 'Packed', label: 'Packed' },
    { value: 'Shipped', label: 'Shipped' },
    { value: 'Delivered', label: 'Delivered' },
    { value: RETURNS_FILTER, label: 'Returns' },
    { value: 'Cancelled', label: 'Cancelled' },
  ];

  const statusSelectClass = (order: Order) =>
    `h-8 text-[12px] font-semibold border rounded-full pl-3 pr-7 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/20 ${getStatusBadge(order.status)}`;

  const renderFlags = (order: Order) => (
    <>
      {order.cancelRequest && !order.cancelRequest.handledAt && (
        <span className="mt-1.5 block w-fit px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold">Cancel requested</span>
      )}
      {(() => {
        const state = returnStatusOf(order);
        if (!state) return null;
        const kind = returnRequestOf(order)?.type === 'exchange' ? 'Exchange' : 'Return';
        return (
          <span className={`mt-1.5 block w-fit px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${isReturnOpen(order) ? 'bg-[#F7E4EA] border-[#8A2E55]/20 text-[#8A2E55]' : 'bg-[#F3EEF8] border-[#4B1D3F]/10 text-[#4B1D3F]/80'}`}>
            {kind}: {RETURN_STATUS_LABEL[state].toLowerCase()}
          </span>
        );
      })()}
    </>
  );

  const testBadge = <span className="mt-1.5 block w-fit whitespace-nowrap px-2.5 py-0.5 rounded-full bg-[#FBF7F3] border border-[#C5A46D]/60 text-[#2A1A26]/80 text-[11px] font-semibold">Test payment</span>;

  return (
    <div id="admin-orders-page" className="space-y-5">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9C7A45]">
            Fulfillment & Shipments
          </span>
          <h2 className="mt-1 font-serif text-3xl sm:text-4xl font-semibold text-[#4B1D3F] leading-tight">
            Order Management <span className="text-[#2A1A26]/35 font-sans text-xl align-middle tabular-nums">({orders.length - unpaidCount})</span>
          </h2>
          <p className="mt-1 text-sm text-[#2A1A26]/60">Track purchase transactions, shipment packages, and prepaid status updates</p>
          {(cancelRequestCount > 0 || openReturnCount > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {cancelRequestCount > 0 && (
                <p role="status" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[12px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                  {cancelRequestCount} cancellation {cancelRequestCount === 1 ? 'request' : 'requests'} waiting. Open the order to cancel or keep it.
                </p>
              )}
              {openReturnCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedStatus(RETURNS_FILTER)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F7E4EA] border border-[#8A2E55]/20 text-[#8A2E55] text-[12px] font-semibold cursor-pointer hover:bg-[#F7E4EA]/70 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8A2E55]" />
                  {openReturnCount} return / exchange {openReturnCount === 1 ? 'request' : 'requests'} open. Show them
                </button>
              )}
            </div>
          )}
        </div>

        <label className="self-start lg:self-auto h-10 px-4 bg-white border border-[#4B1D3F]/15 text-[#2A1A26]/80 text-[13px] font-semibold rounded-full flex items-center gap-2 cursor-pointer hover:border-[#4B1D3F]/30 transition-colors shrink-0">
          <input type="checkbox" checked={showUnpaid} onChange={(e) => setShowUnpaid(e.target.checked)} className="w-4 h-4 accent-[#4B1D3F]" />
          <span>Show unpaid checkout attempts ({unpaidCount})</span>
        </label>
      </div>

      {/* Filter & Search */}
      <div className="bg-white p-3 sm:p-4 rounded-3xl border border-[#4B1D3F]/10 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-8 relative">
            <input
              type="text"
              placeholder="Search by order ID (SAG-...), customer name, email, or mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-11 pr-4 border border-[#4B1D3F]/15 bg-[#FBF7F3] rounded-full text-sm focus:outline-none focus:bg-white focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 text-[#2A1A26] placeholder:text-[#2A1A26]/40 transition"
            />
            <Search className="w-4 h-4 text-[#4B1D3F]/50 absolute left-4 top-1/2 -translate-y-1/2" />
          </div>

          <div className="sm:col-span-4 relative">
            <Filter className="w-4 h-4 text-[#4B1D3F]/50 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-11 pl-10 pr-4 border border-[#4B1D3F]/15 rounded-full text-sm bg-white text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/40 focus:ring-4 focus:ring-[#4B1D3F]/10 cursor-pointer"
            >
              <option value="All">All Order Statuses</option>
              <option value={RETURNS_FILTER}>Returns &amp; exchanges{openReturnCount ? ` (${openReturnCount} open)` : ''}</option>
              {ORDER_STATUSES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto sag-scroll-x -mx-1 px-1 pb-0.5">
          {quickFilters.map((f) => {
            const active = selectedStatus === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setSelectedStatus(f.value)}
                className={`h-8 px-3.5 rounded-full text-[12px] font-semibold whitespace-nowrap border transition-colors cursor-pointer ${active ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/15 text-[#2A1A26]/75 hover:bg-[#F3EEF8] hover:text-[#4B1D3F]'}`}
                aria-pressed={active}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[12px] text-[#2A1A26]/55 px-1">
        Showing <span className="font-semibold text-[#2A1A26]">{filteredOrders.length}</span> {filteredOrders.length === 1 ? 'order' : 'orders'}
      </p>

      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#4B1D3F]/10 py-14 px-6 text-center">
          <span className="mx-auto w-14 h-14 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center mb-4"><ShoppingBag className="w-6 h-6" /></span>
          <p className="font-serif text-xl font-semibold text-[#2A1A26]">No orders match your filter criteria.</p>
          <p className="text-[13px] text-[#2A1A26]/55 mt-1">Try a different search or status filter.</p>
          {(searchQuery || selectedStatus !== 'All') && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSelectedStatus('All'); }}
              className="mt-4 h-10 px-5 rounded-full border border-[#4B1D3F]/20 text-[13px] font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Phone: order cards */}
          <ul className="md:hidden space-y-3">
            {filteredOrders.map((order) => (
              <li
                key={order.orderNumber}
                className="bg-white rounded-2xl border border-[#4B1D3F]/10 p-4 cursor-pointer active:bg-[#FBF7F3]"
                onClick={() => openAdminOrderDetails(order.orderNumber)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-semibold text-[#4B1D3F] truncate">{order.orderNumber}</p>
                    <p className="text-[12px] text-[#2A1A26]/55">{formatOrderDate(order.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-semibold text-[#2A1A26] tabular-nums">₹{order.finalTotal.toLocaleString('en-IN')}</p>
                    <p className="text-[12px] text-[#2A1A26]/55">{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[#4B1D3F]/[0.08]">
                  <p className="text-sm font-semibold text-[#2A1A26] truncate">{order.customerName}</p>
                  <p className="text-[12px] text-[#2A1A26]/55 truncate">{order.customerEmail} · +91 {order.customerMobile}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <PaymentBadge order={order} />
                  <select
                    value={order.status}
                    onChange={(e) => changeStatus(order, e.target.value as AdminOrderStatus)}
                    className={statusSelectClass(order)}
                    aria-label={`Order status for ${order.orderNumber}`}
                  >
                    {ORDER_STATUSES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap gap-x-2">
                  {order.testPayment && testBadge}
                  {renderFlags(order)}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#2A1A26]/50 font-mono uppercase truncate">
                    {order.paymentMethod} {order.paymentRef ? `• ${order.paymentRef}` : ''}
                  </span>
                  <span className="text-[12px] font-semibold text-[#4B1D3F] inline-flex items-center gap-1 shrink-0">
                    <Eye className="w-3.5 h-3.5" /> View
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <div className="hidden md:block bg-white rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] overflow-hidden">
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#FBF7F3] border-b border-[#4B1D3F]/10 text-[11px] text-[#2A1A26]/55 uppercase tracking-[0.12em]">
                    <th className="py-3.5 pl-5 pr-3 font-semibold">Order ID</th>
                    <th className="py-3.5 px-3 font-semibold">Date</th>
                    <th className="py-3.5 px-3 font-semibold">Customer</th>
                    <th className="py-3.5 px-3 font-semibold">Amount</th>
                    <th className="py-3.5 px-3 font-semibold">Payment Status</th>
                    <th className="py-3.5 px-3 font-semibold">Order Status</th>
                    <th className="py-3.5 pl-3 pr-5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#4B1D3F]/[0.06]">
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.orderNumber}
                      className="hover:bg-[#FBF7F3] transition-colors cursor-pointer align-top"
                      onClick={() => openAdminOrderDetails(order.orderNumber)}
                    >

                      {/* 1. Order ID */}
                      <td className="py-4 pl-5 pr-3 font-mono font-semibold text-[#4B1D3F] whitespace-nowrap">
                        <span className="hover:underline underline-offset-2">{order.orderNumber}</span>
                      </td>

                      {/* 2. Date */}
                      <td className="py-4 px-3 text-[#2A1A26]/65 text-[12px] whitespace-nowrap">
                        {formatOrderDate(order.date)}
                      </td>

                      {/* 3. Customer */}
                      <td className="py-4 px-3 max-w-[220px]">
                        <p className="font-semibold text-[#2A1A26] truncate">{order.customerName}</p>
                        <p className="text-[12px] text-[#2A1A26]/55 truncate">{order.customerEmail}</p>
                        <p className="text-[12px] text-[#2A1A26]/45">+91 {order.customerMobile}</p>
                      </td>

                      {/* 4. Amount */}
                      <td className="py-4 px-3 font-semibold text-[#2A1A26] text-sm tabular-nums whitespace-nowrap">
                        ₹{order.finalTotal.toLocaleString('en-IN')}
                        <span className="block text-[12px] font-normal text-[#2A1A26]/50">
                          {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                        </span>
                      </td>

                      {/* 5. Payment Status */}
                      <td className="py-4 px-3" onClick={(e) => e.stopPropagation()}>
                        <PaymentBadge order={order} />
                        {order.testPayment && testBadge}
                        <span className="block text-[11px] text-[#2A1A26]/50 font-mono mt-1.5 uppercase">
                          {order.paymentMethod} {order.paymentRef ? `• ${order.paymentRef}` : ''}
                        </span>
                      </td>

                      {/* 6. Order Status */}
                      <td className="py-4 px-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={order.status}
                          onChange={(e) => changeStatus(order, e.target.value as AdminOrderStatus)}
                          className={statusSelectClass(order)}
                          aria-label={`Order status for ${order.orderNumber}`}
                        >
                          {ORDER_STATUSES.map((st) => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                        {renderFlags(order)}
                      </td>

                      {/* 7. Action */}
                      <td className="py-4 pl-3 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openAdminOrderDetails(order.orderNumber)}
                          className="h-8 px-3.5 bg-white hover:bg-[#4B1D3F] hover:text-white text-[#4B1D3F] border border-[#4B1D3F]/20 hover:border-[#4B1D3F] rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="View Full Order Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>

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
