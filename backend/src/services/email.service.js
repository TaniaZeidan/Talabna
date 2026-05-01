const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn('[email] SMTP credentials missing — emails will fail');
  }

  transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,    // true for 465 (SMTPS), false for 587 (STARTTLS)
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Send a password-reset verification code to the user.
 */
async function sendResetCode(toEmail, username, code) {
  const tx = getTransporter();
  const fromName = process.env.SMTP_FROM_NAME || 'Talabna';
  const fromAddr = process.env.SMTP_USER;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Talabna password reset</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f1e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0"
                 style="max-width:520px;background:#fbf7ef;border:1px solid #ddd2bf;border-radius:8px;overflow:hidden;">
            <!-- Header -->
            <tr>
              <td style="background:#1a1410;padding:32px 40px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                  <tr>
                    <td>
                      <div style="display:inline-block;width:48px;height:48px;background:#c75d2c;border-radius:50%;line-height:48px;text-align:center;color:#f6f1e8;font-family:Georgia,serif;font-style:italic;font-size:22px;font-weight:700;vertical-align:middle;">T</div>
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;">
                      <span style="color:#f6f1e8;font-family:Georgia,serif;font-style:italic;font-weight:700;font-size:24px;letter-spacing:-0.5px;">talabna<span style="color:#c75d2c;font-style:normal;">.</span></span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:36px 40px;">
                <p style="margin:0 0 8px;color:#c75d2c;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Password reset</p>
                <h1 style="margin:0 0 16px;color:#1a1410;font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Hi ${escapeHtml(username)},</h1>
                <p style="margin:0 0 20px;color:#4a3f35;font-size:15px;line-height:1.55;">
                  We received a request to reset the password on your Talabna account.
                  Use the code below to verify it's you. The code expires in <strong>15 minutes</strong>.
                </p>

                <!-- Code box -->
                <div style="margin:28px 0;padding:24px;background:#f6f1e8;border:1px dashed #c75d2c;border-radius:8px;text-align:center;">
                  <p style="margin:0 0 8px;color:#8a7d6f;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Verification code</p>
                  <p style="margin:0;color:#1a1410;font-family:'Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:8px;">${code}</p>
                </div>

                <p style="margin:0 0 8px;color:#4a3f35;font-size:14px;line-height:1.55;">
                  Enter this code on the password reset page to set a new password.
                </p>
                <p style="margin:0;color:#8a7d6f;font-size:13px;line-height:1.55;">
                  If you didn't request this, you can safely ignore this email — your password will stay unchanged.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 40px;border-top:1px solid #ddd2bf;background:#f6f1e8;">
                <p style="margin:0;color:#8a7d6f;font-size:12px;text-align:center;">
                  Talabna · طلبنا · Multi-vendor delivery, built in Lebanon.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;

  const text = `Hi ${username},

We received a request to reset your Talabna password.

Your verification code: ${code}

This code expires in 15 minutes. If you didn't request this, ignore this email.

— Talabna`;

  const info = await tx.sendMail({
    from: `"${fromName}" <${fromAddr}>`,
    to: toEmail,
    subject: 'Your Talabna password reset code',
    text,
    html,
  });

  console.log('[email] Reset code sent to', toEmail, '· messageId:', info.messageId);
  return info;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendResetCode };
