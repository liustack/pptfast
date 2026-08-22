---
summary: 'skills/pptfast/references/images.md 的中文阅读镜像'
mirror_of: skills/pptfast/references/images.md
---

# 配图

何时读：声明资产、搜图库、或生图时。

### 图片页

在 `assets.images` 里统一声明图片，用 `asset_id` 引用——务必逐个核对 `asset_id` 拼写，写错 key 只会渲染出一个静默的占位符，不会报错。显式的 `layout` id 永远优先于 pptfast 的自动选型，否则自动选型会从该页型对应的 theme layout 集合里挑（默认是全部已注册版式，除非 theme 主动收窄）——对于以图片为核心的 slide，把 `layout` 设成某个 image takeover：`image-split`（半页图片 + 侧边文字，`image_side: left|right`）、`image-top`（顶部通版图片 + 下方文字分栏）、`image-bottom`（上方文字，下方图片）、`image-annotate`（居中图片 + 从前 4 条 bullets 取出的放射状标注）。**每个 image layout 都需要 `components` 里至少有一个 `image` component**——不论它在数组里的位置，pptfast 都会用找到的第一个作为图片来源，其余的 component 全部成为该 layout 的文字正文。

给任何 `asset_id` 还没有真实文件的 `image` component 生成美术之前，先跑一遍 `pptfast asset-brief <target>`——它会真的渲染一遍 deck，报告每个图片位实际的渲染框（不是版式的名义槽位尺寸）、带安全区说明的裁切模式、建议的生成像素、主题色板，以及一段可直接粘贴的提示词。宽高比和色调对上了，生成的图片摆上去才会显得是设计好的，而不是被拉伸、裁错或跑色。

### 图库配图

先跑 `pptfast asset-brief <target>`，拿到真实框、裁切和色板。

查询词：短而具体的名词，英文 2 到 4 个词（`office desk`、`wind farm`）。中文只作变体，不要当唯一查询。不要加情绪或画质词（`beautiful`、`4k`、`cinematic`）。不要写负向词（`not office`、`no people`）。

搜索顺序是 Pexels，有 key 再 Pixabay，然后 Openverse（cc0/pdm，commercial 过滤）。

```bash
pptfast config set pexels.apiKey
pptfast images search "office desk" --orientation landscape
```

不要自动收第一条。人（或视觉模型）从大约 8 张缩略图里挑。然后下载：

```bash
pptfast images fetch pexels:123 --deck <dir> --as hero
pptfast images list --deck <dir>
pptfast images generate --deck <dir> --as <asset_id>
```

本地生图默认关闭，要显式打开：

```bash
pptfast config set images.generators.grok.enabled true
pptfast config set images.generators.codex.enabled true
pptfast config set images.generators.antigravity.enabled true
```

文件落在 `.pptfast/<deck>/assets/<asset_id>.jpg`，旁边是 sidecar。页面用这个 `asset_id` 引用。不要为了「重跑」整目录删掉 `.pptfast/`，已钉的图会一起没。

没有 key：槽位保持 `missing`（灰框）。不要编一张图。不要刮网页。不要用 Unsplash。这是本机客户端，用用户自己的 key 去拉。幻灯里商用可以。不要把原图单独转卖。署名打在终端，默认不印在画面上。
