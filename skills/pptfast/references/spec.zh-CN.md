---
summary: 'skills/pptfast/references/spec.md 的中文阅读镜像'
mirror_of: skills/pptfast/references/spec.md
---

# Spec 写法与页型

何时读：写 `deck.spec.json`、选页型（`cover` / `chapter` / `content` / `ending`）、或做叙事访谈时。

### Phase 1 — 读词汇表（每个 session 都要重新读一遍）

```bash
pptfast schema             # IR JSON Schema: the single source of truth
pptfast schema --spec      # deck spec schema
pptfast narratives --json  # named narrative presets (strategy/pacing/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

永远不要凭上一个 session 的记忆、或凭这份文件本身的记忆去写 IR 或 spec——schema 会演进，`schema`/`narratives`/`themes` 的实际输出永远优先。

动手问人之前，先扫工作区。文件能回答的事实不要问人：

- 已有确认过的 `deck.spec.json` 已经锁死 narrative、theme、品牌框。不要重做访谈。后续请求走阶段六
- 已有 `theme.json`、项目 `pptfast.config.json` 钉死的 theme、用户点名的 theme id、或用户递来的 `.thmx` / `.potx` / 带品牌 `.pptx`，都是品牌信号。抽取或沿用。不要再问有没有模板
- 请求原文已经点名受众、论证方式或疏密，这一轴就算推导出来了。不要再问

品牌信号回答的是这份 deck 长什么样，从来不回答它该怎么论证。完整规则在 `references/branding.md`。


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

- 先锁定叙事包：具名预设（或显式三轴）、theme id、品牌框姿态、以及 typeScale 档（封面 / 章 / 演讲页标题有多大：`regular` 省略/1，`display` 1.3，`hero` 1.5）。这是位于 theme 之上的一层决策，不是视觉选择。任一轴仍未知且用户在场时，走下方「叙事访谈」。这种情况下不要自己静默挑一个预设
- 疏密（留白还是铺满）在访谈里判定（或从请求推导）。钉高潮页、金句页、证据页版式和写 `notes` 时走 `references/layouts.md` 的稀排页合同。`pacing` 不会为此多出第四档
- 再定 theme id：从 `narratives --json` 里该预设的 `themeRecommendations` 取（如果都不合适，就从 `themes` 输出里挑一个贴合这份 deck 调性的。这只是推荐，从不构成约束）。访谈的品牌问如果返回了模板，先抽成自定义 theme，见 `references/branding.md`
- 用户一点头，立刻把确认下来的 `narrative`、`theme`、`branding` 写进 `deck.spec.json`，再起草任何一页。不要把答案留在对话里，等页面写完再凭记忆补
- 起草 `deck.spec.json`：每页一条记录（`id`、`type`、`heading`，可选加 `beat`/`focus`/`summary`）——以 `cover` 开篇，以 `ending` 收尾，中间的每一页都是 `content` 或 `chapter`。三轴与某个预设完全相等时，`narrative` 写预设 id 字符串，否则写 `{strategy, pacing, audience}`。不要写 `{id, pacing}` 这种混形。默认省略 `branding`。只有每一页内容页都需要品牌页脚时才写 `branding: "full"`（`meta.confidentiality` 为 `confidential` 或 `restricted` 时同样写 `"full"`）。不要在 spec 上发明 `typeScale` 字段，那个字段不存在。档是推荐。只有跳过 spec、直接写 IR 时，才允许把 `theme.style.shape.typeScale` 写进 IR
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

`推荐：<预设或三轴> × <theme> × branding 省略|full × typeScale regular|display|hero`
`改口条件：<一句>`。最常见的一条：这份会在没有主讲人的情况下被转发，把多出来的字写进 notes，或者建议改用 PDF，不要把幻灯片塞满。

查表（theme = `narratives --json` 里该预设 `themeRecommendations` 的第一项。写三轴对象时改取最靠近预设的名单）。默认省略该字段。`meta.confidentiality` 为 `confidential` 或 `restricted`，或每一页内容页都需要品牌页脚时，才写 `"full"`。`customer` + `talk-pyramid` + `spacious` → `pitch` / 省略 / display。`executive` + `talk-pyramid` + `spacious` → `boardroom-report` / 省略 / display。`customer` + `talk-showcase` + `spacious` → `product-launch` / 省略 / display。`technical` + `teach` + `balanced` → `training` / 省略 / regular。`technical` + `read-brief` + `dense` → `weekly-brief` / 省略 / regular。`executive` + `read-brief` + `dense` → 三轴 `{pyramid, dense, executive}` / 省略 / regular，theme 取 `boardroom-report`。`public` + storytelling + `balanced` → `annual-review` / 省略 / regular。其余写三轴对象，最靠近预设：`pyramid`+`executive` → `boardroom-report`，`pyramid`+`customer` → `pitch`，`showcase` → `product-launch`，`instructional` → `training`，`briefing`+`dense` → `weekly-brief`，`storytelling` → `annual-review`，否则 `general`。

typeScale 档：`dense` 或 `balanced` 用 `regular`。`spacious` 用 `display`。`hero` 只出现在把 theme 换成 `stage` 的那种换皮上。不要为了把标题加大，把董事会 deck 改成 `stage`。不要在 `deck.spec.json` 上写 `typeScale`。不要为了一个 deck 去改仓库根上的 `pptfast.config.json`。跳过 spec、直接写 IR 时，非 `regular` 的档可以写成 `theme.style.shape.typeScale` 1.3 或 1.5。

第二候选跟着推荐包一起抛，事先准备，而且必须在机制上不同：翻疏密（`spacious` ↔ `dense`，type-scale 跟着翻），或者换由什么领头论证（`pitch` ↔ `product-launch`，`training` ↔ 同样内容的密页讲义）。同样三根轴换个主题是换皮，不算候选，只在用户否的是皮时才给，并说清叙事没动。showcase 想要更大标题时，`stage` × `hero` 属于这种换皮。不要三轴一起翻。

这一轮只定三根叙事轴，不负责判断这件事该不该做成 deck。那个更大的问题还开着，就直说，让用户先答，再定 spec。

很小的 deck 仍可跳过 spec 文件、直接写一份 IR。轴未知时不可跳过这场访谈。把同样的决策写到 IR 的 `narrative` / `theme` / `branding` 上。
