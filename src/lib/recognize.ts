// 链接识别:从整段分享文案提取 URL 并判断平台类型
export type Platform = "douyin" | "bilibili" | "youtube" | "generic";

const URL_RE = /https?:\/\/[^\s"'<>【】]+/;

export function extractUrl(text: string): string {
  const t = (text || "").trim();
  const m = t.match(URL_RE);
  return m ? m[0] : t;
}

export function recognize(text: string): { platform: Platform; url: string } | null {
  const url = extractUrl(text);
  if (!/^https?:\/\//i.test(url)) return null;
  const u = url.toLowerCase();
  if (u.includes("douyin.com") || u.includes("iesdouyin.com")) {
    return { platform: "douyin", url };
  }
  if (u.includes("bilibili.com") || u.includes("b23.tv")) {
    return { platform: "bilibili", url };
  }
  if (u.includes("youtube.com") || u.includes("youtu.be")) {
    return { platform: "youtube", url };
  }
  return { platform: "generic", url };
}

const MEDIA_EXT_RE = /\.(mp3|mp4|m4a|m4v|aac|flac|wav|webm|flv|mkv|m3u8)(\?|$)/i;
export function isDirectMediaUrl(url: string): boolean {
  return MEDIA_EXT_RE.test(url);
}
