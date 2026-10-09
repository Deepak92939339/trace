import {
  emailErrorLabel,
  emailKindLabel,
  emailStatusLabel,
  type EmailActivityRow,
} from "@/lib/outbox/status";

/**
 * Emails sent about this quotation. Buyer emails show the buyer's address; internal
 * notifications show only "Team notification" (the database never returns their addresses).
 */
export function EmailActivityList({
  emails,
  locale,
  timezone,
}: {
  emails: EmailActivityRow[];
  locale: string;
  timezone: string;
}) {
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });
  return (
    <section
      className="email-panel"
      aria-labelledby="email-activity-heading"
      data-testid="email-activity"
    >
      <header>
        <p className="eyebrow">Email</p>
        <h2 id="email-activity-heading">Emails</h2>
        <p>
          Sent means the message was handed to the mail server. It does not
          confirm that anyone has read it.
        </p>
      </header>
      <div className="email-panel-list">
        {emails.length === 0 ? (
          <p className="quiet-empty">No emails have been queued.</p>
        ) : (
          <table>
            <caption className="sr-only">
              Emails queued for this quotation
            </caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">To</th>
                <th scope="col">Queued</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => {
                const reason =
                  email.display_status === "failed" ||
                  email.display_status === "cancelled"
                    ? emailErrorLabel(email.last_error_code)
                    : null;
                return (
                  <tr key={email.id}>
                    <td>{emailKindLabel(email.kind)}</td>
                    <td>{email.recipient_label}</td>
                    <td>
                      <time dateTime={email.created_at}>
                        {dateTime.format(new Date(email.created_at))}
                      </time>
                    </td>
                    <td>
                      <span
                        className={`email-status email-status-${email.display_status}`}
                      >
                        {emailStatusLabel(email)}
                      </span>
                      {reason && <small> {reason}</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
