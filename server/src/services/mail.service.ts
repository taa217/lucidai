import { Injectable } from '@nestjs/common';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private mailerSend: MailerSend;
  private from: Sender;

  constructor(private configService: ConfigService) {
    this.mailerSend = new MailerSend({
      apiKey: this.configService.get<string>('MAILERSEND_API_KEY')!,
    });
    this.from = new Sender(
      this.configService.get<string>('MAILERSEND_FROM_EMAIL')!,
      this.configService.get<string>('MAILERSEND_FROM_NAME') || 'Lucid Learn'
    );
  }

  async sendVerificationEmail(toEmail: string, code: string) {
    const recipients = [new Recipient(toEmail, '')];
    const emailParams = new EmailParams()
      .setFrom(this.from)
      .setTo(recipients)
      .setSubject('Verify your email for Lucid Learn')
      .setHtml(`
        <h2>Verify your email</h2>
        <p>Your verification code is: <b>${code}</b></p>
        <p>Enter this code in the app to complete your registration.</p>
      `)
      .setText(`Your verification code is: ${code}`);

    await this.mailerSend.email.send(emailParams);
  }
} 