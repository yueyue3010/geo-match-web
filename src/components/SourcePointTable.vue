<template>
  <div class="source-point-table">
    <div class="table-header">
      <div class="table-title">
        <span class="title-text">待匹配点</span>
        <span class="title-file" v-if="sourceCollection">（{{ sourceCollection }}）</span>
        <span v-if="matchOperationModeValue === 'batch'" class="selected-count">已选 {{ selectedCount }} 个</span>
      </div>
      <div class="table-tools">
        <template v-if="matchOperationModeValue === 'batch'">
          <el-button
            size="small"
            type="primary"
            plain
            @click="handleSelectAll"
          >
            {{ isAllSelected ? '取消全选' : '全选' }}
          </el-button>
        </template>
        <el-popover
          placement="bottom-end"
          :width="220"
          trigger="click"
          popper-class="column-setting-popover"
        >
          <template #reference>
            <button class="tool-btn" title="列设置">
              <el-icon><Setting /></el-icon>
              <span>列设置</span>
            </button>
          </template>
          <div class="column-setting-panel">
            <div class="panel-title">显示列设置</div>
            <div class="column-list">
              <div
                v-for="col in sourceHeaders"
                :key="col"
                class="column-item"
              >
                <el-checkbox
                  :model-value="sourceVisibleColumns.includes(col)"
                  @change="toggleColumn(col, $event)"
                >
                  {{ col }}
                </el-checkbox>
              </div>
            </div>
            <div class="panel-footer">
              <el-button size="small" type="primary" link @click="selectAllColumns">全选</el-button>
              <el-button size="small" type="primary" link @click="invertColumns">反选</el-button>
              <el-button size="small" type="primary" link @click="resetColumns">重置</el-button>
            </div>
          </div>
        </el-popover>
        <el-button
          type="primary"
          size="small"
          class="only-unmatched-btn"
          :plain="!onlyUnmatched"
          @click="toggleOnlyUnmatched"
        >
          仅看未匹配
        </el-button>
        <el-button
          type="success"
          size="small"
          class="next-unmatched-btn"
          plain
          @click="handleNextUnmatched"
          title="跳转到下一个未匹配点"
        >
          <el-icon><ArrowDown /></el-icon>
          下一个未匹配
        </el-button>
      </div>
    </div>

    <div class="table-body">
      <el-table
        ref="tableRef"
        :data="pagedSourcePoints"
        height="100%"
        width="100%"
        style="width: 100%; table-layout: fixed;"
        border
        resizable
        class="custom-table"
        :row-class-name="tableRowClassName"
        @row-click="handleRowClick"
        @row-dblclick="handleRowDblClick"
        @selection-change="handleSelectionChange"
        highlight-current-row
        row-key="id"
      >
        <el-table-column
          v-if="matchOperationModeValue === 'batch'"
          type="selection"
          width="50"
          align="center"
          fixed="left"
        />
        <el-table-column type="index" width="50" align="center" label="序号" fixed="left" />

        <el-table-column
          v-for="col in displayColumns"
          :key="col"
          :prop="col"
          :label="col"
          min-width="100"
          show-overflow-tooltip
        >
          <template #header="{ column }">
            <div class="table-header-cell">
              <span>{{ column.label }}</span>
              <el-popover
                placement="bottom-start"
                :width="200"
                trigger="click"
                popper-class="filter-popover"
                @show="onFilterPanelShow(col)"
              >
                <template #reference>
                  <el-icon class="filter-icon" :class="{ active: hasFilter(col) }"><Filter /></el-icon>
                </template>
                <div class="filter-panel">
                  <el-input
                    v-model="filterInputValue"
                    size="small"
                    placeholder="输入筛选值"
                    clearable
                    @input="onFilterInput"
                  />
                  <div class="filter-list">
                    <el-checkbox
                      v-model="selectAllFilter"
                      @change="toggleAllFilterValue"
                    >
                      全选
                    </el-checkbox>
                    <div
                      v-for="val in uniqueValues[col] || []"
                      :key="val"
                      class="filter-item"
                    >
                      <el-checkbox
                        :model-value="isFilterValueChecked(col, val)"
                        @change="toggleFilterValue(col, val, $event)"
                      >
                        {{ val === '__EMPTY__' ? '(空)' : val }}
                      </el-checkbox>
                    </div>
                  </div>
                  <div class="filter-footer">
                    <span class="filter-count-tip" v-if="allUniqueValues.length > DISPLAY_LIMIT">
                      共 {{ allUniqueValues.length }} 个值，输入关键字搜索更多
                    </span>
                    <el-button size="small" @click="clearFilter(col)">清除</el-button>
                    <el-button size="small" type="primary" @click="applyFilter(col)">确定</el-button>
                  </div>
                </div>
              </el-popover>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="table-footer">
      <el-pagination
        v-model:current-page="localPage"
        v-model:page-size="localPageSize"
        :total="filteredSourcePoints.length"
        layout="total, sizes, prev, pager, next"
        :page-sizes="[10, 20, 50, 100]"
        size="small"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { Setting, ArrowDown, Filter } from '@element-plus/icons-vue'

const tableRef = ref(null)

const matchStore = useMatchStore()
const {
  pagedSourcePoints,
  sourceCollection,
  currentSourcePoint,
  currentPage,
  pageSize,
  searchKeyword,
  onlyUnmatched,
  filteredSourcePoints,
  sourceHeaders,
  sourceVisibleColumns,
  sourceColumnFilters,
  sourcePoints,
  matchOperationMode,
  selectedSourceIds,
} = storeToRefs(matchStore)

const matchOperationModeValue = matchOperationMode

const localPage = ref(1)
const localPageSize = ref(10)
const localSearchKeyword = ref('')
const filterInputValue = ref('')
const selectAllFilter = ref(false)
const currentFilterCol = ref('')
const tempFilterValues = ref([])
const uniqueValues = ref({})

const selectedId = computed(() => currentSourcePoint.value?.id ?? null)

const displayColumns = computed(() => {
  return sourceHeaders.value.filter(h => sourceVisibleColumns.value.includes(h))
})

const selectedCount = computed(() => selectedSourceIds.value.size)

const isAllSelected = computed(() => {
  if (pagedSourcePoints.value.length === 0) return false
  return pagedSourcePoints.value.every(p => selectedSourceIds.value.has(p.id))
})

watch(currentPage, (val) => { localPage.value = val })
watch(pageSize, (val) => { localPageSize.value = val })
watch(searchKeyword, (val) => { localSearchKeyword.value = val })

// 切换出批量模式时清空勾选状态
watch(matchOperationMode, (val) => {
  if (val !== 'batch') {
    selectedSourceIds.value = new Set()
    nextTick(() => {
      tableRef.value?.clearSelection()
    })
  }
})

function onSearchChange() {
  matchStore.searchKeyword = localSearchKeyword.value
  matchStore.currentPage = 1
  localPage.value = 1
}

function toggleOnlyUnmatched() {
  matchStore.onlyUnmatched = !matchStore.onlyUnmatched
  matchStore.currentPage = 1
  localPage.value = 1
}

function onPageChange(page) {
  matchStore.currentPage = page
}

function onPageSizeChange(size) {
  matchStore.pageSize = size
  matchStore.currentPage = 1
  localPage.value = 1
}

function tableRowClassName({ row }) {
  if (row.id === selectedId.value) return 'row-selected'
  if (matchStore.isPointMatched(row)) return 'row-matched'
  return ''
}

function handleRowClick(row, column) {
  // 点击勾选框列时不触发地图跳转
  if (column && column.type === 'selection') return
  matchStore.selectSourcePoint(row)
}

function handleRowDblClick(row, column) {
  if (column && column.type === 'selection') return
  matchStore.selectSourcePoint(row)
  matchStore.findCandidates()
}

function handleNextUnmatched() {
  const allPoints = filteredSourcePoints.value
  const currentIdx = allPoints.findIndex((p) => p.id === selectedId.value)
  let foundIdx = -1
  for (let i = currentIdx + 1; i < allPoints.length; i++) {
    if (matchStore.isPointUnmatched(allPoints[i])) {
      foundIdx = i
      break
    }
  }
  if (foundIdx === -1) {
    for (let i = 0; i < currentIdx; i++) {
      if (matchStore.isPointUnmatched(allPoints[i])) {
        foundIdx = i
        break
      }
    }
  }
  if (foundIdx >= 0) {
    const targetPage = Math.floor(foundIdx / localPageSize.value) + 1
    matchStore.currentPage = targetPage
    localPage.value = targetPage
    matchStore.selectSourcePoint(allPoints[foundIdx])
  } else {
    ElMessage.info('没有更多未匹配的点了')
  }
}

function handleSelectionChange(rows) {
  // 同步 Element Plus 表格的选择状态到 store（用新 Set 替换保证响应式）
  selectedSourceIds.value = new Set(rows.map(r => r.id))
}

function handleSelectAll() {
  // 直接调用表格原生全选切换
  tableRef.value?.toggleAllSelection()
}

function toggleColumn(col, visible) {
  const idx = sourceVisibleColumns.value.indexOf(col)
  if (visible && idx === -1) {
    sourceVisibleColumns.value.push(col)
  } else if (!visible && idx > -1) {
    sourceVisibleColumns.value.splice(idx, 1)
  }
}

function selectAllColumns() {
  sourceVisibleColumns.value = [...sourceHeaders.value]
}

function invertColumns() {
  sourceVisibleColumns.value = sourceHeaders.value.filter(h => !sourceVisibleColumns.value.includes(h))
}

function resetColumns() {
  sourceVisibleColumns.value = [...sourceHeaders.value]
}

function hasFilter(col) {
  return sourceColumnFilters.value[col] && sourceColumnFilters.value[col].length > 0
}

function getColDisplayValue(val) {
  if (val === null || val === undefined || val === '') return '__EMPTY__'
  return String(val)
}

function getColRawValue(val) {
  return val
}

const DISPLAY_LIMIT = 200
let allUniqueValues = []

function onFilterPanelShow(col) {
  currentFilterCol.value = col
  filterInputValue.value = ''
  allUniqueValues = [...new Set(filteredSourcePoints.value.map(p => {
    const v = p[col]
    if (v === null || v === undefined || v === '') return '__EMPTY__'
    return String(v)
  }))]
  const displayVals = allUniqueValues.slice(0, DISPLAY_LIMIT)
  uniqueValues.value = { ...uniqueValues.value, [col]: displayVals }
  tempFilterValues.value = [...(sourceColumnFilters.value[col] || [])]
  selectAllFilter.value = tempFilterValues.value.length === allUniqueValues.length
}

function onFilterInput() {
  const col = currentFilterCol.value
  if (!filterInputValue.value) {
    uniqueValues.value = { ...uniqueValues.value, [col]: allUniqueValues.slice(0, DISPLAY_LIMIT) }
    return
  }
  const kw = filterInputValue.value.toLowerCase()
  const filtered = allUniqueValues.filter(v => v.toLowerCase().includes(kw))
  uniqueValues.value = { ...uniqueValues.value, [col]: filtered.slice(0, DISPLAY_LIMIT) }
}

function isFilterValueChecked(col, val) {
  return tempFilterValues.value.includes(val)
}

function toggleFilterValue(col, val, checked) {
  const idx = tempFilterValues.value.indexOf(val)
  if (checked && idx === -1) {
    tempFilterValues.value.push(val)
  } else if (!checked && idx > -1) {
    tempFilterValues.value.splice(idx, 1)
  }
  selectAllFilter.value = tempFilterValues.value.length === allUniqueValues.length
}

function toggleAllFilterValue(checked) {
  const col = currentFilterCol.value
  if (checked) {
    tempFilterValues.value = [...allUniqueValues]
  } else {
    tempFilterValues.value = []
  }
}

function clearFilter(col) {
  tempFilterValues.value = []
  matchStore.sourceColumnFilters = { ...sourceColumnFilters.value, [col]: [] }
  matchStore.currentPage = 1
  localPage.value = 1
}

function applyFilter(col) {
  matchStore.sourceColumnFilters = { ...sourceColumnFilters.value, [col]: [...tempFilterValues.value] }
  matchStore.currentPage = 1
  localPage.value = 1
}

function doLayout() {
  tableRef.value?.doLayout?.()
}

defineExpose({ doLayout })
</script>

<style scoped>
.source-point-table {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  border-radius: 8px;
  overflow: hidden;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
  min-height: 48px;
}

.table-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.title-text {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
}

.title-file {
  font-size: 13px;
  color: #86909c;
}

.title-count {
  font-size: 13px;
  color: #1677ff;
  background: #e8f3ff;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 4px;
}

.selected-count {
  font-size: 13px;
  color: #00b42a;
  background: #f6ffed;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 6px;
  font-weight: 500;
}

.table-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-btn {
  height: 32px;
  padding: 0 10px;
  border: 1px solid #e5e6eb;
  background: #ffffff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: #4e5969;
  font-size: 12px;
  transition: all 0.2s;
}

.tool-btn:hover {
  border-color: #1677ff;
  color: #1677ff;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: #86909c;
  font-size: 14px;
  z-index: 1;
}

.search-input {
  width: 160px;
  height: 32px;
  padding: 0 10px 0 32px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  background: #ffffff;
}

.search-input:focus {
  border-color: #1677ff;
}

.search-input::placeholder {
  color: #c9cdd4;
}

.only-unmatched-btn {
  height: 32px !important;
}

.next-unmatched-btn {
  height: 32px !important;
  display: flex;
  align-items: center;
  gap: 4px;
}

.table-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.custom-table {
  width: 100%;
}

.table-header-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.filter-icon {
  cursor: pointer;
  color: #c9cdd4;
  font-size: 12px;
  transition: color 0.2s;
  flex-shrink: 0;
}

.filter-icon:hover {
  color: #1677ff;
}

.filter-icon.active {
  color: #1677ff;
}

.source-point-table :deep(.el-table th .cell) {
  white-space: nowrap !important;
  writing-mode: horizontal-tb !important;
  text-orientation: mixed !important;
}

.source-point-table :deep(.el-table th.el-table__column) {
  border-right: 1px solid #e5e6eb;
}

.source-point-table :deep(.el-table th.el-table__column:hover) {
  border-right-color: #1677ff;
}

.source-point-table :deep(.el-table .el-table__column-resize-proxy) {
  border-left: 1px solid #1677ff;
}

.source-point-table :deep(.el-table--border .el-table__cell) {
  border-right: 1px solid #ecf0f3;
}

.source-point-table :deep(.el-table .el-table__header-wrapper) {
  border-right: 1px solid #e5e6eb;
}

.source-point-table :deep(.el-table .el-table__body-wrapper) {
  border-right: 1px solid #e5e6eb;
}

.source-point-table :deep(.el-table__row.row-selected > td) {
  background-color: #e8f3ff !important;
}

.source-point-table :deep(.el-table__row.row-matched > td) {
  background-color: #f6ffed;
}

.table-footer {
  padding: 8px 14px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}
</style>

<style>
.column-setting-popover .el-popover__content {
  padding: 12px;
}

.column-setting-panel .panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8px;
}

.column-setting-panel .column-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.column-setting-panel .column-item {
  padding: 4px 0;
}

.column-setting-panel .panel-footer {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.filter-popover .el-popover__content {
  padding: 10px;
}

.filter-panel .filter-list {
  max-height: 200px;
  overflow-y: auto;
  margin-top: 8px;
  margin-bottom: 8px;
}

.filter-panel .filter-item {
  padding: 3px 0;
}

.filter-panel .filter-footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
  align-items: center;
}

.filter-count-tip {
  flex: 1;
  font-size: 12px;
  color: #86909c;
}
</style>
