const pad2 = (value: number): string => String(value).padStart(2, "0");
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid time value");
  }

  const hours = date.getHours();
  const hour = hours % 12 || 12;
  const period = hours < 12 ? "AM" : "PM";

  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${hour}:${pad2(date.getMinutes())} ${period}`;
}

export function formatClockTime(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad2).join(":");
}

export function formatFileTimestamp(date: Date): string {
  const day = [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad2).join("");
  return `${day}-${time}`;
}
