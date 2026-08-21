---
summary: '24 套内置主题（25 个 id）、从 PowerPoint 模板抽取自家品牌，以及通过 CLI flag、IR、项目配置做 style 覆盖'
read_when:
  - 挑主题，或查某个主题 id
  - 想让产出看起来像自己公司（`pptfast brand extract`）
  - 不分叉主题就换配色
---

# 主题

主题（theme）打包了 style（设计 tokens）、brand（品牌标识元素：logo、页脚、页码）与每个页型各自的版式集合。内置 24 套（25 个 id，`bloom` 是 `classroom` 的纯换色）。

| id | label |
|---|---|
| `consulting` | Business Consulting |
| `enterprise` | Enterprise |
| `academic` | Academic |
| `insight` | Financial Insight |
| `campaign` | Marketing Campaign |
| `bloom` | Soft Bloom（`classroom` 的换色版）|
| `classroom` | Classroom |
| `ink` | Ink Wash |
| `tech` | Tech |
| `runway` | Fashion Runway |
| `journal` | Editorial Journal |
| `luxe` | Luxe |
| `heritage` | Heritage |
| `pulse` | Health & Life Science |
| `terra` | Sustainability & ESG |
| `ember` | Startup Pitch |
| `vermilion` | Official Report |
| `crayon` | Kids Education |
| `arena` | Esports & Entertainment |
| `museum` | Museum（博物） |
| `stage` | Keynote Stage（黑场） |
| `lecture` | Lecture Hall（黑板夜校） |
| `swiss` | Swiss Institutional（冷白制度） |
| `memo` | Decision Memo（打字机决定） |
| `playbill` | Playbill（荧光嗓门，10 页内活动宣发 / 招募 / 节目单） |

`pptfast themes [--json]` 会从你装的这一版里打印同一份清单。

封面、章节、结尾三类页面，有 Claude Design 设计板就锁到板上的构造。软偏好保不住这三类页。第七波五家已经锁了封面：`stage` 用 `poster-center`，`lecture` 用 `board-head`，`swiss` 用 `institutional-block`，`memo` 用 `memo-head`，`playbill` 用 `bill-head`。这五家的章节和结尾，以及其它主题里尚未画板的同类页，仍走各页型全集，等下一轮设计画板后再锁。这是在等板，不是漏锁。内容页仍走全集，再按分配表加权。

版式仍住在共享池里。锁定是主题怎么用池，不是给一家另开一份私有文件。每家内置也会点名自己更常抽到的封面、章节、内容页和结尾，所以两家主题用同一份 deck、同一个 seed，通常会抽到不同版式。软偏好（`layoutTendencies`）留给内容页，以及还没锁定的身份页。已经锁死的封面，偏好就是那把锁本身。某一页必须是某一个版式时，在那一页写 `slide.layout` 钉死。封面锁定不会因为后面某一波把另外三类页填上而跟着动。每个版式都会按主题的实际背景色自适应取色，所以池在任何主题下都保持可读。

`bloom` 就是换了五个色值的 `classroom`，别的一处不差：结构、字体、圆角、装饰几何全部相同，只是渲成自己的色板。想要樱粉纸和干玫瑰选 `bloom`，想要雾蓝讲义纸选 `classroom`，同一份 deck 在两者下抽到的版式相同。所以是 25 个主题 id、24 套设计。

`memo` 是读件光谱的端点：打字机决定（印章红只成线与字，永不成面）。与 deck 声明 `chrome: "full"` 天然搭配，页脚、页码、机构名留在给人带走的那一页上。搭配写在这里，引擎不绑定，chrome 仍归 deck 声明。

## 你自己的品牌

让产出看起来像*你的公司*而不是某个内置主题，最快的路径是从你已有的模板里抽取品牌。`pptfast brand extract` 从 `.thmx` 主题、`.potx` 模板或 `.pptx` 演示文稿中读出配色与字体，写出一个 pptfast 主题文件。整个过程**完全在本地进行，文件从不离开你的机器**（已对 macOS PowerPoint 自带的全部 39 个 Office 主题逐一验证）。

```bash
pptfast brand extract corp-template.pptx -o my-brand.theme.json
pptfast render deck.json -o deck.pptx --theme-file my-brand.theme.json
```

`--theme-file` 在 `render`、`validate`、`audit`、`preview`、`serve` 上都可用。在 deck 项目目录里，把文件放进去命名为 `theme.json`，每条命令都会自动装载，在 `deck.spec.json` 里引用它的 id 即可，不需要任何 flag。

OOXML 的 12 个色槽与 pptfast 的 tokens 几乎一一对应，六个强调色恰好构成图表色板。唯一需要派生的 token 是 `muted`：向背景色逐步混合，止步于仍能保住 4.5:1 对比度的最后一档。

装载时执行与所有注册主题相同的对比度底线：文字与背景过近的配色会被拒绝，错误信息写明失败的 token、实测比值与对应背景，绝不渲染出不可读的结果。自定义主题永远不能顶替内置 id。

抽取的实现细节见 [`brand-extraction.md`](./brand-extraction.md)，对比度机制见 [`contrast-system.md`](./contrast-system.md)（均为英文）。

## style 覆盖与项目配置

不分叉主题就换配色：写一份 style JSON（结构见 `pptfast schema --style`），按次渲染传入（`--style brand.json`），或固化在项目级 `pptfast.config.json` 里（自当前目录向上查找，用 `pptfast init` 生成模板）。

```json
{ "theme": "consulting", "style": { "colors": { "primary": "#0B5FFF", "accent": "#FF6A00" } } }
```

优先级：CLI flag > 项目配置文件 > 用户配置文件 > IR。IR 自身也可以在 `theme.style` 携带同样的覆盖，做到单文件自包含。完整的四层链见 [`ir.zh-CN.md`](./ir.zh-CN.md#deck-项目)。
