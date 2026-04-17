import axios from 'axios';

// Ensure you have MNOTIFY_API_KEY in your .env file
const MNOTIFY_API_KEY = process.env.MNOTIFY_API_KEY || '';
const MNOTIFY_SENDER_ID = process.env.MNOTIFY_SENDER_ID || 'TACCBooking';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '0200000000'; // Set default/fallback for admin

/**
 * Converts a Ghana phone number to the international format required by mNotify.
 * e.g. 0550076503 -> 233550076503
 *      +233550076503 -> 233550076503
 */
function formatGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, ''); // strip non-digits
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return '233' + digits.slice(1);
  return '233' + digits; // assume missing leading 0
}

export async function sendSMS(recipient: string, message: string) {
  if (!MNOTIFY_API_KEY) {
    console.warn('mNotify API key is not set. Skipping SMS sending.');
    return false;
  }

  const formattedPhone = formatGhanaPhone(recipient);
  const url = `https://api.mnotify.com/api/sms/quick?key=${MNOTIFY_API_KEY}`;
  
  const payload = {
    recipient: [formattedPhone], // mNotify expects an array
    sender: MNOTIFY_SENDER_ID,
    message: message,
    is_schedule: 'false',
    schedule_date: ''
  };

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`SMS sent to ${formattedPhone}:`, response.data);
    return true;
  } catch (error: any) {
    console.error(`Error sending SMS to ${formattedPhone}:`, error.response ? error.response.data : error.message);
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
