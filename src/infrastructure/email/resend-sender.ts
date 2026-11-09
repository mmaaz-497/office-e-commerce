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
/**
 * Pauses before the 2nd and 3rd try. Connections to Resend sometimes stall
 * (seen 2026-11-09: one connect in three hung for 7 s), so one send retries
 * a dropped connection, a 429 or a 5xx at once instead of waiting for the
 * next job run. The idempotency key makes every retry safe.
 */
const RETRY_DELAYS_MS = [1_000, 3_000];

export interface ResendSenderOptions {
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
}

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

export class ResendEmailSender implements EmailSender {
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelaysMs: readonly number[];

  constructor(
    private readonly apiKey: string,
    options: ResendSenderOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retryDelaysMs = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  }

  async send(email: OutgoingEmail): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.sendOnce(email);
        return;
      } catch (err) {
        const retryable = err instanceof TransientEmailError;
        const delay = this.retryDelaysMs[attempt];
        if (!retryable || delay === undefined) throw toSendError(err);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async sendOnce(email: OutgoingEmail): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_EMAILS_URL, {
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
      throw new TransientEmailError(`Resend unreachable: ${(err as Error).message}`);
    }

    if (response.ok) return;

    // The body names the reason (e.g. "validation_error"); it never holds the key.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    const message = `Resend answered ${response.status}: ${detail}`;
    throw isTransient(response.status)
      ? new TransientEmailError(message)
      : new EmailSendError(message);
  }
}

/** A failure worth retrying within the same send. */
class TransientEmailError extends EmailSendError {}

function toSendError(err: unknown): EmailSendError {
  if (err instanceof TransientEmailError) return new EmailSendError(err.message);
  if (err instanceof EmailSendError) return err;
  return new EmailSendError((err as Error).message);
}
