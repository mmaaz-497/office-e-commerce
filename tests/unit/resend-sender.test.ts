import { describe, expect, it, vi } from "vitest";
import {
  EmailSendError,
  ResendEmailSender,
  type OutgoingEmail,
} from "@/infrastructure/email/resend-sender";

const EMAIL: OutgoingEmail = {
  from: "Tokoshopee <onboarding@resend.dev>",
  to: "owner@example.com",
  subject: "Pesanan baru",
  text: "text",
  html: "<p>html</p>",
  idempotencyKey: "owner-new-order/TKS-261109-M0X20",
};

function sender(fetchImpl: ReturnType<typeof vi.fn>) {
  return new ResendEmailSender("re_test", {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    retryDelaysMs: [0, 0],
  });
}

const ok = () => new Response('{"id":"x"}', { status: 200 });

describe("ResendEmailSender", () => {
  it("sends once, with the idempotency key, when Resend accepts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    await sender(fetchImpl).send(EMAIL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(EMAIL.idempotencyKey);
  });

  it("retries a stalled connection and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("The operation was aborted due to timeout"))
      .mockResolvedValueOnce(ok());
    await sender(fetchImpl).send(EMAIL);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 or 5xx answer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(ok());
    await sender(fetchImpl).send(EMAIL);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after three tries with the last reason", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connect ETIMEDOUT"));
    const error = await sender(fetchImpl)
      .send(EMAIL)
      .catch((e: unknown) => e);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as Error).message).toBe("Resend unreachable: connect ETIMEDOUT");
  });

  it("does not retry a wrong key or a refused recipient", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"name":"validation_error"}', { status: 403 }));
    await expect(sender(fetchImpl).send(EMAIL)).rejects.toThrow(
      'Resend answered 403: {"name":"validation_error"}',
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
