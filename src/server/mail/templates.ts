// Plain, friendly emails. Inline styles only — email clients ignore stylesheets.

const shell = (body: string) => `<!doctype html>
<html><body style="margin:0;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1f23">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border:1px solid #e7e7ea;border-radius:16px;padding:32px">
        <tr><td>
          <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.01em">lyze<span style="color:#6d5bd0">.</span></p>
          ${body}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const button = (url: string, label: string) =>
  `<a href="${url}" style="display:inline-block;background:#6d5bd0;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${label}</a>`;

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function signInEmail(url: string, host: string) {
  return {
    subject: `Your sign-in link for Lyze`,
    text: `Sign in to Lyze (${host}):\n${url}\n\nThe link works once and expires in 24 hours. If you didn't ask for it, you can ignore this email.`,
    html: shell(`
      <h1 style="margin:0 0 8px;font-size:20px">Welcome back 👋</h1>
      <p style="margin:0 0 24px;line-height:1.5;color:#55555c">Tap the button to sign in to <strong>${escape(host)}</strong>. The link works once and expires in 24 hours.</p>
      ${button(url, "Sign in to Lyze")}
      <p style="margin:24px 0 0;font-size:13px;color:#77777e">Didn't ask for this? You can safely ignore it.</p>`),
  };
}

export function inviteEmail(url: string, workspaceName: string, inviterName: string) {
  return {
    subject: `${inviterName} invited you to ${workspaceName} on Lyze`,
    text: `${inviterName} invited you to join "${workspaceName}" on Lyze.\n${url}\n\nThe invite expires in 7 days.`,
    html: shell(`
      <h1 style="margin:0 0 8px;font-size:20px">You're invited ✨</h1>
      <p style="margin:0 0 24px;line-height:1.5;color:#55555c"><strong>${escape(inviterName)}</strong> invited you to join <strong>${escape(workspaceName)}</strong> on Lyze.</p>
      ${button(url, "Join workspace")}
      <p style="margin:24px 0 0;font-size:13px;color:#77777e">This invite expires in 7 days.</p>`),
  };
}

export function formInviteEmail(url: string, title: string, inviterName: string, description?: string) {
  return {
    subject: `${inviterName} invited you to “${title}”`,
    text: `${inviterName} would love your input on “${title}”.\n${description ? `\n${description}\n` : ""}\nYour personal link:\n${url}\n\nThis link is just for you — please don't share it.`,
    html: shell(`
      <h1 style="margin:0 0 8px;font-size:20px">${escape(title)}</h1>
      <p style="margin:0 0 16px;line-height:1.5;color:#55555c"><strong>${escape(inviterName)}</strong> would love your input.</p>
      ${description ? `<p style="margin:0 0 24px;line-height:1.5;color:#55555c">${escape(description)}</p>` : ""}
      ${button(url, "Start")}
      <p style="margin:24px 0 0;font-size:13px;color:#77777e">This link is personal — please don't forward it.</p>`),
  };
}

export function consentEmail(url: string, studyName: string, researcherName: string, when?: string) {
  return {
    subject: `Please review the consent form for “${studyName}”`,
    text: `${researcherName} invited you to take part in “${studyName}”${when ? ` (${when})` : ""}.\n\nPlease read and sign the consent form before the session:\n${url}\n\nYou can ask questions or withdraw at any time.`,
    html: shell(`
      <h1 style="margin:0 0 8px;font-size:20px">Before we talk 🌿</h1>
      <p style="margin:0 0 24px;line-height:1.5;color:#55555c"><strong>${escape(researcherName)}</strong> invited you to take part in <strong>${escape(studyName)}</strong>${when ? ` on ${escape(when)}` : ""}. Please read and sign the consent form first — it takes a minute.</p>
      ${button(url, "Review consent form")}
      <p style="margin:24px 0 0;font-size:13px;color:#77777e">Taking part is voluntary. You can ask questions or withdraw at any time.</p>`),
  };
}
