# AI 建站上线检查清单

AI 生成网站的交付验收需要覆盖浏览器真实结果、关键路由和可复现证据。CheckHere 用一条本地命令生成 HTML、Markdown 和 JSON 报告。

## 1. 确认页面稳定加载

检查首页与关键路由的 HTTP 状态、重定向、空白页和加载超时。把业务关键路径写入 `routes.txt`：

```text
/
/pricing
/docs
/contact
```

## 2. 查看桌面与移动端截图

逐页确认首屏内容、导航、主按钮、图片和响应式布局。截图可以快速暴露断点遗漏与资源路径错误。

## 3. 清理运行时错误

处理 console error、page error、失败请求和坏图。优先修复影响首屏渲染、路由、表单提交和核心交互的问题。

## 4. 核对 SEO 入口

检查 title、description、canonical、robots.txt、sitemap.xml 和页面主要内容。公开信息应能被浏览器、搜索引擎和 Agent 直接读取。

## 5. 写入 CI

```bash
checkhere ci https://preview.example.com --routes routes.txt --routes-only --max-routes=8 --fail-on=critical
```

## 6. 修复后复检

使用相同 URL、路由集合和阈值再次运行。保存最终报告，并记录剩余问题与接受原因。

完整线上指南：[checkhere.page/guides/ai-website-launch-checklist](https://checkhere.page/guides/ai-website-launch-checklist)
