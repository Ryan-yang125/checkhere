import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckIssue, CheckPageResult, CheckReport, IssueCode, Severity, ViewportResult } from "@checkhere/shared";

export type ReportBundle = {
  html: string;
  markdown: string;
  json: string;
  fixPrompt: string;
};

type IssueGroup = {
  label: string;
  severity: Severity;
  intent: string;
  issues: CheckIssue[];
};

const SEO_ISSUE_CODES = new Set<IssueCode>([
  "MISSING_META_DESCRIPTION",
  "WEAK_META_DESCRIPTION",
  "H1_MISSING",
  "MULTIPLE_H1",
  "CANONICAL_MISSING",
  "CANONICAL_MISMATCH",
  "NOINDEX_DETECTED",
  "ROBOTS_BLOCKED",
  "SITEMAP_MISSING",
  "SITEMAP_INVALID",
  "STRUCTURED_DATA_INVALID",
  "OG_IMAGE_MISSING",
  "MISSING_IMAGE_ALT"
]);

const LIGHTHOUSE_ISSUE_CODES = new Set<IssueCode>(["LIGHTHOUSE_PERFORMANCE_LOW", "CORE_WEB_VITALS_POOR"]);

export async function writeReportBundle(report: CheckReport, outputDir: string): Promise<ReportBundle> {
  const bundle = renderReportBundle(report);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "report.html"), bundle.html);
  await writeFile(path.join(outputDir, "report.md"), bundle.markdown);
  await writeFile(path.join(outputDir, "report.json"), bundle.json);
  await writeFile(path.join(outputDir, "fix-prompt.md"), bundle.fixPrompt);
  return bundle;
}

export function renderReportBundle(report: CheckReport): ReportBundle {
  const markdown = renderMarkdown(report);
  return {
    html: renderHtml(report),
    markdown,
    json: `${JSON.stringify(report, null, 2)}\n`,
    fixPrompt: markdown
  };
}

export function renderMarkdown(report: CheckReport): string {
  const groups = groupIssues(report.issues);
  const lines: string[] = [];
  lines.push(`# CheckHere 网站上线体检报告`);
  lines.push("");
  lines.push(`## 1. 检查结论`);
  lines.push("");
  lines.push(`- 目标 URL: ${report.url}`);
  lines.push(`- 检查 ID: ${report.id}`);
  lines.push(`- 报告契约: ${report.schemaVersion ?? "1.0"}`);
  lines.push(`- CheckHere 版本: ${report.appVersion ?? "0.1.x"}`);
  lines.push(`- 检查时间: ${formatDate(report.checkedAt)}`);
  lines.push(`- 完成时间: ${formatDate(report.completedAt)}`);
  lines.push(`- 总耗时: ${formatDuration(report.checkedAt, report.completedAt)}`);
  lines.push(`- 结果: ${resultLabel(report.result)} (${report.result})`);
  lines.push(`- 分数: ${report.score}/100`);
  if (report.site) {
    lines.push(`- 检查页面: ${report.site.pagesChecked} 个`);
    lines.push(`- 页面分布: 通过 ${report.site.pagesReady} / 修复 ${report.site.pagesNeedingFixes} / 暂缓 ${report.site.pagesBroken}`);
    lines.push(`- 最低页面分: ${report.site.lowestScore}/100`);
  }
  lines.push(`- 问题统计: 严重阻断 ${countSeverity(report.issues, "critical")} / 需要修复 ${countSeverity(report.issues, "fix_soon")} / 体验润色 ${countSeverity(report.issues, "polish")}`);
  lines.push("");
  lines.push(`### 人类读法`);
  lines.push("");
  lines.push(verdictCopy(report));
  lines.push("");
  lines.push(`### Agent 执行目标`);
  lines.push("");
  for (const item of acceptanceCriteria(report)) lines.push(`- ${item}`);
  lines.push("");
  lines.push(`## 2. 页面和截图证据`);
  lines.push("");
  for (const page of reportPages(report)) {
    lines.push(`### ${page.label}`);
    lines.push("");
    lines.push(`- URL: ${page.url}`);
    lines.push(`- 结果: ${resultLabel(page.result)} (${page.score}/100)`);
    for (const viewport of page.viewports) {
      lines.push(`- ${viewportLabel(viewport.name)}首屏: ${markdownArtifactLink(report.id, viewport.screenshotPath)}`);
      lines.push(`- ${viewportLabel(viewport.name)}全页: ${markdownArtifactLink(report.id, viewport.fullScreenshotPath)}`);
    }
    lines.push("");
  }
  appendMarkdownSeo(lines, report);
  appendMarkdownLighthouse(lines, report);
  lines.push(`## 5. 问题清单和修复建议`);
  lines.push("");
  if (report.issues.length === 0) {
    lines.push("当前检测没有发现需要处理的问题。请人工确认桌面和手机截图。");
    lines.push("");
  } else {
    for (const group of groups) appendMarkdownIssueGroup(lines, group);
  }
  lines.push(`## 6. 视口检测明细`);
  lines.push("");
  lines.push(`| 视口 | HTTP | 标题 | 可见元素 | 正文长度 | 页面宽度 | 横向溢出 | DCL | Load |`);
  lines.push(`|---|---:|---|---:|---:|---:|---:|---:|---:|`);
  for (const viewport of report.viewports) {
    lines.push(
      `| ${viewportLabel(viewport.name)} | ${viewport.status ?? "n/a"} | ${markdownTableCell(viewport.title || "无标题")} | ${viewport.visibleElementCount} | ${viewport.bodyTextLength} | ${viewport.documentWidth}px | ${viewport.horizontalOverflowPx}px | ${formatMs(viewport.timings.domContentLoadedMs)} | ${formatMs(viewport.timings.loadEventMs)} |`
    );
  }
  lines.push("");
  lines.push(`## 7. 路由抽样`);
  lines.push("");
  if (report.routes.length === 0) {
    lines.push("没有可抽样的同源链接，或首页状态不适合继续抽样。");
  } else {
    lines.push(`| 页面 | 路由 | 来源 | HTTP | 状态 |`);
    lines.push(`|---|---|---|---:|---|`);
    for (const route of report.routes) {
      lines.push(`| ${markdownTableCell(route.label ?? "")} | ${markdownTableCell(route.url)} | ${routeSourceLabel(route.source)} | ${route.status ?? "n/a"} | ${route.ok ? "通过" : "失败"} |`);
    }
  }
  lines.push("");
  lines.push(`## 8. 建议执行顺序`);
  lines.push("");
  for (const item of executionOrder(report)) lines.push(`- ${item}`);
  return `${lines.join("\n")}\n`;
}

export function renderFixPrompt(report: CheckReport): string {
  return renderMarkdown(report);
}

export function renderHtml(report: CheckReport): string {
  const groups = groupIssues(report.issues);
  const critical = countSeverity(report.issues, "critical");
  const fixSoon = countSeverity(report.issues, "fix_soon");
  const polish = countSeverity(report.issues, "polish");
  const mobile = report.viewports.find((viewport) => viewport.name === "mobile");
  const desktop = report.viewports.find((viewport) => viewport.name === "desktop");
  const markdown = renderMarkdown(report);
  const pages = reportPages(report);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="Kami">
  <meta name="description" content="CheckHere 网站上线前浏览器体检报告">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <title>CheckHere 体检报告 · ${escapeHtml(resultLabel(report.result))} · ${escapeHtml(report.url)}</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f6f0e2;
      --paper-deep: #ece2ce;
      --sheet: #fffaf0;
      --ink: #15191d;
      --ink-blue: #173a5e;
      --muted: #6b6358;
      --line: #d8cbb5;
      --line-strong: #9b8264;
      --green: #173a5e;
      --amber: #9a5b12;
      --red: #a3362d;
      --blue-soft: #dbe8f2;
      --green-soft: #e5edf3;
      --amber-soft: #f4e1ba;
      --red-soft: #efd1c9;
      --shadow: rgba(43, 34, 24, 0.12);
      font-family: "TsangerJinKai02", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", STSong, Georgia, serif;
    }
    * { box-sizing: border-box; }
    html {
      background: var(--paper-deep);
      scrollbar-color: rgba(23, 58, 94, 0.32) rgba(216, 203, 181, 0.42);
      scrollbar-width: thin;
    }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: rgba(216, 203, 181, 0.32); }
    ::-webkit-scrollbar-thumb {
      border: 3px solid rgba(246, 240, 226, 0.9);
      border-radius: 999px;
      background: rgba(23, 58, 94, 0.34);
    }
    ::-webkit-scrollbar-thumb:hover { background: rgba(23, 58, 94, 0.52); }
    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(90deg, rgba(23, 58, 94, 0.08) 1px, transparent 1px) 0 0 / 28px 28px,
        linear-gradient(180deg, var(--paper) 0%, #eee3d1 100%);
    }
    a { color: var(--ink-blue); text-decoration-thickness: 1px; text-underline-offset: 3px; }
    button, textarea { font: inherit; }
    .page { width: min(1220px, calc(100vw - 32px)); margin: 0 auto; padding: 0 0 56px; }
    .paper {
      background: var(--sheet);
      border: 1px solid var(--line);
      box-shadow: 0 22px 70px var(--shadow);
    }
    .masthead {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      align-items: start;
      padding: 24px 28px 18px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.44), rgba(255, 255, 255, 0));
    }
    .brand { display: flex; align-items: center; gap: 12px; color: var(--ink-blue); font-weight: 700; letter-spacing: 0; }
    .seal {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border: 2px solid var(--ink-blue);
      color: var(--ink-blue);
      font-weight: 900;
      line-height: 1;
    }
    .metaLine { color: var(--muted); font-size: 14px; text-align: right; line-height: 1.65; }
    .hero {
      padding: 18px 28px;
      border-bottom: 1px solid var(--line);
    }
    .reportBar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
    }
    .resultStack {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 14px;
      min-width: 0;
    }
    .resultStack strong { font-size: 28px; line-height: 1; color: var(--ink); }
    .resultStack span { color: var(--muted); }
    .target {
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .heroActions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
    .action {
      display: inline-flex;
      align-items: center;
      min-height: 40px;
      border: 1px solid var(--ink-blue);
      background: #fffdf7;
      color: var(--ink-blue);
      padding: 9px 13px;
      text-decoration: none;
      font-weight: 800;
      cursor: pointer;
    }
    .action.primary { background: var(--ink-blue); color: #fffaf0; }
    .verdictBadge {
      width: fit-content;
      padding: 7px 10px;
      border: 1px solid currentColor;
      color: var(--result-color);
      background: var(--result-bg);
      font-weight: 900;
      font-size: 13px;
    }
    .shotSpread {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      padding: 18px 28px 30px;
      border-bottom: 1px solid var(--line);
    }
    .shot {
      margin: 0;
      border: 1px solid var(--line-strong);
      background: #161616;
      overflow: hidden;
    }
    .shot img { display: block; width: 100%; height: auto; background: #fff; }
    .shot figcaption {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: #fffaf0;
      padding: 9px 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }
    .section { padding: 30px 28px; border-bottom: 1px solid var(--line); }
    .pageGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .pageCard {
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      background: #fffdf7;
      padding: 14px;
    }
    .pageCard h3 { margin: 0; color: var(--ink-blue); font-size: 18px; }
    .pageCard .url { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-wrap: anywhere; }
    .pageStats { display: flex; flex-wrap: wrap; gap: 7px; }
    .pageStats span { border: 1px solid var(--line); padding: 4px 7px; background: #fffaf0; font-size: 12px; color: var(--ink-blue); font-weight: 800; }
    .affectedPages { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
    .affectedPages span { border: 1px solid var(--line-strong); padding: 3px 7px; background: #fffaf0; color: var(--ink-blue); font-size: 12px; font-weight: 800; }
    .sectionHeader {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 22px;
      align-items: start;
      margin-bottom: 18px;
    }
    .sectionNo { color: var(--ink-blue); font-weight: 900; letter-spacing: 0.08em; }
    .sectionHeader h2 { margin: 0; font-size: 30px; line-height: 1.18; }
    .sectionIntro { margin: 8px 0 0; color: var(--muted); line-height: 1.6; }
    .summaryCard { border: 1px solid var(--line); background: #fffdf7; padding: 16px; }
    .summaryCard h3 { margin: 0 0 8px; color: var(--ink-blue); font-size: 17px; }
    .summaryCard p { margin: 0; color: #352b20; line-height: 1.6; }
    .issueGroups { display: grid; gap: 22px; }
    .issueGroup { display: grid; gap: 12px; }
    .groupTitle { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
    .groupTitle h3 { margin: 0; font-size: 22px; color: var(--ink-blue); }
    .groupTitle p { margin: 4px 0 0; color: var(--muted); }
    .pill { border: 1px solid currentColor; color: var(--severity-color); background: var(--severity-bg); padding: 4px 8px; font-size: 12px; font-weight: 900; white-space: nowrap; }
    .issue {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 18px;
      border: 1px solid var(--line);
      background: #fffdf7;
      padding: 16px;
    }
    .issueMeta { display: grid; gap: 8px; align-content: start; }
    .issueCode { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink-blue); overflow-wrap: anywhere; }
    .issueBody h4 { margin: 0 0 8px; font-size: 19px; }
    .issueBody p { margin: 0 0 10px; line-height: 1.62; color: #332a20; }
    .evidence {
      display: grid;
      gap: 1px;
      margin-top: 12px;
      background: var(--line);
      border: 1px solid var(--line);
    }
    .evidenceRow { display: grid; grid-template-columns: 150px 1fr; background: #fffaf0; }
    .evidenceRow span { padding: 8px 10px; overflow-wrap: anywhere; }
    .evidenceRow span:first-child { color: var(--muted); background: #f2e8d8; }
    .viewportTags { display: flex; flex-wrap: wrap; gap: 6px; }
    .viewportTags span { border: 1px solid var(--line-strong); padding: 3px 7px; background: #fffaf0; color: var(--ink-blue); font-size: 12px; font-weight: 800; }
    .viewportGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .viewportCard { border: 1px solid var(--line); background: #fffdf7; padding: 16px; }
    .viewportCard h3 { margin: 0 0 12px; color: var(--ink-blue); }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); border: 1px solid var(--line); }
    .fact { display: grid; gap: 4px; background: #fffaf0; padding: 9px; }
    .fact span { color: var(--muted); font-size: 12px; }
    .fact strong { font-size: 14px; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; background: #fffdf7; border: 1px solid var(--line); }
    th, td { border-bottom: 1px solid var(--line); padding: 11px 12px; text-align: left; vertical-align: top; }
    th { color: var(--ink-blue); background: #f0e5d1; font-size: 13px; }
    td { overflow-wrap: anywhere; line-height: 1.5; }
    .action:focus-visible { outline: 3px solid #7ab3d8; outline-offset: 2px; }
    .copySource { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    @media (max-width: 900px) {
      .masthead, .reportBar, .sectionHeader, .issue, .viewportGrid { grid-template-columns: 1fr; }
      .metaLine { text-align: left; }
      .shotSpread { grid-template-columns: 1fr; }
      .heroActions { justify-content: flex-start; }
    }
    @media (max-width: 520px) {
      .page { width: min(100vw - 18px, 1220px); padding-top: 0; }
      .masthead, .hero, .section, .shotSpread { padding-left: 16px; padding-right: 16px; }
      .facts { grid-template-columns: 1fr; }
      .evidenceRow { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="page">
    <article class="paper" style="--score: ${report.score}; --score-color: ${scoreColor(report.score)}; --result-color: ${resultColor(report.result)}; --result-bg: ${resultBackground(report.result)};">
      <header class="masthead">
        <div class="brand"><span class="seal">查</span><span>CheckHere · 网站上线前浏览器体检</span></div>
        <div class="metaLine">
          <div>报告编号 ${escapeHtml(report.id)}</div>
          <div>${escapeHtml(formatDate(report.checkedAt))}</div>
        </div>
      </header>

      <section class="hero" id="conclusion">
        <div class="reportBar">
          <div class="resultStack">
            <span class="verdictBadge">${escapeHtml(resultLabel(report.result))}</span>
            <strong>${report.score}/100</strong>
            <span>${pages.length} 页 · 严重 ${critical} · 修复 ${fixSoon} · 润色 ${polish}</span>
            <span class="target">${escapeHtml(report.url)}</span>
          </div>
          <div class="heroActions">
            <button class="action primary" type="button" data-copy-target="agentMarkdown">复制 Markdown</button>
            <a class="action" href="${escapeHtml(reportLink(report, "markdown"))}">打开 .md</a>
            <a class="action" href="${escapeHtml(reportLink(report, "json"))}">JSON</a>
          </div>
        </div>
      </section>

      <section class="shotSpread" aria-label="截图证据">
        ${renderShotSpread(report, pages, desktop, mobile)}
      </section>

      ${renderPagesSection(report)}
      ${renderSeoSection(report)}
      ${renderLighthouseSection(report)}

      <section class="section" id="issues">
        <div class="sectionHeader">
          <div class="sectionNo">04 · 问题</div>
          <div>
            <h2>问题清单</h2>
            <p class="sectionIntro">${escapeHtml(issueSectionIntro(report))}</p>
          </div>
        </div>
        ${renderIssueGroups(groups)}
      </section>

      <section class="section" id="viewport">
        <div class="sectionHeader">
          <div class="sectionNo">05 · 证据</div>
          <div>
            <h2>视口明细</h2>
          </div>
        </div>
        <div class="viewportGrid">${report.viewports.map(renderViewportCard).join("")}</div>
      </section>

      <section class="section" id="routes">
        <div class="sectionHeader">
          <div class="sectionNo">06 · 路由</div>
          <div>
            <h2>同源链接抽样</h2>
          </div>
        </div>
        ${renderRoutes(report)}
      </section>
      <textarea class="copySource" id="agentMarkdown" readonly>${escapeHtml(markdown)}</textarea>
    </article>
  </main>
  <script>
    document.querySelectorAll("[data-copy-target]").forEach((button) => {
      button.addEventListener("click", async () => {
        const target = document.getElementById(button.getAttribute("data-copy-target"));
        if (!target || !("value" in target)) return;
        await navigator.clipboard.writeText(target.value);
        const original = button.textContent;
        button.textContent = "已复制";
        window.setTimeout(() => { button.textContent = original; }, 1400);
      });
    });
  </script>
</body>
</html>`;
}

function appendMarkdownIssueGroup(lines: string[], group: IssueGroup): void {
  lines.push(`### ${group.label} · ${group.issues.length} 项`);
  lines.push("");
  if (group.issues.length === 0) {
    lines.push("无。");
    lines.push("");
    return;
  }
  for (const [index, issue] of group.issues.entries()) {
    lines.push(`#### ${index + 1}. ${issueTitle(issue)}`);
    lines.push("");
    lines.push(`- 严重度: ${severityLabel(issue.severity)} (${issue.severity})`);
    lines.push(`- 检测代码: ${issue.code}`);
    lines.push(`- 检测信息: ${issue.message}`);
    if (issue.affectedPages?.length) {
      lines.push(`- 影响页面: ${issue.affectedPages.map((page) => `${page.label} (${page.url})`).join("；")}`);
    }
    lines.push(`- 修复建议: ${recommendationFor(issue.code)}`);
    lines.push(`- 验收方式: ${acceptanceFor(issue.code)}`);
    if (issue.evidence) {
      lines.push(`- 证据:`);
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(issue.evidence, null, 2));
      lines.push("```");
    }
    lines.push("");
  }
}

function appendMarkdownSeo(lines: string[], report: CheckReport): void {
  lines.push(`## 3. SEO 技术体检`);
  lines.push("");
  if (!report.seo) {
    lines.push("本次报告没有 SEO 采集数据。");
    lines.push("");
    return;
  }
  const seo = report.seo;
  lines.push(`- Title: ${seo.page.title || "缺失"}`);
  lines.push(`- Meta description: ${seo.page.metaDescription ? `${seo.page.metaDescription.length} 字符` : "缺失"}`);
  lines.push(`- H1: ${seo.page.h1Texts.length > 0 ? seo.page.h1Texts.join(" / ") : "缺失"}`);
  lines.push(`- Canonical: ${seo.page.canonicalHref || "缺失"}`);
  lines.push(`- Robots meta: ${seo.page.robotsMeta || "无"}`);
  lines.push(`- X-Robots-Tag: ${seo.page.xRobotsTag || "无"}`);
  lines.push(`- robots.txt: ${seo.robotsTxt.exists ? `存在，${seo.robotsTxt.blocksHomepage ? "拦截当前页" : "未拦截当前页"}` : "未发现"}`);
  lines.push(`- Sitemap: ${seo.sitemap.exists ? `${seo.sitemap.valid ? "可解析" : "不可解析"}，${seo.sitemap.urlCount} 条` : "未发现"}`);
  lines.push(`- Open Graph: title ${yesNo(Boolean(seo.page.openGraph.title))} / description ${yesNo(Boolean(seo.page.openGraph.description))} / image ${yesNo(Boolean(seo.page.openGraph.image))}`);
  lines.push(`- Twitter Card: card ${seo.page.twitter.card || "缺失"} / image ${yesNo(Boolean(seo.page.twitter.image))}`);
  lines.push(`- JSON-LD: ${seo.page.structuredData.validCount}/${seo.page.structuredData.count} 可解析，类型 ${seo.page.structuredData.types.join(", ") || "无"}`);
  lines.push(`- 图片 alt: ${seo.page.images.total} 张图，${seo.page.images.missingAltCount} 张缺失 alt`);
  lines.push("");
}

function appendMarkdownLighthouse(lines: string[], report: CheckReport): void {
  lines.push(`## 4. Lighthouse 和 Core Web Vitals`);
  lines.push("");
  if (!report.lighthouse) {
    lines.push("本次报告没有 Lighthouse 数据。");
    lines.push("");
    return;
  }
  const lighthouse = report.lighthouse;
  if (lighthouse.error) {
    lines.push(`Lighthouse 执行失败: ${lighthouse.error}`);
    lines.push("");
    return;
  }
  lines.push(`- Lighthouse: Performance ${scorePercent(lighthouse.categories.performance.score)} / Accessibility ${scorePercent(lighthouse.categories.accessibility.score)} / Best Practices ${scorePercent(lighthouse.categories["best-practices"].score)} / SEO ${scorePercent(lighthouse.categories.seo.score)}`);
  lines.push(`- FCP: ${metricDisplay(lighthouse.metrics["first-contentful-paint"])}`);
  lines.push(`- LCP: ${metricDisplay(lighthouse.metrics["largest-contentful-paint"])}`);
  lines.push(`- CLS: ${metricDisplay(lighthouse.metrics["cumulative-layout-shift"])}`);
  lines.push(`- TBT: ${metricDisplay(lighthouse.metrics["total-blocking-time"])}`);
  lines.push(`- Speed Index: ${metricDisplay(lighthouse.metrics["speed-index"])}`);
  if (lighthouse.audits.length > 0) {
    lines.push("");
    lines.push(`### Lighthouse 重点失败项`);
    lines.push("");
    for (const audit of lighthouse.audits) {
      lines.push(`- ${audit.title}${audit.displayValue ? `: ${audit.displayValue}` : ""} (${audit.id})`);
    }
  }
  lines.push("");
}

function groupIssues(issues: CheckIssue[]): IssueGroup[] {
  return [
    {
      label: "严重阻断",
      severity: "critical",
      intent: "发布前必须处理。",
      issues: issues.filter((issue) => issue.severity === "critical")
    },
    {
      label: "上线前修复",
      severity: "fix_soon",
      intent: "分享前建议处理。",
      issues: issues.filter((issue) => issue.severity === "fix_soon")
    },
    {
      label: "体验润色",
      severity: "polish",
      intent: "影响完整度和观感。",
      issues: issues.filter((issue) => issue.severity === "polish")
    }
  ];
}

function renderIssueGroups(groups: IssueGroup[]): string {
  if (groups.every((group) => group.issues.length === 0)) {
    return `<div class="summaryCard"><h3>没有发现问题</h3><p>当前检测未发现阻断项、修复项或润色项。</p></div>`;
  }
  return `<div class="issueGroups">
    ${groups
      .filter((group) => group.issues.length > 0)
      .map(
        (group) => `<section class="issueGroup" style="--severity-color: ${severityColor(group.severity)}; --severity-bg: ${severityBackground(group.severity)};">
          <div class="groupTitle">
            <div>
              <h3>${escapeHtml(group.label)}</h3>
              <p>${escapeHtml(group.intent)}</p>
            </div>
            <span class="pill">${group.issues.length} 项</span>
          </div>
          ${group.issues.map(renderIssue).join("")}
        </section>`
      )
      .join("")}
  </div>`;
}

function renderIssue(issue: CheckIssue): string {
  return `<article class="issue" style="--severity-color: ${severityColor(issue.severity)}; --severity-bg: ${severityBackground(issue.severity)};">
    <aside class="issueMeta">
      <span class="pill">${escapeHtml(severityLabel(issue.severity))}</span>
      <span class="issueCode">${escapeHtml(issue.code)}</span>
      ${renderViewportTags(issue.evidence)}
    </aside>
    <div class="issueBody">
      <h4>${escapeHtml(issueTitle(issue))}</h4>
      <p>${escapeHtml(issue.message)}</p>
      <p><strong>修复建议：</strong>${escapeHtml(recommendationFor(issue.code))}</p>
      <p><strong>验收方式：</strong>${escapeHtml(acceptanceFor(issue.code))}</p>
      ${renderAffectedPages(issue)}
      ${issue.evidence ? renderEvidence(issue.evidence) : ""}
    </div>
  </article>`;
}

function renderAffectedPages(issue: CheckIssue): string {
  if (!issue.affectedPages?.length) return "";
  return `<div class="affectedPages">${issue.affectedPages
    .map((page) => `<span title="${escapeHtml(page.url)}">${escapeHtml(page.label)}</span>`)
    .join("")}</div>`;
}

function renderEvidence(evidence: Record<string, unknown>): string {
  const rows = Object.entries(evidence).filter(([key]) => key !== "viewport" && key !== "viewports");
  if (rows.length === 0) return "";
  return `<div class="evidence">
    ${rows
      .map(([key, value]) => `<div class="evidenceRow"><span>${escapeHtml(evidenceLabel(key))}</span><span>${escapeHtml(formatEvidenceValue(value))}</span></div>`)
      .join("")}
  </div>`;
}

function renderViewportTags(evidence: Record<string, unknown> | undefined): string {
  const viewports = evidenceViewports(evidence);
  if (viewports.length === 0) return "";
  return `<div class="viewportTags">${viewports.map((viewport) => `<span>${escapeHtml(viewportLabel(viewport))}</span>`).join("")}</div>`;
}

function renderViewportCard(viewport: ViewportResult): string {
  return `<section class="viewportCard">
    <h3>${escapeHtml(viewportLabel(viewport.name))} · ${viewport.width}×${viewport.height}</h3>
    <div class="facts">
      ${renderFact("HTTP", String(viewport.status ?? "n/a"))}
      ${renderFact("标题", viewport.title || "无标题")}
      ${renderFact("最终 URL", viewport.finalUrl)}
      ${renderFact("可见元素", String(viewport.visibleElementCount))}
      ${renderFact("正文长度", `${viewport.bodyTextLength} 字符`)}
      ${renderFact("页面宽度", `${viewport.documentWidth}px`)}
      ${renderFact("横向溢出", `${viewport.horizontalOverflowPx}px`)}
      ${renderFact("DCL", formatMs(viewport.timings.domContentLoadedMs))}
      ${renderFact("Load", formatMs(viewport.timings.loadEventMs))}
      ${renderFact("视口 Meta", viewport.hasViewportMeta ? "存在" : "缺失")}
      ${renderFact("Favicon", viewport.faviconFound ? "存在" : "缺失")}
    </div>
  </section>`;
}

function renderSeoSection(report: CheckReport): string {
  if (!report.seo) {
    return `<section class="section" id="seo">
      <div class="sectionHeader">
        <div class="sectionNo">02 · SEO</div>
        <div><h2>SEO 技术体检</h2><p class="sectionIntro">本次报告没有 SEO 采集数据。</p></div>
      </div>
    </section>`;
  }
  const seo = report.seo;
  return `<section class="section" id="seo">
    <div class="sectionHeader">
      <div class="sectionNo">02 · SEO</div>
      <div>
        <h2>SEO 技术体检</h2>
        <p class="sectionIntro">索引、摘要、分享卡片、结构化数据和 sitemap。</p>
      </div>
    </div>
    <div class="viewportGrid">
      <section class="viewportCard">
        <h3>页面信号</h3>
        <div class="facts">
          ${renderFact("Title", seo.page.title || "缺失")}
          ${renderFact("Description", seo.page.metaDescription ? `${seo.page.metaDescription.length} 字符` : "缺失")}
          ${renderFact("H1", seo.page.h1Texts.length > 0 ? `${seo.page.h1Texts.length} 个` : "缺失")}
          ${renderFact("Canonical", seo.page.canonicalHref || "缺失")}
          ${renderFact("Robots", seo.page.robotsMeta || seo.page.xRobotsTag || "无")}
          ${renderFact("HTML lang", seo.page.htmlLang || "缺失")}
        </div>
      </section>
      <section class="viewportCard">
        <h3>抓取和增强</h3>
        <div class="facts">
          ${renderFact("robots.txt", seo.robotsTxt.exists ? (seo.robotsTxt.blocksHomepage ? "拦截当前页" : "未拦截当前页") : "未发现")}
          ${renderFact("Sitemap", seo.sitemap.exists ? `${seo.sitemap.valid ? "可解析" : "不可解析"} · ${seo.sitemap.urlCount} 条` : "未发现")}
          ${renderFact("OG Image", seo.page.openGraph.image ? "存在" : "缺失")}
          ${renderFact("Twitter Card", seo.page.twitter.card || "缺失")}
          ${renderFact("JSON-LD", `${seo.page.structuredData.validCount}/${seo.page.structuredData.count} 可解析`)}
          ${renderFact("图片 alt", `${seo.page.images.missingAltCount}/${seo.page.images.total} 缺失`)}
        </div>
      </section>
    </div>
  </section>`;
}

function renderLighthouseSection(report: CheckReport): string {
  if (!report.lighthouse) {
    return `<section class="section" id="lighthouse">
      <div class="sectionHeader">
        <div class="sectionNo">03 · 性能</div>
        <div><h2>Lighthouse</h2><p class="sectionIntro">本次报告没有 Lighthouse 数据。</p></div>
      </div>
    </section>`;
  }
  const lighthouse = report.lighthouse;
  if (lighthouse.error) {
    return `<section class="section" id="lighthouse">
      <div class="sectionHeader">
        <div class="sectionNo">03 · 性能</div>
        <div><h2>Lighthouse</h2><p class="sectionIntro">执行失败：${escapeHtml(lighthouse.error)}</p></div>
      </div>
    </section>`;
  }
  return `<section class="section" id="lighthouse">
    <div class="sectionHeader">
      <div class="sectionNo">03 · 性能</div>
      <div>
        <h2>Lighthouse</h2>
        <p class="sectionIntro">实验室性能、SEO、可访问性和核心网页指标近似值。</p>
      </div>
    </div>
    <div class="viewportGrid">
      <section class="viewportCard">
        <h3>分类分数</h3>
        <div class="facts">
          ${renderFact("Performance", scorePercent(lighthouse.categories.performance.score))}
          ${renderFact("Accessibility", scorePercent(lighthouse.categories.accessibility.score))}
          ${renderFact("Best Practices", scorePercent(lighthouse.categories["best-practices"].score))}
          ${renderFact("SEO", scorePercent(lighthouse.categories.seo.score))}
        </div>
      </section>
      <section class="viewportCard">
        <h3>核心指标</h3>
        <div class="facts">
          ${renderFact("FCP", metricDisplay(lighthouse.metrics["first-contentful-paint"]))}
          ${renderFact("LCP", metricDisplay(lighthouse.metrics["largest-contentful-paint"]))}
          ${renderFact("CLS", metricDisplay(lighthouse.metrics["cumulative-layout-shift"]))}
          ${renderFact("TBT", metricDisplay(lighthouse.metrics["total-blocking-time"]))}
          ${renderFact("Speed Index", metricDisplay(lighthouse.metrics["speed-index"]))}
        </div>
      </section>
    </div>
    ${
      lighthouse.audits.length > 0
        ? `<table>
            <thead><tr><th>重点失败项</th><th>值</th></tr></thead>
            <tbody>${lighthouse.audits
              .map((audit) => `<tr><td>${escapeHtml(audit.title)}</td><td>${escapeHtml(audit.displayValue || audit.id)}</td></tr>`)
              .join("")}</tbody>
          </table>`
        : ""
    }
  </section>`;
}

function renderFact(labelText: string, value: string): string {
  return `<div class="fact"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderRoutes(report: CheckReport): string {
  if (report.routes.length === 0) return `<p class="sectionIntro">没有可抽样的同源链接，或首页状态不适合继续抽样。</p>`;
  return `<table>
    <thead><tr><th>页面</th><th>路由</th><th>来源</th><th>HTTP</th><th>状态</th></tr></thead>
    <tbody>
      ${report.routes
        .map(
          (route) =>
            `<tr><td>${escapeHtml(route.label ?? "")}</td><td>${escapeHtml(route.url)}</td><td>${escapeHtml(routeSourceLabel(route.source))}</td><td>${escapeHtml(String(route.status ?? "n/a"))}</td><td>${route.ok ? "通过" : "失败"}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderPagesSection(report: CheckReport): string {
  const pages = reportPages(report);
  if (pages.length === 0) return "";
  return `<section class="section" id="pages">
    <div class="sectionHeader">
      <div class="sectionNo">01 · 页面</div>
      <div>
        <h2>页面覆盖</h2>
        <p class="sectionIntro">${escapeHtml(pageCoverageIntro(report))}</p>
      </div>
    </div>
    <div class="pageGrid">${pages.map(renderPageCard).join("")}</div>
  </section>`;
}

function renderPageCard(page: CheckPageResult): string {
  const critical = countSeverity(page.issues, "critical");
  const fixSoon = countSeverity(page.issues, "fix_soon");
  return `<section class="pageCard">
    <h3>${escapeHtml(page.label)}</h3>
    <div class="url">${escapeHtml(page.url)}</div>
    <div class="pageStats">
      <span>${escapeHtml(resultLabel(page.result))}</span>
      <span>${page.score}/100</span>
      <span>严重 ${critical}</span>
      <span>修复 ${fixSoon}</span>
      <span>${escapeHtml(routeSourceLabel(page.source))}</span>
    </div>
  </section>`;
}

function renderShotSpread(report: CheckReport, pages: CheckPageResult[], desktop?: ViewportResult, mobile?: ViewportResult): string {
  const shots = pages.flatMap((page) =>
    page.viewports.slice(0, 2).map((viewport) => renderShot(report.id, viewport, `${page.label} · ${viewportLabel(viewport.name)}首屏`))
  );
  if (shots.length > 0) return shots.join("");
  return `${desktop ? renderShot(report.id, desktop, "桌面首屏") : ""}${mobile ? renderShot(report.id, mobile, "手机首屏") : ""}`;
}

function renderShot(id: string, viewport: ViewportResult, title: string): string {
  return `<figure class="shot">
    <figcaption><span>${escapeHtml(title)}</span><span>${viewport.width}×${viewport.height}</span></figcaption>
    <img src="${escapeHtml(artifactLink(id, viewport.screenshotPath))}" alt="${escapeHtml(title)}截图">
  </figure>`;
}

function reportPages(report: CheckReport): CheckPageResult[] {
  if (report.pages?.length) return report.pages;
  return [
    {
      id: "home",
      label: "首页",
      source: "entry",
      url: report.url,
      finalUrl: report.viewports[0]?.finalUrl ?? report.url,
      checkedAt: report.checkedAt,
      completedAt: report.completedAt,
      status: "completed",
      result: report.result,
      score: report.score,
      summary: report.summary,
      issues: report.issues,
      viewports: report.viewports,
      seo: report.seo,
      lighthouse: report.lighthouse
    }
  ];
}

function reportLink(report: CheckReport, kind: "markdown" | "json"): string {
  if (report.id.startsWith("local_")) return kind === "markdown" ? "report.md" : "report.json";
  return kind === "markdown" ? `/r/${encodeURIComponent(report.id)}.md` : `/r/${encodeURIComponent(report.id)}.json`;
}

function artifactLink(id: string, artifactPath: string): string {
  if (id.startsWith("local_")) return artifactPath;
  return `/r/${encodeURIComponent(id)}/${artifactPath}`;
}

function markdownArtifactLink(id: string, artifactPath: string): string {
  if (id.startsWith("local_")) return artifactPath;
  return `https://checkhere.page/r/${encodeURIComponent(id)}/${artifactPath}`;
}

function countSeverity(issues: CheckIssue[], severity: Severity): number {
  return issues.filter((issue) => issue.severity === severity).length;
}

function resultLabel(result: CheckReport["result"]): string {
  if (result === "ready") return "可以分享";
  if (result === "needs_fixes") return "需要修复";
  return "暂缓发布";
}

function routeSourceLabel(source: string | undefined): string {
  if (source === "entry") return "入口";
  if (source === "manual") return "手动";
  if (source === "sampled") return "自动";
  return "抽样";
}

function pageCoverageIntro(report: CheckReport): string {
  const site = report.site;
  if (!site) return "本次报告覆盖入口页面。";
  return `共检查 ${site.pagesChecked} 个页面，最低分 ${site.lowestScore}/100，失败页面 ${site.failedPages.length} 个。`;
}

function scorePercent(score: number | null): string {
  return score === null ? "n/a" : `${Math.round(score * 100)}`;
}

function metricDisplay(metric: { displayValue: string; numericValue: number | null }): string {
  if (metric.displayValue) return metric.displayValue;
  if (metric.numericValue === null) return "n/a";
  return String(Math.round(metric.numericValue));
}

function yesNo(value: boolean): string {
  return value ? "有" : "缺失";
}

function verdictCopy(report: CheckReport): string {
  const critical = countSeverity(report.issues, "critical");
  const fixSoon = countSeverity(report.issues, "fix_soon");
  const polish = countSeverity(report.issues, "polish");
  return `分数 ${report.score}/100。严重 ${critical}，修复 ${fixSoon}，润色 ${polish}。`;
}

function issueSectionIntro(report: CheckReport): string {
  if (report.issues.length === 0) return "未发现问题。";
  return `共 ${report.issues.length} 项。按严重度排序。`;
}

function acceptanceCriteria(report: CheckReport): string[] {
  const criteria = [
    "目标 URL 返回成功的 HTML 页面。",
    "桌面和手机截图都能看到有意义的内容。",
    "初始加载没有未捕获的运行时异常。",
    "同源脚本、样式、图片和字体没有 4xx 或 5xx。",
    "手机视口没有横向滚动。"
  ];
  if (report.issues.some((issue) => issue.code === "BROKEN_LINK")) criteria.push("抽样到的同源链接全部返回成功状态。");
  if (report.issues.some((issue) => SEO_ISSUE_CODES.has(issue.code))) criteria.push("SEO 技术体检对应问题消失。");
  if (report.issues.some((issue) => LIGHTHOUSE_ISSUE_CODES.has(issue.code))) criteria.push("Lighthouse 性能问题和核心指标问题进入可接受范围。");
  criteria.push("修复后重新运行 CheckHere，并把新报告链接写回任务记录。");
  return criteria;
}

function executionOrder(report: CheckReport): string[] {
  if (report.issues.length === 0) return ["人工确认桌面、手机截图和关键入口。"];
  const order: string[] = [];
  if (report.issues.some((issue) => issue.severity === "critical")) order.push("先修严重阻断，确保页面可访问、非空白、无首屏崩溃。");
  if (report.issues.some((issue) => issue.code === "FAILED_REQUEST" || issue.code === "BROKEN_ASSET" || issue.code === "BROKEN_IMAGE")) {
    order.push("修复资源加载，检查构建路径、CDN 和 public 目录。");
  }
  if (report.issues.some((issue) => issue.code === "MOBILE_OVERFLOW" || issue.code === "MISSING_VIEWPORT")) {
    order.push("处理移动端布局，移除固定宽度，补齐 viewport meta。");
  }
  if (report.issues.some((issue) => SEO_ISSUE_CODES.has(issue.code))) {
    order.push("处理 SEO 技术项，优先修 noindex、robots、canonical 和 sitemap。");
  }
  if (report.issues.some((issue) => LIGHTHOUSE_ISSUE_CODES.has(issue.code))) {
    order.push("处理 Lighthouse 失败项，优先优化 LCP、CLS、TBT 和阻塞资源。");
  }
  if (report.issues.some((issue) => issue.severity === "polish")) order.push("补齐标题、favicon 等细节。");
  order.push("重新部署后再次运行 CheckHere。");
  return order;
}

function issueTitle(issue: CheckIssue): string {
  return codeLabel(issue.code);
}

function codeLabel(code: IssueCode): string {
  switch (code) {
    case "HTTP_ERROR":
      return "首页返回 HTTP 错误";
    case "LOAD_ERROR":
      return "页面导航没有完成";
    case "BLANK_PAGE":
      return "页面疑似空白";
    case "CONSOLE_ERROR":
      return "浏览器控制台报错";
    case "PAGE_ERROR":
      return "页面运行时异常";
    case "SCREENSHOT_FAILED":
      return "截图采集失败";
    case "FAILED_REQUEST":
      return "网络请求失败";
    case "BROKEN_ASSET":
      return "静态资源返回错误";
    case "BROKEN_IMAGE":
      return "图片没有渲染";
    case "MOBILE_OVERFLOW":
      return "手机端横向溢出";
    case "MISSING_TITLE":
      return "页面缺少标题";
    case "MISSING_VIEWPORT":
      return "页面缺少 viewport meta";
    case "MISSING_FAVICON":
      return "页面缺少 favicon";
    case "BROKEN_LINK":
      return "同源链接抽样失败";
    case "MISSING_META_DESCRIPTION":
      return "缺少 meta description";
    case "WEAK_META_DESCRIPTION":
      return "meta description 需要优化";
    case "H1_MISSING":
      return "页面缺少 H1";
    case "MULTIPLE_H1":
      return "页面存在多个 H1";
    case "CANONICAL_MISSING":
      return "缺少 canonical";
    case "CANONICAL_MISMATCH":
      return "canonical 指向不一致";
    case "NOINDEX_DETECTED":
      return "页面设置了 noindex";
    case "ROBOTS_BLOCKED":
      return "robots.txt 拦截当前页";
    case "SITEMAP_MISSING":
      return "缺少 sitemap";
    case "SITEMAP_INVALID":
      return "sitemap 无法解析";
    case "STRUCTURED_DATA_INVALID":
      return "结构化数据无效";
    case "OG_IMAGE_MISSING":
      return "缺少分享图片";
    case "MISSING_IMAGE_ALT":
      return "图片缺少 alt";
    case "LIGHTHOUSE_PERFORMANCE_LOW":
      return "Lighthouse 性能分偏低";
    case "CORE_WEB_VITALS_POOR":
      return "核心网页指标需要优化";
  }
}

function recommendationFor(code: IssueCode): string {
  switch (code) {
    case "HTTP_ERROR":
      return "检查部署路由、边缘函数和源站响应，让目标 URL 返回 2xx HTML。";
    case "LOAD_ERROR":
      return "复现浏览器导航过程，移除阻塞加载的网络或脚本问题。";
    case "BLANK_PAGE":
      return "确认首屏数据、入口脚本和渲染容器都能在首次加载时正常输出内容。";
    case "CONSOLE_ERROR":
    case "PAGE_ERROR":
      return "定位报错堆栈，修复运行时异常，重新构建和部署。";
    case "SCREENSHOT_FAILED":
      return "检查 Web Font 加载、长动画或遮挡层，确保浏览器能稳定截取首屏。";
    case "FAILED_REQUEST":
    case "BROKEN_ASSET":
      return "修正资源路径、构建产物位置、CDN 缓存或 public 文件配置。";
    case "BROKEN_IMAGE":
      return "替换失效图片地址，或移除无法加载的图片元素。";
    case "MOBILE_OVERFLOW":
      return "把固定宽度改成响应式约束，例如 max-width、minmax 和可换行布局。";
    case "MISSING_TITLE":
      return "添加清晰的 document title，说明产品或页面用途。";
    case "MISSING_VIEWPORT":
      return "添加 `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">`。";
    case "MISSING_FAVICON":
      return "添加 favicon 或 app icon，提升浏览器标签页和分享时的完整度。";
    case "BROKEN_LINK":
      return "修复内部链接目标，或移除已经不可访问的入口。";
    case "MISSING_META_DESCRIPTION":
      return "添加一段清晰的 meta description，说明页面内容和打开理由。";
    case "WEAK_META_DESCRIPTION":
      return "重写 meta description，让它适合搜索结果展示，通常控制在 70 到 170 个字符。";
    case "H1_MISSING":
      return "添加一个清晰的 H1，表达页面主题。";
    case "MULTIPLE_H1":
      return "保留一个主 H1，把次级标题调整为 H2 或 H3。";
    case "CANONICAL_MISSING":
      return "添加指向当前首选公开 URL 的 canonical。";
    case "CANONICAL_MISMATCH":
      return "把 canonical 改为当前可索引页面的首选 URL。";
    case "NOINDEX_DETECTED":
      return "上线可索引页面前移除 noindex。";
    case "ROBOTS_BLOCKED":
      return "调整 robots.txt，让当前公开页面允许搜索引擎抓取。";
    case "SITEMAP_MISSING":
      return "发布 sitemap.xml；如果站点有多页内容，在 robots.txt 里声明 sitemap。";
    case "SITEMAP_INVALID":
      return "修复 sitemap XML，确保包含有效的 urlset 或 sitemapindex。";
    case "STRUCTURED_DATA_INVALID":
      return "修复 JSON-LD 语法并重新验证结构化数据。";
    case "OG_IMAGE_MISSING":
      return "添加 og:image 或 twitter:image，用于分享卡片预览。";
    case "MISSING_IMAGE_ALT":
      return "给有意义的图片补充描述性 alt；装饰图使用空 alt。";
    case "LIGHTHOUSE_PERFORMANCE_LOW":
      return "按 Lighthouse 失败项优化阻塞资源、未使用代码、图片体积和服务端响应。";
    case "CORE_WEB_VITALS_POOR":
      return "优化 LCP、CLS 或主线程阻塞，重点检查首屏资源、布局稳定性和 JavaScript 执行。";
  }
}

function acceptanceFor(code: IssueCode): string {
  switch (code) {
    case "HTTP_ERROR":
    case "LOAD_ERROR":
    case "BLANK_PAGE":
      return "重新运行检查后，首页状态为 2xx，桌面和手机截图都有有效内容。";
    case "CONSOLE_ERROR":
    case "PAGE_ERROR":
      return "重新运行检查后，问题清单里不再出现相同控制台错误或运行时异常。";
    case "SCREENSHOT_FAILED":
      return "重新运行检查后，桌面和手机截图都能正常显示。";
    case "FAILED_REQUEST":
    case "BROKEN_ASSET":
    case "BROKEN_IMAGE":
      return "重新运行检查后，相同 URL 的资源加载问题消失，截图中对应区域正常显示。";
    case "MOBILE_OVERFLOW":
    case "MISSING_VIEWPORT":
      return "重新运行检查后，手机视口横向溢出为 0 或低于容忍阈值。";
    case "MISSING_TITLE":
    case "MISSING_FAVICON":
      return "重新运行检查后，页面元信息项不再出现在体验润色列表。";
    case "BROKEN_LINK":
      return "重新运行检查后，抽样路由全部返回成功状态。";
    case "MISSING_META_DESCRIPTION":
    case "WEAK_META_DESCRIPTION":
    case "H1_MISSING":
    case "MULTIPLE_H1":
    case "CANONICAL_MISSING":
    case "CANONICAL_MISMATCH":
    case "NOINDEX_DETECTED":
    case "ROBOTS_BLOCKED":
    case "SITEMAP_MISSING":
    case "SITEMAP_INVALID":
    case "STRUCTURED_DATA_INVALID":
    case "OG_IMAGE_MISSING":
    case "MISSING_IMAGE_ALT":
      return "重新运行检查后，SEO 技术体检里对应问题消失。";
    case "LIGHTHOUSE_PERFORMANCE_LOW":
    case "CORE_WEB_VITALS_POOR":
      return "重新运行检查后，Lighthouse 分数或核心指标进入目标范围。";
  }
}

function severityLabel(severity: Severity): string {
  if (severity === "critical") return "严重阻断";
  if (severity === "fix_soon") return "上线前修复";
  return "体验润色";
}

function severityColor(severity: Severity): string {
  if (severity === "critical") return "var(--red)";
  if (severity === "fix_soon") return "var(--amber)";
  return "var(--ink-blue)";
}

function severityBackground(severity: Severity): string {
  if (severity === "critical") return "var(--red-soft)";
  if (severity === "fix_soon") return "var(--amber-soft)";
  return "var(--blue-soft)";
}

function resultColor(result: CheckReport["result"]): string {
  if (result === "ready") return "var(--green)";
  if (result === "needs_fixes") return "var(--amber)";
  return "var(--red)";
}

function resultBackground(result: CheckReport["result"]): string {
  if (result === "ready") return "var(--green-soft)";
  if (result === "needs_fixes") return "var(--amber-soft)";
  return "var(--red-soft)";
}

function scoreColor(score: number): string {
  if (score >= 90) return "var(--green)";
  if (score >= 60) return "var(--amber)";
  return "var(--red)";
}

function evidenceLabel(key: string): string {
  const labels: Record<string, string> = {
    status: "HTTP 状态",
    url: "URL",
    resourceType: "资源类型",
    alt: "图片 Alt",
    width: "宽度",
    height: "高度",
    documentWidth: "页面宽度",
    viewportWidth: "视口宽度",
    overflowPx: "溢出像素",
    screenshot: "截图",
    errors: "错误",
    location: "位置",
    bodyTextLength: "正文长度",
    visibleElementCount: "可见元素",
    omittedSimilarIssues: "已省略同类问题"
  };
  return labels[key] ?? key;
}

function evidenceViewports(evidence: Record<string, unknown> | undefined): string[] {
  if (!evidence) return [];
  const value = evidence.viewports;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof evidence.viewport === "string" ? [evidence.viewport] : [];
}

function viewportLabel(viewport: string): string {
  if (viewport === "desktop") return "桌面";
  if (viewport === "mobile") return "手机";
  return viewport;
}

function formatEvidenceValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatDuration(start: string, end: string): string {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return "n/a";
  return `${((endMs - startMs) / 1000).toFixed(1)} 秒`;
}

function formatMs(value: number | null): string {
  return typeof value === "number" ? `${value}ms` : "n/a";
}

function markdownTableCell(value: unknown): string {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
