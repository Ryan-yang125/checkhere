type Env = {
  PUBLIC_BASE_URL?: string;
};

type DocSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  code?: string;
};

type DocPage = {
  title: string;
  description: string;
  eyebrow: string;
  lead: string;
  sections: DocSection[];
  faq: Array<{ question: string; answer: string }>;
};

const GITHUB_URL = 'https://github.com/Ryan-yang125/checkhere';
const RELEASE_VERSION = '0.4.0';
const UPDATED_AT = '2026-07-23';

const DOC_PAGES: Record<string, DocPage> = {
  '/docs/cli': {
    title: 'CheckHere CLI 使用文档：本地检查网站',
    description: '安装免费开源的 CheckHere CLI，在本机用 Playwright Chromium 检查网站、生成截图和 HTML、Markdown、JSON 报告。',
    eyebrow: 'CLI 文档',
    lead: 'CheckHere CLI 在你的电脑或 CI runner 中启动 Chromium，检查目标网站并把完整报告写入本地目录。网页内容、截图和检测结果全程留在执行环境内。',
    sections: [
      {
        heading: '安装与首次设置',
        paragraphs: ['安装脚本从 GitHub Release 下载固定版本的 npm 压缩包。setup 命令会安装与 CheckHere 版本匹配的 Chromium。'],
        code: 'curl -fsSL https://checkhere.page/install.sh | bash\ncheckhere setup\ncheckhere doctor'
      },
      {
        heading: '检查一个网站',
        paragraphs: ['传入本地开发地址、预览地址或线上地址。CheckHere 会采集桌面与移动端截图、浏览器错误、资源失败和页面质量信号。'],
        code: 'checkhere http://localhost:3000\ncheckhere https://preview.example.com\ncheckhere https://example.com --routes routes.txt'
      },
      {
        heading: '报告文件',
        paragraphs: ['一次检查会从同一份 report.json 生成面向人的 HTML 报告和面向 Agent 的 Markdown 报告。命令行会输出每个文件的绝对路径。'],
        bullets: [
          'report.html：截图优先的可视化报告',
          'report.md：适合 Coding Agent 阅读和执行的修复清单',
          'report.json：适合脚本、CI 和二次分析的结构化数据',
          'fix-prompt.md：兼容旧工作流的 Markdown 别名'
        ]
      },
      {
        heading: '把检查变成发布门槛',
        paragraphs: ['ci 子命令提供稳定退出码和可配置阈值，可按严重问题、总分或单页得分阻止有风险的发布。'],
        code: 'checkhere ci https://preview.example.com --fail-on=critical\ncheckhere ci https://preview.example.com --fail-on=score:90\ncheckhere ci https://preview.example.com --fail-on=page-score:80'
      }
    ],
    faq: [
      { question: 'CheckHere 会上传我的截图吗？', answer: '每次检查都在本机或你的 CI runner 内完成，截图和报告写入本地目录。' },
      { question: 'CheckHere 能检查 localhost 吗？', answer: '可以。开发服务器可从当前机器访问时，直接运行 checkhere http://localhost:端口。' }
    ]
  },
  '/docs/skill': {
    title: 'CheckHere Agent Skill：让 Coding Agent 验收网站',
    description: '使用免费的 CheckHere Agent Skill，让 Codex、Claude Code 等 Coding Agent 自动运行本地浏览器检查、阅读报告、修复并复检。',
    eyebrow: 'Agent Skill',
    lead: 'CheckHere Skill 把网站验收整理成固定的 Agent 工作流：启动项目、运行本地检查、打开截图报告、读取结构化问题、完成修复、再次验证。',
    sections: [
      {
        heading: 'Skill 能完成什么',
        paragraphs: ['Skill 负责组织检查和修复流程，底层浏览器检测由本地 CheckHere CLI 执行。用户可以在修改代码前后审阅报告和授权范围。'],
        bullets: ['发现正在运行的本地开发地址', '按明确路由执行桌面与移动端检查', '打开 report.html 展示截图证据', '读取 report.md 或 report.json 定位问题', '修复后重新检查并汇报变化']
      },
      {
        heading: '获取 Skill',
        paragraphs: ['Skill 源文件随开源仓库发布，目录遵循 Agent Skills 的 SKILL.md 结构。安装方式和最新兼容列表以仓库说明为准。'],
        code: 'gh skill install Ryan-yang125/checkhere checkhere@v0.4.0 --agent codex --scope user\nnpx skills add Ryan-yang125/checkhere --skill checkhere --agent codex -y'
      },
      {
        heading: '交给 Agent 的一句话',
        paragraphs: ['提供目标地址和验收范围，Agent 就能按 Skill 合同执行。涉及修改代码时，Agent 仍会遵循当前项目的授权边界。'],
        code: '请使用 CheckHere Skill 检查 http://localhost:3000，打开 HTML 报告，修复 critical 和 fix_soon 问题，然后复检。'
      },
      {
        heading: '推荐交付格式',
        paragraphs: ['一次完整交付应包含最终分数、已修复问题、剩余问题，以及 report.html、report.md、report.json 的绝对路径。']
      }
    ],
    faq: [
      { question: 'Skill 会把项目代码发送到外部服务吗？', answer: 'Skill 调用本地 CLI，浏览器和报告生成都发生在当前执行环境中。' },
      { question: '可以只让 Agent 检查而不改代码吗？', answer: '可以。把任务范围写成只读验收，Agent 会运行检查并汇报证据。' }
    ]
  },
  '/docs/github-actions': {
    title: '在 GitHub Actions 中运行 CheckHere',
    description: '把免费开源的 CheckHere CLI 加入 GitHub Actions，用真实 Chromium 截图、控制台错误和页面得分守住网站发布质量。',
    eyebrow: 'GitHub Actions',
    lead: 'CheckHere 的 ci 子命令适合在预览环境或部署完成后运行。退出码 0 表示通过当前策略，退出码 1 表示发现超出阈值的问题，退出码 2 表示执行环境错误。',
    sections: [
      {
        heading: '最小工作流',
        paragraphs: ['官方 Action 会安装 v0.4.0、准备 Chromium、运行检查，并把报告保存在当前 workflow 中。'],
        code: [
          'name: checkhere',
          'on: [pull_request]',
          'jobs:',
          '  browser-check:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - uses: Ryan-yang125/checkhere@v0.4.0',
          '        with:',
          '          url: https://preview.example.com',
          '          fail-on: critical'
        ].join('\n')
      },
      {
        heading: '选择失败策略',
        paragraphs: ['critical 适合作为第一阶段门槛。积累几次真实项目结果后，可以增加总分或单页得分阈值。'],
        bullets: ['--fail-on=critical：发现 critical 问题时失败', '--fail-on=score:90：总分低于 90 时失败', '--fail-on=page-score:80：任一已检查页面低于 80 时失败']
      },
      {
        heading: '检查多个明确路由',
        paragraphs: ['把重要路径按行写入 routes.txt，再通过 --routes 传入。登录页、定价页、文档页和主要转化页可以获得稳定覆盖。'],
        code: '/\n/pricing\n/docs\n/contact\n\ncheckhere ci https://preview.example.com --routes routes.txt --fail-on=page-score:80'
      },
      {
        heading: '保留报告证据',
        paragraphs: ['CI 生成的 HTML、Markdown 和 JSON 文件可以作为 workflow artifact 保存。出现失败时，团队可以直接查看截图和机器可读证据。']
      }
    ],
    faq: [
      { question: 'CheckHere GitHub Action 需要 API key 吗？', answer: '本地 CLI 在 GitHub runner 中直接运行，基础检查无需 CheckHere 账号或 API key。' },
      { question: '应该检查生产站还是预览站？', answer: '优先检查每个 PR 的预览地址，并在正式部署后增加一次生产冒烟检查。' }
    ]
  },
  '/checks/broken-image': {
    title: '如何检测网站坏图：BROKEN_IMAGE 浏览器检查',
    description: '用 CheckHere 在真实 Chromium 中发现加载失败、尺寸异常或无法显示的图片，查看请求证据和页面截图并复检。',
    eyebrow: '检测项 · BROKEN_IMAGE',
    lead: '坏图检查关注用户真正看到的图片结果。CheckHere 在 Chromium 页面环境里观察图片加载状态和资源请求，再把 URL、页面位置与截图证据写入本地报告。',
    sections: [
      {
        heading: '什么情况会触发坏图问题',
        paragraphs: ['图片请求失败、资源返回错误状态或图片元素完成加载后仍缺少有效尺寸，都可能形成 BROKEN_IMAGE 证据。'],
        bullets: ['图片 URL 返回 404、403 或 5xx', '构建产物缺少被页面引用的静态资源', 'CDN 或跨域配置让浏览器无法读取图片', '图片元素存在，浏览器得到的自然宽高为零']
      },
      {
        heading: '本地复现',
        paragraphs: ['先运行开发服务器，再让 CheckHere 检查包含图片的明确路由。HTML 报告中的桌面与移动端截图可帮助确认视觉影响。'],
        code: 'checkhere http://localhost:3000 --routes routes.txt\nopen ./checkhere-reports/latest/report.html'
      },
      {
        heading: '常见修复',
        paragraphs: ['核对 public 目录、构建后的资源路径、大小写和部署 base path。远程资源还需要检查响应状态、CORS 和防盗链规则。']
      },
      {
        heading: '验收标准',
        paragraphs: ['修复后再次运行同一条命令。报告中对应 BROKEN_IMAGE 消失，截图呈现预期图片，相关网络请求成功。']
      }
    ],
    faq: [
      { question: '为什么浏览器里偶尔能看到图片，检查仍然报错？', answer: '缓存、鉴权、防盗链和间歇性 CDN 响应都可能造成差异。报告里的请求状态和检查时间能帮助定位。' },
      { question: '背景图会被检查吗？', answer: '网络失败采集可以覆盖浏览器请求到的 CSS 背景资源，图片元素还会获得额外的 DOM 状态证据。' }
    ]
  },
  '/checks/mobile-overflow': {
    title: '如何检测移动端横向溢出：MOBILE_OVERFLOW',
    description: '用 CheckHere 的移动端 Chromium 检查发现页面横向滚动、超宽元素和响应式布局问题，并通过截图证据完成修复复检。',
    eyebrow: '检测项 · MOBILE_OVERFLOW',
    lead: '移动端横向溢出会让内容被裁切、页面意外左右滚动。CheckHere 在移动端视口比较页面滚动宽度和可视宽度，并记录可疑元素与截图。',
    sections: [
      {
        heading: '常见触发原因',
        paragraphs: ['固定宽度、长文本、表格、绝对定位和视口单位组合都可能把内容推到可视区域之外。'],
        bullets: ['width 或 min-width 超过父容器', '100vw 与页面滚动条或外层 padding 叠加', '代码块、URL、表格缺少换行或横向容器', '绝对定位元素超出右侧边界']
      },
      {
        heading: '运行移动端检查',
        paragraphs: ['CheckHere 会在标准移动视口加载页面。优先把导航、定价、文档和表单页面加入 routes.txt。'],
        code: 'checkhere http://localhost:3000 --routes routes.txt\nopen ./checkhere-reports/latest/report.html'
      },
      {
        heading: '修复方向',
        paragraphs: ['从报告指出的元素向上检查布局约束。常用处理包括 max-width: 100%、min-width: 0、overflow-wrap: anywhere，以及为宽表格提供明确的滚动容器。']
      },
      {
        heading: '验收标准',
        paragraphs: ['页面滚动宽度回到视口宽度范围，移动端截图完整，主要内容在常见触控宽度下可读可操作。']
      }
    ],
    faq: [
      { question: '给 body 加 overflow-x: hidden 可以解决吗？', answer: '它会遮住超出部分。定位并修正超宽元素能保留完整内容和可访问性。' },
      { question: '桌面端正常时还需要检查吗？', answer: '需要。响应式断点、长文本和触控导航的问题经常只在窄视口出现。' }
    ]
  },
  '/checks/console-error': {
    title: '如何检测网页 Console Error：CONSOLE_ERROR',
    description: '用 CheckHere 在真实 Chromium 中记录 JavaScript console error、page error 和失败请求，获得可复现证据并完成上线前复检。',
    eyebrow: '检测项 · CONSOLE_ERROR',
    lead: '控制台错误经常对应初始化失败、第三方脚本异常或交互功能损坏。CheckHere 在页面加载和检查期间收集 console error，并把消息、页面和相关证据写入报告。',
    sections: [
      {
        heading: 'CheckHere 会记录什么',
        paragraphs: ['浏览器 console.error 形成 CONSOLE_ERROR；未捕获的页面 JavaScript 异常形成 PAGE_ERROR；资源请求失败会单独保留网络证据。'],
        bullets: ['错误消息和来源页面', '检查发生时间和页面 URL', '桌面与移动端运行结果', '相关失败请求和截图上下文']
      },
      {
        heading: '本地复现',
        paragraphs: ['使用与用户相同的页面地址运行检查，再从 HTML 报告跳到 Markdown 或 JSON 查看完整错误文本。'],
        code: 'checkhere http://localhost:3000\nopen ./checkhere-reports/latest/report.html'
      },
      {
        heading: '判断优先级',
        paragraphs: ['影响首屏渲染、路由、表单提交或核心交互的错误应优先处理。来自可选分析脚本的噪声可以结合用户影响和复现稳定性评估。']
      },
      {
        heading: '验收标准',
        paragraphs: ['修复后在相同 URL 和路由集合上复检。核心流程可操作，CONSOLE_ERROR 或 PAGE_ERROR 证据消失，网络失败数量符合预期。']
      }
    ],
    faq: [
      { question: '所有 console error 都会阻止发布吗？', answer: '严重度取决于实际影响。CI 可以先用 critical 策略，再根据项目基线逐步收紧。' },
      { question: 'CheckHere 能看到未捕获异常吗？', answer: '可以。页面运行期间触发的未捕获 JavaScript 异常会作为 PAGE_ERROR 记录。' }
    ]
  },
  '/guides/ai-website-launch-checklist': {
    title: 'AI 建站上线检查清单：用真实浏览器完成交付验收',
    description: '面向 AI 生成网站和 vibe coding 项目的上线清单：状态、首屏、截图、坏图、控制台、移动端、SEO、路由与 Lighthouse。',
    eyebrow: '上线指南',
    lead: 'AI 建站上线验收需要覆盖浏览器真实结果、关键路由和可复现证据。CheckHere 把这些项目集中到一条本地命令，并保留 HTML、Markdown、JSON 三种报告。',
    sections: [
      {
        heading: '1. 确认页面能稳定打开',
        paragraphs: ['检查首页和关键路由的 HTTP 状态、重定向、空白页和加载超时。把业务关键路径显式写入 routes.txt。'],
        code: '/\n/pricing\n/docs\n/contact'
      },
      {
        heading: '2. 查看桌面与移动端截图',
        paragraphs: ['逐页确认首屏内容、导航、主按钮、图片和移动端布局。截图证据能快速暴露 AI 生成代码中常见的断点遗漏。']
      },
      {
        heading: '3. 清理运行时错误',
        paragraphs: ['处理 console error、page error、失败请求和坏图。每条问题都应带有稳定代码、证据与可执行建议。']
      },
      {
        heading: '4. 核对 SEO 和可访问入口',
        paragraphs: ['检查 title、description、canonical、robots、sitemap 和页面主要内容。确保搜索引擎与 Agent 能直接读取公开信息。']
      },
      {
        heading: '5. 写入发布流程',
        paragraphs: ['先用 critical 作为 CI 门槛，随后根据真实项目基线增加总分和单页得分策略。'],
        code: 'checkhere ci https://preview.example.com --routes routes.txt --fail-on=critical'
      },
      {
        heading: '6. 修复后复检',
        paragraphs: ['使用相同 URL、路由和阈值再次运行。保存最终报告，并把剩余问题和接受原因写进发布记录。']
      }
    ],
    faq: [
      { question: 'AI 生成的网站最容易漏掉哪些上线问题？', answer: '移动端溢出、静态资源路径、未捕获脚本错误、空白路由、元数据和关键页面覆盖最常见。' },
      { question: '什么时候运行上线检查？', answer: '本地开发完成后运行一次，每个预览部署运行一次，正式发布后再做一次生产冒烟检查。' }
    ]
  }
};

const SITE_CSS = ':root{color-scheme:light;--ink:#172018;--muted:#5f6c62;--paper:#f7f5ed;--card:#fffdf7;--line:#d8d7ca;--green:#0f6b42;--lime:#d9ff71;--dark:#14231b;--mono:"SFMono-Regular",Consolas,monospace;--sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.65}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}code,pre{font-family:var(--mono)}.wrap{width:min(1120px,calc(100% - 40px));margin-inline:auto}.site-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;min-height:68px;padding:10px max(20px,calc((100vw - 1120px)/2));border-bottom:1px solid rgba(216,215,202,.8);background:rgba(247,245,237,.92);backdrop-filter:blur(14px)}.brand-link{display:flex;align-items:center;gap:10px}.brand-mark{display:grid;place-items:center;width:34px;height:34px;border:2px solid var(--ink);font-family:Georgia,serif;font-weight:900}.site-nav nav{display:flex;align-items:center;gap:24px;color:var(--muted);font-size:14px}.hero{padding:92px 0 74px}.eyebrow{color:var(--green);font:700 12px/1.3 var(--mono);letter-spacing:.13em}.hero h1,.doc-hero h1{max-width:980px;margin:18px 0 24px;font-size:clamp(46px,8vw,94px);line-height:.98;letter-spacing:-.055em}.hero-copy{max-width:760px;margin:0;color:var(--muted);font-size:clamp(18px,2.2vw,24px)}.hero-actions,.example-actions,.doc-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:34px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border:1px solid var(--ink);border-radius:999px;font-weight:700}.button.primary{background:var(--ink);color:#fff}.text-link{color:var(--green);font-weight:750}.terminal{max-width:820px;margin-top:58px;overflow:hidden;border:1px solid #2f4036;border-radius:18px;background:var(--dark);box-shadow:0 24px 60px rgba(20,35,27,.18);color:#f6f7ec}.terminal-bar{display:flex;align-items:center;gap:7px;padding:13px 17px;border-bottom:1px solid #2f4036;color:#a9b7ae;font:12px var(--mono)}.terminal-bar span{width:9px;height:9px;border-radius:50%;background:#6c7e72}.terminal-bar b{margin-left:6px;font-weight:500}.terminal pre,.code-card pre,.panel pre,.doc-section pre{margin:0;padding:26px;overflow:auto;font-size:14px;line-height:1.9}.terminal em{color:var(--lime);font-style:normal}.facts{display:grid;grid-template-columns:repeat(4,1fr);margin-top:34px;border-block:1px solid var(--line)}.facts div{display:grid;gap:3px;padding:18px 14px;border-right:1px solid var(--line)}.facts div:last-child{border:0}.facts span{color:var(--muted);font-size:12px}.facts strong{font-size:14px}.band{border-block:1px solid var(--line);background:#eeeee4}.section-grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:80px;padding-block:88px}.section-grid h2,.section-block h2,.panel h2,.example-section h2{margin:14px 0 18px;font-size:clamp(32px,4vw,54px);line-height:1.08;letter-spacing:-.035em}.section-grid>div>p,.panel>p,.example-section p{color:var(--muted);font-size:17px}.feature-list{display:grid;border-top:1px solid var(--line)}.feature-list article{display:grid;grid-template-columns:42px 1fr;gap:5px 16px;padding:22px 0;border-bottom:1px solid var(--line)}.feature-list span{grid-row:1/3;color:var(--green);font:700 12px var(--mono)}.feature-list h3,.feature-list p{margin:0}.feature-list p{color:var(--muted)}.split-section{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding-block:88px}.panel{min-height:360px;padding:40px;border:1px solid var(--line);border-radius:24px;background:var(--card)}.panel.dark{background:var(--dark);color:#f4f5eb}.panel.dark .eyebrow{color:var(--lime)}.panel pre{padding:24px 0;font-size:18px;white-space:pre-wrap}.text-link.light{color:var(--lime)}.section-block{padding-block:88px}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:24px}.code-card{overflow:hidden;border:1px solid #2f4036;border-radius:18px;background:var(--dark);color:#f4f5eb}.link-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;margin-top:34px;border:1px solid var(--line);background:var(--line)}.link-grid a{padding:28px;background:var(--card)}.link-grid a:hover{background:#fff;text-decoration:none}.link-grid span{color:var(--green);font:700 11px var(--mono)}.link-grid strong{display:block;margin-top:10px;font-size:21px}.link-grid p{margin:6px 0 0;color:var(--muted)}.example-section{display:grid;grid-template-columns:1fr auto;align-items:center;gap:50px;padding-block:88px}.example-section h2{max-width:650px}.example-section p{max-width:700px}.site-footer{border-top:1px solid var(--line);padding:34px max(20px,calc((100vw - 1120px)/2));display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:13px}.site-footer nav{display:flex;gap:18px}.doc-wrap{width:min(900px,calc(100% - 40px));margin:0 auto;padding:34px 0 80px}.breadcrumbs{display:flex;gap:9px;color:var(--muted);font-size:13px}.doc-hero{padding:64px 0 58px;border-bottom:1px solid var(--line)}.doc-hero h1{font-size:clamp(42px,7vw,76px)}.doc-hero>p{max-width:760px;margin:0;color:var(--muted);font-size:20px}.doc-content{max-width:760px;padding:22px 0}.doc-section{padding:40px 0;border-bottom:1px solid var(--line)}.doc-section h2{margin:0 0 18px;font-size:30px;line-height:1.2;letter-spacing:-.025em}.doc-section p{color:#3f4d43;font-size:17px}.doc-section li{margin:8px 0}.doc-section pre{margin-top:22px;border-radius:14px;background:var(--dark);color:#f4f5eb;white-space:pre-wrap}.faq details{padding:17px 0;border-top:1px solid var(--line)}.faq summary{cursor:pointer;font-weight:750}.next-card{display:grid;gap:12px;margin-top:34px;padding:28px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.next-card code{display:block;padding:14px;background:#efefe5}.next-card a{color:var(--green);font-weight:700}.report-hero{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:end;padding:60px 0 34px;border-bottom:1px solid var(--line)}.score{display:grid;place-items:center;width:150px;height:150px;border:12px solid var(--green);border-radius:50%;font:800 46px var(--mono)}.report-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:32px 0}.report-card{padding:25px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.report-card strong{display:block;margin-bottom:8px;font-size:20px}.severity{display:inline-flex;padding:3px 8px;border-radius:999px;background:#ffe0c3;color:#8c3b00;font:700 11px var(--mono)}.shot{min-height:220px;margin-top:18px;padding:18px;border:8px solid var(--dark);border-radius:14px;background:linear-gradient(135deg,#fff 0 58%,#e9f1ec 58%);box-shadow:inset 0 0 0 1px var(--line)}@media(max-width:760px){.site-nav nav a:not(:last-child){display:none}.hero{padding-top:62px}.hero h1{font-size:49px}.facts{grid-template-columns:1fr 1fr}.facts div:nth-child(2){border-right:0}.section-grid,.split-section,.example-section,.report-hero,.report-grid{grid-template-columns:1fr;gap:30px}.section-grid{padding-block:64px}.panel{min-height:auto;padding:28px}.link-grid{grid-template-columns:1fr}.section-heading{align-items:start;flex-direction:column}.example-actions{align-items:stretch;flex-direction:column}.site-footer{align-items:flex-start;flex-direction:column;gap:16px}.doc-hero{padding-top:44px}}';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return route(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'site_error',
        error: error instanceof Error ? error.message : String(error)
      }));
      return json({ ok: false, error: 'internal_error' }, 500);
    }
  }
};

function route(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const method = request.method;
  const base = (env.PUBLIC_BASE_URL || url.origin).replace(/\/$/, '');

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,HEAD,OPTIONS',
        'access-control-allow-headers': 'content-type'
      }
    });
  }

  if (url.pathname === '/v1/checks' || url.pathname.startsWith('/v1/checks/')) {
    return localOnly(base, method);
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('method not allowed\n', {
      status: 405,
      headers: { allow: 'GET, HEAD, OPTIONS', 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    const canonicalPath = url.pathname.slice(0, -1);
    if (canonicalPath in DOC_PAGES) {
      return Response.redirect(base + canonicalPath, 308);
    }
  }

  if (url.pathname === '/') return home(base, method);
  if (url.pathname === '/health') return jsonBody({ ok: true, service: 'checkhere-site', version: RELEASE_VERSION, mode: 'local_only' }, method);
  if (url.pathname === '/install.sh') return installScript(base, method);
  if (url.pathname === '/llms.txt') return llmsTxt(base, method);
  if (url.pathname === '/robots.txt') return robotsTxt(base, method);
  if (url.pathname === '/sitemap.xml') return sitemapXml(base, method);
  if (url.pathname === '/favicon.svg') return favicon(method);
  if (url.pathname === '/og.svg') return ogImage(method);
  if (url.pathname === '/example-report') return exampleReport(base, method);
  if (url.pathname === '/example-report.md') return exampleMarkdown(method);
  if (url.pathname === '/example-report.json') return exampleJson(method);

  const page = DOC_PAGES[url.pathname];
  if (page) return docPage(base, url.pathname, page, method);

  return new Response(method === 'HEAD' ? null : 'not found\n', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
}

function home(base: string, method: string): Response {
  const title = 'CheckHere — 免费开源的网站上线检查 CLI';
  const description = 'CheckHere 在本机用真实 Chromium 检查 AI 生成网站，输出桌面与移动端截图、浏览器错误、SEO、Lighthouse 和 Agent 可读报告。';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'CheckHere',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    softwareVersion: RELEASE_VERSION,
    url: base + '/',
    codeRepository: GITHUB_URL,
    downloadUrl: GITHUB_URL + '/releases/tag/v' + RELEASE_VERSION,
    description,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  };
  const body = [
    '<header class="site-nav">',
    '<a class="brand-link" href="/" aria-label="CheckHere 首页"><span class="brand-mark">查</span><strong>CheckHere</strong></a>',
    mainNav(),
    '</header>',
    '<main>',
    '<section class="hero wrap">',
    '<div class="eyebrow">FREE · OPEN SOURCE · LOCAL FIRST</div>',
    '<h1>AI 建站交付前，<br>跑一次真实浏览器验收</h1>',
    '<p class="hero-copy">CheckHere 在本机启动 Chromium，检查桌面与移动端页面，生成截图、问题证据和 Agent 可读报告。代码开源，所有检查免费。</p>',
    '<div class="hero-actions"><a class="button primary" href="' + GITHUB_URL + '">查看 GitHub</a><a class="button" href="/docs/cli">阅读 CLI 文档</a><a class="text-link" href="/example-report">查看固定示例报告 →</a></div>',
    '<div class="terminal" aria-label="安装和运行命令"><div class="terminal-bar"><span></span><span></span><span></span><b>终端</b></div><pre><code><em>$</em> curl -fsSL https://checkhere.page/install.sh | bash\n<em>$</em> checkhere setup\n<em>$</em> checkhere https://your-site.com</code></pre></div>',
    '<div class="facts"><div><span>运行位置</span><strong>本机 / CI</strong></div><div><span>浏览器</span><strong>Playwright Chromium</strong></div><div><span>报告</span><strong>HTML · Markdown · JSON</strong></div><div><span>价格</span><strong>¥0</strong></div></div>',
    '</section>',
    '<section class="band"><div class="wrap section-grid"><div><div class="eyebrow">ONE LOCAL COMMAND</div><h2>一次检查，留下可复现的交付证据</h2><p>页面截图、浏览器错误、网络失败、坏图、移动端溢出、SEO 信号和 Lighthouse 指标会汇总到同一份 report.json，再渲染为面向人和 Agent 的报告。</p></div><div class="feature-list"><article><span>01</span><h3>看见页面</h3><p>桌面与移动端截图放在 HTML 报告首要位置。</p></article><article><span>02</span><h3>定位问题</h3><p>每条问题包含稳定代码、严重度、证据和建议。</p></article><article><span>03</span><h3>交给 Agent</h3><p>Markdown 与 JSON 可直接进入修复和复检工作流。</p></article></div></div></section>',
    '<section class="wrap split-section"><div class="panel"><div class="eyebrow">AGENT SKILL</div><h2>让 Coding Agent 自己检查、修复、复检</h2><p>仓库内置 CheckHere Skill。Agent 启动项目后运行本地 CLI，打开 HTML 报告给你看，再读取 Markdown 或 JSON 完成修复。</p><a class="text-link" href="/docs/skill">查看 Skill 工作流 →</a></div><div class="panel dark"><div class="eyebrow">PROMPT</div><pre><code>请使用 CheckHere Skill 检查\nhttp://localhost:3000，\n打开报告，修复后复检。</code></pre><a class="text-link light" href="' + GITHUB_URL + '/tree/main/skills/checkhere">GitHub 中查看 Skill →</a></div></section>',
    '<section class="wrap section-block"><div class="section-heading"><div><div class="eyebrow">RELEASE GATE</div><h2>放进 GitHub Actions</h2></div><a class="text-link" href="/docs/github-actions">完整配置 →</a></div><div class="code-card"><pre><code>checkhere ci https://preview.example.com --fail-on=critical\ncheckhere ci https://preview.example.com --fail-on=score:90\ncheckhere ci https://preview.example.com --routes routes.txt --fail-on=page-score:80</code></pre></div></section>',
    '<section class="band"><div class="wrap section-block"><div class="eyebrow">CHECK LIBRARY</div><h2>从真实问题进入文档</h2><div class="link-grid"><a href="/checks/broken-image"><span>BROKEN_IMAGE</span><strong>坏图与资源路径</strong><p>请求失败、自然尺寸和截图证据。</p></a><a href="/checks/mobile-overflow"><span>MOBILE_OVERFLOW</span><strong>移动端横向溢出</strong><p>视口宽度、超宽元素和响应式布局。</p></a><a href="/checks/console-error"><span>CONSOLE_ERROR</span><strong>浏览器运行时错误</strong><p>console error、page error 和失败请求。</p></a><a href="/guides/ai-website-launch-checklist"><span>GUIDE</span><strong>AI 建站上线清单</strong><p>从关键路由到 CI 门槛的完整验收顺序。</p></a></div></div></section>',
    '<section class="wrap example-section"><div><div class="eyebrow">FIXED EXAMPLE</div><h2>先看看最终报告长什么样</h2><p>这是由本地 CLI 生成并公开保存的固定参考报告。每位用户的新检查都在自己的机器或 CI runner 内完成。</p></div><div class="example-actions"><a class="button primary" href="/example-report">打开 HTML 示例</a><a class="button" href="/example-report.md">查看 Markdown</a><a class="button" href="/example-report.json">查看 JSON</a></div></section>',
    '</main>',
    siteFooter(),
  ].join('\n');

  return html(documentPage(title, description, base + '/', base, schema, body), method);
}

function docPage(base: string, path: string, page: DocPage, method: string): Response {
  const canonical = base + path;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': path.startsWith('/guides/') ? 'HowTo' : 'TechArticle',
        headline: page.title,
        description: page.description,
        url: canonical,
        dateModified: UPDATED_AT,
        author: { '@type': 'Organization', name: 'CheckHere', url: base }
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer }
        }))
      }
    ]
  };

  const sections = page.sections.map((section) => [
    '<section class="doc-section">',
    '<h2>' + escapeHtml(section.heading) + '</h2>',
    section.paragraphs.map((paragraph) => '<p>' + escapeHtml(paragraph) + '</p>').join(''),
    section.bullets ? '<ul>' + section.bullets.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>' : '',
    section.code ? '<pre><code>' + escapeHtml(section.code) + '</code></pre>' : '',
    '</section>'
  ].join('')).join('');

  const faq = page.faq.map((item) => '<details><summary>' + escapeHtml(item.question) + '</summary><p>' + escapeHtml(item.answer) + '</p></details>').join('');

  const body = [
    '<header class="site-nav"><a class="brand-link" href="/"><span class="brand-mark">查</span><strong>CheckHere</strong></a>' + mainNav() + '</header>',
    '<main class="doc-wrap">',
    '<nav class="breadcrumbs" aria-label="面包屑"><a href="/">首页</a><span>/</span><span>' + escapeHtml(page.eyebrow) + '</span></nav>',
    '<article>',
    '<header class="doc-hero"><div class="eyebrow">' + escapeHtml(page.eyebrow) + '</div><h1>' + escapeHtml(page.title) + '</h1><p>' + escapeHtml(page.lead) + '</p><div class="doc-actions"><a class="button primary" href="' + GITHUB_URL + '">查看源码</a><a class="button" href="/docs/cli">开始使用</a></div></header>',
    '<div class="doc-content">' + sections + '<section class="doc-section faq"><h2>常见问题</h2>' + faq + '</section></div>',
    '</article>',
    '<aside class="next-card"><strong>现在运行一次本地检查</strong><code>checkhere https://your-site.com</code><a href="/docs/cli">打开 CLI 文档 →</a></aside>',
    '</main>',
    siteFooter()
  ].join('\n');

  return html(documentPage(page.title, page.description, canonical, base, schema, body), method);
}

function installScript(base: string, method: string): Response {
  const script = [
    '#!/usr/bin/env sh',
    'set -eu',
    '',
    'VERSION="${CHECKHERE_VERSION:-' + RELEASE_VERSION + '}"',
    'INSTALL_ROOT="${CHECKHERE_INSTALL_DIR:-$HOME/.local}"',
    'RELEASE_URL="${CHECKHERE_RELEASE_URL:-' + GITHUB_URL + '/releases/download/v${VERSION}/checkhere-${VERSION}.tgz}"',
    'CHECKSUM_URL="${CHECKHERE_CHECKSUM_URL:-' + GITHUB_URL + '/releases/download/v${VERSION}/SHA256SUMS.txt}"',
    'BIN="$INSTALL_ROOT/bin/checkhere"',
    '',
    'if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then',
    '  echo "CheckHere requires Node.js 20 or newer, npm, and curl." >&2',
    '  exit 1',
    'fi',
    '',
    "node -e 'const major = Number(process.versions.node.split(\".\")[0]); if (major < 20) process.exit(1)' || {",
    '  echo "CheckHere requires Node.js 20 or newer." >&2',
    '  exit 1',
    '}',
    '',
    'TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/checkhere.XXXXXX")"',
    'TARBALL="$TMP_ROOT/checkhere-${VERSION}.tgz"',
    'CHECKSUMS="$TMP_ROOT/SHA256SUMS.txt"',
    'cleanup() { rm -f "$TARBALL" "$CHECKSUMS"; rmdir "$TMP_ROOT" 2>/dev/null || true; }',
    'trap cleanup EXIT HUP INT TERM',
    '',
    'echo "Downloading CheckHere v$VERSION from GitHub Releases..."',
    'curl -fsSL "$RELEASE_URL" -o "$TARBALL"',
    'curl -fsSL "$CHECKSUM_URL" -o "$CHECKSUMS"',
    'EXPECTED="$(awk -v file="checkhere-${VERSION}.tgz" \'$2 == file { print $1; exit }\' "$CHECKSUMS")"',
    'if [ -z "$EXPECTED" ]; then',
    '  echo "The release checksum file does not contain checkhere-${VERSION}.tgz." >&2',
    '  exit 1',
    'fi',
    'if command -v sha256sum >/dev/null 2>&1; then',
    '  ACTUAL="$(sha256sum "$TARBALL" | awk \'{ print $1 }\')"',
    'elif command -v shasum >/dev/null 2>&1; then',
    '  ACTUAL="$(shasum -a 256 "$TARBALL" | awk \'{ print $1 }\')"',
    'else',
    '  echo "A SHA-256 tool (sha256sum or shasum) is required." >&2',
    '  exit 1',
    'fi',
    'if [ "$ACTUAL" != "$EXPECTED" ]; then',
    '  echo "Release checksum verification failed." >&2',
    '  exit 1',
    'fi',
    '',
    'mkdir -p "$INSTALL_ROOT"',
    'echo "Installing verified CheckHere v$VERSION..."',
    'npm install --global --prefix "$INSTALL_ROOT" "$TARBALL"',
    '',
    'if [ ! -x "$BIN" ]; then',
    '  echo "Install completed, yet $BIN could not be found." >&2',
    '  echo "See ' + base + '/docs/cli" >&2',
    '  exit 1',
    'fi',
    '',
    'case ":${PATH:-}:" in',
    '  *:"$INSTALL_ROOT/bin":*) ;;',
    '  *)',
    '    shell_name="$(basename "${SHELL:-sh}")"',
    '    case "$shell_name" in',
    '      zsh) profile="$HOME/.zshrc" ;;',
    '      bash) profile="$HOME/.bashrc" ;;',
    '      *) profile="$HOME/.profile" ;;',
    '    esac',
    '    path_line="export PATH=\\"$INSTALL_ROOT/bin:\\$PATH\\""',
    '    if [ ! -f "$profile" ] || ! grep -F "$path_line" "$profile" >/dev/null 2>&1; then',
    '      printf "\\n# CheckHere CLI\\n%s\\n" "$path_line" >> "$profile"',
    '    fi',
    '    export PATH="$INSTALL_ROOT/bin:$PATH"',
    '    echo "Added $INSTALL_ROOT/bin to $profile"',
    '    ;;',
    'esac',
    '',
    'echo "Installed CheckHere v$VERSION"',
    'echo "Next: checkhere setup"',
    'echo "Then: checkhere https://your-site.com"',
    'echo "Docs: ' + base + '/docs/cli"',
    ''
  ].join('\n');

  return new Response(method === 'HEAD' ? null : script, {
    headers: {
      'content-type': 'text/x-shellscript; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
}

function llmsTxt(base: string, method: string): Response {
  const body = [
    '# CheckHere',
    '',
    'CheckHere v0.4.0 is a free, open-source, local-first browser release check for AI-built websites.',
    'Browser execution, screenshots, findings, and reports stay on the user machine or CI runner.',
    '',
    '## Source',
    '',
    '- GitHub: ' + GITHUB_URL,
    '- Releases: ' + GITHUB_URL + '/releases',
    '- Skills.sh: https://skills.sh/ryan-yang125/checkhere/checkhere',
    '- License: ' + GITHUB_URL + '/blob/main/LICENSE',
    '',
    '## Install and run',
    '',
    'curl -fsSL ' + base + '/install.sh | bash',
    'checkhere setup',
    'checkhere https://your-site.com',
    'checkhere ci https://your-site.com --fail-on=critical',
    '',
    '## Local output',
    '',
    '- report.html: visual report with desktop and mobile screenshots.',
    '- report.md: agent-readable findings and recommended fixes.',
    '- report.json: stable machine-readable report data.',
    '- fix-prompt.md: compatibility alias for the agent Markdown report.',
    '',
    '## Documentation',
    '',
    '- CLI: ' + base + '/docs/cli',
    '- Agent Skill: ' + base + '/docs/skill',
    '- GitHub Actions: ' + base + '/docs/github-actions',
    '- AI website launch checklist: ' + base + '/guides/ai-website-launch-checklist',
    '- Broken image check: ' + base + '/checks/broken-image',
    '- Mobile overflow check: ' + base + '/checks/mobile-overflow',
    '- Console error check: ' + base + '/checks/console-error',
    '',
    '## Agent workflow',
    '',
    '1. Start the project development server or obtain its preview URL.',
    '2. Run CheckHere locally against the URL.',
    '3. Open report.html for screenshot evidence.',
    '4. Read report.md or report.json and fix actionable issues within the user authorization.',
    '5. Run CheckHere again and compare the result.',
    '6. Skill source: ' + GITHUB_URL + '/tree/main/skills/checkhere',
    '',
    '## Checks',
    '',
    'CheckHere covers HTTP status, blank pages, metadata, desktop and mobile screenshots, console and page errors, failed requests, broken images, mobile overflow, route coverage, SEO signals, and Lighthouse lab metrics.',
    '',
    '## Fixed example',
    '',
    '- HTML: ' + base + '/example-report',
    '- Markdown: ' + base + '/example-report.md',
    '- JSON: ' + base + '/example-report.json',
    '',
    'The example links are read-only reference artifacts. New scans run locally.',
    ''
  ].join('\n');

  return new Response(method === 'HEAD' ? null : body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
}

function localOnly(base: string, method: string): Response {
  const payload = {
    ok: false,
    error: 'local_only',
    message: 'CheckHere runs browser checks on your machine.',
    install: 'curl -fsSL ' + base + '/install.sh | bash',
    docs: base + '/docs/cli',
    repository: GITHUB_URL
  };
  return new Response(method === 'HEAD' ? null : JSON.stringify(payload, null, 2), {
    status: 410,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  });
}

function exampleReport(base: string, method: string): Response {
  const title = 'CheckHere 固定示例报告';
  const description = '查看 CheckHere 本地 CLI 生成的 HTML 报告结构、分数、页面覆盖和可执行问题证据。';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    url: base + '/example-report',
    dateModified: UPDATED_AT
  };
  const body = [
    '<header class="site-nav"><a class="brand-link" href="/"><span class="brand-mark">查</span><strong>CheckHere</strong></a>' + mainNav() + '</header>',
    '<main class="doc-wrap">',
    '<section class="report-hero"><div><div class="eyebrow">FIXED LOCAL REPORT EXAMPLE</div><h1>checkhere.page 自检</h1><p>生成于 CheckHere v0.4.0 · 4 个页面 · 桌面与移动端</p></div><div class="score" aria-label="得分 94">94</div></section>',
    '<div class="report-grid">',
    '<article class="report-card"><span class="severity">FIX SOON</span><strong>缺少 social preview image</strong><p>首页缺少可被社交平台稳定读取的 og:image 位图资源。</p><code>SEO_SOCIAL_IMAGE</code></article>',
    '<article class="report-card"><span class="severity">INFO</span><strong>页面覆盖</strong><p>/、/docs/cli、/docs/skill、/docs/github-actions 均成功加载。</p><code>pages_checked=4</code></article>',
    '<article class="report-card"><strong>桌面截图</strong><div class="shot"><h3>CheckHere</h3><p>AI 建站交付前，跑一次真实浏览器验收</p></div></article>',
    '<article class="report-card"><strong>移动端截图</strong><div class="shot" style="max-width:240px"><h3>CheckHere</h3><p>本地浏览器验收</p></div></article>',
    '</div>',
    '<div class="example-actions"><a class="button primary" href="/example-report.md">Agent Markdown</a><a class="button" href="/example-report.json">JSON 数据</a><a class="button" href="/docs/cli">自己运行一次</a></div>',
    '</main>',
    siteFooter()
  ].join('\n');
  return html(documentPage(title, description, base + '/example-report', base, schema, body), method);
}

function exampleMarkdown(method: string): Response {
  const body = [
    '# CheckHere 固定示例报告',
    '',
    '- URL: https://checkhere.page',
    '- Version: 0.4.0',
    '- Score: 94/100',
    '- Result: needs_fixes',
    '- Pages checked: 4',
    '',
    '## FIX SOON',
    '',
    '### SEO_SOCIAL_IMAGE',
    '',
    '首页缺少可被社交平台稳定读取的 og:image 位图资源。',
    '',
    'Recommendation: 提供 1200 × 630 的公开图片，并在首页输出绝对 URL 的 og:image。',
    '',
    '## Coverage',
    '',
    '- /',
    '- /docs/cli',
    '- /docs/skill',
    '- /docs/github-actions',
    '',
    '这是只读固定示例。新检查由本地 CheckHere CLI 生成。',
    ''
  ].join('\n');
  return new Response(method === 'HEAD' ? null : body, {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
}

function exampleJson(method: string): Response {
  const payload = {
    schemaVersion: '3.0',
    appVersion: RELEASE_VERSION,
    id: 'example_local_report',
    url: 'https://checkhere.page',
    checkedAt: UPDATED_AT + 'T00:00:00.000Z',
    result: 'needs_fixes',
    score: 94,
    summary: '4 pages checked; 1 fix-soon issue.',
    site: { pagesChecked: 4, requestedRoutes: ['/', '/docs/cli', '/docs/skill', '/docs/github-actions'] },
    issues: [{
      code: 'SEO_SOCIAL_IMAGE',
      category: 'seo',
      severity: 'fix_soon',
      message: '首页缺少可被社交平台稳定读取的 og:image 位图资源。',
      evidence: 'No raster og:image was present in the example run.',
      recommendation: '提供 1200 × 630 的公开图片，并输出绝对 URL 的 og:image。',
      affectedPages: ['/']
    }]
  };
  return jsonBody(payload, method);
}

function robotsTxt(base: string, method: string): Response {
  const body = ['User-agent: *', 'Allow: /', 'Sitemap: ' + base + '/sitemap.xml', ''].join('\n');
  return new Response(method === 'HEAD' ? null : body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
}

function sitemapXml(base: string, method: string): Response {
  const paths = ['/', ...Object.keys(DOC_PAGES), '/example-report'];
  const urls = paths.map((path) => [
    '  <url>',
    '    <loc>' + escapeXml(base + path) + '</loc>',
    '    <lastmod>' + UPDATED_AT + '</lastmod>',
    '    <changefreq>' + (path === '/' ? 'weekly' : 'monthly') + '</changefreq>',
    '    <priority>' + (path === '/' ? '1.0' : '0.8') + '</priority>',
    '  </url>'
  ].join('\n')).join('\n');
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n';
  return new Response(method === 'HEAD' ? null : body, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
}

function favicon(method: string): Response {
  const body = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#f7f5ed"/><rect x="10" y="10" width="44" height="44" fill="none" stroke="#0f6b42" stroke-width="4"/><text x="32" y="40" text-anchor="middle" font-family="Georgia,serif" font-size="27" font-weight="900" fill="#172018">查</text></svg>';
  return new Response(method === 'HEAD' ? null : body, {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400' }
  });
}

function ogImage(method: string): Response {
  const body = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="CheckHere"><rect width="1200" height="630" fill="#f7f5ed"/><rect x="76" y="76" width="1048" height="478" rx="24" fill="#fffdf7" stroke="#d8d7ca" stroke-width="3"/><rect x="126" y="126" width="74" height="74" fill="none" stroke="#0f6b42" stroke-width="6"/><text x="163" y="177" text-anchor="middle" font-family="Georgia,serif" font-size="40" font-weight="900" fill="#172018">查</text><text x="226" y="176" font-family="Arial,sans-serif" font-size="36" font-weight="800" fill="#172018">CheckHere</text><text x="126" y="326" font-family="Arial,sans-serif" font-size="70" font-weight="800" fill="#172018">本地浏览器验收 CLI</text><text x="130" y="406" font-family="Arial,sans-serif" font-size="31" fill="#5f6c62">Free · Open Source · Local First</text><rect x="126" y="456" width="310" height="50" rx="25" fill="#14231b"/><text x="281" y="489" text-anchor="middle" font-family="monospace" font-size="20" fill="#d9ff71">checkhere setup</text></svg>';
  return new Response(method === 'HEAD' ? null : body, {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400' }
  });
}

function documentPage(title: string, description: string, canonical: string, base: string, schema: unknown, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="description" content="' + escapeHtml(description) + '">',
    '<link rel="canonical" href="' + escapeHtml(canonical) + '">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="alternate" href="/llms.txt" type="text/plain" title="llms.txt">',
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="' + escapeHtml(canonical) + '">',
    '<meta property="og:title" content="' + escapeHtml(title) + '">',
    '<meta property="og:description" content="' + escapeHtml(description) + '">',
    '<meta property="og:image" content="' + escapeHtml(base + '/og.svg') + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + escapeHtml(title) + '">',
    '<meta name="twitter:description" content="' + escapeHtml(description) + '">',
    '<title>' + escapeHtml(title) + '</title>',
    '<script type="application/ld+json">' + safeJson(schema) + '</script>',
    '<style>' + SITE_CSS + '</style>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>'
  ].join('\n');
}

function mainNav(): string {
  return '<nav aria-label="主导航"><a href="/docs/cli">CLI</a><a href="/docs/skill">Skill</a><a href="/docs/github-actions">GitHub Actions</a><a href="' + GITHUB_URL + '">GitHub ↗</a></nav>';
}

function siteFooter(): string {
  return '<footer class="site-footer"><span>CheckHere · 免费开源的本地浏览器验收工具</span><nav><a href="/llms.txt">llms.txt</a><a href="/sitemap.xml">Sitemap</a><a href="' + GITHUB_URL + '">GitHub</a></nav></footer>';
}

function html(body: string, method: string): Response {
  return new Response(method === 'HEAD' ? null : body, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' }
  });
}

function jsonBody(data: unknown, method: string, status = 200): Response {
  return new Response(method === 'HEAD' ? null : JSON.stringify(data, null, 2) + '\n', {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2) + '\n', {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}
