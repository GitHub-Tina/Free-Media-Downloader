@echo off
rem 商店版构建:独立产品名/标识符/安装目录,与完整版可并存
rem 产物: src-tauri\target\release\bundle\nsis\媒体下载器 Store_2.4.1_x64-setup.exe
set VITE_STORE_BUILD=1
npm run tauri build -- --bundles nsis --config src-tauri/tauri.store.conf.json --features store
