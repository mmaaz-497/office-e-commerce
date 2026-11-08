/**
 * The one way this app sends email: Resend's HTTPS API, called with fetch, so
 * there is no SDK dependency and no SMTP port for a VPS host to block.
 *
 * `idempotencyKey` names the one email a call is for. Resend keeps it for 24
 * hours and answers a repeat with the original email instead of sending
 * again, so a retry after an unclear failure (timeout, dropped connection)
 * cannot email the owner twice.
 */

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}

/**
 * Every failure is treated alike by the caller: a wrong key (401) or a
 * recipient Resend will not deliver to (403) is fixed in configuration, after
 * which the same retry succeeds, so nothing here is "permanent".
 */
export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailSendError";
  }
}

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export class ResendEmailSender implements EmailSender {
  constructor(private readonly apiKey: string) {}

  async send(email: OutgoingEmail): Promise<void> {
    let response: Response;
    try {
      response = await fetch(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new EmailSendError(`Resend unreachable: ${(err as Error).message}`);
    }

    if (response.ok) return;

    // The body names the reason (e.g. "validation_error"); it never holds the key.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new EmailSendError(`Resend answered ${response.status}: ${detail}`);
  }
}
