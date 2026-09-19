use futures::StreamExt;
use regex::Regex;
use reqwest::Client;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tauri::{AppHandle, Emitter, Manager, State};

const DOUYIN_PAGE_UA: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
/// 商店版与完整版共存的隔离标识(安装目录/数据目录各自独立)
pub fn store_mode() -> bool {
    cfg!(feature = "store")
}

const GENERIC_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ---------------- 任务注册表与进度事件 ----------------

#[derive(Clone, Serialize, Default)]
struct Progress {
    id: String,
    status: String, // running | done | error | cancelled
    downloaded: u64,
    total: u64,
    speed: f64,
    percent: f64,
    message: String,
    path: String,
    name: String,
}

struct TaskControl {
    abort: Arc<AtomicBool>,
    child: Mutex<Option<tokio::process::Child>>,
}

#[derive(Clone, Default)]
struct TaskRegistry {
    map: Arc<Mutex<HashMap<String, Arc<TaskControl>>>>,
}

impl TaskRegistry {
    fn insert(&self, id: &str, ctl: Arc<TaskControl>) {
        self.map.lock().unwrap().insert(id.to_string(), ctl);
    }
    fn remove(&self, id: &str) {
        self.map.lock().unwrap().remove(id);
    }
    fn get(&self, id: &str) -> Option<Arc<TaskControl>> {
        self.map.lock().unwrap().get(id).cloned()
    }
}

fn emit(app: &AppHandle, p: Progress) {
    let _ = app.emit("task-progress", p);
}

fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\r' | '\n' | '\t' => '_',
            _ => c,
        })
        .collect();
    let trimmed = cleaned.trim_matches(|c| c == ' ' || c == '.');
    let out = if trimmed.is_empty() { "media" } else { trimmed };
    out.chars().take(100).collect()
}

pub fn find_exe(names: &[&str]) -> Option<PathBuf> {
    // 1. 应用自身所在目录(安装目录随包分发;MEDIA_DOWNLOADER_BIN 可覆盖)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for n in names {
                let cand = dir.join(n);
                if cand.is_file() {
                    return Some(cand);
                }
                #[cfg(windows)]
                {
                    let exe = dir.join(format!("{}.exe", n));
                    if exe.is_file() {
                        return Some(exe);
                    }
                }
            }
        }
    }
    if let Ok(p) = std::env::var("MEDIA_DOWNLOADER_BIN") {
        let dir = PathBuf::from(p);
        for n in names {
            let cand = dir.join(n);
            if cand.exists() {
                return Some(cand);
            }
        }
    }
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path) {
        for n in names {
            let cand = dir.join(n);
            if cand.is_file() {
                return Some(cand);
            }
            #[cfg(windows)]
            {
                let exe = dir.join(format!("{}.exe", n));
                if exe.is_file() {
                    return Some(exe);
                }
            }
        }
    }
    None
}

// ---------------- 抖音解析 ----------------

async fn douyin_video_id(text: &str) -> Result<String, String> {
    let re = Regex::new(r"modal_id=(\d+)").unwrap();
    if let Some(c) = re.captures(text) {
        return Ok(c[1].to_string());
    }
    let re = Regex::new(r"douyin\.com/video/(\d+)").unwrap();
    if let Some(c) = re.captures(text) {
        return Ok(c[1].to_string());
    }
    let re = Regex::new(r"https?://v\.douyin\.com/[\w\-]+").unwrap();
    if let Some(m) = re.find(text) {
        let client = Client::builder().user_agent(GENERIC_UA).build().unwrap();
        let resp = client
            .get(m.as_str())
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("短链解析失败: {e}"))?;
        let final_url = resp.url().to_string();
        let re = Regex::new(r"/video/(\d+)").unwrap();
        if let Some(c) = re.captures(&final_url) {
            return Ok(c[1].to_string());
        }
        let re = Regex::new(r"modal_id=(\d+)").unwrap();
        if let Some(c) = re.captures(&final_url) {
            return Ok(c[1].to_string());
        }
        return Err(format!("短链未指向视频页: {final_url}"));
    }
    Err("分享文案中未找到抖音链接".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoInfo {
    title: String,
    url: String,
    kind: String,
}

#[tauri::command]
async fn douyin_resolve(share_text: String, keep_watermark: Option<bool>) -> Result<VideoInfo, String> {

    let vid = douyin_video_id(&share_text).await?;

    // 1. 注册匿名 ttwid(无需登录):回调 302 的 Set-Cookie 里取 ttwid 值。
    //    注意 cookie 按 domain 隔离(ixigua 注册、douyin 使用),必须手动携带。
    let body = serde_json::json!({
        "region": "cn", "aid": 1768, "needFid": false,
        "service": "www.ixigua.com",
        "migrate_info": {"ticket": "", "source": "node"},
        "cbUrlProtocol": "https", "union": true,
    });
    let noredirect = Client::builder()
        .user_agent(GENERIC_UA)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let resp: serde_json::Value = noredirect
        .post("https://ttwid.bytedance.com/ttwid/union/register/")
        .json(&body)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("ttwid 注册失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("ttwid 响应解析失败: {e}"))?;
    let redirect = resp["redirect_url"]
        .as_str()
        .ok_or("ttwid 注册返回异常")?
        .to_string();
    let callback = noredirect
        .get(&redirect)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("ttwid 回调失败: {e}"))?;
    let ttwid = callback
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find_map(|c| c.strip_prefix("ttwid=").map(|v| v.split(';').next().unwrap_or(v).to_string()))
        .ok_or("ttwid 回调未返回 ttwid cookie")?;

    // 2. 拉取移动端分享页 SSR 数据(手动带 ttwid)
    let client = Client::builder().user_agent(DOUYIN_PAGE_UA).build().unwrap();
    let page_url = format!("https://www.iesdouyin.com/share/video/{vid}");
    let html = client
        .get(&page_url)
        .header("Cookie", format!("ttwid={ttwid}"))
        .header("Referer", "https://www.douyin.com/")
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("分享页请求失败: {e}"))?
        .text()
        .await
        .map_err(|e| format!("分享页读取失败: {e}"))?;

    // 3. 解析 window._ROUTER_DATA
    let re = Regex::new(r"window\._ROUTER_DATA\s*=\s*(\{.*?\})\s*</script>").unwrap();
    let json_str = re
        .captures(&html)
        .ok_or("分享页被风控拦截,未找到视频数据,请稍后重试")?
        .get(1)
        .map(|m| m.as_str())
        .unwrap();
    let data: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| format!("视频数据解析失败: {e}"))?;

    let loader = data
        .get("loaderData")
        .and_then(|v| v.as_object())
        .ok_or("页面数据结构异常")?;
    let mut item: Option<&serde_json::Value> = None;
    for v in loader.values() {
        if let Some(obj) = v.as_object() {
            if let Some(info) = obj.get("videoInfoRes") {
                item = info
                    .get("item_list")
                    .and_then(|l| l.as_array())
                    .and_then(|a| a.first());
                break;
            }
        }
    }
    let item = item.ok_or_else(|| {
        let keys: Vec<String> = loader
            .keys()
            .cloned()
            .collect();
        let counts: Vec<String> = loader
            .values()
            .filter_map(|v| v.get("videoInfoRes"))
            .map(|v| v.to_string())
            .collect();
        format!(
            "页面数据中没有视频条目(keys={:?}, info={})",
            keys,
            counts.first().map(|s| s.chars().take(300).collect::<String>()).unwrap_or_default()
        )
    })?;
    let title = item["desc"]
        .as_str()
        .or(item["title"].as_str())
        .unwrap_or(&vid);
    let url = item["video"]["play_addr"]["url_list"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|u| u.as_str())
        .ok_or("未找到播放地址(视频可能已删除或需要登录)")?
        .to_string();
    // playwm=带水印,play=无水印;商店版(keep_watermark=true)保留官方水印以规避合规风险
    let final_url = if keep_watermark.unwrap_or(false) {
        url
    } else {
        url.replace("playwm", "play")
    };
    Ok(VideoInfo {
        title: title.to_string(),
        url: final_url,
        kind: "douyin".into(),
    })
}

// ---------------- HTTP 直链下载(带进度/取消/断点续传) ----------------

async fn run_http_download(
    app: AppHandle,
    registry: TaskRegistry,
    id: String,
    url: String,
    dest: PathBuf,
    referer: Option<String>,
) {
    let ctl = match registry.get(&id) {
        Some(c) => c,
        None => return,
    };
    // 部分文件:下载中写 dest.part,完成后改名为 dest;暂停/出错保留,下次从断点续传
    let part = PathBuf::from(format!("{}.part", dest.to_string_lossy()));
    let result: Result<(), String> = async {
        let client = Client::builder().user_agent(GENERIC_UA).build().unwrap();
        let mut req = client.get(&url).timeout(Duration::from_secs(60));
        if let Some(r) = &referer {
            req = req.header("Referer", r);
        }

        // 断点续传:已有 .part 则从其大小发起 Range 请求
        let mut offset: u64 = 0;
        if part.is_file() {
            offset = tokio::fs::metadata(&part).await.map(|m| m.len()).unwrap_or(0);
            req = req.header("Range", format!("bytes={offset}-"));
        }
        let mut resp = req.send().await.map_err(|e| format!("连接失败: {e}"))?;
        let status = resp.status();

        if offset > 0 && status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            // 断点已到文件末尾:视为已完成
            tokio::fs::rename(&part, &dest)
                .await
                .map_err(|e| format!("断点文件处理失败: {e}"))?;
            return Ok(());
        }
        let resumed = offset > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT;
        if !resumed {
            offset = 0; // 服务端不支持 Range(200 全量):从头下载
        }
        let total = if resumed {
            offset + resp.content_length().unwrap_or(0)
        } else {
            resp.content_length().unwrap_or(0)
        };

        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
        let mut file = if resumed {
            tokio::fs::OpenOptions::new()
                .append(true)
                .open(&part)
                .await
                .map_err(|e| format!("无法续写文件: {e}"))?
        } else {
            tokio::fs::File::create(&part)
                .await
                .map_err(|e| format!("无法创建文件: {e}"))?
        };

        let mut downloaded = offset;
        let mut last_emit = Instant::now() - Duration::from_millis(500);
        let mut last_bytes = downloaded;
        let mut last_time = Instant::now();
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if ctl.abort.load(Ordering::Relaxed) {
                return Err("__cancelled__".into());
            }
            let chunk = chunk.map_err(|e| format!("下载中断: {e}"))?;
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            if last_emit.elapsed() >= Duration::from_millis(250) {
                let dt = last_time.elapsed().as_secs_f64().max(0.001);
                let speed = (downloaded - last_bytes) as f64 / dt;
                last_bytes = downloaded;
                last_time = Instant::now();
                last_emit = Instant::now();
                let percent = if total > 0 {
                    downloaded as f64 * 100.0 / total as f64
                } else {
                    0.0
                };
                emit(
                    &app,
                    Progress {
                        id: id.clone(),
                        status: "running".into(),
                        downloaded,
                        total,
                        speed,
                        percent,
                        ..Default::default()
                    },
                );
            }
        }
        file.flush().await.ok();
        drop(file);
        tokio::fs::rename(&part, &dest)
            .await
            .map_err(|e| format!("完成改名失败: {e}"))?;
        Ok(())
    }
    .await;
    match result {
        Ok(()) => {
            emit(
                &app,
                Progress {
                    id: id.clone(),
                    status: "done".into(),
                    percent: 100.0,
                    path: dest.to_string_lossy().to_string(),
                    ..Default::default()
                },
            );
        }
        Err(e) => {
            // .part 保留供断点续传;仅在首次创建即失败(尚无 part)时无需处理
            let (status, message) = if e == "__cancelled__" {
                ("cancelled", "已取消".to_string())
            } else {
                ("error", e)
            };
            emit(
                &app,
                Progress {
                    id: id.clone(),
                    status: status.into(),
                    message,
                    ..Default::default()
                },
            );
        }
    }
    registry.remove(&id);
}

#[tauri::command]
fn http_download(
    app: AppHandle,
    registry: State<'_, TaskRegistry>,
    id: String,
    url: String,
    dest: String,
    referer: Option<String>,
) -> Result<(), String> {
    let ctl = Arc::new(TaskControl {
        abort: Arc::new(AtomicBool::new(false)),
        child: Mutex::new(None),
    });
    registry.insert(&id, ctl);
    let reg = registry.inner().clone();
    let dest = sanitize_name_path(&dest);
    tauri::async_runtime::spawn(async move {
        run_http_download(app, reg, id, url, dest, referer).await;
    });
    Ok(())
}

fn sanitize_name_path(dest: &str) -> PathBuf {
    // 只清理文件名部分,保留目录结构
    let p = PathBuf::from(dest);
    match (p.parent(), p.file_name()) {
        (Some(parent), Some(name)) => {
            parent.join(sanitize_name(&name.to_string_lossy()))
        }
        _ => p,
    }
}

// ---------------- yt-dlp 后端下载(主流站点) ----------------

#[tauri::command]
fn backend_download(
    app: AppHandle,
    registry: State<'_, TaskRegistry>,
    id: String,
    url: String,
    format: String, // best | 1080 | 720 | mp3
    out_dir: String,
    direct: bool,
) -> Result<(), String> {
    let ytdlp = find_exe(&["yt-dlp"]).ok_or("未找到下载内核组件".to_string())?;
    let ctl = Arc::new(TaskControl {
        abort: Arc::new(AtomicBool::new(false)),
        child: Mutex::new(None),
    });
    registry.insert(&id, ctl.clone());

    // 画质优先 mp4 容器(avc1/m4a,兼容性最好);不可用时才回退 webm 等
    let mut fmt_args: Vec<String> = match format.as_str() {
        "mp3" => vec!["-x".into(), "--audio-format".into(), "mp3".into()],
        "1080" => vec!["-f".into(), "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/bv*[height<=1080]+ba/b".into()],
        "720" => vec!["-f".into(), "bv*[ext=mp4][height<=720]+ba[ext=m4a]/bv*[height<=720]+ba/b".into()],
        _ => vec!["-f".into(), "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b".into()],
    };
    if direct {
        fmt_args.push("--proxy".into());
        fmt_args.push("".into());
    }
    let template = format!(
        "{}/%(title)s.%(ext)s",
        out_dir.trim_end_matches(['\\', '/'])
    );

    let mut cmd = tokio::process::Command::new(&ytdlp);
    cmd.args([
        "--encoding",
        "utf-8",
        "--newline",
        "--no-playlist",
        "--windows-filenames",
        "--no-simulate",
        "--print",
        "before_dl:%(title)s",
        "--print",
        "after_move:filepath",
    ])
    .args(&fmt_args)
    .args(["-o", &template])
    .arg(&url)
    // 关键:yt-dlp(打包的 Python)stdout 在管道模式下默认块缓冲,
    // 进度行会积压到缓冲满/进程退出才吐出(UI 表现为 0% 卡死→跳变完成)。
    // PYTHONUNBUFFERED=1 强制逐行刷新,进度/网速才能实时到达。
    .env("PYTHONUNBUFFERED", "1")
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            registry.remove(&id);
            return Err(format!("内核启动失败: {e}"));
        }
    };
    let stdout = child.stdout.take().ok_or("无法读取内核输出")?;
    *ctl.child.lock().unwrap() = Some(child);

    let reg = registry.inner().clone();
    tauri::async_runtime::spawn(async move {
        watch_backend(app, reg, id, stdout).await;
    });
    Ok(())
}

async fn watch_backend(
    app: AppHandle,
    registry: TaskRegistry,
    id: String,
    stdout: tokio::process::ChildStdout,
) {
    let ctl = match registry.get(&id) {
        Some(c) => c,
        None => return,
    };
    let mut reader = tokio::io::BufReader::new(stdout).lines();
    let mut final_path = String::new();
    let mut task_title = String::new();
    let mut last_emit = Instant::now() - Duration::from_millis(500);
    let percent_re = Regex::new(r"(\d+(?:\.\d+)?)%").unwrap();
    // yt-dlp 进度行: [download]  45.3% of ~ 8.50MiB at 2.50MiB/s ETA 00:02
    let speed_re = Regex::new(r"at\s+([\d.]+)(B|KiB|MiB|GiB)/s").unwrap();
    let total_re = Regex::new(r"of\s+~?\s*([\d.]+)(KiB|MiB|GiB)").unwrap();

    loop {
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(150)) => {
                if ctl.abort.load(Ordering::Relaxed) {
                    let mut child = ctl.child.lock().unwrap().take();
                    if let Some(c) = child.as_mut() {
                        let _ = c.kill().await;
                    }
                    emit(&app, Progress { id: id.clone(), status: "cancelled".into(), message: "已取消".into(), ..Default::default() });
                    registry.remove(&id);
                    return;
                }
            }
            line = reader.next_line() => {
                match line {
                    Ok(Some(line)) => {
                        if let Some(c) = percent_re.captures(&line) {
                            let percent: f64 = c[1].parse().unwrap_or(0.0);
                            let mut speed = 0.0;
                            if let Some(s) = speed_re.captures(&line) {
                                let v: f64 = s[1].parse().unwrap_or(0.0);
                                speed = match &s[2] {
                                    "B" => v,
                                    "KiB" => v * 1024.0,
                                    "GiB" => v * 1024.0 * 1024.0 * 1024.0,
                                    _ => v * 1024.0 * 1024.0,
                                };
                            }
                            // 总大小与已下载量(供前端显示 已下载/总量/剩余时间)
                            let mut total = 0u64;
                            if let Some(t) = total_re.captures(&line) {
                                let v: f64 = t[1].parse().unwrap_or(0.0);
                                total = match &t[2] {
                                    "KiB" => (v * 1024.0) as u64,
                                    "GiB" => (v * 1024.0 * 1024.0 * 1024.0) as u64,
                                    _ => (v * 1024.0 * 1024.0) as u64,
                                };
                            }
                            let downloaded = if total > 0 {
                                (total as f64 * percent / 100.0) as u64
                            } else {
                                0
                            };
                            let now = Instant::now();
                            if now.duration_since(last_emit).as_millis() >= 300 {
                                last_emit = now;
                                emit(&app, Progress {
                                    id: id.clone(), status: "running".into(),
                                    downloaded, total, speed, percent,
                                    name: task_title.clone(),
                                    ..Default::default()
                                });
                            }
                        } else {
                            let t = line.trim();
                            // --print before_dl:%(title)s 的输出是纯标题行(无 [ 前缀、非路径)
                            if task_title.is_empty() && !t.is_empty()
                                && !t.starts_with('[') && !t.contains('\\') && !t.contains('/')
                            {
                                task_title = t.to_string();
                            }
                            // --print after_move:filepath 的输出是一个纯路径行
                            if !t.starts_with('[') && (t.contains('\\') || t.contains('/'))
                                && (t.ends_with(".mp4") || t.ends_with(".mp3") || t.ends_with(".webm") || t.ends_with(".m4a"))
                            {
                                final_path = t.to_string();
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
    }
    let child = ctl.child.lock().unwrap().take();
    let status = match child {
        Some(mut c) => c.wait().await.map(|s| s.success()).unwrap_or(false),
        None => false,
    };
    if ctl.abort.load(Ordering::Relaxed) {
        return; // cancelled 事件已发出
    }
    if status {
        emit(&app, Progress {
            id: id.clone(), status: "done".into(), percent: 100.0,
            path: final_path, ..Default::default()
        });
    } else {
        emit(&app, Progress {
            id: id.clone(), status: "error".into(),
            message: "下载失败,请检查链接或网络后重试".into(),
            ..Default::default()
        });
    }
    registry.remove(&id);
}

#[tauri::command]
async fn abort_task(registry: State<'_, TaskRegistry>, id: String) -> Result<(), String> {
    if let Some(ctl) = registry.get(&id) {
        ctl.abort.store(true, Ordering::Relaxed);
        let mut child = ctl.child.lock().unwrap().take();
        if let Some(c) = child.as_mut() {
            let _ = c.kill().await;
        }
    }
    Ok(())
}

// ---------------- 直链提取 ----------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaItem {
    kind: String, // video | audio
    label: String,
    url: String,
    size: String,
    recommended: bool,
}

#[tauri::command]
async fn extract_media(page_url: String) -> Result<(String, Vec<MediaItem>), String> {
    let client = Client::builder().user_agent(GENERIC_UA).build().unwrap();
    let html = client
        .get(&page_url)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("页面抓取失败: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let title = Regex::new(r"<title>([^<]*)</title>")
        .unwrap()
        .captures(&html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_else(|| "未命名页面".into());

    let mut found: Vec<String> = Vec::new();
    // 1) <audio>/<video>/<source> 标签 src(可能是相对路径)
    let tag_re = Regex::new(r#"<(?:audio|video|source)[^>]+?\bsrc=["']([^"']+)["']"#).unwrap();
    for c in tag_re.captures_iter(&html) {
        found.push(c[1].to_string());
    }
    // 2) og:audio / og:video 元数据(很多站点播放器只在这里暴露地址)
    let og_re = Regex::new(
        r#"<meta[^>]+?property=["']og:(?:audio|video)(?::secure_url)?["'][^>]+?content=["']([^"']+)["']"#,
    )
    .unwrap();
    for c in og_re.captures_iter(&html) {
        found.push(c[1].to_string());
    }
    // 3) 页面/JS 中裸露的媒体直链(兼容 \/ 转义)
    let ext_re = Regex::new(
        r#"https?://[^\s"'<>\\]+?\.(?:mp3|mp4|m4a|m4v|aac|flac|wav|webm|flv|mkv|m3u8)[^\s"'<>\\]*"#,
    )
    .unwrap();
    for m in ext_re.find_iter(&html) {
        found.push(m.as_str().replace("\\/", "/"));
    }

    // 相对路径 → 绝对地址;去重
    let base = url::Url::parse(&page_url).ok();
    let mut uniq: Vec<String> = Vec::new();
    for u in found {
        let abs = match &base {
            Some(b) => b.join(&u).map(|j| j.to_string()).unwrap_or(u),
            None => u,
        };
        if !uniq.contains(&abs) {
            uniq.push(abs);
        }
    }

    let items: Vec<MediaItem> = uniq
        .iter()
        .enumerate()
        .map(|(i, u)| {
            let lower = u.to_lowercase();
            let kind = if lower.contains(".mp3")
                || lower.contains(".m4a")
                || lower.contains(".aac")
                || lower.contains(".flac")
                || lower.contains(".wav")
            {
                "audio"
            } else {
                "video"
            };
            let ext = Regex::new(r"\.(\w{3,5})(?:\?|$)")
                .unwrap()
                .captures(&lower)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str())
                .unwrap_or("mp4");
            MediaItem {
                kind: kind.into(),
                label: if kind == "audio" {
                    format!("仅音轨 {} · 直链", ext.to_uppercase())
                } else {
                    format!("视频 {} · 直链", ext.to_uppercase())
                },
                url: u.clone(),
                size: "未知大小".into(),
                recommended: i == 0,
            }
        })
        .collect();
    if items.is_empty() {
        return Err(
            "页面中未找到可直接提取的资源。该网站可能通过 JavaScript 动态加载音视频(抖音、B站、小红书等均如此)——请回到「下载」页直接粘贴链接即可。本页适用于:网页内嵌 <audio>/<video> 播放器或页面源码中可见媒体地址的小众站点。".into(),
        );
    }
    Ok((title, items))
}

// ---------------- ffmpeg MP3 转换 ----------------

#[tauri::command]
async fn convert_mp3(src: String) -> Result<String, String> {
    let ffmpeg = find_exe(&["ffmpeg"]).ok_or("未找到 ffmpeg 组件")?;
    let dst = Path::new(&src).with_extension("mp3");
    let mut cmd = tokio::process::Command::new(&ffmpeg);
    cmd.args(["-y", "-loglevel", "error", "-i", &src, "-vn", "-b:a", "128k"])
        .arg(&dst)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let out = cmd.output().await.map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "转码失败: {}",
            String::from_utf8_lossy(&out.stderr)
                .chars()
                .take(200)
                .collect::<String>()
        ));
    }
    tokio::fs::remove_file(&src).await.ok();
    Ok(dst.to_string_lossy().to_string())
}

// ---------------- 通用 ----------------

#[tauri::command]
fn get_default_out_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?
        .join(if store_mode() {
            "媒体下载器 Store"
        } else {
            "媒体下载器"
        });
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.to_string_lossy().to_string())
}

// ---------------- 删除本地文件 ----------------

// 用系统 shell 打开文件/在资源管理器中定位(绕开 opener 插件的权限与scope限制)
#[tauri::command]
fn open_in_shell(path: String, reveal: bool) -> Result<(), String> {
    let p = path.trim_matches('"').to_string();
    if p.is_empty() {
        return Err("路径为空".into());
    }
    if !Path::new(&p).exists() {
        // 文件已被移动/删除:回退打开其所在目录,目录也没了则明确报错
        let parent = Path::new(&p)
            .parent()
            .map(|d| d.to_string_lossy().to_string())
            .unwrap_or_default();
        if !parent.is_empty() && Path::new(&parent).exists() {
            return open_in_shell(parent, false);
        }
        return Err("File no longer exists (moved or deleted)".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = if reveal {
            let mut c = std::process::Command::new("explorer.exe");
            c.arg(format!("/select,\"{}\"", p));
            c
        } else {
            let mut c = std::process::Command::new("cmd");
            c.args(["/C", "start", "", &p]);
            c
        };
        cmd.creation_flags(0x0800_0000);
        cmd.spawn().map_err(|e| format!("打开失败: {e}"))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        let mut cmd = std::process::Command::new(if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        });
        if reveal {
            cmd.arg("-R");
        }
        cmd.arg(&p);
        cmd.spawn().map_err(|e| format!("打开失败: {e}"))?;
        Ok(())
    }
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), // 已不存在视为成功
        Err(e) => Err(format!("删除文件失败: {e}")),
    }
}

// ---------------- 入口 ----------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;
    use tauri::WindowEvent;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(TaskRegistry::default())
        .invoke_handler(tauri::generate_handler![
            douyin_resolve,
            http_download,
            backend_download,
            abort_task,
            extract_media,
            convert_mp3,
            delete_file,
            open_in_shell,
            get_default_out_dir,
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("媒体下载器")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide(); // 关闭 = 最小化到托盘,下载不中断
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
