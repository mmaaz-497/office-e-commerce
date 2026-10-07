import { notFound } from "next/navigation";
import { getAdminTranslations } from "@/i18n/admin";
import { getOrderDetailData } from "@/infrastructure/db/admin-orders";
import { formatIDR } from "@/domain/money";
import { OrderActions } from "@/components/admin/OrderActions";
import { getAdminErrorMessages } from "@/components/admin/admin-error-messages";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const [t, data, errorMessages] = await Promise.all([
    getAdminTranslations("admin.orderDetail"),
    getOrderDetailData(orderNumber),
    getAdminErrorMessages(),
  ]);

  if (!data) notFound();
  const { order, allowedActions } = data;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-brown-dark font-mono text-2xl font-bold">{order.orderNumber}</h1>

      <section className="border-brown grid grid-cols-2 gap-2 rounded border p-4 text-sm">
        <div>{t("status")}</div>
        <div className="font-semibold">{order.status}</div>
        <div>{t("paymentMethod")}</div>
        <div>{order.paymentMethod}</div>
        <div>{t("customer")}</div>
        <div>
          {order.customerName} · {order.phone}
        </div>
        <div>{t("address")}</div>
        <div>
          {order.streetAddress}, {order.district}, {order.cityName}, {order.provinceName}{" "}
          {order.postalCode}
        </div>
        <div>{t("quantity")}</div>
        <div>{order.quantity}</div>
        <div>{t("total")}</div>
        <div>{formatIDR(order.totalIDR)}</div>
        {order.trackingNumber && (
          <>
            <div>{t("trackingNumber")}</div>
            <div>{order.trackingNumber}</div>
          </>
        )}
        {order.conflictFlag !== "NONE" && (
          <>
            <div className="font-bold text-red-800">{t("conflict")}</div>
            <div className="font-bold text-red-800">{order.conflictFlag}</div>
          </>
        )}
      </section>

      {order.cancellationRequest && order.cancellationRequest.resolution === "OPEN" && (
        <section className="rounded border-2 border-amber-600 bg-amber-50 p-4 text-sm">
          {t("cancellationRequestPending")}
          {order.cancellationRequest.reason && <p>{order.cancellationRequest.reason}</p>}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">{t("timeline")}</h2>
        <ol className="flex flex-col gap-1 text-sm">
          {order.statusEvents.map((event) => (
            <li key={event.id}>
              {event.createdAt.toISOString()} — {event.fromStatus ?? "—"} → {event.toStatus} (
              {event.actor})
            </li>
          ))}
        </ol>
      </section>

      <OrderActions
        orderNumber={order.orderNumber}
        paymentMethod={order.paymentMethod}
        allowedActions={allowedActions}
        hasOpenCancellationRequest={order.cancellationRequest?.resolution === "OPEN"}
        labels={{
          confirmCod: t("actions.confirmCod"),
          markShipped: t("actions.markShipped"),
          trackingNumberPlaceholder: t("actions.trackingNumberPlaceholder"),
          markCompleted: t("actions.markCompleted"),
          markReturned: t("actions.markReturned"),
          cancel: t("actions.cancel"),
          refundReferencePlaceholder: t("actions.refundReferencePlaceholder"),
          recheckPayment: t("actions.recheckPayment"),
          approveCancellation: t("actions.approveCancellation"),
          rejectCancellation: t("actions.rejectCancellation"),
          submitting: t("actions.submitting"),
        }}
        errorMessages={errorMessages}
      />
    </main>
  );
}
