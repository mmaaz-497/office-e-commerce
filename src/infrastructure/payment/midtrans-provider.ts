import midtransClient from "midtrans-client";
import { createHash, timingSafeEqual } from "node:crypto";
import type { IDR } from "@/domain/money";
import type { NotificationOutcome, PaymentProvider } from "@/domain/payment/provider";
import { interpretNotification } from "@/domain/payment/interpret-notification";
import { env } from "@/config";

/**
 * @types/midtrans-client does not declare CoreApi's `.transaction.status()`
 * method (it exists at runtime — verified against node_modules/midtrans-client
 * source — but the community type definitions only cover Snap.createTransaction).
 * Declared locally rather than trusting the incomplete upstream types.
 */
interface CoreApiTransactionStatus {
  transaction_status: string;
  fraud_status?: string;
  status_code: string;
}

interface CoreApiWithStatus {
  transaction: {
    status(transactionId: string): Promise<CoreApiTransactionStatus>;
  };
}

/**
 * The infrastructure adapter over Midtrans (ADR-0002). No vendor SDK type
 * appears in the PaymentProvider interface this class implements.
 */
export class MidtransProvider implements PaymentProvider {
  private readonly snap: InstanceType<typeof midtransClient.Snap>;
  private readonly coreApi: InstanceType<typeof midtransClient.CoreApi> & CoreApiWithStatus;

  constructor() {
    const options = {
      isProduction: env.MIDTRANS_IS_PRODUCTION,
      serverKey: env.MIDTRANS_SERVER_KEY,
      clientKey: env.MIDTRANS_CLIENT_KEY,
    };
    this.snap = new midtransClient.Snap(options);
    this.coreApi = new midtransClient.CoreApi(options) as InstanceType<
      typeof midtransClient.CoreApi
    > &
      CoreApiWithStatus;
  }

  /** grossAmount MUST come from the order snapshot, never the live catalogue (R-006). */
  async createCheckoutSession(args: {
    providerOrderId: string;
    grossAmount: IDR;
    expiryHours: number;
    customer: { name: string; phone: string; email?: string };
  }): Promise<{ token: string; redirectUrl: string }> {
    const response = await this.snap.createTransaction({
      transaction_details: {
        order_id: args.providerOrderId,
        gross_amount: args.grossAmount,
      },
      customer_details: {
        first_name: args.customer.name,
        phone: args.customer.phone,
        email: args.customer.email,
      },
      expiry: {
        unit: "hour",
        duration: args.expiryHours,
      },
    } as Parameters<typeof this.snap.createTransaction>[0]);

    return { token: response.token, redirectUrl: response.redirect_url };
  }

  /**
   * SHA512(order_id + status_code + gross_amount + serverKey), compared in
   * constant time. `payload` is the ALREADY-PARSED, camelCase output of
   * midtransNotificationSchema (T069a) — never the raw request body.
   */
  verifyNotificationSignature(payload: unknown): boolean {
    const p = payload as {
      orderId?: unknown;
      statusCode?: unknown;
      grossAmount?: unknown;
      signatureKey?: unknown;
    };
    if (
      typeof p.orderId !== "string" ||
      typeof p.statusCode !== "string" ||
      typeof p.grossAmount !== "string" ||
      typeof p.signatureKey !== "string"
    ) {
      return false;
    }

    const expected = createHash("sha512")
      .update(p.orderId + p.statusCode + p.grossAmount + env.MIDTRANS_SERVER_KEY)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "utf-8");
    const actualBuf = Buffer.from(p.signatureKey, "utf-8");
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  }

  /** Authoritative re-query — the Get Status API, not the notification body (R-007). */
  async fetchTransactionStatus(providerOrderId: string): Promise<NotificationOutcome> {
    const status = await this.coreApi.transaction.status(providerOrderId);
    return interpretNotification({
      transactionStatus: status.transaction_status,
      fraudStatus: status.fraud_status,
      statusCode: status.status_code,
    });
  }
}
