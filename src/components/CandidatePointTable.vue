<template>
  <div class="candidate-point-table">
    <div class="table-header">
      <div class="table-title">
        <span class="title-text">候选匹配点</span>
        <span class="title-file" v-if="targetCollection">（{{ targetCollection }}）</span>
        <span class="title-count" v-if="candidatePoints.length > 0">
          <template v-if="bothHaveCoordinates">共 {{ candidatePoints.length }} 条（缓冲区内）</template>
          <template v-else>共 {{ candidatePoints.length }} 条（文本匹配）</template>
        </span>
      </div>
      <div class="table-tools">
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
            <div class="panel-title">原始字段</div>
            <div class="column-list">
              <div
                v-for="col in targetHeaders"
                :key="col"
                class="column-item"
              >
                <el-checkbox
                  :model-value="targetVisibleColumns.includes(col)"
                  @change="toggleTargetColumn(col, $event)"
                >
                  {{ col }}
                </el-checkbox>
              </div>
            </div>
            <div class="panel-divider"></div>
            <div class="panel-title">匹配分析字段</div>
            <div class="column-list">
              <div class="column-item" v-if="bothHaveCoordinates">
                <el-checkbox
                  :model-value="showDistance"
                  @change="showDistance = $event"
                >
                  距离
                </el-checkbox>
              </div>
              <div class="column-item">
                <el-checkbox
                  :model-value="showNameScore"
                  @change="showNameScore = $event"
                >
                  名称得分
                </el-checkbox>
              </div>
              <div class="column-item">
                <el-checkbox
                  :model-value="showAddrScore"
                  @change="showAddrScore = $event"
                >
                  地址得分
                </el-checkbox>
              </div>
              <div class="column-item">
                <el-checkbox
                  :model-value="showTotalScore"
                  @change="showTotalScore = $event"
                >
                  综合得分
                </el-checkbox>
              </div>
              <div class="column-item">
                <el-checkbox
                  :model-value="showConflict"
                  @change="showConflict = $event"
                >
                  冲突说明
                </el-checkbox>
              </div>
            </div>
            <div class="panel-footer">
              <el-button size="small" type="primary" link @click="selectAllTargetColumns">全选</el-button>
              <el-button size="small" type="primary" link @click="resetTargetColumns">重置</el-button>
            </div>
          </div>
        </el-popover>
      </div>
    </div>

    <div class="table-body">
      <el-table
        ref="tableRef"
        :data="filteredCandidatePoints"
        height="100%"
        width="100%"
        style="width: 100%; table-layout: fixed;"
        border
        resizable
        class="custom-table"
        :row-class-name="tableRowClassName"
        highlight-current-row
        @row-click="handleRowClick"
        @row-dblclick="handleRowDblClick"
      >
        <el-table-column width="40" align="center" fixed="left">
          <template #default="{ row }">
            <el-radio v-model="selectedCandidateId" :label="row.id" class="candidate-radio" />
          </template>
        </el-table-column>

        <el-table-column
          v-for="col in displayTargetColumns"
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
                @show="onTargetFilterPanelShow(col)"
              >
                <template #reference>
                  <el-icon class="filter-icon" :class="{ active: hasTargetFilter(col) }"><Filter /></el-icon>
                </template>
                <div class="filter-panel">
                  <el-input
                    v-model="targetFilterInputValue"
                    size="small"
                    placeholder="输入筛选值"
                    clearable
                    @input="onTargetFilterInput"
                  />
                  <div class="filter-list">
                    <el-checkbox
                      v-model="targetSelectAllFilter"
                      @change="toggleAllTargetFilterValue"
                    >
                      全选
                    </el-checkbox>
                    <div
                      v-for="val in targetUniqueValues[col] || []"
                      :key="val"
                      class="filter-item"
                    >
                      <el-checkbox
                        :model-value="isTargetFilterValueChecked(col, val)"
                        @change="toggleTargetFilterValue(col, val, $event)"
                      >
                        {{ val === '__EMPTY__' ? '(空)' : val }}
                      </el-checkbox>
                    </div>
                  </div>
                  <div class="filter-footer">
                    <span class="filter-count-tip" v-if="allTargetUniqueValues.length > TARGET_DISPLAY_LIMIT">
                      共 {{ allTargetUniqueValues.length }} 个值，输入关键字搜索更多
                    </span>
                    <el-button size="small" @click="clearTargetFilter(col)">清除</el-button>
                    <el-button size="small" type="primary" @click="applyTargetFilter(col)">确定</el-button>
                  </div>
                </div>
              </el-popover>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="showDistance && bothHaveCoordinates" prop="distance" label="距离(m)" width="90" align="center">
          <template #default="{ row }">
            <span class="distance-text" :class="getDistanceClass(row.distance)">
              {{ row.distance !== undefined ? row.distance.toFixed(1) : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column v-if="showNameScore" prop="nameScore" label="名称得分" width="90" align="center">
          <template #default="{ row }">
            <span class="score-text" :style="{ color: getScoreColor100(row.nameScore) }">
              {{ row.nameScore !== undefined ? row.nameScore : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column v-if="showAddrScore" prop="addrScore" label="地址得分" width="90" align="center">
          <template #default="{ row }">
            <span class="score-text" :style="{ color: getScoreColor100(row.addrScore) }">
              {{ row.addrScore !== undefined ? row.addrScore : '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column v-if="showTotalScore" prop="totalScore" label="综合得分" width="100" align="center">
          <template #default="{ row }">
            <div class="score-cell">
              <span class="score-text total" :style="{ color: getScoreColor100(row.totalScore / 2) }">
                {{ row.totalScore !== undefined ? row.totalScore : '-' }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="showConflict" prop="conflict" label="冲突说明" min-width="140" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.conflict" size="small" type="warning">{{ row.conflict }}</el-tag>
            <span v-else class="score-text">-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }">
            <button
              class="locate-btn"
              :class="{ 'is-disabled': !bothHaveCoordinates }"
              :title="bothHaveCoordinates ? '地图定位' : '无经纬度坐标，无法定位'"
              @click="handleLocate(row)"
            >
              <el-icon><Location /></el-icon>
              <span>定位</span>
            </button>
          </template>
        </el-table-column>
        <el-table-column label="确认" width="65" align="center" fixed="right">
          <template #default="{ row }">
            <button
              class="confirm-btn"
              :class="{ 'is-confirmed': row.confirmed }"
              title="确认匹配"
              @click="handleConfirm(row)"
            >
              <el-icon :size="18"><Check /></el-icon>
            </button>
          </template>
        </el-table-column>

        <template #empty>
          <div class="table-empty-content">
            <svg viewBox="0 0 1024 1024" width="60" height="60" fill="#d9d9d9">
              <path d="M908.1 155.1l-49.6-49.6c-10-10-24.8-15.1-39.6-15.1H165.6c-14.8 0-29.6 5.1-39.6 15.1l-49.6 49.6c-10 10-15.1 24.8-15.1 39.6v656.6c0 14.8 5.1 29.6 15.1 39.6l49.6 49.6c10 10 24.8 15.1 39.6 15.1h692.9c14.8 0 29.6-5.1 39.6-15.1l49.6-49.6c10-10 15.1-24.8 15.1-39.6V194.7c0-14.8-5.1-29.6-15.1-39.6zM402.4 856.8V486.9h219.2v369.9H402.4zM608.1 296.7c0 47.1-38.1 85.3-85.3 85.3-47.1 0-85.3-38.1-85.3-85.3s38.1-85.3 85.3-85.3c47.1 0 85.3 38.1 85.3 85.3z"/>
            </svg>
            <div class="empty-text">
              <p class="empty-title">暂无候选数据</p>
              <p class="empty-step">1. 在左侧表格选择一个待匹配点</p>
              <p class="empty-step">2. 点击"开始匹配"查找候选点</p>
            </div>
          </div>
        </template>
      </el-table>
    </div>

    <div class="table-footer" v-if="candidatePoints.length > 0">
      <div class="footer-left">
        综合排序 · 综合得分≥70 <span class="highlight">{{ highConfidenceCount }}</span> 个
      </div>
      <div class="footer-right">
        <el-button type="warning" size="small" @click="handleMarkNone">
          <el-icon><Close /></el-icon>
          标记无匹配
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, Filter, Location, Check, Close } from '@element-plus/icons-vue'

const matchStore = useMatchStore()
const { candidatePoints, targetCollection, isMatching, targetHeaders, targetVisibleColumns, targetColumnFilters, selectedCandidateId, bothHaveCoordinates } = storeToRefs(matchStore)

const tableRef = ref(null)

const showDistance = ref(true)
const showNameScore = ref(true)
const showAddrScore = ref(true)
const showTotalScore = ref(true)
const showConflict = ref(true)

// 无坐标模式下：自动关闭距离列，并且不允许再打开
watch(
  bothHaveCoordinates,
  (hasCoords) => {
    if (!hasCoords) showDistance.value = false
  },
  { immediate: true }
)

const targetFilterInputValue = ref('')
const targetSelectAllFilter = ref(false)
const currentTargetFilterCol = ref('')
const tempTargetFilterValues = ref([])
const targetUniqueValues = ref({})

const displayTargetColumns = computed(() => {
  return targetHeaders.value.filter(h => targetVisibleColumns.value.includes(h))
})

const highConfidenceCount = computed(() => {
  return candidatePoints.value.filter((p) => (p.totalScore || 0) >= 70).length
})

const filteredCandidatePoints = computed(() => {
  let result = [...candidatePoints.value]
  const filters = targetColumnFilters.value
  const filterKeys = Object.keys(filters).filter(k => filters[k] && filters[k].length > 0)
  if (filterKeys.length > 0) {
    result = result.filter((p) => {
      return filterKeys.every(key => {
        const filterVals = filters[key]
        const cellVal = p[key]
        return filterVals.some(fv => {
          if (fv === '__EMPTY__') {
            return cellVal === null || cellVal === undefined || cellVal === ''
          }
          return String(cellVal ?? '') === String(fv)
        })
      })
    })
  }
  return result
})

function tableRowClassName({ rowIndex }) {
  return rowIndex === 0 ? 'row-highlight' : ''
}

function handleRowClick(row) {
  selectedCandidateId.value = row.id
}

function handleCheck(row, checked) {
  selectedCandidateId.value = row.id
}

function handleLocate(row) {
  if (!bothHaveCoordinates.value) {
    ElMessage.warning('当前数据无经纬度坐标，无法在地图上定位')
    return
  }
  matchStore.locateCandidate(row)
}

function handleConfirm(row) {
  // 如果当前已有确认的候选点（且不是当前点击的行），提示先撤回
  const hasConfirmedOther = candidatePoints.value.some(c => c.confirmed && c.id !== row.id)
  if (hasConfirmedOther) {
    ElMessage.warning('请先点击顶部的"撤回匹配"，再进行勾选切换')
    return
  }
  matchStore.confirmMatch(row)
}

function handleRowDblClick(row) {
  handleConfirm(row)
}

async function handleMarkNone() {
  try {
    await ElMessageBox.confirm(
      '确认该点无匹配结果，并将 ' + matchStore.getSourceUvField() + ' 写入 0 吗？',
      '标记无匹配',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
    await matchStore.markAsNoMatch()
    ElMessage.success('已标记为无匹配')
  } catch { /* 取消 */ }
}

function toggleTargetColumn(col, visible) {
  const idx = targetVisibleColumns.value.indexOf(col)
  if (visible && idx === -1) {
    targetVisibleColumns.value.push(col)
  } else if (!visible && idx > -1) {
    targetVisibleColumns.value.splice(idx, 1)
  }
}

function selectAllTargetColumns() {
  targetVisibleColumns.value = [...targetHeaders.value]
  if (bothHaveCoordinates.value) showDistance.value = true
  showNameScore.value = true
  showAddrScore.value = true
  showTotalScore.value = true
  showConflict.value = true
}

function resetTargetColumns() {
  targetVisibleColumns.value = [...targetHeaders.value]
  if (bothHaveCoordinates.value) showDistance.value = true
  showNameScore.value = true
  showAddrScore.value = true
  showTotalScore.value = true
  showConflict.value = true
}

function hasTargetFilter(col) {
  return targetColumnFilters.value[col] && targetColumnFilters.value[col].length > 0
}

const TARGET_DISPLAY_LIMIT = 200
let allTargetUniqueValues = []

function onTargetFilterPanelShow(col) {
  currentTargetFilterCol.value = col
  targetFilterInputValue.value = ''
  allTargetUniqueValues = [...new Set(filteredCandidatePoints.value.map(p => {
    const v = p[col]
    if (v === null || v === undefined || v === '') return '__EMPTY__'
    return String(v)
  }))]
  const displayVals = allTargetUniqueValues.slice(0, TARGET_DISPLAY_LIMIT)
  targetUniqueValues.value = { ...targetUniqueValues.value, [col]: displayVals }
  tempTargetFilterValues.value = [...(targetColumnFilters.value[col] || [])]
  targetSelectAllFilter.value = tempTargetFilterValues.value.length === allTargetUniqueValues.length
}

function onTargetFilterInput() {
  const col = currentTargetFilterCol.value
  if (!targetFilterInputValue.value) {
    targetUniqueValues.value = { ...targetUniqueValues.value, [col]: allTargetUniqueValues.slice(0, TARGET_DISPLAY_LIMIT) }
    return
  }
  const kw = targetFilterInputValue.value.toLowerCase()
  const filtered = allTargetUniqueValues.filter(v => v.toLowerCase().includes(kw))
  targetUniqueValues.value = { ...targetUniqueValues.value, [col]: filtered.slice(0, TARGET_DISPLAY_LIMIT) }
}

function isTargetFilterValueChecked(col, val) {
  return tempTargetFilterValues.value.includes(val)
}

function toggleTargetFilterValue(col, val, checked) {
  const idx = tempTargetFilterValues.value.indexOf(val)
  if (checked && idx === -1) {
    tempTargetFilterValues.value.push(val)
  } else if (!checked && idx > -1) {
    tempTargetFilterValues.value.splice(idx, 1)
  }
  targetSelectAllFilter.value = tempTargetFilterValues.value.length === allTargetUniqueValues.length
}

function toggleAllTargetFilterValue(checked) {
  const col = currentTargetFilterCol.value
  if (checked) {
    tempTargetFilterValues.value = [...allTargetUniqueValues]
  } else {
    tempTargetFilterValues.value = []
  }
}

function clearTargetFilter(col) {
  tempTargetFilterValues.value = []
  matchStore.targetColumnFilters = { ...targetColumnFilters.value, [col]: [] }
}

function applyTargetFilter(col) {
  matchStore.targetColumnFilters = { ...targetColumnFilters.value, [col]: [...tempTargetFilterValues.value] }
}

function getDistanceClass(distance) {
  if (distance === undefined) return ''
  if (distance <= 100) return 'dist-close'
  if (distance <= 300) return 'dist-medium'
  return 'dist-far'
}

function getScoreColor(score) {
  if (score === undefined) return '#86909c'
  if (score >= 0.7) return '#00b42a'
  if (score >= 0.5) return '#1677ff'
  if (score >= 0.3) return '#ff7d00'
  return '#f53f3f'
}

function getScoreColor100(score) {
  if (score === undefined) return '#86909c'
  if (score >= 80) return '#00b42a'
  if (score >= 60) return '#1677ff'
  if (score >= 40) return '#ff7d00'
  return '#f53f3f'
}

function doLayout() {
  tableRef.value?.doLayout?.()
}

defineExpose({ doLayout })
</script>

<style scoped>
.candidate-point-table {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.table-header {
  display: flex;
  flex-direction: row;
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

.refresh-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #e5e6eb;
  background: #ffffff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #4e5969;
  transition: all 0.2s;
  padding: 0;
}

.refresh-btn:hover {
  border-color: #1677ff;
  color: #1677ff;
}

.export-btn {
  height: 32px !important;
}

.table-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
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

.candidate-point-table :deep(.el-table th .cell) {
  white-space: nowrap !important;
  writing-mode: horizontal-tb !important;
  text-orientation: mixed !important;
}

.candidate-point-table :deep(.el-table--border .el-table__cell) {
  border-right: 1px solid #ecf0f3;
}

.candidate-point-table :deep(.el-table th.el-table__column) {
  border-right: 1px solid #e5e6eb;
}

.candidate-point-table :deep(.el-table th.el-table__column:hover) {
  border-right-color: #1677ff;
}

.candidate-point-table :deep(.el-table .el-table__header-wrapper) {
  border-right: 1px solid #e5e6eb;
}

.candidate-point-table :deep(.el-table .el-table__body-wrapper) {
  border-right: 1px solid #e5e6eb;
}

.candidate-point-table :deep(.el-table .el-table__column-resize-proxy) {
  border-left: 1px solid #1677ff;
}

.candidate-point-table :deep(.el-table .caret-wrapper) {
  color: #c9cdd4;
}

.candidate-point-table :deep(.el-table .caret-wrapper:hover) {
  color: #1677ff;
}

.candidate-point-table :deep(.el-table__empty-text) {
  display: none;
}

.custom-table :deep(.el-table__row.row-highlight > td) {
  background-color: #f6ffed;
}

.distance-text {
  font-size: 12px;
  font-weight: 500;
}

.distance-text.dist-close {
  color: #00b42a;
}

.distance-text.dist-medium {
  color: #1677ff;
}

.distance-text.dist-far {
  color: #ff7d00;
}

.candidate-radio {
  margin-right: 0;
}

.score-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
}

.score-bar-bg {
  flex: 1;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
  min-width: 30px;
}

.score-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.score-text {
  font-size: 12px;
  font-weight: 600;
  min-width: 20px;
  text-align: right;
}

.locate-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #1677ff;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.2s;
}

.locate-btn:hover {
  background: #e8f3ff;
}

.locate-btn.is-disabled {
  color: #c9cdd4;
  cursor: not-allowed;
  opacity: 0.6;
  background: transparent !important;
}

.confirm-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #e5e6eb;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #c9cdd4;
  transition: all 0.2s;
  padding: 0;
}

.confirm-btn:hover {
  border-color: #00b42a;
  color: #00b42a;
  background: #f6ffed;
}

.confirm-btn.is-confirmed {
  background: #00b42a;
  border-color: #00b42a;
  color: #ffffff;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
  min-height: 44px;
}

.footer-left {
  font-size: 13px;
  color: #4e5969;
}

.footer-left .highlight {
  color: #00b42a;
  font-weight: 600;
}

.table-empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
}

.table-empty-content .empty-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.table-empty-content .empty-text p {
  margin: 0;
}

.table-empty-content .empty-title {
  font-size: 14px;
  color: #86909c;
  font-weight: 500;
}

.table-empty-content .empty-step {
  font-size: 12px;
  color: #86909c;
  line-height: 1.6;
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

.column-setting-panel .panel-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 10px 0;
}

.column-setting-panel .column-list {
  max-height: 180px;
  overflow-y: auto;
  margin-bottom: 4px;
}

.column-setting-panel .column-item {
  padding: 3px 0;
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
