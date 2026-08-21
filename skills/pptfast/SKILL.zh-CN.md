---
summary: 'skills/pptfast/SKILL.md 的中文阅读镜像，仅供人工审阅该 skill 会指示 agent 做什么'
mirror_of: skills/pptfast/SKILL.md
---

# pptfast — deck 生成操作手册

> 本文件是 [`skills/pptfast/SKILL.md`](./SKILL.md) 的中文阅读镜像，供中文使用者审阅这个 skill 会指示 agent 执行的内容。agent 始终加载并执行英文版 `SKILL.md`——本文件不含 `name` 字段，从不注册为一个独立的 skill，也从不被 agent 读取。两个文件如有出入，以英文版 `SKILL.md` 为准。修改任一文件时，必须把改动同步镜像到另一文件。

pptfast 把一份 JSON IR（intermediate representation，中间表示）转换成原生 DrawingML 格式的 `.pptx`——每个图形在 PowerPoint 里都保持可编辑。内容模型由你掌控，layout、style 与动效由工具掌控。你从不绘制 SVG，也从不给任何东西定位：从受控词汇表里挑选，装不下的内容交给 validate 关卡去拦。

## 怎么跑

这份操作手册里的每一步都走 CLI：schema、spec/assemble、validate、render、audit、preview、serve、品牌提取。这些命令一律通过本 skill 自带的启动器执行，由它替你解析出一个可用的运行时。把 `<skill-dir>` 换成这份 SKILL.md 所在的目录：

```bash
bash <skill-dir>/scripts/run.sh <args>                                       # macOS / Linux
powershell -ExecutionPolicy Bypass -File <skill-dir>\scripts\run.ps1 <args>  # Windows
```

它按顺序尝试：PATH 上版本兼容的 `pptfast`、`npx`、`bunx`，参数与退出码原样透传。不需要预先安装任何东西，跑到的版本被钉死在这份 skill 上。退出码 78 表示没有任何可用运行时：把它 stderr 里 JSON 的 `nextSteps` 转告用户，不要重试。

下文凡是写 `pptfast <args>` 的地方，都通过这个启动器执行。

刚装完，以及任何时候某条命令的表现不对、错误信息又解释不清时，先跑 `pptfast doctor`。它会报告运行时、机器上每一份已安装的 skill 副本及其是否过期、dsh 插件版本、可选能力是否具备，以及一次自检渲染。把它说的原样转达，不要靠猜。

如果你的 harness 不允许执行脚本，就按同样的顺序自己判断，用第一条成立的：

1. PATH 上有 `pptfast`，且主版本号与下面的钉版本相同、版本不低于它：`pptfast <args>`。
2. 否则，有 `npx` 就用：`npx --yes --package @liustack/pptfast@0.20.0 pptfast <args>`。
3. 否则，有 `bunx` 就用：`bunx --bun @liustack/pptfast@0.20.0 <args>`。
4. 都没有就告诉用户机器上找不到 JavaScript 运行时，下一步是装 Node 22.19+（https://nodejs.org）或 Bun（https://bun.sh）。不要说成是 pptfast 本身坏了。

## 工作流程

六个阶段：读词汇表、定 spec 并确认、分批填页面、渲染、自查、修订。对于很小的 deck（页数屈指可数），可以跳过 spec，直接写一个单独的 IR 文件，用 `pptfast validate` 校验——下文所有内容依然适用，只需把「deck 项目目录」读作「这个 IR 文件」，并跳过阶段二的 spec 步骤。

### Phase 1 — 读词汇表（每个 session 都要重新读一遍）

```bash
pptfast schema             # IR JSON Schema: the single source of truth
pptfast schema --spec      # deck spec schema
pptfast narratives --json  # named narrative presets (strategy/pacing/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

永远不要凭上一个 session 的记忆、或凭这份文件本身的记忆去写 IR 或 spec——schema 会演进，`schema`/`narratives`/`themes` 的实际输出永远优先。

动手问人之前，先扫工作区。文件能回答的事实不要问人：

- 已有确认过的 `deck.spec.json` 已经锁死 narrative、theme、chrome。不要重做访谈。后续请求走阶段六
- 已有 `theme.json`、项目 `pptfast.config.json` 钉死的 theme、用户点名的 theme id、或用户递来的 `.thmx` / `.potx` / 带品牌 `.pptx`，都是品牌信号。抽取或沿用。不要再问有没有模板
- 请求原文已经点名受众、论证方式或疏密，这一轴就算推导出来了。不要再问

品牌信号回答的是这份 deck 长什么样，从来不回答它该怎么论证。把「这家公司的配色像咨询公司」读成一种叙事，是把推断当事实抬上来，一份没人选过的论证形状就是这样上台的。

**边界页规则——现在就记住，这是最常见的错误：** `cover`、`chapter`、`ending` 三种页面，不论用哪个 layout，永远不渲染 `components` 或 `footnote`，没有例外。这类内容要放到 `content` 页面上。在 spec 阶段就弄错，意味着之后要重写已经写好的真实内容——`validate` 会用 `"<type>" slides do not render components/footnote — move this content to a content slide or remove it` 这条报错抓到它，但那时你已经把内容写完了，还得再搬一次。

```json
// pages/closing.json — spec type "ending" — WRONG: components never render on an ending page
{ "components": [{ "type": "bullets", "items": ["Thank you", "Questions? sales@example.com"] }] }
```

```json
// pages/wrap-up.json — spec type "content", inserted right before the ending page — CORRECT
{ "components": [{ "type": "bullets", "items": ["Thank you", "Questions? sales@example.com"] }] }
```

```json
// pages/closing.json — spec type "ending" — stays bare, nothing to move here
{}
```

`docs/deck-projects.md` 里的边界页渲染面表（boundary-page render surface table）有按页型划分的完整对照。

### Phase 2 — 定 spec 并确认

写任何页面内容之前，先提议并确认。

- 先锁定叙事包：具名预设（或显式三轴）、theme id、chrome 姿态、以及 typeScale 档（封面 / 章 / 演讲页标题有多大：`regular` 省略/1，`display` 1.3，`hero` 1.5）。这是位于 theme 之上的一层决策，不是视觉选择。任一轴仍未知且用户在场时，走下方「叙事访谈」。这种情况下不要自己静默挑一个预设
- 疏密（留白还是铺满）在访谈里判定（或从请求推导）。钉高潮页、金句页、证据页版式和写 `notes` 时走下方「稀排页合同」。`pacing` 不会为此多出第四档
- 再定 theme id：从 `narratives --json` 里该预设的 `themeRecommendations` 取（如果都不合适，就从 `themes` 输出里挑一个贴合这份 deck 调性的。这只是推荐，从不构成约束）。访谈的品牌问如果返回了模板，先抽成自定义 theme，见下方「品牌主题」
- 用户一点头，立刻把确认下来的 `narrative`、`theme`、`chrome` 写进 `deck.spec.json`，再起草任何一页。不要把答案留在对话里，等页面写完再凭记忆补
- 起草 `deck.spec.json`：每页一条记录（`id`、`type`、`heading`，可选加 `beat`/`focus`/`summary`）——以 `cover` 开篇，以 `ending` 收尾，中间的每一页都是 `content` 或 `chapter`。三轴与某个预设完全相等时，`narrative` 写预设 id 字符串，否则写 `{strategy, pacing, audience}`。不要写 `{id, pacing}` 这种混形。默认省略 `chrome`。只有每一页内容页都需要品牌页脚时才写 `chrome: "full"`（`meta.confidentiality` 为 `confidential` 或 `restricted` 时同样写 `"full"`）。不要在 spec 上发明 `typeScale` 字段，那个字段不存在。档是推荐。只有跳过 spec、直接写 IR 时，才允许把 `theme.style.shape.typeScale` 写进 IR
- 跑 `pptfast spec validate deck.spec.json`，把它报出的问题都修掉，直到打印 `OK`——边界页、标题长度、beat 轮换、页数是否匹配 pacing 这些硬门都在这一步触发，早于任何一页正文的写作
- `spec validate` 打印 `OK` 之后，在 `deck.spec.json` 里设一个 `seed`（任意整数）以保证修订稳定——现在就写一个，或者在阶段三跑一次 `pptfast assemble`，把它打印出的 `generated seed …` 值抄进 spec。没有固化的 seed，之后改一页的标题就可能打乱其余每一页自动选出的 layout

**用户确认过校验通过的 spec 之后，不要再重新定 spec。** 改动一份已确认的 spec（调整顺序、改页型、删页）会悄悄浪费用户已经做过的审阅。如果确有新信息迫使必须改动，先说明理由并重新取得确认，再重新跑一次 `spec validate`。

### 叙事访谈（最多一轮）

用户在场，且受众、怎么讲 / strategy、pacing 任一轴仍未知时，把所有未决的问放进**一条**消息转达给人，然后停。不要自己填。不要说「我按常见情况先选」。宿主有选择题工具就用它，选项原文照传。

这条消息开头先写一句话，说出你打算建的这份 deck：给谁、论证怎么讲、每页多满、哪个主题、页脚开还是关。这句话只能用请求和工作区真说过的东西搭。缺信号的地方就说缺，并把 ★ 点明成默认，不是对用户处境的读数。不要把默认打扮成结论。这句话和选项里都不要出现 `pyramid`、`spacious`、`executive` 这类轴名。结尾给三条出路：不改就说「就这样」，要改就挑选项，或者说「都不对」。

整段跳过访谈（零问）：已有确认过的 spec。用户说跳过问题、直接生成或批量。这一轮里根本没有人。请求已经同时锁定受众、论证方式、疏密。完整 brief 仍要在写 spec 之前甩一句叙事包。那是原来的 spec 确认，不是第二轮访谈。

没有选择题工具，不等于没有用户。普通文本对话里用户是在场的：问题就是整条消息，停照旧。只有真的没有人的运行（CI、批量、无对话脚本）才免掉这次停顿，而且仍要把包、一句理由、一句改口条件写进可见输出，然后按包继续。事后用户任何一条反对都重开这个决定，改完重跑 `spec validate`。

只跳过已推导的轴。空 workspace（无 spec、无 `theme.json`、无钉死的 config theme、请求里什么都推不出）把 Q1–Q4 一起问。没有品牌信号的工作区即使别的文件很多，也要问 Q4。

用户跳过某选项、说「都行」、或回了表外的话：用 ★ 默认补齐，在推荐理由里写明补了哪一轴，不要追问。用户说「都不对」：只回一句「三轴里哪一根不对」，别的都不问。用户否决推荐包：抛出事先准备的第二候选，不要重开访谈。

<!-- 维护者注记，不要转达给用户：Q1 今天的价值全部来自下面那张查表和正文口吻，`audience` 轴在渲染面上仍然什么都不做。如果将来查表不再读 `audience`，应该删掉 Q1，而不是留着一个答案改变不了交付物的问题。 -->

**Q1 这页是讲给谁的？** `executive` 董事会 / 高管（结论先行） · `technical` 会核对数字的技术同事 · `customer` ★ 客户、买家、路演现场 · `public` 公开或不特定。

**Q2 你想怎么讲这件事？** 这一问才是这份 deck 的读法，Q1 和 Q3 只是把它调准。`talk-pyramid` ★ 一页一个结论（`pyramid`） · `talk-showcase` 一页一个画面或数字（`showcase`） · `read-brief` 一页铺满证据（`briefing`） · `teach` 按步骤教（`instructional`）。年报 / 品牌片 / 情境到解决的说法直接推导 `storytelling`，不要把它加成第五选项。

**Q3 页上要留白还是铺满？** `spacious` ★ 留白，一页少字 · `balanced` 普通疏密 · `dense` 铺满证据，页自己把话说完。

**Q4 有没有公司模板可以抽成主题？** 仅当没有品牌信号时问。`extract` 有，用户会给出 `.thmx` / `.potx` / 带品牌 `.pptx` · `builtin` ★ 没有，用内置主题 · `later` 先用内置，稍后补（当作 `builtin`，不开第二轮）。工作区里有没有 `theme.json`，是自己查的事，永远不问。

这条消息的结尾原样附上下面这个块，一轴一行，已推导的轴填上值，未决的轴留 `?`：

```
NARRATIVE_INTERVIEW
audience: ?
tell: ?
pacing: ?
brand: ?
```

这个块就是闸，不靠自觉：只要还有一行是 `?`，就不许新建或修改 `deck.spec.json`、页面文件或裸 IR。清掉一个 `?` 只有两条路：用户回答，或者用户已经回复、只是留空了某一轴，那一轴用 ★ 默认补。真的没有人的运行里，自己把每一行填满，并在块的第一行标上 `(no user in this run)`，让这个选择可见、可推翻。

用户回复之后，立刻给一个推荐包和一个第二候选，一句理由，一句改口条件，然后等确认：

`推荐：<预设或三轴> × <theme> × chrome 省略|full × typeScale regular|display|hero`
`改口条件：<一句>`。最常见的一条：这份会在没有主讲人的情况下被转发，把多出来的字写进 notes，或者建议改用 PDF，不要把幻灯片塞满。

查表（theme = `narratives --json` 里该预设 `themeRecommendations` 的第一项。写三轴对象时改取最靠近预设的名单）。默认省略该字段。`meta.confidentiality` 为 `confidential` 或 `restricted`，或每一页内容页都需要品牌页脚时，才写 `"full"`。`customer` + `talk-pyramid` + `spacious` → `pitch` / 省略 / display。`executive` + `talk-pyramid` + `spacious` → `boardroom-report` / 省略 / display。`customer` + `talk-showcase` + `spacious` → `product-launch` / 省略 / display。`technical` + `teach` + `balanced` → `training` / 省略 / regular。`technical` + `read-brief` + `dense` → `weekly-brief` / 省略 / regular。`executive` + `read-brief` + `dense` → 三轴 `{pyramid, dense, executive}` / 省略 / regular，theme 取 `boardroom-report`。`public` + storytelling + `balanced` → `annual-review` / 省略 / regular。其余写三轴对象，最靠近预设：`pyramid`+`executive` → `boardroom-report`，`pyramid`+`customer` → `pitch`，`showcase` → `product-launch`，`instructional` → `training`，`briefing`+`dense` → `weekly-brief`，`storytelling` → `annual-review`，否则 `general`。

typeScale 档：`dense` 或 `balanced` 用 `regular`。`spacious` 用 `display`。`hero` 只出现在把 theme 换成 `stage` 的那种换皮上。不要为了把标题加大，把董事会 deck 改成 `stage`。不要在 `deck.spec.json` 上写 `typeScale`。不要为了一个 deck 去改仓库根上的 `pptfast.config.json`。跳过 spec、直接写 IR 时，非 `regular` 的档可以写成 `theme.style.shape.typeScale` 1.3 或 1.5。

第二候选跟着推荐包一起抛，事先准备，而且必须在机制上不同：翻疏密（`spacious` ↔ `dense`，type-scale 跟着翻），或者换由什么领头论证（`pitch` ↔ `product-launch`，`training` ↔ 同样内容的密页讲义）。同样三根轴换个主题是换皮，不算候选，只在用户否的是皮时才给，并说清叙事没动。showcase 想要更大标题时，`stage` × `hero` 属于这种换皮。不要三轴一起翻。

这一轮只定三根叙事轴，不负责判断这件事该不该做成 deck。那个更大的问题还开着，就直说，让用户先答，再定 spec。

很小的 deck 仍可跳过 spec 文件、直接写一份 IR。轴未知时不可跳过这场访谈。把同样的决策写到 IR 的 `narrative` / `theme` / `chrome` 上。

### Phase 3 — 分批填页面（每批至多 4 页），随填随 validate

对已确认 spec 里的每一页，写一个 `pages/<page-id>.json` 存放它的内容（`components`，以及可选的 `layout`/`arrangement`/`background`/`image_side`/`footnote`/`notes`——绝不写 `type`/`heading`，这两个字段被 spec 锁定）。撰写 `cover`/`chapter`/`ending` 页面时记住 Phase 1 的边界页规则——不要先给它们塞 `components` 或 `footnote`，然后再回头搬走。`notes` 是给主讲人看的演讲稿——写一份好的讲稿是模型的强项。只要页面需要一段超出幻灯片本身的口头讲解，就起草 `notes`（稀排页合同）。这是默认动作，不是可选项。

```bash
pptfast assemble deck-dir/     # materializes deck.json — catches structural drift: orphan page files, locked-field violations, a broken spec
pptfast validate deck-dir/     # content-quality gate: heading length, density, bullets budget (warnings) + unknown theme, boundary-page content, and a bullet item past render-safety (hard errors)
```

把两个命令报出的错误都修掉，重新跑，直到两者都打印 `OK`。`validate` 可能在打印 `OK` 的同时带着 `warning:` 行（比如标题太长、某页太密）——条件允许时也应该收紧，读起来会更好，但它们不拦渲染。只有 error 才会让 `OK` 打印不出来。spec 里某一页如果还没有对应的页面文件，就是一个占位页（只有标题）——assemble 和 validate 都接受这种情况。分批之间留一些占位页是正常状态，不是错误。只要某一页的 `layout` 被留给自动选型，`assemble` 也会打印 `note: N layouts auto-selected into deck.json`——这只是提示，不是错误。只有当某个具体选型结果需要被锁定时，才在页面文件里显式钉死 `layout`——像 `quote-stage`、`statement`、`pull-quote`、`verse-chapter` 这种 `pinOnly` 版式每次都需要这个钉子，因为它从来不会通过自动选型出现（见下文「Pin-only 版式」）。高潮页、金句页、证据页默认就要钉（见「稀排页合同」）。

### Phase 4 — 渲染

```bash
pptfast render deck-dir/
```

`.pptx` 落在 `.pptfast/<deck>/`。命令会打印绝对路径，把那一行报给用户。

`--theme <id>` 在不改动 spec 的前提下覆盖 deck 的 theme。`--style <path>` 在其上叠加一层 style-token 覆盖（不用分叉 theme 就能重新配色，schema 见 `pptfast schema --style`）。deck 里还有未填的占位页时，render 会拒绝导出，除非加上 `--draft`——只有当用户明确想在所有页面都写完之前先看一眼时，才用它。某一页装不下、版面丢掉了放不下的块而页面上毫无提示时，render 同样拒绝导出，报错会写清哪几页各丢了几块。正确做法是把那一页缩短或拆成两页再重新渲染，`--allow-dropped-content` 会带着缺失的内容出片，只有用户明确要求时才用。

如果项目里有 `pptfast.config.json`，它的 theme/style 就是项目默认值——除非用户要求，不要用 `--theme` 跟它对着干。阶段三里写的任何页面 `notes` 都会导出成原生 PowerPoint 演讲者备注（PowerPoint/Keynote 里的 View → Notes）——从不会画到幻灯片本身上。

### Phase 5 — 审查，可选的视觉自查

所有页面都填完（没有占位页剩下）之后，跑一次确定性几何审查：

```bash
pptfast audit deck-dir/
```

零 token、零方差——它离屏渲染每一页，检查溢出（overflow）、越界（out-of-bounds）、低对比度（low-contrast）、重叠（overlap）、内容截断（content-truncated，省略号截掉了真实文字）、内容丢失（content-dropped，一个「+N …」标记隐藏了某个条目或整个 component），发现问题就 exit 1（干净则是 0）。每条 finding 都标出所在页面（和 id），并带一个修法。修那一页被标出的内容——和处理 `validate` 报错一样遵循「重组，不要删除」的纪律——然后单独重跑一次 `pptfast audit deck-dir/`（不用重新渲染）直到 exit 0。这是这份 deck 的视觉 QA。不要用肉眼看截图来代替它。

如果有页面用了 cover/chapter 照片背景，加上 `--pixels`——它会把该页光栅化并采样真实像素，抓住文字直接压在一张没有遮罩的照片上的情况，这是上面纯 SVG 检查唯一看不到的一种。

```bash
pptfast preview deck-dir/ --html
```

为每张 slide 各写一个独立 SVG，外加一个自包含的 `preview.html`，都落在 `.pptfast/<deck>/`，永远不受占位页拦截。命令会打印绝对路径，把那一行报给用户。交付之前自己读几个 SVG（它们就是纯文本文件），核对 layout 与密度是否合理，图片较多的 deck 尤其要看。把 `preview.html`（缩略图条、键盘翻页、占位页角标）交给用户自己看，而不是代替这一步。所有页面都填完时，`preview.html` 还会叠加同一份 `audit` 检查结果（每页一个角标 + 一个 findings 面板），让审查者不用打开终端就能看到问题。deck 里如果还有占位页，则改为显示一行「audit skipped」的提示。`preview.html` 是只读的：它只负责把 deck 呈现出来，从不改动它。审查者想改什么，直接在对话里告诉你。把那一页截图发给你是最快的交接方式，你再走阶段六处理。

### 把 deck 拿给用户看

怎么交付取决于 harness 能画什么。按下面的顺序，用第一条成立的。

**如果存在 `pptfast_preview` 工具，就调它。** 它渲染完直接把幻灯片预览放进对话：卡片里是缩略图条，点开看全尺寸，方向键翻页。用户不用离开对话，也不用打开任何东西。**这个工具在场时绝不要退回去甩一个文件路径或 URL 给用户**。它就是为了取代那个体验才存在的。工具只回给你一行摘要（页数、审计状态），这是刻意的：deck 去用户屏幕，不进你的上下文。

**如果 harness 有内置浏览器（VS Code、Cursor 一类），就预览成文件。** 跑 `pptfast preview deck-dir/ --html`。命令会打印 `preview.html` 的绝对路径，把那条路径给用户，让他在内置浏览器里打开。每轮修订后重跑同一条命令，路径不变，用户刷新即可。不占端口，不留常驻进程。

**否则就起服务。** 大多数 harness 没办法在对话里画出一页幻灯片，审阅就发生在用户自己的浏览器里。绝不要用「贴一张缩略图或某一页的截图」来代替。把整份 deck 服务出去，让用户全尺寸自己翻。启动服务（在 DSH 里遵循后台任务的规矩，记下 job id，方便之后停掉）：

```bash
pptfast serve deck-dir/ --no-open
```

然后按这个顺序走完这一轮：

1. 必须带 `--no-open`。agent 环境里没有可以自动打开的浏览器。
2. 把它打印的 localhost URL（默认 `http://127.0.0.1:4400`）原样报给用户，让用户自己打开。这一行就是全部交付动作。
3. 用户翻完整份 deck，在对话里告诉你哪里要改。把出问题的那一页截图发过来是最快的交接方式——你看到的和他看到的完全一致。
4. 把每一条请求都走阶段六的修订流程。你每保存一次文件页面就实时重渲染，每一次修订都直接落在用户已经打开的那个标签页里。不用发新链接，也不用让他点任何东西。
5. 用户还在继续看就留在这个循环里。这一轮结束时停掉 serve 进程（kill 掉那个后台任务）。任务结束后绝不留着它继续跑。

### Phase 6 — 修订：改一页，重新 assemble

一次修订，只改能承载这次改动的最小那份文件：

- 内容改动（「把 KPI 那页写得更有冲击力」）→ 只改那一页的 `pages/<id>.json`，然后重复阶段三的 `assemble` + `validate` 组合，以及阶段五的 `audit`，再重新渲染。没人要求你改的页面，绝不重新生成。
- 结构性改动（调整顺序、增删页面、改某页的 type 或 heading）→ 改 `deck.spec.json`，先重新跑一次 `pptfast spec validate`（阶段二的「不要重新定 spec」规则依然适用：只有在用户确实要求结构性改动时才这么做）。
- 审查者在对话里提出的改动（通常附一张页面截图）→ 对照他描述的内容在 `deck.spec.json`/`pages/` 里找到那一页的 `pages/<id>.json`。把他的话当成一条需要你去理解的需求，而不是可以照抄的补丁：他描述的是渲染出来的 slide，不是在写页面文件 JSON——你自己要把它翻译成具体的内容改动，然后对每一页你动过的页面跑上面同一套内容改动流程（`assemble` + `validate` + `audit`）。preview 全程只读：除了你自己主动做出的编辑之外，没有任何环节会写入 `pages/*.json`。

## 后续请求怎么分流

一旦 deck 项目已经存在，后续消息恰好分流进三条分支之一——动手之前先判断走哪一条：

1. **改一页**（「改一下第 3 页」「把 KPI 那页写得更有冲击力」，或者一张截图加一句说明）→ 走阶段六：改那一页的文件，重新 assemble、重新 validate、重新 audit。没人问起的页面绝不去碰。
2. **一份新 deck**（不同的主题、不同的受众，或明确要求重新开始）→ 走阶段一：新建一个 deck 项目目录，重新决定 narrative/theme，重新起一份 spec。
3. **和 deck 生成无关**（关于内容本身的问题，或任何和 slides 没有关联的事）→ 完全不要调用 pptfast。

## 品牌主题——用户自己的公司模板

当用户递来（或提到手头有）公司模板——`.thmx` 主题、`.potx` 模板，或任何带品牌的 `.pptx`——先把它的配色和字体抽成自定义 theme，**再**进入阶段二的 theme 决策。抽取完全在本地进行，文件从不离开这台机器。

```bash
pptfast brand extract corp-template.pptx -o deck-dir/theme.json --id acme
pptfast render deck-dir/     # theme.json 自动装载。在 deck.spec.json 里写 "theme": "acme"
```

放在 deck 项目目录里的 `theme.json` 会在每条命令（validate/render/audit/preview/serve）上自动装载——在 `deck.spec.json` 里引用它的 id 即可，不需要任何 flag。单个 IR 文件则改用 `--theme-file deck-dir/theme.json`（同样五条命令都支持）。装载时会执行对比度底线检查：文字与背景色过于接近的模板会被拒绝，错误信息里写明是哪个 token、比值是多少——把这条信息转告用户，问 TA 是想调整抽出文件里的颜色，还是退回内置 theme。

## 内容方法论

### 组件选型

| 内容形态 | 用 | 不用 |
|---|---|---|
| 2–5 项头条指标 | `kpi_cards` | `chart` |
| 系列数据（趋势、对比、占比） | `chart`（`bar`/`line`/`pie`/`funnel`/`dumbbell`/`scatter`/`area`/`donut`/`gauge`） | 埋在 `bullets` 里的数字 |
| 受众要逐行读的精确数字（价目表、规格表、按周期分列的指标网格） | `data_table` | `chart` |
| 线性流程，无分支 | `steps` | `flowchart` |
| 有分支、且最终走到终点的流程 | `flowchart` | `steps` |
| 循环往复、没有终点的流程（首尾相连回到起点，如 PDCA、产品生命周期、飞轮、季节性循环） | `cycle` | `flowchart` |
| 双方对比 | `comparison` | 两份 bullet 列表 |
| 系统/组织分层（一叠层带，例如技术栈分层或成熟度阶梯） | `architecture` | `bullets` |
| 有日期的里程碑 | `timeline` | 带日期的 `bullets` |
| 分阶段计划，带多条工作线 | `roadmap` | `timeline` |
| 分阶段计划，在共享坐标轴上画出带日期的条形 | `gantt` | `roadmap` |
| 一句结论或要点 | `verdict_banner` 或 `callout` | `paragraph` |
| 2×2 战略评估（优势/劣势/机会/威胁） | `swot` | `matrix` |
| 9 宫格商业模式画布 | `bmc` | 拆开的 `bullets`/`row_cards` |
| 累计合计的桥接/差异拆解 | `waterfall` | `chart` |
| 2×2 宏观环境扫描（政治/经济/社会/技术） | `pest` | `swot` |
| 竞争结构分析（竞争强度 + 周边 4 种力量） | `five_forces` | `matrix` |
| 双轴数值网格，按颜色编码单元格（例如地区 × 季度） | `heatmap` | `matrix` |
| 跨阶段的比例流量/数量分布（例如预算分配、能源结构） | `sankey` | `chart`（funnel）或 `flowchart` |
| 产品/软件截图，这张 slide 要让人一眼认出「这是真实、正在运行的软件」（App 仪表盘、真实产品界面） | `device_mockup` | `image` |
| 一份人员名单（团队、讲者阵容、评委阵容、作者名单），需要一个无照片可用的身份锚点 | `people_cards` | `row_cards`/`icon_cards` |
| 一组机构/品牌标识（赞助商、客户墙、媒体报道/"as seen in"、合作伙伴） | `logo_wall` | `image_grid` |
| 一组短平行标签（技术栈、能力清单、关键词、资质认证）——是标签，不是带描述的条目 | `tag_row` | `bullets`/`row_cards` |

`steps` 和 `flowchart` 是最常见的混用：只要分支路径从不出现，就是 `steps`。`flowchart` 和 `cycle` 是次常见的：这个流程最终走到一个终点，还是转回自己的起点？把一个闭环硬塞进 `flowchart`，那条收尾的回边会被画成一条横跨整张图的迷路线段或大弧线——这不是画图的 bug，是选错了 component；只要最后一个阶段的箭头是指回第一个阶段，就该换成 `cycle`。`roadmap` 和 `gantt` 是再下一个：`roadmap` 把多条工作线分组进泳道，没有共享的数值坐标轴，`gantt` 则把带日期的条形画在一根所有条目共同比对的共享坐标轴上。`pest` 和 `swot` 是再下一个：`pest` 只看外部宏观环境因素（没有内部优势/劣势这条轴），永远是同样命名的四个类别——一份内部对外部的战略评估仍然是 `swot`。`sankey` 和 `flowchart`/funnel `chart` 是再下一个：`sankey` 在分支/汇合的路径上守恒并拆分一个数量（带宽本身就承载意义），`flowchart` 是没有数量含义的决策/流程分支，funnel `chart` 则永远只沿一条线收窄，从不分支也不汇合。`data_table` 和 `chart` 和 `comparison` 是最后一组：受众要逐行读的精确数字用 `data_table`，一眼看出趋势/对比形态的用 `chart`，没有精确数字、只做定性并排属性对比的用 `comparison`。

`chart` 内部，子型就是数据的形态。两根轴都是数值量时用 `scatter`（给每个点加可选 `size` 就成了气泡图）。线下方的填充区要读作累积或体量时用 `area`。部分对整体的占比用 `donut`，中心可选把总值放大居中（`center_total: true`）。单个指标对目标的完成度用 `gauge`。`gauge` 和 `kpi_cards` 最要分清：`gauge` 是单个完成度指标，画成一段填充的半环（例如 62% 达标），`kpi_cards` 则是多个各自独立的头条数字并排陈列，所以别在该用 `kpi_cards` 的地方摆一排 gauge。`scatter` 和 `line` 的区别：`scatter` 需要数值 x（两根轴都是真实坐标），x 轴是类目标签的仍然是 `line`。

`architecture` 的 `layers` 数组默认从上到下画（`layers[0]` 是最顶层的那条带）——这是自顶向下撰写系统分层（表现层在前、基础设施在后）的自然顺序。如果是一个自底向上的叙事（成熟度阶梯、基础优先的能力模型），就按它自己从低到高的自然顺序撰写，并在 component 上设 `direction: "bottom_up"`，让 `layers[0]` 改画在最底部——不要手动把数组倒过来伪造这个效果，这个字段存在的意义正是让数组始终保持叙事顺序。

`swot`/`bmc`/`waterfall`/`gantt`/`pest`/`five_forces`/`heatmap`/`sankey` 是「满幅」（full-body）组件：各自占满整张 slide，且必须是该 slide 唯一的 component——见下文「容量」。

### cycle vs. flowchart

两者都是用箭头把一串阶段连起来，区别在于这个流程有没有终点。`flowchart` 面向一个从某处开始、到某处结束的流程，哪怕中途有分支；硬要用它画一个闭环，做法只能是从最后一个节点拉一条边指回第一个节点，而 `flowchart` 的排布引擎并不知道这条边有什么特殊——画出来就是一条横跨整张图的迷路线段或大弧线，读起来像画错了，不像「这个流程会重复」。`cycle` 面向没有终点、总会转回自己起点的流程（PDCA、产品生命周期、飞轮、季节性循环、「设计 → 构建 → 复盘 → 设计」）。判断标准很直接：最后一个阶段的箭头，指向的是一个新东西，还是指回第一个阶段？指回第一个阶段，就用 `cycle`，不用再犹豫。

字段：`items`（3-8 项，每项必填 `label`，可选 `description`），可选的整体 `title`。`cycle` 不接受 `direction` 字段（阶段固定按顺时针排布，`items` 就按这个阅读顺序撰写），也没有中心文字槽——把内容留给阶段本身，别的信息放进 slide 周围的文字里。3 是硬下限（2 个阶段视觉上闭不成一个环，该用 `flowchart` 或 `steps`），8 是硬上限（第 9 个节点会把环挤到 1280x720 slide 上不够清楚的程度，超过就拆成多张 `cycle` slide，不要硬塞进一个环里）。

### 设备样机 vs. 普通图片

`device_mockup` 把一份资产框进一个主题化的浏览器窗口或手机机身，而不是一个普通带边框的矩形——它只为一件事存在：一张截图需要被读成「一个真实的产品，正在运行」，而不是「slide 上的一张图」。内容是软件/App/仪表盘的截图，且这一页的论点就是「这个产品是真的、正在正常工作」时用它。除此之外——普通照片、示意图、插画,或者只是顺带用截图说明一个观点而不是断言「这在真实运行」——都用 `image`。把不是产品截图的内容硬套 `device_mockup`，读出来只是个奇怪的装饰边框，不是证据。

字段：`device`（`"browser"` 或 `"phone"`，必填，pptfast 不猜）、`asset_id`（语义同 `image`）、可选 `caption`，以及——仅 `browser` 款——可选的 `url`，渲染为地址栏文字（这是「这是真的在浏览器里跑」这件事上最强的信号）。`phone` 款没有地址栏，`validate` 会硬拒绝在 `phone` 上设置 `url`。屏幕内容永远铺满裁切（cover）——不像 `image` 那样有 `fit` 可选：真实设备的屏幕就是边到边铺满的。故意不提供其它装饰选项——没有倾斜/透视、没有暗色 chrome 开关、没有多设备并排——chrome 配色完全由主题 token 决定。

### 人员卡片 vs. row/icon cards

判据很直接：条目是不是「人」？团队名单、讲者阵容、评委阵容、作者名单，用 `people_cards`：2-12 人的等重卡片网格，每张卡是一个由 `name` 派生的确定性 initials 徽章（不需要照片资源），加姓名和可选的 `role`/`org`。非人条目仍用 `row_cards`/`icon_cards`，哪怕字段形状很像。这两个组件上限都是 6 项，`people_cards` 是 12 项：一份会撑爆 6 上限的人员名单（比如 9 位讲者的大会阵容），就是该换 `people_cards`、而不是硬拆成两页无标签 `row_cards` 的最清楚信号。

字段：`people`（2-12 项，每项必填 `name`，可选 `role`/`org`），可选的整体 `title`。initials 徽章是 `name` 的纯函数：拉丁名取首两词的首字母（"Sarah Chen" → "SC"），单个拉丁词取它自己的前两个字母，CJK 名只取首字符，也就是姓（"王小明" → "王"），不取两个字。这个组件故意没有照片字段：真有头像照片的场景，`image_grid` 已经够用，`people_cards` 存在的全部理由就是这个零资产依赖的 initials 徽章。2 是硬下限（一个人的简介用不上网格，改用 `callout` 或纯文字），12 是硬上限（更大的名单拆成多张 `people_cards` slide，不要硬塞第 13 张卡进一个网格）。

### 标识墙 vs. 图片网格

一面第三方标识墙——赞助商、客户名录、媒体报道/"as seen in" 墙、技术合作伙伴——用 `logo_wall`，不是 `image_grid`。它存在的理由是 `image_grid` 是为照片设计的，对 logo 会同时犯两个错：格子会 cover 裁切，宽扁 wordmark 两端的文字被裁掉（"Northbridge Robotics" 渲染成 "NORTHBR"）。而且它在真实资产下方不铺任何底色，透明单色油墨 logo（press kit 实际就是这么分发的）会直接露出幻灯片背景，浅色主题上的白色油墨 logo 直接消失成一个空框。`logo_wall` 把每个 logo 都 contain 缩放（永不裁切）画在各自自动生成的中性底板上，所以深墨和浅墨 logo 在同一面墙上、任何主题下都保持可辨。内容是一组属于*其它*机构的标识时就用它。普通照片（自身铺满画面）仍用 `image_grid`，单张作为「正在运行的软件」的产品截图用 `device_mockup`。

字段：`items`（4-12 项，每项必填 `asset_id`，可选 `label`），可选的整体 `title`。每个 logo 在 `assets.images` 里声明一次，用 `asset_id` 引用，和 `image` 完全一样。`label` 是机构名称——它一身两用：资产自身没有 `alt` 时作为该 logo 的无障碍文本，资产缺失时作为可见的兜底文字（永远不会画在已存在的 logo 上面）。没有灰度/单色选项（改别人 logo 的颜色是商标风险），没有单 logo 链接，也没有尺寸/权重分级——每个 logo 等重。4 是硬下限（1-3 个 logo 用 `image` 或 `image_grid`），12 是硬上限（超过 12 个后每个 logo 会缩到看不清——把更大的一组拆成多张 `logo_wall` slide）。

### 标签行 vs. bullets/卡片

一行短平行标签——技术栈、能力或技能清单、关键词、供应商持有的资质——用 `tag_row`，不是 `bullets` 或 `row_cards`。判据是每一项是不是一个短*标签*（一个名词），而不是一句话或一个带描述的条目。`tag_row` 把 2-16 个短标签排成一行会自动换行的胶囊，每个标签按其真实的逐字符宽度测量，所以 CJK/拉丁混排的标签也能正确换行，可选的 `emphasis: "first"` 把首个标签画成主题 accent 色，作为其余标签中的主标签。真正的正文列表（读起来是句子或从句的条目）仍用 `bullets`，每项自带描述文字的条目用 `row_cards`/`icon_cards`——标签没有描述。

字段：`items`（2-16 个短字符串，每个 ≤24 字符——这是硬上限，因为标签是标签、不是句子；超了 `validate` 会把你指向 `bullets`/`row_cards`），可选的整体 `title`，可选的 `emphasis`（`"first"` 或 `"none"`，默认 `"none"`）。2 是硬下限（单个标签不成行——放进标题、`callout` 或 `verdict_banner`），16 是硬上限（超过 16 个后这行读起来就是一堆没排序的关键词——拆成多张 `tag_row` slide，或把标签分成带小标题的组）。

### 图片页

在 `assets.images` 里统一声明图片，用 `asset_id` 引用——务必逐个核对 `asset_id` 拼写，写错 key 只会渲染出一个静默的占位符，不会报错。显式的 `layout` id 永远优先于 pptfast 的自动选型，否则自动选型会从该页型对应的 theme layout 集合里挑（默认是全部已注册版式，除非 theme 主动收窄）——对于以图片为核心的 slide，把 `layout` 设成某个 image takeover：`image-split`（半页图片 + 侧边文字，`image_side: left|right`）、`image-top`（顶部通版图片 + 下方文字分栏）、`image-bottom`（上方文字，下方图片）、`image-annotate`（居中图片 + 从前 4 条 bullets 取出的放射状标注）。**每个 image layout 都需要 `components` 里至少有一个 `image` component**——不论它在数组里的位置，pptfast 都会用找到的第一个作为图片来源，其余的 component 全部成为该 layout 的文字正文。

给任何 `asset_id` 还没有真实文件的 `image` component 生成美术之前，先跑一遍 `pptfast asset-brief <target>`——它会真的渲染一遍 deck，报告每个图片位实际的渲染框（不是版式的名义槽位尺寸）、带安全区说明的裁切模式、建议的生成像素、主题色板，以及一段可直接粘贴的提示词。宽高比和色调对上了，生成的图片摆上去才会显得是设计好的，而不是被拉伸、裁错或跑色。

### 图库配图

先跑 `pptfast asset-brief <target>`，拿到真实框、裁切和色板。

查询词：短而具体的名词，英文 2 到 4 个词（`office desk`、`wind farm`）。中文只作变体，不要当唯一查询。不要加情绪或画质词（`beautiful`、`4k`、`cinematic`）。不要写负向词（`not office`、`no people`）。

```bash
pptfast config set pexels.apiKey
pptfast images search "office desk" --orientation landscape
```

不要自动收第一条。人（或视觉模型）从大约 8 张缩略图里挑。然后下载：

```bash
pptfast images fetch pexels:123 --deck <dir> --as hero
pptfast images list --deck <dir>
```

文件落在 `.pptfast/<deck>/assets/<asset_id>.jpg`，旁边是 sidecar。页面用这个 `asset_id` 引用。不要为了「重跑」整目录删掉 `.pptfast/`，已钉的图会一起没。

没有 key：槽位保持 `missing`（灰框）。不要编一张图。不要刮网页。这一版不要用 Unsplash 或 Openverse。这是本机客户端，用用户自己的 key 去拉。幻灯里商用可以。不要把原图单独转卖。署名打在终端，默认不印在画面上。

### Pin-only 版式

这些版式从不出现在自动选型里。每次要用都得显式设置 `layout`。pin-only 的 content 版式超出声明容量时 `validate` 会硬报错（普通版式钉住超容量只给警告）。

`quote-stage` 是 content 页上的论断页：一句短而有力的标题是整页主视觉，最多再配一个短附注 component（出处、署名、一句补充）。0 个 component 合法。这一页仍会画主题的品牌页脚和 motif。

`statement` 是 content 页上的整页诗行或金句。最多一个 component，渲成出处小字（quote / paragraph / citation），不走卡片。可选 kicker 来自上一章。品牌页脚和 logo 不画。主题 motif 仍画。脸是主题专属的（已定稿的主题不是通用斜体 500 行）。

`pull-quote` 是 content 页上的引言页：标题、出处小字、可选 muted 散文。出处优先 quote 的 `attribution`，否则 `subheading`。品牌页脚和 logo 不画。主题 motif 仍画。

`verse-chapter` 是居中诗行章首（`type: "chapter"`）。tracking 章号眉、两行标题、可选斜体副题。没有水印大数字，没有 body，没有 footnote，chapter 页的既有边界照旧。logo 不画。主题 motif 仍画。

### 稀排页合同

一份 deck 是拿来讲的。幻灯片装不下的字写进 `slide.notes`。如果文件必须作为文档独立站住，建议用 PDF，不要把画布塞满。

这不是新的 `pacing` 档。枚举仍是 `dense` / `balanced` / `spacious`。合同靠版式点名、`notes` 和 deck `chrome` 实现。

高潮页、金句页、证据页，在主题提供这些版式时显式钉 pinOnly 极简版式。点名：`statement`、`pull-quote`、`verse-chapter`、`stat-hero`、`one-evidence`、`mono-bleed`。不要把这些页交给自动选型。某一页真的只剩一句话时，即使 pacing 是 `dense` 也仍然钉。crayon、classroom（含 bloom）、enterprise、pulse、runway、ember 不提供这些版式。如果 `validate` 警告这个钉子不是该主题提供的稀排页，就去掉钉子，改写普通内容页。

访谈或请求选了 `spacious`：收紧页上预算。标题就是主视觉。钉住的极简页最多一个 body component（一行出处、一个数字、一张图或一张表）。这些页零 bullet。装不下就拆页。

`balanced` 或 `dense`：按 pacing 预算写。某一页是一句话、一个数字、一句引语或一条证据时，仍然钉极简版式。

讲稿写进 `slide.notes`。`render` 导出成原生 PowerPoint 演讲者备注（View → Notes，演讲者视图可见）。讲稿从不画到画布上。

spec 和 IR 不要写 `chrome`，除非每一页内容页都需要品牌页脚。`meta.confidentiality` 为 `confidential` 或 `restricted`，或文件需要机构落款时，写 `chrome: "full"`。密级和日期随后出现在封面。其余姿态不出现。

### 容量

一张 slide 是一块固定尺寸的画布。第一遍起草就要考虑装得下：每张 slide 少放几个 component，标题简短有力，bullet 条目控制在约两行以内。component 数和 bullets 预算随这份 deck 的 `pacing` 轴变化（`spacious` 最紧，`dense` 最松）——`validate` 会报出实际生效的具体数值，不是一个写死的常数。这些是警告，不是硬错误——值得为了让 deck 更紧凑而修，但从不拦住 `render`。正文字号则反过来变化：`spacious` 渲染出的正文字号最大（32px，相对 `balanced` 的 24px 和 `dense` 的 20px），即便它允许的 component 数最少——所以一张 `spacious` 的 slide 需要更少、更短的条目，而不只是更紧凑。不论 pacing 是什么，一条长到在渲染安全字号地板下仍然溢出的 bullet 条目，*就是*一条硬 `validate` 错误，五种 bullet 样式（`default`/`plain`/`divided`/`numbered`/`checklist`）一视同仁——否则它会被省略号真的截掉一段真实文字。把「bullet 条目要短」当成一条不分样式都成立的硬约束。拿不准的时候就拆成两张 slide——一遍写对，好过事后反复修补。

有八种 component 类型独占整张 slide，而不是与其他组件共享：`swot`、`bmc`、`waterfall`、`gantt`、`pest`、`five_forces`、`heatmap`、`sankey`。各自必须是所在 slide 唯一的 component——`validate` 会在一张 slide 把其中之一和 `bullets` 或其他任何组件混在一起时硬报错，绝不会静默丢弃那个「陪衬」的 component。

### Beat（节奏标记）

一张 content 页面上可选的 `beat`（`anchor`、`dense` 或 `breathing`）现在不只是 `spec validate` 的节奏检查——它还会影响 `render` 给这一页自动选出哪个 layout：`anchor` 偏向单一的强断言式 layout，`dense` 偏向可见条目更多的高密度 layout，`breathing` 偏向最舒展的单栏 layout。它是一个软权重，不是钉死的选择——显式的 `layout` 依然会完全覆盖它，未设置的 `beat` 则毫无影响。要有意识地声明它，按每一页在论证里的实际角色各给一个值（「重磅揭示」的那页是 `anchor`，数据密集的对比页是 `dense`，两个高密度段落之间的换气页是 `breathing`），而不是每一页都盖同一个章——`spec validate` 自己的 beat 轮换门已经会对期望有变化的 strategy 标出一连串相同 beat 的问题，而且到处盖同一个值本来就会抵消这个字段存在的目的：给 layout 增加变化。

### Decor（装饰）

只有当用户明确要求装饰性点缀时，才设置 slide 的 `decor`。默认不设——theme 本身已经带着自己的视觉母题。

## 规则

- 从不编辑或后处理生成出来的 `.pptx`
- 从不通过删除 `validate` 报错所指的内容来绕过它——去重组它（拆分 slide、收紧标题、换一个更紧凑的 component 类型）
- 面向用户的 deck 文本跟随用户使用的语言，IR 的结构性字段永远用 schema 里的英文枚举值
- 从不告诉用户 `chart`、`data_table` 里的数字可以在 PowerPoint 里直接编辑。这两类组件渲染出来是成组的图形加文字，样式和文字都能自由改，但背后没有原生的图表部件，也没有 `<a:tbl>`。要改数字，去改 IR 再重新渲染
