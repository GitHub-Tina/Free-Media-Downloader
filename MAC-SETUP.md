# macOS 构建与测试指南

## 一、环境准备(一次性,约 15 分钟)

打开「终端」(Terminal),依次执行:

```bash
# 1. Xcode 命令行工具(编译 Rust 必需,弹窗点"安装")
xcode-select --install

# 2. Rust(下载安装脚本,一路回车默认即可)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# 3. Homebrew(如已装跳过;按提示回车确认)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 4. Node 22 + 下载内核依赖(yt-dlp / ffmpeg 走 PATH 查找,brew 装即可)
brew install node@22 yt-dlp ffmpeg
```

## 二、获取项目

Windows 端已生成源码包 `media-downloader-src.zip`(在工作区目录),
用 LocalSend / U盘 / AirDrop 传到 Mac,然后:

```bash
unzip media-downloader-src.zip -d ~/dev
cd ~/dev/media-downloader
npm install
```

## 三、开发模式测试(热重载)

```bash
npm run tauri dev
```

应用窗口直接启动,可完整测试:粘贴下载、直链提取、
任务管理、设置(浅色/深色主题、macOS 交通灯标题栏)。

## 四、打 dmg 安装包

```bash
npm run tauri build
# 产物:
# src-tauri/target/release/bundle/dmg/媒体下载器_2.4.1_aarch64.dmg
# src-tauri/target/release/bundle/macos/媒体下载器.app

# 如需 Intel + Apple Silicon 双架构通用包:
rustup target add x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

## 五、未签名 app 的首次运行

测试构建无开发者签名,Gatekeeper 会拦截:

- 方法一:在 Finder 中**右键** .app →「打开」→ 再点「打开」;
- 方法二(彻底解除隔离属性):
  ```bash
  xattr -cr /Applications/媒体下载器.app
  ```

## 已知 Mac 平台注意事项

1. **下载内核**:Mac 测试用 brew 安装的 yt-dlp/ffmpeg(应用按 PATH 自动查找,
   /opt/homebrew/bin 在默认 PATH 内);正式分发需改为 sidecar 随包携带(见主 README TODO)。
2. **国内网络**:如 brew/rustup 下载慢,配置国内镜像(如 TUNA)或代理。
3. **标题栏**:macOS 版为系统交通灯 + 居中标题,与 Windows 自绘三键不同,属预期设计。
4. dmg 拖入 Applications 即完成安装;卸载直接删除 app。

## 备选:GitHub Actions 云端打包(不需要 Mac)

工程已内置 `.github/workflows/build.yml`:
`git init` → 推送到 GitHub → Actions 页手动 Run workflow →
Artifacts 下载 universal dmg。适合出正式分发包,日常开发用本地 Mac 更快。
