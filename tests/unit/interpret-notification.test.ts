import { describe, expect, it } from "vitest";
import { interpretNotification } from "@/domain/payment/interpret-notification";

describe("interpretNotification", () => {
  it("is PAYMENT_SUCCESS only when all three fields hold", () => {
    expect(
      interpretNotification({
        transactionStatus: "settlement",
        fraudStatus: "ACCEPT",
        statusCode: "200",
      }),
    ).toBe("PAYMENT_SUCCESS");

    expect(
      interpretNotification({
        transactionStatus: "capture",
        fraudStatus: "ACCEPT",
        statusCode: "200",
      }),
    ).toBe("PAYMENT_SUCCESS");
  });

  it("settlement with fraud_status CHALLENGE is NOT success", () => {
    const outcome = interpretNotification({
      transactionStatus: "settlement",
      fraudStatus: "CHALLENGE",
      statusCode: "200",
    });
    expect(outcome).not.toBe("PAYMENT_SUCCESS");
    expect(outcome).toBe("PAYMENT_PENDING");
  });

  it("settlement with a non-200 statusCode is NOT success", () => {
    const outcome = interpretNotification({
      transactionStatus: "settlement",
      fraudStatus: "ACCEPT",
      statusCode: "201",
    });
    expect(outcome).not.toBe("PAYMENT_SUCCESS");
  });

  it("settlement without fraudStatus is success, as Midtrans sends for Indomaret/Alfamart", () => {
    // Midtrans docs: "if `fraud_status` exists ensure the value is `accept`";
    // low-risk methods are not screened and carry no fraud_status at all.
    expect(interpretNotification({ transactionStatus: "settlement", statusCode: "200" })).toBe(
      "PAYMENT_SUCCESS",
    );
  });

  it("compares both statuses case-insensitively", () => {
    // Lower case is what Midtrans actually sends.
    for (const [transactionStatus, fraudStatus] of [
      ["settlement", "accept"],
      ["capture", "accept"],
      ["Settlement", "Accept"],
      ["CAPTURE", "ACCEPT"],
    ]) {
      expect(interpretNotification({ transactionStatus, fraudStatus, statusCode: "200" })).toBe(
        "PAYMENT_SUCCESS",
      );
    }
    expect(
      interpretNotification({
        transactionStatus: "capture",
        fraudStatus: "challenge",
        statusCode: "200",
      }),
    ).toBe("PAYMENT_PENDING");
    expect(interpretNotification({ transactionStatus: "DENY", statusCode: "202" })).toBe(
      "PAYMENT_FAILED",
    );
    expect(interpretNotification({ transactionStatus: "Expire", statusCode: "407" })).toBe(
      "PAYMENT_EXPIRED",
    );
  });

  it("a present fraudStatus other than accept is NOT success", () => {
    for (const fraudStatus of ["challenge", "deny", ""]) {
      expect(
        interpretNotification({ transactionStatus: "settlement", fraudStatus, statusCode: "200" }),
      ).not.toBe("PAYMENT_SUCCESS");
    }
  });

  it("maps pending to PAYMENT_PENDING", () => {
    expect(interpretNotification({ transactionStatus: "pending", statusCode: "201" })).toBe(
      "PAYMENT_PENDING",
    );
  });

  it("maps deny and cancel to PAYMENT_FAILED", () => {
    expect(interpretNotification({ transactionStatus: "deny", statusCode: "202" })).toBe(
      "PAYMENT_FAILED",
    );
    expect(interpretNotification({ transactionStatus: "cancel", statusCode: "200" })).toBe(
      "PAYMENT_FAILED",
    );
  });

  it("maps expire to PAYMENT_EXPIRED", () => {
    expect(interpretNotification({ transactionStatus: "expire", statusCode: "200" })).toBe(
      "PAYMENT_EXPIRED",
    );
  });

  it("maps an unrecognised transaction status to IGNORE", () => {
    expect(interpretNotification({ transactionStatus: "refund", statusCode: "200" })).toBe(
      "IGNORE",
    );
  });
});
