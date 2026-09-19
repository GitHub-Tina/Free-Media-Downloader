export function fmtBytes(n: number): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function fmtSpeed(n: number): string {
  if (!n || n <= 0) return "";
  return `${fmtBytes(n)}/s`;
}

export function fmtRemaining(downloaded: number, total: number, speed: number): string {
  if (!total || !speed || speed <= 0) return "";
  const secs = Math.max(0, Math.round((total - downloaded) / speed));
  if (secs < 60) return `剩余 ${secs} 秒`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `剩余 ${m} 分 ${secs % 60} 秒`;
  return `剩余 ${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

export function fmtWhen(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86400000;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 2 * day) return "昨天";
  if (diff < 3 * day) return "前天";
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}
