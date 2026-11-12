<template>
  <el-dialog
    v-model="visible"
    title="撤回匹配"
    width="420px"
    class="undo-match-dialog"
    :close-on-click-modal="false"
  >
    <div class="dialog-content">
      <div class="undo-tabs">
        <div 
          class="tab-item" 
          :class="{ active: activeTab === 'current' }"
          @click="activeTab = 'current'"
        >
          撤回当前点
        </div>
        <div 
          class="tab-item" 
          :class="{ active: activeTab === 'batch' }"
          @click="activeTab = 'batch'"
        >
          撤回最近批量
        </div>
        <div 
          class="tab-item" 
          :class="{ active: activeTab === 'search' }"
          @click="activeTab = 'search'"
        >
          按ID搜索撤回
        </div>
      </div>

      <div v-if="activeTab === 'current'" class="current-point-section">
        <div v-if="currentSourcePoint && matchStore.isPointMatched(currentSourcePoint)" class="point-info">
          <div class="info-row">
            <span class="info-label">待匹配点：</span>
            <span class="info-value">{{ currentSourcePoint[nameField] }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">已匹配 {{ uvField }}：</span>
            <span class="info-value highlight">{{ currentSourcePoint[uvField] }}</span>
          </div>
          <div class="warning-text">
            <el-icon color="#ff7d00"><Warning /></el-icon>
            <span>撤回后 {{ uvField }} 将清空，状态变为"未匹配"</span>
          </div>
        </div>
        <div v-else class="empty-tip">
          <el-empty description="当前选择的点未匹配或未选择点" :image-size="60" />
        </div>
      </div>

      <div v-if="activeTab === 'batch'" class="batch-section">
        <div v-if="lastBatchCount > 0">
          <div class="batch-header">
            <span class="header-text">最近批量匹配：{{ lastBatchCount }} 个点</span>
            <el-button
              size="small"
              type="primary"
              plain
              @click="toggleSelectAllUndo"
            >
              {{ isAllUndoSelected ? '取消全选' : '全选' }}
            </el-button>
          </div>
          <div class="batch-list">
            <div
              v-for="point in lastBatchPoints"
              :key="point.id"
              class="batch-item"
            >
              <el-checkbox
                v-model="selectedUndoIds"
                :value="point.id"
              />
              <div class="batch-item-content">
                <div class="item-name">{{ point[nameField] }}</div>
                <div class="item-uv">{{ uvField }}: {{ point[uvField] }}</div>
              </div>
            </div>
          </div>
          <div class="warning-text" v-if="selectedUndoIds.length > 0">
            <el-icon color="#ff7d00"><Warning /></el-icon>
            <span>撤回后将恢复选中 {{ selectedUndoIds.length }} 个点的原始匹配状态</span>
          </div>
        </div>
        <div v-else class="empty-tip">
          <el-empty description="没有可撤回的最近批量匹配记录" :image-size="60" />
        </div>
      </div>

      <div v-if="activeTab === 'search'" class="search-section">
        <div class="form-item">
          <label class="form-label">输入要撤回的 {{ uvField }}</label>
          <el-input 
            v-model="undoId" 
            :placeholder="`请输入 ${uvField}`"
            size="default"
            class="form-input"
            clearable
          />
        </div>
        <div class="search-result" v-if="searchResult">
          <div class="result-title">找到匹配记录：</div>
          <div class="result-info">
            <div class="info-row">
              <span class="info-label">待匹配点：</span>
              <span class="info-value">{{ searchResult[nameField] }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">地址：</span>
              <span class="info-value">{{ searchResult[addrField] }}</span>
            </div>
          </div>
        </div>
        <div class="form-tip">
          <el-icon color="#86909c"><InfoFilled /></el-icon>
          <span>撤回后状态将变为"未匹配"</span>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button size="default" @click="handleCancel">取消</el-button>
        <el-button 
          type="primary" 
          size="default" 
          @click="handleConfirm"
          :disabled="!canConfirm"
        >
          确认撤回
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'

const matchStore = useMatchStore()
const { undoDialogVisible, currentSourcePoint, sourcePoints, lastBatchMatchedIds } = storeToRefs(matchStore)

const uvField = computed(() => matchStore.getSourceUvField())
const nameField = computed(() => matchStore.getSourceNameField())
const addrField = computed(() => matchStore.getSourceAddrField())

const activeTab = ref('current')
const undoId = ref('')
const searchResult = ref(null)
const selectedUndoIds = ref([])

const lastBatchCount = computed(() => lastBatchMatchedIds.value.length)

const lastBatchPoints = computed(() => {
  return lastBatchMatchedIds.value.map(id => {
    return sourcePoints.value.find(p => p.id === id)
  }).filter(Boolean)
})

const isAllUndoSelected = computed(() => {
  return selectedUndoIds.value.length === lastBatchCount.value && lastBatchCount.value > 0
})

const visible = computed({
  get: () => undoDialogVisible.value,
  set: (val) => {
    if (!val) undoDialogVisible.value = false
  },
})

watch(visible, (val) => {
  if (val) {
    activeTab.value = 'current'
    undoId.value = ''
    searchResult.value = null
    selectedUndoIds.value = []
  }
})

watch(activeTab, (val) => {
  if (val === 'batch') {
    selectedUndoIds.value = [...lastBatchMatchedIds.value]
  }
})

watch(undoId, (val) => {
  if (val) {
    const found = sourcePoints.value.find(
      (p) => String(p[uvField.value]) === String(val) && matchStore.isPointMatched(p)
    )
    searchResult.value = found || null
  } else {
    searchResult.value = null
  }
})

const canConfirm = computed(() => {
  if (activeTab.value === 'current') {
    return currentSourcePoint.value && matchStore.isPointMatched(currentSourcePoint.value)
  } else if (activeTab.value === 'batch') {
    return selectedUndoIds.value.length > 0
  } else {
    return !!searchResult.value
  }
})

function toggleSelectAllUndo() {
  if (isAllUndoSelected.value) {
    selectedUndoIds.value = []
  } else {
    selectedUndoIds.value = [...lastBatchMatchedIds.value]
  }
}

function handleCancel() {
  undoDialogVisible.value = false
}

function handleConfirm() {
  if (activeTab.value === 'current') {
    matchStore.undoCurrentMatch()
    ElMessage.success('已撤回当前点的匹配')
  } else if (activeTab.value === 'batch') {
    const count = matchStore.undoLastBatchMatch(selectedUndoIds.value)
    ElMessage.success(`已撤回 ${count} 个批量匹配点`)
  } else {
    if (searchResult.value) {
      matchStore.undoMatch(undoId.value)
      ElMessage.success(`已撤回 ${uvField.value} = ${undoId.value} 的匹配`)
    }
  }
  undoDialogVisible.value = false
}
</script>

<style scoped>
.undo-match-dialog :deep(.el-dialog) {
  border-radius: 12px;
  margin: 0 !important;
}

.undo-match-dialog :deep(.el-dialog__header) {
  padding: 18px 24px 12px;
  border-bottom: 1px solid #f0f0f0;
  margin-right: 0;
}

.undo-match-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}

.undo-match-dialog :deep(.el-dialog__body) {
  padding: 16px 24px 12px;
}

.undo-match-dialog :deep(.el-dialog__footer) {
  padding: 0 24px 20px;
}

.undo-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: #f2f3f5;
  border-radius: 6px;
  padding: 3px;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 8px 12px;
  font-size: 13px;
  color: #4e5969;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.tab-item.active {
  background: #ffffff;
  color: #1677ff;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.point-info {
  background: #f7f8fa;
  border-radius: 8px;
  padding: 14px;
}

.info-row {
  display: flex;
  margin-bottom: 8px;
  font-size: 13px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: #86909c;
  flex-shrink: 0;
}

.info-value {
  color: #1d2129;
  word-break: break-all;
}

.info-value.highlight {
  color: #00b42a;
  font-weight: 600;
  font-family: 'Monaco', 'Consolas', monospace;
}

.warning-text {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e6eb;
  font-size: 12px;
  color: #ff7d00;
}

.empty-tip {
  text-align: center;
  padding: 20px 0;
}

.batch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header-text {
  font-size: 13px;
  font-weight: 500;
  color: #4e5969;
}

.batch-list {
  max-height: 200px;
  overflow-y: auto;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 8px;
}

.batch-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.batch-item:hover {
  background: #e5e6eb;
}

.batch-item-content {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  color: #1d2129;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-uv {
  font-size: 12px;
  color: #86909c;
  font-family: 'Monaco', 'Consolas', monospace;
  margin-top: 2px;
}

.form-item {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 13px;
  color: #4e5969;
  margin-bottom: 8px;
  font-weight: 500;
}

.form-input {
  width: 100%;
}

.search-result {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.result-title {
  font-size: 13px;
  font-weight: 500;
  color: #389e0d;
  margin-bottom: 8px;
}

.result-info .info-row {
  font-size: 12px;
  margin-bottom: 4px;
}

.result-info .info-label {
  color: #86909c;
}

.result-info .info-value {
  color: #1d5969;
}

.form-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #86909c;
  padding: 8px 12px;
  background: #f7f8fa;
  border-radius: 6px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-footer .el-button {
  border-radius: 6px;
}
</style>
