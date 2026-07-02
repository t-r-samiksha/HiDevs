export async function sendSlackMessage(
  webhookUrl: string,
  message: string,
  channel?: string
): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, ...(channel && { channel }) }),
  });
  return res.ok;
}
