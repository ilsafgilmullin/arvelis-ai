import nodemailer from 'nodemailer';

const UNSAFE_HEADER_PATTERN = /[\r\n]/;
const CLOSED_TEST_SMTP_HOST = 'smtp.yandex.ru';
const CLOSED_TEST_SMTP_LOGIN = 'arvelis.auth';
const CLOSED_TEST_SMTP_FROM = 'arvelis.auth@yandex.ru';

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

function classifyError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  const responseCode = Number.isInteger(error?.responseCode) ? String(error.responseCode) : 'none';
  if (code === 'EAUTH' || responseCode === '535') return { category: 'AUTH_REJECTED', code, responseCode };
  if (code === 'ETIMEDOUT') return { category: 'TIMEOUT', code, responseCode };
  if (code === 'ESOCKET') return { category: 'NETWORK_OR_TLS', code, responseCode };
  if (code === 'EDNS' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { category: 'DNS', code, responseCode };
  return { category: 'OTHER', code, responseCode };
}

async function main() {
  const host = optional('SMTP_HOST', CLOSED_TEST_SMTP_HOST);
  const port = parsePort(process.env.SMTP_PORT);
  const secure = parseSecure(process.env.SMTP_SECURE, port);
  const username = optional('SMTP_USERNAME', CLOSED_TEST_SMTP_LOGIN);
  const password = required('SMTP_PASSWORD');
  const from = optional('SMTP_FROM', CLOSED_TEST_SMTP_FROM);

  if (host !== CLOSED_TEST_SMTP_HOST || username !== CLOSED_TEST_SMTP_LOGIN || from !== CLOSED_TEST_SMTP_FROM) {
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

  try {
    await transporter.verify();
  } catch (error) {
    const diagnostic = classifyError(error);
    console.error(`ARVELIS SMTP smoke: FAIL (stage=verify category=${diagnostic.category} code=${diagnostic.code} responseCode=${diagnostic.responseCode})`);
    process.exitCode = 1;
    return;
  }

  try {
    await transporter.sendMail({
      from,
      to: from,
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
    const diagnostic = classifyError(error);
    console.error(`ARVELIS SMTP smoke: FAIL (stage=send category=${diagnostic.category} code=${diagnostic.code} responseCode=${diagnostic.responseCode})`);
    process.exitCode = 1;
    return;
  }

  console.log('ARVELIS SMTP smoke: PASS');
}

void main().catch(() => {
  console.error('ARVELIS SMTP smoke: FAIL (stage=setup category=OTHER code=UNKNOWN responseCode=none)');
  process.exitCode = 1;
});
