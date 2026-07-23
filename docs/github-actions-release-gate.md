# 用 GitHub Actions 做网站发布验收

CheckHere 的 `ci` 子命令可以在预览部署完成后运行真实 Chromium 检查。退出码 0 表示通过当前策略，退出码 1 表示检测结果超出阈值，退出码 2 表示执行环境错误。

## 最小工作流

```yaml
name: checkhere

on:
  pull_request:

jobs:
  browser-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Ryan-yang125/checkhere@v0.4.0
        with:
          url: https://preview.example.com
          fail-on: critical
```

## 精确路由门禁

```yaml
      - uses: Ryan-yang125/checkhere@v0.4.0
        with:
          url: https://preview.example.com
          routes: routes.txt
          routes-only: "true"
          max-routes: "8"
          fail-on: page-score:85
```

启用 `routes-only` 后，Action 仅检查路由文件中筛选后的前 8 个页面，`url` 只负责解析相对路由。门禁失败仍会生成 Job Summary 并上传完整报告 artifact。

## 失败策略

- `--fail-on=critical`：发现 critical 问题时失败
- `--fail-on=score:90`：总分低于 90 时失败
- `--fail-on=page-score:80`：任一已检查页面低于 80 时失败

第一阶段可以使用 `critical`，积累真实项目基线后再增加分数阈值。

完整线上文档位于 [checkhere.page/docs/github-actions](https://checkhere.page/docs/github-actions)。
