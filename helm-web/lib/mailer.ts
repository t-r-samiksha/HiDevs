// Email notifications. Uses Resend's free tier when RESEND_API_KEY is set
// (100 emails/day, no card); otherwise logs to the console so the flow still
// works end-to-end for the demo.

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!to) return false;

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "Helm <onboarding@resend.dev>",
          to: [to],
          subject,
          html: body,
        }),
      });
      if (!res.ok) {
        console.error(`[EMAIL] Resend error ${res.status}: ${await res.text().catch(() => "")}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error("[EMAIL] Resend request failed:", e);
      return false;
    }
  }

  // Fallback: log the email so the demo shows the notification flow working.
  console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Body: ${body}`);
  return true;
}
