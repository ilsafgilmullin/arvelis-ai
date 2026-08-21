import nodemailer from 'nodemailer';

const UNSAFE_HEADER_PATTERN = /[\r\n]/;
const CLOSED_TEST_SMTP_HOST = 'smtp.yandex.ru';
const CLOSED_TEST_SMTP_MAILBOX = 'arvelis.auth@yandex.ru';

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() !== value || UNSAFE_HEADER_PATTERN.test(value)) {
    throw new Error(`Missing or invalid ${name}`);
  }
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (value.trim() !== value || UNSAFE_HEADER_PATTERN.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function parsePort(value) {
  const port = Number(value ?? '465');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP_PORT');
  return port;
}

function parseSecure(value, port) {
  if (value === undefined || value === '') return port === 465;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Invalid SMTP_SECURE');
}

function smtpFailureSummary(error, stage) {
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  const responseCode = Number.isInteger(error?.responseCode) ? error.responseCode : null;

  let category = 'UNKNOWN';
  if (code === 'EAUTH' || responseCode === 535) category = 'AUTH_REJECTED';
  else if (code === 'ETIMEDOUT') category = 'TIMEOUT';
  else if (code === 'EDNS') category = 'DNS';
  else if (code === 'ECONNECTION' || code === 'ESOCKET') category = 'NETWORK_OR_TLS';
  else if (code === 'EENVELOPE') category = 'SENDER_OR_RECIPIENT';
  else if (code === 'EMESSAGE') category = 'MESSAGE_REJECTED';

  const responseSuffix = responseCode === null ? '' : ` responseCode=${responseCode}`;
  return `stage=${stage} category=${category} code=${code}${responseSuffix}`;
}

async function main() {
  const host = optional('SMTP_HOST', CLOSED_TEST_SMTP_HOST);
  const port = parsePort(process.env.SMTP_PORT);
  const secure = parseSecure(process.env.SMTP_SECURE, port);
  const username = optional('SMTP_USERNAME', CLOSED_TEST_SMTP_MAILBOX);
  const password = required('SMTP_PASSWORD');
  const from = optional('SMTP_FROM', CLOSED_TEST_SMTP_MAILBOX);

  if (host !== CLOSED_TEST_SMTP_HOST || username !== CLOSED_TEST_SMTP_MAILBOX || from !== username) {
    throw new Error('Unexpected closed-test SMTP identity');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: username, pass: password },
    requireTLS: !secure,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  });

  let stage = 'verify';
  try {
    await transporter.verify();
    stage = 'send';
    await transporter.sendMail({
      from,
      to: username,
      subject: 'ARVELIS AI — проверка почтового канала',
      text: [
        'Это техническое тестовое письмо ARVELIS AI.',
        '',
        'SMTP-подключение и доставка работают. Это письмо не содержит код входа и не создаёт пользовательскую сессию.',
        '',
        'ARVELIS AI',
        'INTELLIGENCE. PRECISION. RESULTS.',
      ].join('\n'),
    });
  } catch (error) {
    console.error(`ARVELIS SMTP smoke: FAIL (${smtpFailureSummary(error, stage)})`);
    process.exitCode = 1;
    return;
  }

  console.log('ARVELIS SMTP smoke: PASS');
}

void main().catch(() => {
  console.error('ARVELIS SMTP smoke: FAIL (stage=setup category=CONFIGURATION code=LOCAL)');
  process.exitCode = 1;
});
