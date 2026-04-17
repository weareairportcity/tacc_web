import { google } from 'googleapis';
import { getAccraTime } from './date-utils';
import { addMinutes } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: SCOPES,
});

const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

export async function createCalendarEvent(bookingData: {
  name: string;
  fellowship: string;
  phone: string;
  email: string;
  reason: string;
  date: string; // ISO date string from frontend
  time: string; // e.g., "16:00"
}) {
  if (!CALENDAR_ID) {
    console.warn("GOOGLE_CALENDAR_ID is not set. Skipping event creation.");
    return null;
  }

  // Calculate start and end times in Africa/Accra timezone
  const dateObj = new Date(bookingData.date);
  const [hours, minutes] = bookingData.time.split(':').map(Number);
  dateObj.setHours(hours, minutes, 0, 0);

  // Since the date coming from frontend is likely already in local or we need to be careful,
  // Let's create an ISO string representing the exact time in Accra timezone
  const startDateTime = formatInTimeZone(dateObj, 'Africa/Accra', "yyyy-MM-dd'T'HH:mm:ssXXX");
  const endDateObj = addMinutes(dateObj, 30);
  const endDateTime = formatInTimeZone(endDateObj, 'Africa/Accra', "yyyy-MM-dd'T'HH:mm:ssXXX");

  const event = {
    summary: `Meeting with ${bookingData.name}`,
    description: `
      Name: ${bookingData.name}
      Fellowship: ${bookingData.fellowship}
      Phone: ${bookingData.phone}
      Email: ${bookingData.email}
      Reason: ${bookingData.reason}
    `,
    start: {
      dateTime: startDateTime,
      timeZone: 'Africa/Accra',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Africa/Accra',
    },
    attendees: bookingData.email ? [{ email: bookingData.email }] : [],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
      sendUpdates: 'all', // Send email notifications to attendees
    });
    
    console.log('Event created:', response.data.htmlLink);
    return response.data.id; // Return the event ID
  } catch (error: any) {
    console.error('Error creating calendar event:', error.message);
    return null; // Non-fatal: booking proceeds without calendar event
  }
}

export async function deleteCalendarEvent(eventId: string) {
  if (!CALENDAR_ID) return;
  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: eventId,
    });
    console.log(`Event ${eventId} deleted successfully`);
  } catch (error: any) {
    console.error(`Error deleting event ${eventId}:`, error.message);
    // Non-fatal: log and continue
  }
}
