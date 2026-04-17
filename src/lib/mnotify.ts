import axios from 'axios';

// Ensure you have MNOTIFY_API_KEY in your .env file
const MNOTIFY_API_KEY = process.env.MNOTIFY_API_KEY || '';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '0200000000'; // Set default/fallback for admin

export async function sendSMS(recipient: string, message: string) {
  if (!MNOTIFY_API_KEY) {
    console.warn('mNotify API key is not set. Skipping SMS sending.');
    return false;
  }

  const url = `https://api.mnotify.com/api/sms/quick?key=${MNOTIFY_API_KEY}`;
  
  const payload = {
    recipient: recipient,
    sender: 'TACC', // Sender ID (Needs to be registered with mNotify)
    message: message
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log(`SMS Sent Successfully to ${recipient}:`, response.data);
    return true;
  } catch (error: any) {
    console.error(`Error sending SMS to ${recipient}:`, error.response ? error.response.data : error.message);
    return false;
  }
}

export async function sendBookingNotifications(userPhone: string, userName: string, date: string, time: string) {
  const userMessage = `Hello ${userName}, your meeting with the Pastor on ${date} at ${time} has been scheduled successfully. - The Airport City Church`;
  const adminMessage = `New Meeting Alert: ${userName} has booked a session on ${date} at ${time}. Phone: ${userPhone}`;

  // Send to User
  await sendSMS(userPhone, userMessage);
  
  // Send to Admin
  await sendSMS(ADMIN_PHONE, adminMessage);
}
