import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL?.trim() || "German Verb Master <onboarding@resend.dev>";

let cachedResend: Resend | null = null;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getResendClient(): Resend {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured. Email delivery is disabled.");
  }

  if (!cachedResend) {
    cachedResend = new Resend(RESEND_API_KEY);
  }

  return cachedResend;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail(options: SendEmailOptions): Promise<void> {
  const resend = getResendClient();

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

interface SendVerificationEmailOptions {
  url: string;
  token: string;
  name?: string | null;
}

export async function sendVerificationEmail(to: string, options: SendVerificationEmailOptions): Promise<void> {
  const subject = "Verify your German Verb Master account";
  const safeName = options.name ? escapeHtml(options.name) : undefined;
  const greeting = safeName ? `Hi ${safeName},` : "Welcome to German Verb Master!";
  const text = [
    options.name ? `Hi ${options.name},` : "Welcome to German Verb Master!",
    "",
    "Please confirm your email address to finish setting up your account.",
    `Verification link: ${options.url}`,
    "",
    `Verification code: ${options.token}`,
    "",
    "If you didn't request this, you can ignore this message.",
  ].join("\n");

  const html = `
    <p>${greeting}</p>
    <p>Please confirm your email address to finish setting up your account.</p>
    <p><a href="${options.url}">Verify my email</a></p>
    <p>Verification code: <code>${options.token}</code></p>
    <p>If you didn't request this, you can ignore this message.</p>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text,
  });
}

interface SendPasswordResetEmailOptions {
  url: string;
  token: string;
  name?: string | null;
}

export async function sendPasswordResetEmail(to: string, options: SendPasswordResetEmailOptions): Promise<void> {
  const subject = "Reset your German Verb Master password";
  const safeName = options.name ? escapeHtml(options.name) : undefined;
  const greeting = safeName ? `Hi ${safeName},` : "Hello,";
  const text = [
    options.name ? `Hi ${options.name},` : "Hello,",
    "We received a request to reset your German Verb Master password.",
    "",
    `Reset link: ${options.url}`,
    "",
    `Reset code: ${options.token}`,
    "",
    "If you didn't request a password reset, you can safely ignore this email.",
  ].join("\n");

  const html = `
    <p>${greeting}</p>
    <p>We received a request to reset your German Verb Master password.</p>
    <p><a href="${options.url}">Reset my password</a></p>
    <p>Reset code: <code>${options.token}</code></p>
    <p>If you didn't request a password reset, you can safely ignore this email.</p>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text,
  });
}
