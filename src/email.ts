// Email notification service — sends admin notifications for payouts and disputes.
// Logs to console by default; uses SMTP when nodemailer + env vars are configured.

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _smtpTransport: any = null;

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? "587"),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
  };
}

async function getTransport() {
  if (_smtpTransport) return _smtpTransport;
  const smtp = getSmtpConfig();
  if (!smtp.host) return null;
  try {
    // Dynamic import — nodemailer is an optional dependency
    // @ts-expect-error nodemailer may not be installed
    const mod = await import("nodemailer");
    const factory = mod.default ?? mod;
    if (typeof factory.createTransport !== "function") return null;
    _smtpTransport = factory.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    return _smtpTransport;
  } catch {
    return null;
  }
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  const transport = await getTransport();
  if (!transport) {
    console.log(`[email] To: ${payload.to} | Subject: ${payload.subject}`);
    console.log(`[email] Body: ${payload.body}`);
    return;
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "bot@mining-rewards.io",
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
    });
  } catch (err) {
    console.error("[email] failed to send:", err);
  }
}

function getAdminEmail(): string {
  return process.env.ADMIN_EMAIL ?? "admin@mining-rewards.io";
}

export async function notifyAdminWithdrawal(opts: {
  userId: number;
  amount: number;
  destination: string;
  method: string;
}): Promise<void> {
  const adminEmail = getAdminEmail();
  await sendEmail({
    to: adminEmail,
    subject: `[Mining Rewards] Withdrawal Request — $${opts.amount.toFixed(2)}`,
    body: [
      `A user has requested a withdrawal.`,
      ``,
      `User ID: ${opts.userId}`,
      `Amount: $${opts.amount.toFixed(2)}`,
      `Destination: ${opts.destination}`,
      `Method: ${opts.method}`,
      ``,
      `Please process this payout.`,
    ].join("\n"),
  });
}

export async function notifyAdminDispute(opts: {
  userId: number;
  disputeId: string;
  details: string;
}): Promise<void> {
  const adminEmail = getAdminEmail();
  await sendEmail({
    to: adminEmail,
    subject: `[Mining Rewards] New Dispute — ${opts.disputeId}`,
    body: [
      `A user has submitted a dispute.`,
      ``,
      `User ID: ${opts.userId}`,
      `Dispute ID: ${opts.disputeId}`,
      `Details: ${opts.details}`,
      ``,
      `Please review and resolve.`,
    ].join("\n"),
  });
}

export async function notifyAdminMiningReport(opts: {
  totalUsers: number;
  totalMinutes: number;
  totalEarnings: number;
}): Promise<void> {
  const adminEmail = getAdminEmail();
  await sendEmail({
    to: adminEmail,
    subject: `[Mining Rewards] Periodic Activity Report`,
    body: [
      `Activity Report:`,
      ``,
      `Total active miners: ${opts.totalUsers}`,
      `Total minutes mined: ${opts.totalMinutes}`,
      `Total earnings credited: $${opts.totalEarnings.toFixed(2)}`,
    ].join("\n"),
  });
}
