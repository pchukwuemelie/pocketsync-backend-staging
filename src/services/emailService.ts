type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

const sendViaResend = async ({ to, subject, html }: EmailPayload): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'PocketSync <onboarding@resend.dev>';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error: ${response.status} ${body}`);
  }
};

export const sendOtpEmail = async (
  email: string,
  code: string,
  purpose: 'signup' | 'reset',
): Promise<{ mocked: boolean }> => {
  const subject =
    purpose === 'signup'
      ? 'Verify your PocketSync account'
      : 'Reset your PocketSync password';

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>PocketSync</h2>
      <p>Your verification code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</p>
      <p>This code expires in 10 minutes. If you did not request this, ignore this email.</p>
    </div>
  `;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV OTP EMAIL] to=${email} purpose=${purpose} code=${code}`);
  }

  if (process.env.RESEND_API_KEY) {
    try {
      await sendViaResend({ to: email, subject, html });
      return { mocked: false };
    } catch (err) {
      console.error('[EMAIL] Resend delivery failed:', err);
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.log(`[EMAIL MOCK] To: ${email} | Purpose: ${purpose} | OTP: ${code}`);
      return { mocked: true };
    }
  }

  console.log(`[EMAIL MOCK] To: ${email} | Purpose: ${purpose} | OTP: ${code}`);
  return { mocked: true };
};