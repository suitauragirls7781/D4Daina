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
import { AlertCircle, ChevronRight, RotateCcw } from 'lucide-react';
import { AdminPageHeader, tone, ui } from './kidsToysShared';

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

  // 44px tall on a phone so the status is easy to change with a thumb; compact in the desktop table
  const statusSelectClass = (order: Order) =>
    `h-11 md:h-9 max-w-full text-[13px] font-semibold border rounded-[10px] pl-2.5 pr-7 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand ${getStatusBadge(order.status)}`;

  const renderFlags = (order: Order) => (
    <>
      {order.cancelRequest && !order.cancelRequest.handledAt && (
        <span className={`mt-1.5 w-fit ${ui.badge} ${tone.danger}`}>Cancel requested</span>
      )}
      {(() => {
        const state = returnStatusOf(order);
        if (!state) return null;
        const kind = returnRequestOf(order)?.type === 'exchange' ? 'Exchange' : 'Return';
        return (
          <span className={`mt-1.5 w-fit ${ui.badge} ${isReturnOpen(order) ? tone.warn : tone.muted}`}>
            {kind}: {RETURN_STATUS_LABEL[state].toLowerCase()}
          </span>
        );
      })()}
    </>
  );

  const testBadge = <span className={`mt-1.5 w-fit whitespace-nowrap ${ui.badge} ${tone.muted}`}>Test payment</span>;
  const paymentLine = (order: Order) => `${order.paymentMethod || ''}${order.paymentRef ? ` · ${order.paymentRef}` : ''}`;

  return (
    <div id="admin-orders-page" className="space-y-4">

      <AdminPageHeader
        eyebrow="Sales"
        title={<>Order Management <span className="text-ink-muted font-normal tabular-nums">({orders.length - unpaidCount})</span></>}
        icon={<ShoppingBag />}
        description="Paid orders, newest first. Change a status here, or open an order to add tracking and message the customer."
      />

      {(cancelRequestCount > 0 || openReturnCount > 0) && (
        <div className="space-y-2">
          {cancelRequestCount > 0 && (
            <p role="status" className="px-3.5 py-2.5 rounded-xl bg-danger-tint border border-danger-line text-danger text-sm leading-5 font-semibold flex items-start gap-2">
              <AlertCircle className="w-[18px] h-[18px] mt-px shrink-0" aria-hidden="true" />
              <span>{cancelRequestCount} cancellation {cancelRequestCount === 1 ? 'request' : 'requests'} waiting. Open the order to cancel or keep it.</span>
            </p>
          )}
          {openReturnCount > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStatus(RETURNS_FILTER)}
              className="w-full min-h-11 px-3.5 py-2.5 rounded-xl bg-sale-tint border border-sale-line text-sale text-sm leading-5 font-semibold flex items-center gap-2 text-left cursor-pointer"
            >
              <RotateCcw className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
              <span className="flex-1">{openReturnCount} return / exchange {openReturnCount === 1 ? 'request' : 'requests'} open. Show them</span>
              <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Search and filters */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-8 relative">
            <input
              type="text"
              inputMode="search"
              aria-label="Search orders"
              placeholder="Order ID, name, email or mobile"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={ui.search}
            />
            <Search className="w-[18px] h-[18px] text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="sm:col-span-4 relative">
            <Filter className="w-[18px] h-[18px] text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="Filter by order status"
              className={`${ui.select} pl-10`}
            >
              <option value="All">All order statuses</option>
              <option value={RETURNS_FILTER}>Returns &amp; exchanges{openReturnCount ? ` (${openReturnCount} open)` : ''}</option>
              {ORDER_STATUSES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto sag-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
          {quickFilters.map((f) => {
            const active = selectedStatus === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setSelectedStatus(f.value)}
                className={`${ui.chip(active)} shrink-0 whitespace-nowrap`}
                aria-pressed={active}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] leading-[18px] text-ink-muted">
          Showing <span className="font-semibold text-ink tabular-nums">{filteredOrders.length}</span> {filteredOrders.length === 1 ? 'order' : 'orders'}
        </p>
        <label className="min-h-11 text-[13px] leading-[18px] text-ink flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={showUnpaid} onChange={(e) => setShowUnpaid(e.target.checked)} className="w-[22px] h-[22px] rounded-md accent-brand" />
          <span>Show unpaid checkout attempts ({unpaidCount})</span>
        </label>
      </div>

      {filteredOrders.length === 0 ? (
        <div className={ui.empty}>
          <ShoppingBag className="mx-auto w-6 h-6 text-ink-muted mb-2" aria-hidden="true" />
          <p className="text-base font-semibold text-ink">No orders match</p>
          <p className="text-sm leading-5 text-ink-muted mt-0.5">Try a different search or status.</p>
          {(searchQuery || selectedStatus !== 'All') && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSelectedStatus('All'); }}
              className={`mt-4 ${ui.outline}`}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Phone: order cards */}
          <ul className="md:hidden space-y-2.5">
            {filteredOrders.map((order) => (
              <li
                key={order.orderNumber}
                className="bg-white rounded-2xl border border-line p-3.5 cursor-pointer active:bg-page"
                onClick={() => openAdminOrderDetails(order.orderNumber)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] leading-5 font-semibold text-ink truncate">{order.customerName}</p>
                    <p className="font-mono text-xs leading-4 text-ink-muted truncate">{order.orderNumber}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base leading-5 font-bold text-ink tabular-nums">₹{order.finalTotal.toLocaleString('en-IN')}</p>
                    <p className="text-xs leading-4 text-ink-muted">{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</p>
                  </div>
                </div>
                <p className="mt-1.5 text-[13px] leading-[18px] text-ink-muted truncate">{formatOrderDate(order.date)} · +91 {order.customerMobile}</p>
                <p className="text-[13px] leading-[18px] text-ink-muted truncate">{order.customerEmail}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                  <PaymentBadge order={order} />
                </div>
                <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap gap-x-2">
                  {order.testPayment && testBadge}
                  {renderFlags(order)}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-line flex items-center justify-between gap-2">
                  <span className="text-xs leading-4 text-ink-muted font-mono truncate">
                    {paymentLine(order)}
                  </span>
                  <span className="text-sm font-semibold text-brand inline-flex items-center gap-0.5 shrink-0">
                    Open order <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: table */}
          <div className={`hidden md:block ${ui.panel}`}>
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className={ui.thead}>
                    <th className="py-2.5 pl-5 pr-3 font-semibold">Order</th>
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Customer</th>
                    <th className="py-2.5 px-3 font-semibold">Amount</th>
                    <th className="py-2.5 px-3 font-semibold">Payment</th>
                    <th className="py-2.5 px-3 font-semibold">Order status</th>
                    <th className="py-2.5 pl-3 pr-5 text-right font-semibold"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.orderNumber}
                      className="hover:bg-page transition-colors cursor-pointer align-top"
                      onClick={() => openAdminOrderDetails(order.orderNumber)}
                    >

                      {/* 1. Order ID */}
                      <td className="py-3 pl-5 pr-3 font-mono font-semibold text-brand whitespace-nowrap">
                        <span className="underline underline-offset-[3px]">{order.orderNumber}</span>
                      </td>

                      {/* 2. Date */}
                      <td className="py-3 px-3 text-ink-muted whitespace-nowrap">
                        {formatOrderDate(order.date)}
                      </td>

                      {/* 3. Customer */}
                      <td className="py-3 px-3 max-w-[220px]">
                        <p className="font-semibold text-ink truncate">{order.customerName}</p>
                        <p className="text-xs text-ink-muted truncate">{order.customerEmail}</p>
                        <p className="text-xs text-ink-muted">+91 {order.customerMobile}</p>
                      </td>

                      {/* 4. Amount */}
                      <td className="py-3 px-3 font-bold text-ink text-sm tabular-nums whitespace-nowrap">
                        ₹{order.finalTotal.toLocaleString('en-IN')}
                        <span className="block text-xs font-normal text-ink-muted">
                          {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                        </span>
                      </td>

                      {/* 5. Payment */}
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        <PaymentBadge order={order} />
                        {order.testPayment && <span className="block">{testBadge}</span>}
                        <span className="block text-[11px] text-ink-muted font-mono mt-1.5 break-all">
                          {paymentLine(order)}
                        </span>
                      </td>

                      {/* 6. Order status */}
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
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
                        <span className="flex flex-col">{renderFlags(order)}</span>
                      </td>

                      {/* 7. Open */}
                      <td className="py-3 pl-3 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openAdminOrderDetails(order.orderNumber)}
                          className={ui.small}
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
