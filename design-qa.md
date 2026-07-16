# Design QA — 自选监控单屏排序与对比度优化

## Comparison targets

- Source visual truth 1: `/Users/liyuening/Desktop/截屏2026-07-16 15.16.23.png`
- Source visual truth 2: `/Users/liyuening/Desktop/截屏2026-07-16 15.17.44.png`
- Implementation screenshot: `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/monitoringGroups-default-desktop-final.png`
- Full-view comparison: `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/monitoringGroups-single-screen-comparison.png`
- Dossier contrast comparison: `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/monitoringGroups-dossier-contrast-comparison.png`
- Viewport: in-app desktop browser, 2560 × 1440.
- State: 自选监控默认分组；Yahoo 延迟行情已加载 52/53；默认按今日涨跌降序。

## Full-view comparison evidence

- 参考图绿色框中的“观察备注”表头、输入框和整列已删除，中央表格由八列收敛为七列。
- 左侧分组、七列表格和右侧档案在 2560 × 1440 桌面视口中同时完整显示；九条观察记录、三个分层区块、顶部摘要和底部工具均进入同一屏，无横向或纵向页面溢出。
- 表格正文维持约 13px 的舒适字号，主要通过减少无效列、收紧行高、区块间距和档案区间距实现单屏展示。
- 带排序能力的表头显示方向箭头；当前排序字段使用樱花粉强调，静态字段保持原有纸张风格。

## Focused region comparison evidence

- `monitoringGroups-dossier-contrast-comparison.png` 对照第二张参考图与优化后的档案区。成交额、热度比例、Top50 数值、股票代码、“强弱领跑”“异动解读”“观察笔记”“历史记录”等文字均由近白色改为深黑灰。
- 红涨、绿跌和领涨/领跌标签继续使用语义色，黑色修复没有覆盖行情状态颜色。
- 第一张参考图中的绿色备注列在实施截图中完全消失，状态列成为最后一列。

## Required fidelity surfaces

- Fonts and typography: 主表正文保持原舒适字号；短桌面断点仅轻微收紧辅助字号，表头排序箭头与文字基线对齐。
- Spacing and layout rhythm: 七列栅格、58px 行高、紧凑分层标题和右侧档案间距让核心信息进入一屏；1338px 宽度检查也无水平溢出。
- Colors and visual tokens: 暖白纸张、夜樱外壳、樱花粉强调及红涨绿跌保留；档案区绿色框文字统一提升为 `#302a2e` 深黑灰。
- Image quality and asset fidelity: 沿用项目现有夜樱侧栏位图与图标库，本次无新增图片资产。
- Copy and content: 删除“观察备注”列；清单说明改为“点击带箭头的表头即可排序”；排序设置按钮改为可用的“恢复默认排序”。
- Interactions: 标的、今日涨跌、成交额、热度比例和自选池排名均支持单击升降序；恢复默认排序可用；排序前后分层结构保持不变。
- Accessibility: 排序按钮提供明确的可访问名称和可见方向箭头；文本对比度明显提升；行键盘操作保留。

## Findings

- No actionable P0/P1/P2 visual, overflow, contrast or interaction differences remain.

## Comparison history

1. First comparison found a P1 horizontal-density issue: the observation-note column consumed the final grid track and forced the user to slide to reach the right side.
2. Removed the note column and rebuilt the table as seven tracks; post-fix full-view evidence shows left index, table and dossier together.
3. First comparison found a P2 interaction issue: the sort control was visual-only and column headings could not change order.
4. Added one-click ascending/descending sorting to five data columns plus a working default-reset control; browser interaction checks confirmed the first row changes and restores correctly.
5. First focused comparison found a P1 contrast issue: dossier metric values, stock codes and section headings were nearly white on the warm paper background.
6. Applied explicit deep ink colors while preserving semantic red/green values; the focused post-fix comparison shows all green-box text clearly readable.

## Implementation checklist

- [x] Observation-note column removed.
- [x] Seven-column responsive grid implemented.
- [x] Five table headers support one-click ascending/descending sorting.
- [x] Default sorting can be restored.
- [x] Desktop spacing compressed without materially shrinking the main type scale.
- [x] Core page fits one 2560 × 1440 desktop viewport.
- [x] Dossier metric values, codes and headings changed to deep black-gray.
- [x] Semantic rise/fall colors preserved.
- [x] Browser interaction and console checks passed.

## Follow-up polish

- P3: On substantially shorter windows, the page remains horizontally complete but may still require vertical scrolling to preserve readable two-line row content.

final result: passed
