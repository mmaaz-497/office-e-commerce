import Link from "next/link";
import { getAdminTranslations } from "@/i18n/admin";
import {
  DASHBOARD_RANGES,
  asDashboardRange,
  getDashboardData,
  type DashboardData,
} from "@/infrastructure/db/admin-dashboard";
import { formatIDR, formatIDRCompact } from "@/domain/money";
import { formatWibDateTime, formatWibDayMonth, hoursBetween } from "@/domain/time";
import type { OrderStatus } from "@/domain/order/status";
import { AdminSessionError } from "@/domain/errors";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState } from "@/components/admin/EmptyState";
import { Panel } from "@/components/admin/dashboard/Panel";
import { StatCard } from "@/components/admin/dashboard/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TrendChart, type TrendPoint } from "@/components/admin/dashboard/TrendChart";
import { StatusDonut } from "@/components/admin/dashboard/StatusDonut";
import { BarRow, Meter } from "@/components/admin/dashboard/Meter";
import { STATUS_TONE, formatCount } from "@/components/admin/status-tone";
import { delta, percentOf } from "@/components/admin/dashboard/tokens";

/** The admin areas, in the order the operator works through them. */
const SECTIONS: ReadonlyArray<{ href: string; key: string; icon: IconName }> = [
  { href: "/admin/orders", key: "nav.orders", icon: "cart" },
  { href: "/admin/stock", key: "nav.stock", icon: "package" },
  { href: "/admin/products", key: "links.products", icon: "gem" },
  { href: "/admin/categories", key: "links.categories", icon: "grip" },
  { href: "/admin/reviews", key: "nav.reviews", icon: "star" },
  { href: "/admin/settings", key: "nav.settings", icon: "sliders" },
];

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const range = asDashboardRange(rawRange);

  const [[t, tStatus, tPayment, tActor], result] = await Promise.all([
    Promise.all([
      getAdminTranslations("admin.dashboard"),
      getAdminTranslations("admin.orderStatus"),
      getAdminTranslations("admin.paymentMethod"),
      getAdminTranslations("admin.actor"),
    ]),
    // An unreadable database must not cost the operator the rest of the admin
    // area, so the aggregation failing renders a notice with the navigation
    // intact rather than a 500. An expired session is a different thing
    // entirely and is rethrown untouched, so the guard still guards (FR-055).
    getDashboardData({ range }).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => {
        if (error instanceof AdminSessionError) throw error;
        console.error("Admin dashboard: aggregation failed", error);
        return { ok: false as const };
      },
    ),
  ]);

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
        <h1 className="text-brown-dark text-2xl font-bold tracking-tight">{t("title")}</h1>
        <Panel title={t("unavailable.title")} icon="alert" tone="alert">
          <p className="text-xs leading-relaxed text-red-900">{t("unavailable.body")}</p>
          <Link
            href={`/admin/dashboard?range=${range}`}
            className="bg-brown mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white"
          >
            {t("unavailable.retry")}
            <Icon name="arrowRight" className="h-3.5 w-3.5" />
          </Link>
        </Panel>
        <nav className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="border-line bg-shell text-brown-dark hover:bg-cream-dark flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
            >
              <Icon name={section.icon} className="h-4 w-4" />
              {t(section.key)}
            </Link>
          ))}
        </nav>
      </main>
    );
  }

  const data = result.value;
  const status = (value: OrderStatus) => tStatus(value);
  const now = data.generatedAt;

  /** Period-on-period change, or an honest "nothing to compare" when yesterday was empty. */
  const change = (current: number, previous: number) => {
    const { direction, percent } = delta(current, previous);
    const label =
      direction === "up"
        ? t("kpi.comparedUp", { percent })
        : direction === "down"
          ? t("kpi.comparedDown", { percent })
          : direction === "flat"
            ? t("kpi.comparedFlat")
            : t("kpi.comparedNew");
    return { direction, label };
  };

  /** Hours up to two days, whole days past that — "Unchanged 823h" is arithmetic. */
  const staleLabel = (hours: number) =>
    hours >= 48
      ? t("attention.staleForDays", { days: Math.floor(hours / 24) })
      : t("attention.staleFor", { hours });

  const points: TrendPoint[] = data.period.series.map((point) => ({
    day: point.day,
    label: formatWibDayMonth(point.day),
    tooltip: t("trend.point", {
      day: point.day,
      revenue: formatIDR(point.revenueIDR),
      orders: point.orders,
      paid: point.paidOrders,
    }),
    revenueIDR: point.revenueIDR,
    orders: point.orders,
  }));
  const peakRevenue = Math.max(...points.map((p) => p.revenueIDR), 0);

  const openStages = data.openStages.filter((stage) => stage.count > 0);
  const maxStageCount = Math.max(...data.openStages.map((stage) => stage.count), 0);
  const stageCount = (status: OrderStatus) =>
    data.openStages.find((stage) => stage.status === status)?.count ?? 0;

  const needsAction = data.codAwaitingConfirmation + data.awaitingShipment;
  const attentionCount =
    data.conflicts.length +
    data.attention.openCancellations.length +
    data.attention.expiringSoon.length +
    data.attention.staleFulfilment.length +
    (data.attention.unpublishedReviews > 0 ? 1 : 0) +
    (data.attention.outOfStock ? 1 : 0);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6 lg:gap-6 lg:p-8">
      <header className="border-line flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-brown-dark text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-brown/70 mt-1 text-xs tabular-nums sm:text-sm">
            {t("asOf", { timestamp: formatWibDateTime(now) })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <RangeFilter
            active={data.range}
            legend={t("range.legend")}
            label={(days) => t(`range.d${days}`)}
          />
          <Link
            href="/admin/orders"
            className="bg-brown shadow-soft hover:bg-brown-dark flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {t("primaryAction")}
            <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="border-line bg-shell text-brown-dark hover:border-brown-light/60 hover:bg-cream-dark flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
          >
            <Icon name={section.icon} className="h-4 w-4" />
            {t(section.key)}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("todayOrders")}
          value={formatCount(data.today.orders)}
          hint={t("kpi.todayHint")}
          icon="cart"
          change={change(data.today.orders, data.yesterday.orders)}
          href="/admin/orders?period=today"
        />
        <StatCard
          label={t("kpi.revenueToday")}
          value={formatIDR(data.today.revenueIDR)}
          hint={t("kpi.revenueHint")}
          icon="wallet"
          change={change(data.today.revenueIDR, data.yesterday.revenueIDR)}
        />
        <StatCard
          label={t("kpi.needsAction")}
          value={formatCount(needsAction)}
          hint={t("kpi.needsActionHint", {
            cod: data.codAwaitingConfirmation,
            ship: data.awaitingShipment,
          })}
          icon="truck"
          href="/admin/orders"
        />
        <StatCard
          label={t("currentStock")}
          value={formatCount(data.currentStock)}
          hint={
            data.stockCoverDays === null
              ? t("kpi.stockHintUnknown")
              : t("kpi.stockHint", { days: Math.round(data.stockCoverDays * 10) / 10 })
          }
          icon="package"
          href="/admin/stock"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title={t("attention.title")}
          icon="alert"
          tone={data.conflicts.length > 0 || data.attention.outOfStock ? "alert" : "default"}
          className="lg:col-span-2"
        >
          {attentionCount === 0 ? (
            <EmptyState message={t("attention.allClear")} />
          ) : (
            <div className="flex flex-col gap-4">
              {/* FR-075 — first, in red, and the whole block is absent when there
                  are no unresolved conflicts, so its presence always means money
                  is at risk. */}
              {data.conflicts.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-red-200 bg-red-50/70 p-3">
                  <h3 className="flex items-center gap-2 text-xs font-semibold text-red-800">
                    <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t("conflicts.title")}</span>
                    <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] tabular-nums">
                      {formatCount(data.conflicts.length)}
                    </span>
                  </h3>
                  <ul className="divide-y divide-red-200/70">
                    {data.conflicts.map((conflict) => (
                      <li
                        key={conflict.orderNumber}
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/admin/orders/${conflict.orderNumber}`}
                            className="font-mono font-semibold text-red-900 underline underline-offset-2"
                          >
                            {conflict.orderNumber}
                          </Link>
                          <p className="text-red-800">
                            {t(`conflicts.reason.${conflict.conflictFlag}`)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-red-800 tabular-nums">
                          <p className="font-semibold">{formatIDR(conflict.totalIDR)}</p>
                          <p className="text-[11px]">
                            {formatWibDateTime(conflict.conflictDetectedAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.attention.outOfStock && (
                <AttentionNote
                  icon="package"
                  message={t("attention.stock")}
                  action={{ href: "/admin/stock", label: t("attention.restock") }}
                />
              )}

              {data.attention.openCancellations.length > 0 && (
                <AttentionGroup
                  title={t("attention.cancellations")}
                  count={data.attention.openCancellations.length}
                >
                  {data.attention.openCancellations.map((request) => (
                    <AttentionRow
                      key={request.orderNumber}
                      orderNumber={request.orderNumber}
                      badge={<StatusBadge status={request.status} label={status(request.status)} />}
                      detail={request.reason ?? t("attention.noReason")}
                      meta={formatIDR(request.totalIDR)}
                      metaSub={formatWibDateTime(request.createdAt)}
                    />
                  ))}
                </AttentionGroup>
              )}

              {data.attention.expiringSoon.length > 0 && (
                <AttentionGroup
                  title={t("attention.expiring")}
                  count={data.attention.expiringSoon.length}
                >
                  {data.attention.expiringSoon.map((order) => {
                    const expired = order.expiresAt.getTime() <= now.getTime();
                    const hoursLeft = Math.max(0, hoursBetween(now, order.expiresAt));
                    return (
                      <AttentionRow
                        key={order.orderNumber}
                        orderNumber={order.orderNumber}
                        badge={
                          <StatusBadge status="PENDING_PAYMENT" label={status("PENDING_PAYMENT")} />
                        }
                        detail={order.customerName}
                        meta={formatIDR(order.totalIDR)}
                        metaSub={
                          expired
                            ? t("attention.expired")
                            : t("attention.expiresIn", { hours: hoursLeft })
                        }
                        metaTone={expired ? "alert" : "warn"}
                      />
                    );
                  })}
                </AttentionGroup>
              )}

              {data.attention.staleFulfilment.length > 0 && (
                <AttentionGroup
                  title={t("attention.stale")}
                  count={data.attention.staleFulfilment.length}
                >
                  {data.attention.staleFulfilment.map((order) => (
                    <AttentionRow
                      key={order.orderNumber}
                      orderNumber={order.orderNumber}
                      badge={<StatusBadge status={order.status} label={status(order.status)} />}
                      detail={order.customerName}
                      meta={formatIDR(order.totalIDR)}
                      metaSub={staleLabel(hoursBetween(order.updatedAt, now))}
                      metaTone="warn"
                    />
                  ))}
                </AttentionGroup>
              )}

              {data.attention.unpublishedReviews > 0 && (
                <AttentionNote
                  icon="star"
                  message={`${t("attention.reviews")} — ${t("attention.reviewsCount", {
                    count: data.attention.unpublishedReviews,
                  })}`}
                  action={{ href: "/admin/reviews", label: t("attention.moderate") }}
                />
              )}
            </div>
          )}
        </Panel>

        <Panel title={t("quickActions.title")} icon="sliders">
          <ul className="flex flex-col gap-2">
            <QuickAction
              href="/admin/orders?status=COD_PENDING"
              icon="wallet"
              label={t("quickActions.confirmCod")}
              count={data.codAwaitingConfirmation}
            />
            <QuickAction
              href="/admin/orders?status=PAID"
              icon="truck"
              label={t("quickActions.shipPaid")}
              count={stageCount("PAID")}
            />
            <QuickAction
              href="/admin/orders?status=CONFIRMED"
              icon="package"
              label={t("quickActions.shipConfirmed")}
              count={stageCount("CONFIRMED")}
            />
            <QuickAction
              href="/admin/orders?status=PENDING_PAYMENT"
              icon="clock"
              label={t("quickActions.chaseUnpaid")}
              count={stageCount("PENDING_PAYMENT")}
            />
            <QuickAction
              href="/admin/stock"
              icon="package"
              label={t("quickActions.adjustStock")}
              count={data.currentStock}
            />
            <QuickAction
              href="/admin/reviews"
              icon="star"
              label={t("quickActions.moderateReviews")}
              count={data.attention.unpublishedReviews}
            />
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title={t("trend.title")}
          caption={t("trend.caption")}
          icon="chart"
          className="lg:col-span-2"
        >
          <TrendChart
            points={points}
            labels={{
              revenue: t("trend.revenue"),
              orders: t("trend.orders"),
              summary: `${t("trend.title")} — ${t("range.caption", { days: data.range })}`,
              empty: t("trend.empty"),
              peak:
                peakRevenue > 0
                  ? t("trend.peak", { revenue: formatIDRCompact(peakRevenue) })
                  : undefined,
            }}
          />
        </Panel>

        <Panel title={t("mix.title")} caption={t("mix.caption")} icon="chart">
          <div className="flex flex-col gap-4">
            <StatusDonut
              total={data.period.orders}
              slices={data.period.statusBreakdown.map((row) => ({
                status: row.status,
                label: status(row.status),
                count: row.count,
              }))}
              labels={{ total: t("mix.total"), empty: t("mix.empty") }}
            />
            {data.period.paymentMix.length > 0 && (
              <div className="border-line border-t pt-3">
                <p className="text-brown/60 mb-2 text-[11px] uppercase">{t("mix.paymentMix")}</p>
                <ul className="flex flex-col gap-1 text-xs">
                  {data.period.paymentMix.map((row) => (
                    <li key={row.paymentMethod} className="flex items-center justify-between gap-2">
                      <span className="text-brown-dark truncate">
                        {tPayment(row.paymentMethod)}
                      </span>
                      <span className="text-brown-dark shrink-0 font-semibold tabular-nums">
                        {formatCount(row.count)}
                        <span className="text-brown/50 ml-1 font-normal">
                          ({percentOf(row.count, data.period.orders)}%)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel title={t("pipeline.title")} caption={t("pipeline.caption")} icon="package">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {openStages.length === 0 ? (
              <EmptyState message={t("pipeline.empty")} />
            ) : (
              <ul className="flex flex-col gap-3">
                {openStages.map((stage) => (
                  <BarRow
                    key={stage.status}
                    label={<StatusBadge status={stage.status} label={status(stage.status)} />}
                    count={t("pipeline.count", { count: stage.count })}
                    value={formatIDR(stage.valueIDR)}
                    share={percentOf(stage.count, maxStageCount)}
                    color={STATUS_TONE[stage.status].chart}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <Meter
              label={t("pipeline.conversion")}
              percent={percentOf(data.period.createdThatWerePaid, data.period.orders)}
              caption={
                data.period.orders === 0
                  ? t("pipeline.noBasis")
                  : t("pipeline.conversionHint", {
                      paid: data.period.createdThatWerePaid,
                      created: data.period.orders,
                    })
              }
              color="var(--color-accent)"
            />
            <Meter
              label={t("pipeline.fulfilment")}
              percent={percentOf(data.lifetime.completed, data.lifetime.orders)}
              caption={
                data.lifetime.orders === 0
                  ? t("pipeline.noBasis")
                  : t("pipeline.fulfilmentHint", {
                      completed: data.lifetime.completed,
                      total: data.lifetime.orders,
                    })
              }
              color="#15803d"
            />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title={t("recentOrders.title")}
          icon="cart"
          action={{ href: "/admin/orders", label: t("recentOrders.viewAll") }}
          className="lg:col-span-2"
        >
          {data.recentOrders.length === 0 ? (
            <EmptyState message={t("recentOrders.empty")} />
          ) : (
            /* Wrapped, not the bare table: six columns are wider than 360px, and
               scrolling this region keeps the page itself from scrolling
               horizontally (T126, SC-001). */
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead>
                  <tr className="text-brown/60 border-line border-b">
                    <th className="py-2 pr-3 font-medium">{t("recentOrders.columns.order")}</th>
                    <th className="py-2 pr-3 font-medium">{t("recentOrders.columns.status")}</th>
                    <th className="py-2 pr-3 font-medium">{t("recentOrders.columns.payment")}</th>
                    <th className="py-2 pr-3 font-medium">{t("recentOrders.columns.customer")}</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t("recentOrders.columns.total")}
                    </th>
                    <th className="py-2 text-right font-medium">
                      {t("recentOrders.columns.placed")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {data.recentOrders.map((order) => (
                    <tr key={order.orderNumber} className="hover:bg-cream-dark/50">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/admin/orders/${order.orderNumber}`}
                          className="text-brown-dark font-mono font-semibold underline-offset-2 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={order.status} label={status(order.status)} />
                      </td>
                      <td className="text-brown py-2 pr-3">{tPayment(order.paymentMethod)}</td>
                      <td className="text-brown-dark max-w-[10rem] truncate py-2 pr-3">
                        <span title={order.customerName}>{order.customerName}</span>
                      </td>
                      <td className="text-brown-dark py-2 pr-3 text-right font-semibold tabular-nums">
                        {formatIDR(order.totalIDR)}
                      </td>
                      <td className="text-brown/60 py-2 text-right tabular-nums">
                        {formatWibDateTime(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t("activity.title")} icon="clock">
          {data.recentActivity.length === 0 ? (
            <EmptyState message={t("activity.empty")} />
          ) : (
            <ol className="divide-line flex flex-col divide-y">
              {data.recentActivity.map((event) => (
                <li key={event.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/orders/${event.orderNumber}`}
                      className="text-brown-dark truncate font-mono text-xs font-semibold underline-offset-2 hover:underline"
                    >
                      {event.orderNumber}
                    </Link>
                    <span className="text-brown/50 shrink-0 text-[10px] tabular-nums">
                      {formatWibDateTime(event.createdAt)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {event.fromStatus ? (
                      <>
                        <StatusBadge status={event.fromStatus} label={status(event.fromStatus)} />
                        <Icon name="arrowRight" className="text-brown/40 h-3 w-3" />
                      </>
                    ) : (
                      <span className="text-brown/50 text-[11px]">{t("activity.placed")}</span>
                    )}
                    <StatusBadge status={event.toStatus} label={status(event.toStatus)} />
                    <span className="text-brown/50 text-[11px]">
                      {t("activity.by", { actor: tActor(event.actor) })}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </main>
  );
}

/** A GET-only segmented control. Three links, no JavaScript, bookmarkable. */
function RangeFilter({
  active,
  legend,
  label,
}: {
  active: DashboardData["range"];
  legend: string;
  label: (days: number) => string;
}) {
  return (
    <nav aria-label={legend} className="border-line bg-shell flex rounded-full border p-1">
      {DASHBOARD_RANGES.map((days) => {
        const current = days === active;
        return (
          <Link
            key={days}
            href={`/admin/dashboard?range=${days}`}
            aria-current={current ? "page" : undefined}
            className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
              current
                ? "bg-brown text-white"
                : "text-brown hover:bg-cream-dark hover:text-brown-dark"
            }`}
          >
            {label(days)}
          </Link>
        );
      })}
    </nav>
  );
}

function AttentionGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-brown-dark flex items-center gap-2 text-xs font-semibold">
        <span className="truncate">{title}</span>
        <span className="bg-cream-dark text-brown shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
          {formatCount(count)}
        </span>
      </h3>
      <ul className="divide-line flex flex-col divide-y">{children}</ul>
    </div>
  );
}

function AttentionRow({
  orderNumber,
  badge,
  detail,
  meta,
  metaSub,
  metaTone = "muted",
}: {
  orderNumber: string;
  badge: React.ReactNode;
  detail: string;
  meta: string;
  metaSub: string;
  metaTone?: "muted" | "warn" | "alert";
}) {
  const tone =
    metaTone === "alert"
      ? "text-red-700"
      : metaTone === "warn"
        ? "text-amber-700"
        : "text-brown/50";

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/orders/${orderNumber}`}
            className="text-brown-dark font-mono text-xs font-semibold underline-offset-2 hover:underline"
          >
            {orderNumber}
          </Link>
          {badge}
        </div>
        <p className="text-brown/70 truncate text-[11px]" title={detail}>
          {detail}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs tabular-nums">
        <p className="text-brown-dark font-semibold">{meta}</p>
        <p className={`text-[11px] ${tone}`}>{metaSub}</p>
      </div>
    </li>
  );
}

/** A single-line issue that is not about one order — empty stock, a review queue. */
function AttentionNote({
  icon,
  message,
  action,
}: {
  icon: IconName;
  message: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="border-line bg-cream-dark/60 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5">
      <p className="text-brown-dark flex min-w-0 items-center gap-2 text-xs font-medium">
        <Icon name={icon} className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </p>
      <Link
        href={action.href}
        className="text-brown hover:text-brown-dark shrink-0 text-xs font-semibold underline underline-offset-2"
      >
        {action.label}
      </Link>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  count,
}: {
  href: string;
  icon: IconName;
  label: string;
  count: number;
}) {
  return (
    <li>
      <Link
        href={href}
        className="border-line bg-cream-dark/40 hover:border-brown-light/60 hover:bg-cream-dark flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors"
      >
        <span className="bg-shell text-brown border-line flex h-7 w-7 shrink-0 items-center justify-center rounded-md border">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span className="text-brown-dark min-w-0 flex-1 truncate text-xs font-semibold">
          {label}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            count > 0 ? "bg-brown text-white" : "bg-cream-dark text-brown/50"
          }`}
        >
          {formatCount(count)}
        </span>
      </Link>
    </li>
  );
}
