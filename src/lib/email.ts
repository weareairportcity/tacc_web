import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.EMAIL_FROM || 'booking@theairportcitychurch.com';
const adminEmail = process.env.ADMIN_EMAIL || fromEmail;

export async function sendConfirmationEmail(
  toEmail: string,
  name: string,
  date: string,
  time: string,
  icsContent: string
) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set. Skipping email sending.");
    return;
  }

  try {
    await resend.emails.send({
      from: `The Airport City Church <${fromEmail}>`,
      to: toEmail,
      subject: 'Meeting Confirmation: Time with Pastor',
      html: `
        <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto;">
          <h2>Meeting Confirmation</h2>
          <p>Dear ${name},</p>
          <p>Your meeting with the Pastor has been successfully scheduled.</p>
          <ul>
            <li><strong>Date:</strong> ${date}</li>
            <li><strong>Time:</strong> ${time}</li>
          </ul>
          <p>Please find the calendar invitation attached to this email.</p>
          <p>Blessings,<br/>The Airport City Church</p>
        </div>
      `,
      attachments: [
        {
          filename: 'meeting.ics',
          content: Buffer.from(icsContent).toString('base64'),
        },
      ],
    });
    console.log("Confirmation email sent to", toEmail);
  } catch (error: any) {
    console.error("Error sending email:", error.message || error);
    if (error.response) console.error("Resend Response Error:", error.response.data || error.response);
  }
}

export async function sendAdminNotificationEmail(
  name: string,
  fellowship: string,
  phone: string,
  email: string,
  reason: string,
  date: string,
  time: string,
  cancelUrl: string
) {
  if (!process.env.RESEND_API_KEY) {
    return;
  }

  try {
    await resend.emails.send({
      from: `TACC System <${fromEmail}>`,
      to: adminEmail, // Dedicated admin inbox
      subject: `New Meeting Request: ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>New Meeting Scheduled</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Fellowship:</strong> ${fellowship}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Time:</strong> ${time}</p>
          <p><strong>Reason:</strong><br/>${reason}</p>
          <hr/>
          <p>
            <a href="${cancelUrl}" style="color: red; font-weight: bold;">Click here to cancel this meeting</a>
          </p>
        </div>
      `,
    });
    console.log("Admin notification email sent.");
  } catch (error: any) {
    console.error("Error sending admin email:", error.message || error);
  }
}

export async function sendReminderEmail(
  toEmail: string,
  name: string,
  time: string
) {
  if (!process.env.RESEND_API_KEY) return;

  try {
    await resend.emails.send({
      from: `The Airport City Church <${fromEmail}>`,
      to: toEmail,
      subject: 'Reminder: Meeting with Pastor Tomorrow',
      html: `
        <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto;">
          <h2>Meeting Reminder</h2>
          <p>Dear ${name},</p>
          <p>This is a friendly reminder that you have a scheduled meeting with the Pastor <strong>tomorrow</strong> at <strong>${time}</strong>.</p>
          <p>We look forward to speaking with you.</p>
          <p>Blessings,<br/>The Airport City Church</p>
        </div>
      `,
    });
    console.log("Reminder email sent to", toEmail);
  } catch (error: any) {
    console.error("Error sending reminder email:", error.message || error);
  }
}

export async function sendThankYouEmail(
  toEmail: string,
  name: string
) {
  if (!process.env.RESEND_API_KEY) return;

  try {
    await resend.emails.send({
      from: `The Airport City Church <${fromEmail}>`,
      to: toEmail,
      subject: 'Thank You for Meeting with the Pastor',
      html: `
        <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto;">
          <h2>Thank You</h2>
          <p>Dear ${name},</p>
          <p>It was a blessing to have you meet with Pastor. We hope the session was impactful and encouraging for you.</p>
          <p>If you have any further questions or need additional support, feel free to reach out to us.</p>
          <p>Blessings,<br/>The Airport City Church</p>
        </div>
      `,
    });
    console.log("Thank you email sent to", toEmail);
  } catch (error: any) {
    console.error("Error sending thank you email:", error.message || error);
  }
}

export async function sendCancellationEmail(
  toEmail: string,
  name: string,
  date: string,
  time: string
) {
  if (!process.env.RESEND_API_KEY) return;

  try {
    await resend.emails.send({
      from: `The Airport City Church <${fromEmail}>`,
      to: toEmail,
      subject: 'Update: Your Meeting with the Pastor has been Cancelled',
      html: `
        <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto;">
          <h2>Meeting Cancelled</h2>
          <p>Dear ${name},</p>
          <p>We regret to inform you that your scheduled meeting with the Pastor on <strong>${date} at ${time}</strong> has been cancelled.</p>
          <p>We sincerely apologize for any inconvenience this may cause. If you wish to reschedule, please visit our booking page again.</p>
          <p>Blessings,<br/>The Airport City Church</p>
        </div>
      `,
    });
    console.log("Cancellation email sent to", toEmail);
  } catch (error: any) {
    console.error("Error sending cancellation email:", error.message || error);
  }
}
