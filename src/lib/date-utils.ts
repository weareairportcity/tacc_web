import { format, isMonday, isThursday, startOfDay, addDays, getHours, getMinutes } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = 'Africa/Accra';

export function getAccraTime(date: Date = new Date()) {
  return toZonedTime(date, TIMEZONE);
}

export function isBookableDay(date: Date, currentAccraTime: Date = getAccraTime()) {
  // Must be Monday or Thursday
  if (!isMonday(date) && !isThursday(date)) {
    return false;
  }

  const startOfDate = startOfDay(date);
  const startOfCurrent = startOfDay(currentAccraTime);

  // Cannot book in the past
  if (startOfDate < startOfCurrent) {
    return false;
  }

  // 12 Noon same-day cutoff
  if (startOfDate.getTime() === startOfCurrent.getTime()) {
    const currentHour = getHours(currentAccraTime);
    if (currentHour >= 12) {
      return false; // Past noon on the same day
    }
  }

  return true;
}

export function generateAvailableDays(numDays: number = 30): Date[] {
  const currentAccraTime = getAccraTime();
  const today = startOfDay(currentAccraTime);
  const days: Date[] = [];
  
  for (let i = 0; i < numDays; i++) {
    const d = addDays(today, i);
    if (isBookableDay(d, currentAccraTime)) {
      days.push(d);
    }
  }
  return days;
}

export const AVAILABLE_SLOTS = ["16:00", "17:00", "18:00"];

export function formatAccraDate(date: Date) {
  return formatInTimeZone(date, TIMEZONE, 'MMM dd, yyyy');
}
