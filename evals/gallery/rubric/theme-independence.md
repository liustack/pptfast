# 主题独立性

每个主题必须还是自己。抽查封面几何、装饰语言、禁止串皮。

## 封面几何还是该主题

封面的标题轴（左/中/右）、meta 位置、主装饰语言，应能让人认出是这个主题，而不是换了色的另一份封面。

判定：把本页去色后，构图仍应不同于基准主题 consulting 的默认同页（若该主题声明了自己的封面或 motif）。只换色、构图相同，记 `limit`。完全串成另一主题的封面，记 `rework`。

## 禁止串皮

主题不得借用另一主题的招牌件。academic 的学者轴、playbill 的倾斜日期贴、vermilion 的直角朱印、crayon 的手绘星、enterprise 的工业横幅块，都只属于自己。

判定：在 A 主题页上出现 B 主题的可指名装饰（形状和位置都像），记 `rework`。共享版式池里的几何（paper-masthead 的巨字和右缘年份）是版式，不是串皮。

## 贴片圆角跟卡走

卡面是直角，里面的 pill、徽章、标签也必须是直角语言。方卡配全圆 pill 记 `rework`。vermilion 朱印是直角，不能在方卡上套全圆胶囊。圆卡配圆 pill 通过。

看什么：外卡 `rx`（缺省即直角）对照内 pill 的 `rx`。

怎么算 rework：方卡、直角朱印卡，内嵌接近全圆的 pill，记 `rework`。

正例：圆角卡配圆角 pill。直角卡配直角标签。

反例：方卡内嵌 `rx=24` 的全圆 pill。种植图 `rubric/examples/radius-1.png` 与 `rubric/examples/radius-2.png` 应判 `rework` 或 `limit`。

## 旋转字跟形走

日期贴片如果倾了，字必须同方向、同量级旋转。字保持水平，或转到相反方向，记 `rework`。

看什么：贴片多边形的倾角，对照文字 `transform` 的旋转方向和角度。

怎么算 rework：贴片逆时针倾，字水平或顺时针转，记 `rework`。

正例：贴片逆时针倾约 4 度，字也逆时针倾约 4 度。

反例：贴片在倾，字水平，或字转到相反方向。种植图 `rubric/examples/rotate-1.png` 与 `rubric/examples/rotate-2.png` 应判 `rework` 或 `limit`。

## crayon 星星

crayon 左下角星星贴纸禁止（与 taboo 同条）。去掉星星后，crayon 仍须靠手绘线、蜡笔色、圆角语言维持身份，不得因此变成一份无装饰的 consulting。

判定：crayon 页仍有左下星，记 `rework`。crayon 页去掉星且同时失去全部手绘语言，记 `limit`。
