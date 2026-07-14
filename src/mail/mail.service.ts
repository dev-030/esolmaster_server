import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  /**
   * Low-level send helper. Never throws to the caller — a failed email must not
   * break the surrounding request (e.g. a password-reset request). Logs instead.
   */
  private async send(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const from = process.env.MAIL_FROM || process.env.MAIL_USER;
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent to ${to} — "${subject}"`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${to}: ${message}`);
      return false;
    }
  }

  // 🔑 Forgot Password OTP
  async sendResetPasswordCode(to: string, code: string): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; padding:24px; max-width:480px; margin:auto;">
        <h2 style="color:#0f172a;">Password Reset Code</h2>
        <p>Hello,</p>
        <p>Use the verification code below to reset your password:</p>
        <div style="margin:24px 0; text-align:center;">
          <span style="
            display:inline-block;
            font-size:32px;
            letter-spacing:10px;
            font-weight:bold;
            color:#2d89ef;
            background:#eff6ff;
            padding:14px 24px;
            border-radius:10px;
          ">${code}</span>
        </div>
        <p>This code expires in <b>10 minutes</b>. Do not share it with anyone.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
        <p style="font-size:12px;color:#666;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `;
    return this.send(to, 'Your password reset code', html);
  }

  /**
   * Generic notification email (task opened, task ending soon, subscription
   * expiring, etc). Best-effort — returns whether it was accepted by the SMTP server.
   */
  async sendNotificationMail(
    to: string,
    subject: string,
    heading: string,
    body: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; padding:24px; max-width:520px; margin:auto;">
        <h2 style="color:#0f172a;">${heading}</h2>
        <div style="color:#334155; font-size:14px; line-height:1.6;">${body}</div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
        <p style="font-size:12px;color:#666;">This is an automated message from your English Learning platform.</p>
      </div>
    `;
    return this.send(to, subject, html);
  }
}
