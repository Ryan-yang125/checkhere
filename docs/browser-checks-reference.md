# CheckHere 浏览器检测项参考

CheckHere 在真实 Chromium 页面环境里收集可复现证据。每条问题包含稳定代码、严重度、消息、证据和修复建议。

## BROKEN_IMAGE

图片请求失败、资源返回错误状态，或图片加载完成后缺少有效尺寸，都可能触发 `BROKEN_IMAGE`。

常见原因：

- 静态资源路径或文件名大小写错误
- 构建产物缺少页面引用的图片
- CDN 返回 403、404 或 5xx
- 防盗链、跨域配置或签名 URL 失效

详细文档：[checkhere.page/checks/broken-image](https://checkhere.page/checks/broken-image)

## MOBILE_OVERFLOW

移动端页面滚动宽度超出可视宽度时，CheckHere 会记录可疑元素和截图。

常见原因：

- 固定宽度或 `min-width` 超过父容器
- `100vw` 与外层 padding 叠加
- 长 URL、代码块或表格缺少换行
- 绝对定位元素超出右侧边界

详细文档：[checkhere.page/checks/mobile-overflow](https://checkhere.page/checks/mobile-overflow)

## CONSOLE_ERROR 与 PAGE_ERROR

浏览器 `console.error` 会形成 `CONSOLE_ERROR`，页面运行期间的未捕获 JavaScript 异常会形成 `PAGE_ERROR`。失败请求会保留独立网络证据。

详细文档：[checkhere.page/checks/console-error](https://checkhere.page/checks/console-error)
