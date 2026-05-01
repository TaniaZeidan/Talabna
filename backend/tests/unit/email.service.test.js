const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({ sendMail: mockSendMail }),
}));

const nodemailer = require('nodemailer');

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMail.mockResolvedValue({ messageId: 'test-msg-id' });
  process.env.SMTP_HOST = 'smtp.test.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'test@test.com';
  process.env.SMTP_PASS = 'testpass';
  process.env.SMTP_FROM_NAME = 'TestApp';
});

describe('sendResetCode()', () => {
  let sendResetCode;

  beforeAll(() => {
    ({ sendResetCode } = require('../../src/services/email.service'));
  });

  test('sends email to the correct recipient', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('user@example.com', 'johndoe', '123456');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' })
    );
    spy.mockRestore();
  });

  test('uses the correct subject line', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', 'user1', '999999');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Your Talabna password reset code' })
    );
    spy.mockRestore();
  });

  test('includes the verification code in plain text body', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', 'user1', '654321');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.text).toContain('654321');
    spy.mockRestore();
  });

  test('includes the verification code in HTML body', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', 'user1', '112233');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('112233');
    spy.mockRestore();
  });

  test('includes the username in the email body', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', 'karim', '000000');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.text).toContain('karim');
    expect(call.html).toContain('karim');
    spy.mockRestore();
  });

  test('sets from field with configured name and address', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', 'u', '111111');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.from).toContain('TestApp');
    expect(call.from).toContain('test@test.com');
    spy.mockRestore();
  });

  test('returns sendMail result with messageId', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const result = await sendResetCode('a@b.com', 'u', '111111');
    expect(result).toEqual({ messageId: 'test-msg-id' });
    spy.mockRestore();
  });

  test('propagates sendMail errors', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(sendResetCode('a@b.com', 'u', '111111')).rejects.toThrow('SMTP down');
  });

  test('escapes HTML special chars in username to prevent XSS', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', '<script>alert("xss")</script>', '111111');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).not.toContain('<script>');
    expect(call.html).toContain('&lt;script&gt;');
    spy.mockRestore();
  });

  test('escapes ampersands in username', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', 'Tom & Jerry', '111111');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('Tom &amp; Jerry');
    spy.mockRestore();
  });

  test('escapes double quotes in username', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', 'user"name', '111111');
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('user&quot;name');
    spy.mockRestore();
  });
});

describe('escapeHtml() — via sendResetCode output', () => {
  let sendResetCode;
  beforeAll(() => {
    ({ sendResetCode } = require('../../src/services/email.service'));
  });

  const cases = [
    ['ampersand', 'A&B', '&amp;'],
    ['less-than', 'A<B', '&lt;'],
    ['greater-than', 'A>B', '&gt;'],
    ['double-quote', 'A"B', '&quot;'],
    ['combined', '<"&>', '&lt;&quot;&amp;&gt;'],
  ];

  test.each(cases)('escapes %s correctly', async (_, input, expected) => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    await sendResetCode('a@b.com', input, '000000');
    const html = mockSendMail.mock.calls[0][0].html;
    expect(html).toContain(expected);
    spy.mockRestore();
  });
});
