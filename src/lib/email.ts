import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.EMAIL_FROM || 'booking@theairportcitychurch.com';

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
  } catch (error) {
    console.error("Error sending email:", error);
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
      to: fromEmail, // Sending to admin
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
  } catch (error) {
    console.error("Error sending admin email:", error);
  }
}
