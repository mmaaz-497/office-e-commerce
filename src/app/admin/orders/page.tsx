import { getAdminTranslations } from "@/i18n/admin";
import Link from "next/link";
import {
  ORDER_LIST_PERIODS,
  asOrderListPeriod,
  getOrderList,
} from "@/infrastructure/db/admin-orders";
import { formatIDR } from "@/domain/money";
import { formatWibDateTime } from "@/domain/time";
import { isUnreachableStatus } from "@/domain/order/transitions";
import type { OrderStatus, PaymentMethod } from "@/domain/order/status";
import { EmptyState } from "@/components/admin/EmptyState";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { OrderFilters } from "@/components/admin/OrderFilters";

const STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "COD_PENDING",
  "CONFIRMED",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "RETURNED",
];

const PAYMENT_METHODS: PaymentMethod[] = ["ONLINE", "COD"];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    paymentMethod?: string;
    search?: string;
    period?: string;
  }>;
}) {
  const params = await searchParams;

  // Each filter is coerced to something the query can trust; anything else in
  // the URL is dropped rather than passed through (FR-058, Principle IX).
  const status = STATUSES.includes(params.status as OrderStatus)
    ? (params.status as OrderStatus)
    : undefined;
  const paymentMethod = PAYMENT_METHODS.includes(params.paymentMethod as PaymentMethod)
    ? (params.paymentMethod as PaymentMethod)
    : undefined;
  const period = asOrderListPeriod(params.period);
  const search = params.search?.trim() || undefined;
  const anyFilter = Boolean(status || paymentMethod || period || search);

  const [t, tStatus, tPayment, orders] = await Promise.all([
    getAdminTranslations("admin.orders"),
    getAdminTranslations("admin.orderStatus"),
    getAdminTranslations("admin.paymentMethod"),
    getOrderList({ status, paymentMethod, period, search }),
  ]);

  /**
   * A COD order never reaches PAID and an online order never reaches CONFIRMED,
   * so these pairs match nothing however much the store has sold. Saying so is
   * the difference between "no results" and "this filter is broken".
   */
  const impossiblePair =
    status && paymentMethod && isUnreachableStatus(status, paymentMethod)
      ? { status: tStatus(status), paymentMethod: tPayment(paymentMethod) }
      : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-brown-dark text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-brown/70 mt-1 text-xs">
            {t("resultCount", { count: orders.length })}
            {anyFilter && ` · ${t("filtered")}`}
          </p>
        </div>
        <Link
          href="/admin/dashboard"
          className="text-brown hover:text-brown-dark text-xs font-semibold underline underline-offset-2"
        >
          {t("backToDashboard")}
        </Link>
      </header>

      <OrderFilters
        statuses={STATUSES.map((value) => ({ value, label: tStatus(value) }))}
        paymentMethods={PAYMENT_METHODS.map((value) => ({ value, label: tPayment(value) }))}
        periods={ORDER_LIST_PERIODS.map((value) => ({ value, label: t(`periods.${value}`) }))}
        labels={{
          status: t("filters.status"),
          allStatuses: t("filters.allStatuses"),
          paymentMethod: t("filters.paymentMethod"),
          allPaymentMethods: t("filters.allPaymentMethods"),
          period: t("filters.period"),
          allTime: t("periods.all"),
          search: t("filters.search"),
          searchPlaceholder: t("filters.searchPlaceholder"),
          apply: t("filters.apply"),
          applying: t("filters.applying"),
          reset: t("filters.reset"),
        }}
      />

      {orders.length === 0 ? (
        /* An empty <tbody> under a header row is indistinguishable from a broken
           filter, which is exactly how this page used to report no matches. */
        <EmptyState
          message={anyFilter ? t("emptyFiltered") : t("empty")}
          hint={
            impossiblePair
              ? t("impossiblePair", {
                  status: impossiblePair.status,
                  paymentMethod: impossiblePair.paymentMethod,
                })
              : anyFilter
                ? t("emptyFilteredHint")
                : undefined
          }
        />
      ) : (
        /* Wrapped, not the bare table: a 6-column table is wider than 360px,
           and scrolling this region keeps the page itself from scrolling
           horizontally (T126, SC-001). */
        <div className="border-line bg-shell overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-line text-brown/70 border-b text-xs">
                <th className="p-3 font-medium">{t("table.orderNumber")}</th>
                <th className="p-3 font-medium">{t("table.status")}</th>
                <th className="p-3 font-medium">{t("table.paymentMethod")}</th>
                <th className="p-3 font-medium">{t("table.customer")}</th>
                <th className="p-3 text-right font-medium">{t("table.total")}</th>
                <th className="p-3 text-right font-medium">{t("table.placed")}</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {orders.map((order) => (
                <tr key={order.orderNumber} className="hover:bg-cream-dark/50">
                  <td className="p-3">
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="text-brown-dark font-mono font-semibold underline-offset-2 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={order.status} label={tStatus(order.status)} />
                  </td>
                  <td className="text-brown p-3">{tPayment(order.paymentMethod)}</td>
                  <td className="text-brown-dark max-w-[12rem] truncate p-3">
                    <span title={order.customerName}>{order.customerName}</span>
                  </td>
                  <td className="text-brown-dark p-3 text-right font-semibold tabular-nums">
                    {formatIDR(order.totalIDR)}
                  </td>
                  <td className="text-brown/60 p-3 text-right text-xs tabular-nums">
                    {formatWibDateTime(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
