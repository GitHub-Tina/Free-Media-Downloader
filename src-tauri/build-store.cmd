@echo off
rem 商店版构建:独立产品名/标识符/安装目录,与完整版可并存
set VITE_STORE_BUILD=1
npm run tauri build -- --bundles nsis --config src-tauri/tauri.store.conf.json --features store
