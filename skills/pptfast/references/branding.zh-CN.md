---
summary: 'skills/pptfast/references/branding.md 的中文阅读镜像'
mirror_of: skills/pptfast/references/branding.md
---

# Branding 姿态

何时读：抽取公司模板，或决定要不要写 `branding: "full"` 时。

品牌信号回答的是这份 deck 长什么样，从来不回答它该怎么论证。把「这家公司的配色像咨询公司」读成一种叙事，是把推断当事实抬上来，一份没人选过的论证形状就是这样上台的。

## 品牌主题——用户自己的公司模板

当用户递来（或提到手头有）公司模板——`.thmx` 主题、`.potx` 模板，或任何带品牌的 `.pptx`——先把它的配色和字体抽成自定义 theme，**再**进入阶段二的 theme 决策。抽取完全在本地进行，文件从不离开这台机器。

```bash
pptfast brand extract corp-template.pptx -o deck-dir/theme.json --id acme
pptfast render deck-dir/     # theme.json 自动装载。在 deck.spec.json 里写 "theme": "acme"
```

spec 和 IR 不要写 `branding`，除非每一页内容页都需要品牌页脚。`meta.confidentiality` 为 `confidential` 或 `restricted`，或文件需要机构落款时，写 `branding: "full"`。密级和日期随后出现在封面。其余姿态不出现。
