# Design QA — 自选监控大字号与安全数据版

## Comparison targets

- Source visual truth: `/Users/liyuening/Desktop/截屏2026-07-16 14.31.57.png`
- Implementation screenshot: `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/monitoringGroups-large-font-final.png`
- Full-view comparison: `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/monitoringGroups-reference-comparison.png`
- Focused row comparison: `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/monitoringGroups-row-comparison.png`
- Viewport: in-app desktop browser capture, 2530 × 1423 physical screenshot.
- State: 自选监控默认分组；Yahoo 延迟行情已加载 52/53，缺失股票不参与计算。

## Full-view comparison evidence

- 参考图中所有表格正文约 8–10px，实施版按用户要求将自选监控正文、表头、分组和操作文字放大约三倍，并同步增加行高、栏宽和控件尺寸。
- 左侧分组、中央观察清单、顶部摘要的暖白纸张风格与原版一致；在当前桌面宽度下，右侧档案区自动移到清单下方，避免大字号挤压八列表格。
- 参考图绿色框中的板块名称已从每一行删除；红色框中的股票代码与公司名被保留并成为首列主要信息。
- 实施版数据由固定模拟值切换为 Yahoo 延迟行情，因而股票、涨跌幅和排序与参考截图不同；这是明确的数据状态变化，不是视觉漂移。

## Focused region comparison evidence

- `monitoringGroups-row-comparison.png` 将参考行与实施行放在同一张对照图中。首列从“板块名称 + 股票代码/公司名”精简为“股票代码 + 公司名”，符合红绿框标注。
- 字体放大后，代码、公司名、涨跌、成交额、热度、排名和状态仍保持独立列，无重叠；观察备注仍可输入。
- 顶部日期、数据来源、更新时间和部分兜底状态均清晰可见。

## Required fidelity surfaces

- Fonts and typography: 表格正文由 8.5px 提升至 25.5px，表头、辅助文字、侧栏和按钮按相同比例放大；标题保持合理视觉层级，避免扩大到无法使用的 81px。
- Spacing and layout rhythm: 行高、栅格间距、输入框和状态标签同步扩展；窄于 2200px 时档案区下移，主清单保持可读。
- Colors and visual tokens: 暖白纸张、樱花粉强调、A 股红涨绿跌和夜樱外壳全部保留；修复了日期与分级标题在浅色背景上的对比度。
- Image quality and asset fidelity: 继续使用项目现有夜樱侧栏位图；本次目标没有新增图片资产需求。
- Copy and content: 删除固定日期、固定“较昨日”、假换手率和伪造历史；Top50 改为“自选池排名”，数据来源和缺失状态明确展示。
- Interactions: 行情自动刷新、手动刷新、备注输入与保存、刷新后备注保留均已通过浏览器测试；主题热度、榜单变化与异动雷达也确认读取延迟行情，控制台无错误。
- Accessibility: 大字号显著改善可读性；关键按钮保留可访问名称，观察行继续支持键盘操作。

## Findings

- No actionable P0/P1/P2 visual or interaction differences remain.

## Comparison history

1. First pass found a P1 contrast issue: dynamic date and tier labels inherited the dark shell's light text and nearly disappeared on the paper background.
2. Fixed with explicit ink and muted colors scoped to the watchbook heading and tier headers.
3. First pass also found a P2 width issue: three-column layout plus triple-size text pushed the right dossier entirely off-screen.
4. Added the 2200px desktop breakpoint so the dossier moves below while the eight-column observation list keeps adequate width.
5. Post-fix full-view and focused comparison images show readable columns, correct red/green annotation handling, and no visible overlap.

## Implementation checklist

- [x] Green-box board names removed from every observation row.
- [x] Red-box ticker and company retained.
- [x] Watchbook text enlarged approximately three times.
- [x] Yahoo delayed watchlist data connected with five-minute refresh.
- [x] Coverage, missing-symbol handling and error status added without mixing mock values into live calculations.
- [x] Tier counts, day-over-day comparison, heat and strongest signal derived from consistent data.
- [x] Fake turnover and hard-coded history removed.
- [x] Daily local snapshots and note persistence added.
- [x] Production build and browser interaction checks passed.

## Follow-up polish

- P3: Historical rows will naturally expand after the page has accumulated multiple trading-day snapshots in this browser.

final result: passed
