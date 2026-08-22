---
summary: 'skills/pptfast/references/validate.md 的中文阅读镜像'
mirror_of: skills/pptfast/references/validate.md
---

# 排错与 validate 循环

何时读：跑 assemble / validate / audit / preview / serve，或修订某一页时。

### Phase 3 — 分批填页面（每批至多 4 页），随填随 validate

对已确认 spec 里的每一页，写一个 `pages/<page-id>.json` 存放它的内容（`components`，以及可选的 `layout`/`arrangement`/`background`/`image_side`/`footnote`/`notes`——绝不写 `type`/`heading`，这两个字段被 spec 锁定）。撰写 `cover`/`chapter`/`ending` 页面时记住 Phase 1 的边界页规则——不要先给它们塞 `components` 或 `footnote`，然后再回头搬走。`notes` 是给主讲人看的演讲稿——写一份好的讲稿是模型的强项。只要页面需要一段超出幻灯片本身的口头讲解，就起草 `notes`（稀排页合同）。这是默认动作，不是可选项。

```bash
pptfast assemble deck-dir/     # materializes deck.json — catches structural drift: orphan page files, locked-field violations, a broken spec
pptfast validate deck-dir/     # content-quality gate: heading length, density, bullets budget (warnings) + unknown theme, boundary-page content, and a bullet item past render-safety (hard errors)
```

把两个命令报出的错误都修掉，重新跑，直到两者都打印 `OK`。`validate` 可能在打印 `OK` 的同时带着 `warning:` 行（比如标题太长、某页太密）——条件允许时也应该收紧，读起来会更好，但它们不拦渲染。只有 error 才会让 `OK` 打印不出来。spec 里某一页如果还没有对应的页面文件，就是一个占位页（只有标题）——assemble 和 validate 都接受这种情况。分批之间留一些占位页是正常状态，不是错误。只要某一页的 `layout` 被留给自动选型，`assemble` 也会打印 `note: N layouts auto-selected into deck.json`——这只是提示，不是错误。只有当某个具体选型结果需要被锁定时，才在页面文件里显式钉死 `layout`——像 `quote-stage`、`statement`、`pull-quote`、`verse-chapter`、`stat-hero`、`one-evidence`、`mono-bleed` 这种 `pinOnly` 版式每次都需要这个钉子，因为它从来不会通过自动选型出现（见 `references/layouts.md`）。高潮页、金句页、证据页默认就要钉（见 `references/layouts.md`）。

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

零 token、零方差——它离屏渲染每一页，检查溢出（overflow）、越界（out-of-bounds）、低对比度（low-contrast）、重叠（overlap）、内容截断（content-truncated，省略号截掉了真实文字）、内容丢失（content-dropped，某个条目或整个 component 被静默截掉，SVG 里标成 data-dropped），发现问题就 exit 1（干净则是 0）。每条 finding 都标出所在页面（和 id），并带一个修法。修那一页被标出的内容——和处理 `validate` 报错一样遵循「重组，不要删除」的纪律——然后单独重跑一次 `pptfast audit deck-dir/`（不用重新渲染）直到 exit 0。这是这份 deck 的视觉 QA。不要用肉眼看截图来代替它。

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
