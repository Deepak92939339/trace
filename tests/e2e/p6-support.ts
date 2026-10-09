import { randomUUID } from "node:crypto";
import {
  asOperator,
  CUSTOMER,
  json,
  MANAGER,
  OPERATOR,
  ORGANIZATION_ID,
  psql,
  savePayload,
  type IssuedQuote,
} from "./p5-support";

/** Helpers for the email outbox spec: Mailpit (the CLI's mail catcher), fixtures, drains. */
export const MAILPIT = "http://127.0.0.1:54324";

export type CaughtMessage = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
  From: { Address: string };
};

async function search(query: string): Promise<CaughtMessage[]> {
  const response = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}&limit=50`,
  );
  if (!response.ok)
    throw new Error(`Mail catcher search failed: ${response.status}`);
  return (
    ((await response.json()) as { messages: CaughtMessage[] }).messages ?? []
  );
}

/** The local catcher keeps mail across database resets, while quote numbers restart. */
export async function clearMailbox() {
  const response = await fetch(`${MAILPIT}/api/v1/messages`, {
    method: "DELETE",
  });
  if (!response.ok)
    throw new Error(`Mail catcher reset failed: ${response.status}`);
}

export const messagesTo = (address: string) => search(`to:"${address}"`);
export const messagesWithSubject = (subject: string) =>
  search(`subject:"${subject}"`);

export async function messageDetail(id: string) {
  const response = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const detail = (await response.json()) as {
    Text: string;
    Subject: string;
    From: { Address: string };
    To: Array<{ Address: string }>;
    ReplyTo: Array<{ Address: string }>;
  };

  // SMTP carries CRLF line endings.
  return { ...detail, Text: detail.Text.replace(/\r\n/g, "\n") };
}

export async function rawMessage(id: string) {
  return (await fetch(`${MAILPIT}/api/v1/message/${id}/raw`)).text();
}

export function uniqueAddress(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

export async function drain(baseURL: string, secret: string) {
  const response = await fetch(`${baseURL}/api/outbox/drain`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null,
  };
}

function asUser(userId: string, body: string) {
  return `begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}';
${body}
commit;`;
}

/** A buyer link on an issued fixture quote, created by the given user. */
export function createShareLink(
  quote: IssuedQuote,
  by: { id: string } = OPERATOR,
): { selector: string; secret: string; linkId: string } {
  const result = json<{ selector: string; secret: string; link_id: string }>(
    asUser(
      by.id,
      `select public.create_quote_share_link('${quote.quoteId}', '${quote.revisionId}',
        (select version from public.quotes where id = '${quote.quoteId}'),
        'link-${randomUUID().slice(0, 6)}@example.test', now() + interval '18 days', gen_random_uuid());`,
    ),
  );
  return {
    selector: result.selector,
    secret: result.secret,
    linkId: result.link_id,
  };
}

/** The buyer responds through the same service broker the public route uses. */
export function recordBuyerEvent(
  kind: "declined" | "change_requested",
  link: { selector: string; secret: string },
  message: string | null,
) {
  const text = message === null ? "null" : `'${message.replace(/'/g, "''")}'`;
  return psql(`select public.broker_record_quote_event('${kind}'::public.quote_recipient_event_type,
    '${link.selector}'::uuid, '${link.secret}',
    extensions.digest(convert_to('p6-e2e-${randomUUID()}', 'UTF8'), 'sha256'),
    gen_random_uuid(), ${text})->>'status'`);
}

/** A quotation submitted with a 15% discount, so it waits for a manager. */
export function provisionWaitingQuote(): { quoteId: string; number: string } {
  return json<{ quoteId: string; number: string }>(
    asOperator(`
do $fixture$
declare created jsonb; v_quote uuid; v_revision uuid;
begin
  created := public.create_verified_quote_draft('${ORGANIZATION_ID}', '${CUSTOMER}',
    'INR', 'en-IN', 'GST 18%', 'exclusive', current_date, current_date + 30, extensions.gen_random_uuid());
  v_quote := (created->>'id')::uuid;
  v_revision := (created->>'current_revision_id')::uuid;
  perform public.save_quote_draft(v_quote, 1, extensions.gen_random_uuid(), ${savePayload("P6 approval fixture", 1, 1, 0, 1500)});
  perform public.submit_quote_revision(v_quote, v_revision, (select version from public.quotes where id = v_quote), extensions.gen_random_uuid());
  create temporary table p6_fixture(value jsonb) on commit drop;
  insert into p6_fixture values (jsonb_build_object('quoteId', v_quote, 'number', (select number from public.quotes where id = v_quote)));
end;
$fixture$;
select value from p6_fixture;`),
  );
}

export type OutboxRow = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error_code: string | null;
  recipient_email: string;
  share_link_id: string | null;
  sent_at: string | null;
  dead_at: string | null;
};

export function outboxFor(quoteId: string): OutboxRow[] {
  return json<OutboxRow[]>(
    `select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'status', status,
      'attempts', attempts, 'last_error_code', last_error_code, 'recipient_email', recipient_email,
      'share_link_id', share_link_id, 'sent_at', sent_at, 'dead_at', dead_at) order by created_at), '[]'::json)
     from public.email_outbox where quote_id = '${quoteId}'`,
  );
}

export function queueBuyerEmailViaView(
  quote: IssuedQuote,
  address: string,
): string {
  return psql(
    asUser(
      OPERATOR.id,
      `insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
       select '${quote.quoteId}', '${quote.revisionId}', version, '${address}', now() + interval '5 days', gen_random_uuid()
       from public.quotes where id = '${quote.quoteId}' returning id;`,
    ),
  )
    .split("\n")[0]!
    .trim();
}

export { MANAGER, OPERATOR };
