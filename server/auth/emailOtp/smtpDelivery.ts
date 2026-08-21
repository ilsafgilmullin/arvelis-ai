import nodemailer from 'nodemailer';
import type { EmailOtpDelivery, EmailOtpDeliveryPort } from './contracts';

export type SmtpEmailOtpDeliveryConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
};

const UNSAFE_HEADER_PATTERN = /[\r\n]/;

function assertHeaderSafe(value: string, label: string): void {
  if (!value || value.length > 320 || UNSAFE_HEADER_PATTERN.test(value)) {
    throw new Error(`Invalid SMTP ${label}`);
  }
}

export class SmtpEmailOtpDelivery implements EmailOtpDeliveryPort {
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;
  private readonly from: string;

  constructor(config: SmtpEmailOtpDeliveryConfig) {
    assertHeaderSafe(config.host, 'host');
    assertHeaderSafe(config.username, 'username');
    assertHeaderSafe(config.from, 'from');
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || !config.password) {
      throw new Error('Invalid SMTP configuration');
    }

    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password,
      },
      requireTLS: !config.secure,
      tls: {
        minVersion: 'TLSv1.2',
      },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 12_000,
    });
  }

  async sendCode(delivery: EmailOtpDelivery): Promise<void> {
    assertHeaderSafe(delivery.to, 'recipient');
    if (!/^\d{4,9}$/.test(delivery.code)) throw new Error('Invalid OTP delivery payload');

    const action = delivery.intent === 'sign_up' ? 'регистрации' : 'входа';
    const minutes = Math.max(1, Math.ceil((delivery.expiresAt - Date.now()) / 60_000));

    await this.transporter.sendMail({
      from: this.from,
      to: delivery.to,
      subject: `ARVELIS AI — код ${action}`,
      text: [
        `Код для ${action} в ARVELIS AI: ${delivery.code}`,
        '',
        `Код действует около ${minutes} мин. и используется только один раз.`,
        'Если вы не запрашивали этот код, просто проигнорируйте письмо.',
        '',
        'ARVELIS AI',
        'INTELLIGENCE. PRECISION. RESULTS.',
      ].join('\n'),
    });
  }
}
