const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  hour12: true,
});

const pad2 = (value: number): string => String(value).padStart(2, "0");

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

export function formatClockTime(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad2).join(":");
}

export function formatFileTimestamp(date: Date): string {
  const day = [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad2).join("");
  return `${day}-${time}`;
}
