import { describe, expect, it } from "vitest";
import { envSchema } from "@/config/env";
import { buildOrderEmail, type OrderEmailSummary } from "@/domain/notification/order-email";
import id from "@/messages/id.json";
import en from "@/messages/en.json";

const LABELS = id.admin.orderEmail;
const URL = "https://tokoshopee.example/admin/orders/TKS-261108-N906T";

const COD_ORDER: OrderEmailSummary = {
  orderNumber: "TKS-261108-N906T",
  // 07:05 UTC is 14:05 WIB
  createdAt: new Date("2026-11-08T07:05:00Z"),
  productName: "Sandal Gemoy",
  size: "40",
  quantity: 1,
  totalIDR: 184999,
  paymentMethod: "COD",
  cityName: "Kota Jakarta Pusat",
  provinceName: "DKI Jakarta",
};

describe("buildOrderEmail", () => {
  it("summarises a COD order with the WIB time, IDR total, size and admin link", () => {
    const email = buildOrderEmail(COD_ORDER, LABELS, URL);

    expect(email.subject).toBe("Pesanan baru TKS-261108-N906T · Rp 184.999 · COD");
    expect(email.text).toContain("Waktu: 2026-11-08 14:05 WIB");
    expect(email.text).toContain("Produk: Sandal Gemoy");
    expect(email.text).toContain("Ukuran: 40");
    expect(email.text).toContain("Jumlah: 1 pasang");
    expect(email.text).toContain("Total: Rp 184.999");
    expect(email.text).toContain("Pembayaran: Bayar di tempat (COD)");
    expect(email.text).toContain("Kota: Kota Jakarta Pusat, DKI Jakarta");
    expect(email.text).toContain(`Lihat pesanan: ${URL}`);
    expect(email.html).toContain(`href="${URL}"`);
  });

  it("marks an online order as awaiting payment", () => {
    const email = buildOrderEmail({ ...COD_ORDER, paymentMethod: "ONLINE" }, LABELS, URL);
    expect(email.subject).toContain("· Online");
    expect(email.text).toContain("Pembayaran: Online, menunggu pembayaran");
  });

  it("leaves out the size and product rows when the order has none", () => {
    const email = buildOrderEmail({ ...COD_ORDER, size: null, productName: null }, LABELS, URL);
    expect(email.text).not.toContain("Ukuran:");
    expect(email.text).not.toContain("Produk:");
  });

  it("escapes catalogue text in the HTML body", () => {
    const email = buildOrderEmail(
      { ...COD_ORDER, productName: 'Sandal <b>"Gemoy"</b> & Co' },
      LABELS,
      URL,
    );
    expect(email.html).toContain("Sandal &lt;b&gt;&quot;Gemoy&quot;&lt;/b&gt; &amp; Co");
    expect(email.html).not.toContain('<b>"Gemoy"</b>');
  });

  it("has no field that could carry the buyer's name, phone or address", () => {
    // The summary type is the privacy boundary: adding such a field must be a
    // deliberate change that also updates this list.
    expect(Object.keys(COD_ORDER).sort()).toEqual(
      [
        "cityName",
        "createdAt",
        "orderNumber",
        "paymentMethod",
        "productName",
        "provinceName",
        "quantity",
        "size",
        "totalIDR",
      ].sort(),
    );
  });

  it("has the same labels in both languages", () => {
    expect(Object.keys(en.admin.orderEmail).sort()).toEqual(Object.keys(LABELS).sort());
  });
});

describe("envSchema email settings", () => {
  const BASE = {
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/tokoshopee",
    NEXT_PUBLIC_BASE_URL: "https://tokoshopee.com",
    MIDTRANS_SERVER_KEY: "SB-Mid-server-xxx",
    MIDTRANS_CLIENT_KEY: "SB-Mid-client-xxx",
    MIDTRANS_IS_PRODUCTION: "false",
    ADMIN_USERNAME: "owner",
    ADMIN_PASSWORD_HASH: "$2b$12$abcdefghijklmnopqrstuv",
    SESSION_SECRET: "a".repeat(32),
    JOB_SECRET: "b".repeat(32),
    UPLOAD_DIR: "/var/lib/tokoshopee/uploads",
  };

  it("is off by default and falls back to the shared Resend sender", () => {
    const result = envSchema.parse(BASE);
    expect(result.RESEND_API_KEY).toBeNull();
    expect(result.ORDER_NOTIFY_EMAIL).toBeNull();
    expect(result.EMAIL_FROM).toBe("Tokoshopee <onboarding@resend.dev>");
  });

  it("treats empty values as unset", () => {
    const result = envSchema.parse({
      ...BASE,
      RESEND_API_KEY: "  ",
      ORDER_NOTIFY_EMAIL: "",
      EMAIL_FROM: "",
    });
    expect(result.RESEND_API_KEY).toBeNull();
    expect(result.ORDER_NOTIFY_EMAIL).toBeNull();
    expect(result.EMAIL_FROM).toBe("Tokoshopee <onboarding@resend.dev>");
  });

  it("keeps a key and recipient, and rejects a malformed recipient", () => {
    const result = envSchema.parse({
      ...BASE,
      RESEND_API_KEY: "re_123",
      ORDER_NOTIFY_EMAIL: "owner@example.com",
    });
    expect(result.RESEND_API_KEY).toBe("re_123");
    expect(result.ORDER_NOTIFY_EMAIL).toBe("owner@example.com");
    expect(envSchema.safeParse({ ...BASE, ORDER_NOTIFY_EMAIL: "not-an-email" }).success).toBe(
      false,
    );
  });
});
