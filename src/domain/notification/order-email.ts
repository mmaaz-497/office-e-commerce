import { formatIDR } from "../money";
import { formatWibDateTime } from "../time";

/**
 * The owner's "new order" email, built from a summary of the order. Pure: the
 * labels come in from the messages (Principle I) and the result is plain
 * data the sender posts.
 *
 * The summary type is the privacy boundary. It has no field for the buyer's
 * name, phone, email or street address, so none of them can reach the email
 * provider; the owner opens the admin link for those.
 */
export interface OrderEmailSummary {
  orderNumber: string;
  createdAt: Date;
  productName: string | null;
  size: string | null;
  quantity: number;
  totalIDR: number;
  paymentMethod: "ONLINE" | "COD";
  cityName: string;
  provinceName: string;
}

export interface OrderEmailLabels {
  subject: string;
  heading: string;
  time: string;
  product: string;
  size: string;
  quantity: string;
  quantityValue: string;
  total: string;
  payment: string;
  paymentCod: string;
  paymentOnline: string;
  paymentCodShort: string;
  paymentOnlineShort: string;
  city: string;
  viewOrder: string;
  footer: string;
}

export interface OrderEmail {
  subject: string;
  text: string;
  html: string;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildOrderEmail(
  order: OrderEmailSummary,
  labels: OrderEmailLabels,
  adminOrderUrl: string,
): OrderEmail {
  const total = formatIDR(order.totalIDR);
  const isCod = order.paymentMethod === "COD";

  const rows: Array<[string, string]> = [
    [labels.time, `${formatWibDateTime(order.createdAt)} WIB`],
    ...(order.productName ? [[labels.product, order.productName] as [string, string]] : []),
    ...(order.size ? [[labels.size, order.size] as [string, string]] : []),
    [labels.quantity, fill(labels.quantityValue, { count: order.quantity })],
    [labels.total, total],
    [labels.payment, isCod ? labels.paymentCod : labels.paymentOnline],
    [labels.city, `${order.cityName}, ${order.provinceName}`],
  ];

  const subject = fill(labels.subject, {
    orderNumber: order.orderNumber,
    total,
    payment: isCod ? labels.paymentCodShort : labels.paymentOnlineShort,
  });

  const text = [
    labels.heading,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `${labels.viewOrder}: ${adminOrderUrl}`,
    "",
    labels.footer,
  ].join("\n");

  const cell = "padding:4px 12px 4px 0;vertical-align:top;";
  const html = [
    `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:22px;color:#2E1B10;">`,
    `<p style="font-size:18px;font-weight:bold;margin:0 0 12px;">${escapeHtml(labels.heading)}</p>`,
    `<p style="margin:0 0 12px;font-weight:bold;">${escapeHtml(order.orderNumber)}</p>`,
    `<table style="border-collapse:collapse;margin:0 0 16px;">`,
    ...rows.map(
      ([label, value]) =>
        `<tr><td style="${cell}color:#5C4434;">${escapeHtml(label)}</td><td style="${cell}font-weight:bold;">${escapeHtml(value)}</td></tr>`,
    ),
    `</table>`,
    `<p style="margin:0 0 16px;"><a href="${escapeHtml(adminOrderUrl)}" style="background:#7A4B32;color:#FFFFFF;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">${escapeHtml(labels.viewOrder)}</a></p>`,
    `<p style="margin:0;color:#76604F;font-size:13px;">${escapeHtml(labels.footer)}</p>`,
    `</div>`,
  ].join("");

  return { subject, text, html };
}
