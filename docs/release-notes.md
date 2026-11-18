# JSON Grid 0.2.3

- 源码折叠箭头与行号垂直居中，长行换行时仍对齐首行。
- 对象网格直接显示键和值，移除表头、顶部「JSON 数据」和底部汇总；嵌套对象同样适用。
- 所有数组网格的 `#` 行号从 1 开始，排序和筛选时保留原始行号；JSONPath 继续使用零基下标。
- 表头和行号列同色，与数据区域区分；深色主题下略亮，浅色主题下略深。
- 仅在需要翻页时于表格上方显示分页控件，保留列宽调整、数组列筛选和排序。

MIT licensed. The universal `.dbxp` is an unsigned candidate for DBX Store review.
