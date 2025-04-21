export function getSamaraDateTimeNow(): [string, string] {
  const [day, time] = new Date()
    .toLocaleString('ru-RU', {
      timeZone: 'Europe/Samara',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .split(', ');

  return [day.split('.').reverse().join('-'), time.slice(0, 5)];
}
