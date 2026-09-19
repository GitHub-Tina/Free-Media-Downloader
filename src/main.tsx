import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// 平台标记必须在首次渲染前同步就绪:Titlebar/设计令牌依此选择 mac/win 变体,
// 渲染后再设置不会触发重渲染,mac 会残留 Windows 标题栏(与原生交通灯叠加)
document.documentElement.dataset.platform = /Macintosh|Mac OS X/i.test(
  navigator.userAgent,
)
  ? "mac"
  : "win";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
