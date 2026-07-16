# Design QA — 虚拟账户与自选监控

## Comparison targets

- 虚拟账户 source visual truth: `/Users/liyuening/.codex/generated_images/019f692b-bc26-7b62-a42e-c589c6fc684a/exec-208f58c5-9690-4dc8-a1b0-c41cba58041d.png`
- 虚拟账户 implementation: `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/paperPortfolio-redesign-final.png`
- 自选监控 source visual truth: `/Users/liyuening/.codex/generated_images/019f692b-bc26-7b62-a42e-c589c6fc684a/exec-8b5d37d1-ea0b-47d5-9844-9809873e85c4.png`
- 自选监控 implementation: `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/monitoringGroups-watchbook-final.png`
- Viewport: 1440 × 1024 desktop; responsive overflow also checked at 1180 × 900.
- State: 虚拟账户为当前真实空账户状态；自选监控为默认选中“人工智能与算力”的本地模拟数据状态。

## Full-view comparison evidence

- 虚拟账户保留了定稿的六项指标带、左侧资产曲线、右侧策略与风控状态、下方持仓和近期成交双栏结构。当前 Supabase 账户尚无持仓或成交，因此图表和表格展示产品真实空状态；这是数据状态差异，不是布局漂移。
- 自选监控复现了定稿的暖白纸张画布、晨间观察册标题、顶端信号摘要、左侧监控组、中央分级观察清单和右侧主题档案。页面与全局深色夜樱侧栏形成明确但协调的层次。
- 两页在 1440 宽度无横向溢出，主要区域、操作按钮与页面底部说明均可见。1180 宽度下页面按预定断点重排，`scrollWidth` 与 `clientWidth` 一致。

## Focused region comparison evidence

- 虚拟账户重点检查了指标带、资产曲线区间切换、风控四项指标、主次操作按钮、持仓表头和成交空状态；层级、边框、颜色语义和交互状态与定稿一致。
- 自选监控重点检查了分组选中态、三档观察区标题、行内涨跌/热度/Top50 数据、备注输入、右侧领涨领跌与历史记录。实际操作验证了保存时间回写、备注编辑、仅看重点筛选和详情抽屉。

## Required fidelity surfaces

- Fonts and typography: 深色页面使用苹方/日文字体回退，观察册标题使用宋体回退，数字使用等宽数字特性；字号和字重层级与参考一致，无关键文字截断。
- Spacing and layout rhythm: 主要栅格、卡片间距、分隔线、页面边距和桌面断点已对齐；观察册采用连续纸张式表格，避免了多余浮卡。
- Colors and visual tokens: 夜樱深蓝、樱花粉、A 股红涨绿跌以及暖白观察册色板均一致；焦点和选中状态清晰。
- Image quality and asset fidelity: 复用现有高质量夜樱侧栏位图；参考图没有其他必须生成的独立图片资产。未以 CSS 图形或自绘 SVG 替代视觉资产。
- Copy and content: 保留 A 股、人民币、Top50、热度、模拟数据与投资风险说明；文案与页面任务一致。
- Icons: 使用现有统一图标库，尺寸与线条风格一致，无文本符号代替交互图标。
- States and interactions: 账户加载/空状态、区间切换、导出、刷新、分组切换、保存、备注、重点筛选及详情抽屉均已覆盖；浏览器控制台无错误或警告。
- Accessibility: 核心按钮有可访问名称，观察行支持键盘 Enter/Space，输入框有占位说明，聚焦状态由全局主题提供。

## Findings

- No actionable P0/P1/P2 visual or interaction differences remain.

## Open questions

- None blocking. 虚拟账户上线后会继续展示实际 Supabase 账户数据；空状态不会用虚构持仓填充。

## Comparison history

1. First pass found a P1 color-token conflict: the global `.night-sakura main` selector made the observation list center dark instead of warm white.
2. Fixed by explicitly scoping the nested watchbook main surface to a transparent paper background and ink text.
3. Post-fix capture `/Users/liyuening/Documents/China A Share Dashboard/artifacts/design-qa/monitoringGroups-watchbook-final.png` confirms the entire three-column observation surface is consistently warm white.
4. Accessibility pass replaced a button containing inputs with a keyboard-enabled row container so note fields are valid interactive controls.
5. Post-fix build, interaction checks, 1440 comparison captures, and 1180 overflow checks passed with no console errors.

## Implementation checklist

- [x] 虚拟账户 option 1 implemented.
- [x] 自选监控 option 3 implemented.
- [x] Core interactions verified.
- [x] Desktop and narrower desktop layouts checked.
- [x] Production build passed.

## Follow-up polish

- P3: 当账户积累更多快照、持仓和交易后，资产曲线与下方表格会自然达到参考图的视觉密度。

final result: passed
