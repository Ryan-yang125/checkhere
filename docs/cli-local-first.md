# CheckHere CLI：本地浏览器验收

CheckHere 是免费的开源 CLI。它在当前电脑或 CI runner 中启动 Playwright Chromium，检查网站并把截图和报告写入本地目录。

## 安装

```bash
curl -fsSL https://checkhere.page/install.sh | bash
checkhere setup
checkhere doctor
```

安装脚本从 GitHub Release 下载 `checkhere-0.4.0.tgz`。首次运行 `setup` 会安装与当前 CheckHere 版本匹配的 Chromium。

## 检查网站

```bash
checkhere http://localhost:3000
checkhere https://preview.example.com
checkhere https://example.com --routes routes.txt
```

普通模式会检查入口 URL、显式路由，并按 `--max-routes` 的数量自动抽样同源链接。需要精确覆盖清单时使用：

```bash
checkhere ci https://preview.example.com \
  --routes routes.txt \
  --routes-only \
  --max-routes=8 \
  --fail-on=page-score:85
```

`--routes-only` 要求同时提供 `--routes`。此模式仅检查筛选后的显式路由，目标 URL 用于解析相对路由；`--max-routes` 表示显式路由总数上限，最小值为 1。

每次检查会生成：

- `report.html`：桌面与移动端截图优先的可视化报告
- `report.md`：适合 Coding Agent 阅读的修复清单
- `report.json`：适合脚本、CI 和二次分析的结构化数据
- `fix-prompt.md`：兼容旧工作流的 Markdown 别名

## 发布门槛

```bash
checkhere ci https://preview.example.com --fail-on=critical
checkhere ci https://preview.example.com --fail-on=score:90
checkhere ci https://preview.example.com --fail-on=page-score:80
```

检查内容、截图和报告始终留在执行环境内。线上文档位于 [checkhere.page/docs/cli](https://checkhere.page/docs/cli)。
