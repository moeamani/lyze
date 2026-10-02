import "server-only";
import { createTransport } from "nodemailer";
import { db } from "@/server/db";
import { devMailbox } from "@/server/db/schema";

export type Mail = { to: string; subject: string; text: string; html: string; url?: string };

export function devMailboxEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.LYZE_DEV_MAILBOX === "1";
}

/**
 * Send an email. With EMAIL_SERVER configured it goes over SMTP; otherwise it is printed to the
 * console and stored in the dev mailbox (/dev/mailbox) so local sign-in works without setup.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const server = process.env.EMAIL_SERVER?.trim();
  if (server) {
    const transport = createTransport(server);
    const result = await transport.sendMail({
      to: mail.to,
      from: process.env.EMAIL_FROM || "Lyze <hello@lyze.local>",
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
    if (failed.length) throw new Error(`Email could not be sent to ${failed.join(", ")}`);
    return;
  }

  if (!devMailboxEnabled()) {
    throw new Error("EMAIL_SERVER is not configured. Set it to send sign-in links in production.");
  }
  console.info(`\n✉️  ${mail.subject} → ${mail.to}\n   ${mail.url ?? mail.text}\n`);
  await db.insert(devMailbox).values({ to: mail.to, subject: mail.subject, text: mail.text, url: mail.url });
}
