---
summary: 'CLI 完整命令表、audit 的六类检查、配图简报，以及推荐给 agent 的生成回路'
read_when:
  - 找一条 README 上没列的命令
  - 读到 audit 的报错，想知道这条检查在查什么
  - 给图片位生成美术之前（`asset-brief`）
  - 给 agent 接上 validate → audit → render 回路
---

# CLI 命令参考

所有带 `<target>` 的命令都接受同样三种形式：IR JSON 文件、[deck 项目目录](./ir.zh-CN.md#deck-项目)，或者一个裸名。

| 命令 | 作用 |
|---|---|
| `render <target> -o <out.pptx> [--theme <id>] [--theme-file <file>] [--style <file>] [--draft]` | 校验并渲染成 `.pptx` |
| `validate <target>` | 校验 IR，输出带页码的错误信息与提示性警告 |
| `audit <target> [--json] [--pixels]` | 确定性几何审查，发现问题 exit 1（见[审查](#审查)） |
| `asset-brief <target> [--json]` | 为每个 `image` 组件生成一份配图简报（见[配图简报](#配图简报)） |
| `spec validate <spec.json>` | 校验 deck spec 是否符合 schema 与随 strategy 变化的硬门 |
| `assemble <dir\|name> [-o <file>]` | 把 deck 项目目录合并成单个 IR JSON 文件 |
| `disassemble <ir.json> -o <dir>` | 把 IR JSON 文件拆成 deck 项目目录 |
| `schema [--style \| --spec]` | 输出 IR 的 JSON Schema（或 style 覆盖 schema，或 deck spec schema） |
| `themes [--json]` | 列出 17 个内置主题 |
| `brand extract <file> -o <out.theme.json> [--id] [--label]` | 从 `.thmx`/`.potx`/`.pptx` 本地抽取品牌配色与字体生成主题文件（见[主题](./themes.zh-CN.md#你自己的品牌)） |
| `narratives [--json]` | 列出具名叙事预设（strategy/pacing/audience 轴 + theme 推荐） |
| `preview <target> -o <dir> [--html]` | 逐页渲染为独立 SVG（`--html` 额外写出一个自包含的 `preview.html`），永远不受占位页拦截 |
| `serve <target> [--port 4400] [--no-open]` | 实时预览服务：与 `preview --html` 同款审阅页，源文件变化自动刷新，批注直接提交回 deck 目录生成 `revision-request.json` |
| `migrate <input> -o <output>` | 把 v3 IR 文件转成 v4，或把 `deck.plan.json` 项目目录转成 `deck.spec.json`，确定性转换，不调模型 |
| `init` | 生成 `pptfast.config.json` 模板 |
| `check-update` / `self-update` | 检查 npm 上的新版本 / 更新全局安装 |

`--theme-file` 在 `render`、`validate`、`audit`、`preview`、`serve` 上都可用。

## 审查

`pptfast audit <target> [--json]` 离屏渲染每一页，跑一遍确定性几何审查，不靠模型看截图，两次跑出来的结果一样。

六类检查：

- **溢出**：文字超出自己的框或列。
- **越界**：内容超出页面边缘。
- **低对比度**：文字与其所在背景的 WCAG 相对亮度对比度不达标。
- **重叠**：两个组件的区域大面积相交。
- **内容截断**：渲染器为适配版面用省略号截断了文字。
- **内容丢失**：出现「+N 更多」标记，一张卡片列表或整个组件放不下被隐藏了。

audit 是建议性工具，不是硬门。结构非法或密度超标的 deck 由 `validate` 拦下，audit 抓的是一份*合法* deck 在渲染层仍可能出现的问题：作者选了一个贴近背景色的文字颜色、两个组件的内容恰好撞在一起、一张卡片列表放不下丢了一条。

加上 `--pixels`（仅 Node，需要可选依赖 `sharp`）还能抓住文字直接压在没有遮罩的照片背景上这一种情况，做法是把该页光栅化成真实像素再采样。每次结果都带一个 `checks` 字段（`{ svg: "completed", pixels: "not-requested" | "completed" }`），让调用方分得清「没查」和「查了没问题」。像素层自身的跨平台一致性说明见 [`contrast-system.md`](./contrast-system.md)。

建议在所有页面填完之后跑一遍。人读输出按页分组报错（`page 3 (p-kpi): [low-contrast] …`，每条消息都带修正建议），末尾附一行汇总。`--json` 输出完整的机器可读报告。exit code 本身即可供 agent 判断：干净是 `0`，发现问题是 `1`。按报错修那一页再单独重跑一次 `audit` 即可，不必重新渲染。被跳过的占位页会在汇总里注明。

```bash
pptfast audit examples/basic.json
# → audited 5 pages, 0 skipped, 0 findings
```

## 配图简报

`pptfast asset-brief <target> [--json]` 输出一份生图提示词需要、调用方却看不到的简报：每个 `image` 组件的真实渲染框，而不是版式的名义槽位。

每个 `image` 组件的条目包含渲染出的 `frame`（x/y/w/h 加宽高比，来自一次离屏渲染，不是手抄的常量）、带裁切安全区说明的 `fit` 模式、`suggested_pixels`（框的 2 倍分辨率）、该主题的 `palette` 与 `mood`，以及一段可直接粘贴的英文 `suggested_prompt`。

`assets.images` 里没有可用资产的 `asset_id` 依然会拿到完整条目，标为 `missing: true`，这就是待生成清单。选中的版式实际没画出来的组件标为 `rendered: false`，而不是被悄悄丢掉。

简报是纯信息性输出：不设 exit code 硬门，不改动渲染管线，也不调用任何生图 API。

```bash
pptfast asset-brief my-deck/
# → page 3 (content, p-hero) — pic (missing)
#     frame: 613x307 @ (571,203), aspect 2:1, cover
#     suggested pixels: 1226x614
#     ...
```

## agent 回路

推荐给 agent 的生成回路：

1. `pptfast schema`，动手之前先读词汇表。
2. 写出 IR JSON。
3. `pptfast validate`，按报错自纠。错误信息带页码，也带可以直接照抄的修法，这个回路不必依赖人工介入。
4. 给任何图片位生成美术之前先跑 `pptfast asset-brief`。真实渲染框和裁切模式在 IR 里看不出来，宽高比不对是生成图片摆上去之后最常见的翻车原因。
5. `pptfast audit`，对一份合法 deck 在渲染层的问题给同样可照抄的反馈。exit code 本身就说明干不干净。
6. `pptfast preview` 写出 SVG，让 agent 自己看一眼版式。
7. `pptfast render`。

`pptfast preview --html` 还会额外写出一个自包含的 `preview.html` 供人工审查：支持键盘翻页、占位页角标，打开后零网络请求（远程 URL 的图片资产仍是远程链接，这是自包含性上唯一的缺口）。所有页面都填好之后，这份页面还会叠加同一份 `audit` 结果：每页一个数量角标，加一个可点击跳转的 findings 面板。deck 里还有占位页时，显示一行「audit 已跳过」的提示代替。

审阅者可以直接在 `preview.html` 里给每页写自由文本批注，导出为 `revision-request.json`（浏览器下载，不联网也不写文件，preview 始终只读），交给 agent 通过 `pages/*.json` 回填。`pptfast serve <target>` 把同一套回路做成实时版本：浏览器标签页随源文件变化自动刷新，批注面板直接提交到磁盘上的 `<deck-dir>/revision-request.json`。

Claude Code 插件与 DSH 插件都把这套回路封装成了 skill（[`skills/pptfast/SKILL.zh-CN.md`](../skills/pptfast/SKILL.zh-CN.md)）。回路本身由一个模型无关的内部基准测试（`tests/bench/`，不发布到 npm）机械化验证，固定题库，评估模型跟随该 skill 的表现，细节见 `tests/bench/README.md`。

## 延伸

- [`ir.zh-CN.md`](./ir.zh-CN.md)：IR 里写什么、叙事、版式选型、deck 项目。
- [`themes.zh-CN.md`](./themes.zh-CN.md)：17 个内置主题、品牌抽取、style 覆盖。
- [`concepts.md`](./concepts.md)：theme/layout/component/narrative 概念模型（英文）。
- [`deck-projects.md`](./deck-projects.md)：deck 项目格式详解（英文）。
