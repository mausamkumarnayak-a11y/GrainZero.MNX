/**
 * server/utils/time.js
 * Timezone helpers for Asia/Kolkata (IST = UTC+05:30)
 */

function todayIST(offsetDays = 0) {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istMs = utcMs + (5.5 * 60 * 60 * 1000) + (offsetDays * 24 * 60 * 60 * 1000);
  const istDate = new Date(istMs);
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const day = String(istDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nowIST() {
  return new Date();
}

function mealDateTimeIST(dateString, timeString) {
  if (!dateString || !timeString) return null;
  const time = timeString.length === 5 ? `${timeString}:00` : timeString;
  return new Date(`${dateString}T${time}+05:30`);
}

module.exports = {
  todayIST,
  nowIST,
  mealDateTimeIST
};

