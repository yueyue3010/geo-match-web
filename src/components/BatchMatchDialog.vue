<template>
  <el-dialog
    v-model="dialogVisible"
    title="批量匹配结果"
    width="90%"
    :close-on-click-modal="false"
    class="batch-match-dialog"
  >
    <div class="batch-match-content">
      <div class="batch-match-header">
        <el-checkbox v-model="selectAll" @change="handleSelectAll">全选</el-checkbox>
        <span class="match-count">共匹配成功 {{ results.length }} 条</span>
        <span class="match-count selected">已选择 {{ selectedCount }} 条</span>
      </div>

      <div class="batch-match-table-wrap">
        <el-table
          :data="results"
          height="100%"
          border
          class="custom-table"
        >
          <el-table-column type="index" width="50" align="center" label="序号" fixed="left" />

          <!-- 选择列 -->
          <el-table-column width="55" align="center" fixed="left">
            <template #header>
              <el-checkbox v-model="selectAll" @change="handleSelectAll" />
            </template>
            <template #default="{ row }">
              <el-checkbox v-model="row.selected" />
            </template>
          </el-table-column>

          <!-- 左侧：待匹配点信息 -->
          <el-table-column label="待匹配点信息" min-width="280">
            <template #default="{ row }">
              <div class="source-info">
                <div class="info-row">
                  <span class="info-label">名称：</span>
                  <span class="info-value">{{ row.target[sourceNameField] || '-' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">地址：</span>
                  <span class="info-value">{{ row.target[sourceAddrField] || '-' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">坐标：</span>
                  <span class="info-value">{{ row.target[sourceLngField] }}, {{ row.target[sourceLatField] }}</span>
                </div>
              </div>
            </template>
          </el-table-column>

          <!-- 中间：匹配结果信息 -->
          <el-table-column label="匹配结果" min-width="280">
            <template #default="{ row }">
              <div class="match-info">
                <div class="info-row">
                  <span class="info-label">名称：</span>
                  <span class="info-value">{{ row.bestMatch.name || '-' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">地址：</span>
                  <span class="info-value">{{ row.bestMatch.addr || '-' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">ID：</span>
                  <span class="info-value id-value">{{ row.bestMatch.sourceId }}</span>
                </div>
              </div>
            </template>
          </el-table-column>

          <!-- 右侧：得分信息 -->
          <el-table-column label="得分" width="200" align="center">
            <template #default="{ row }">
              <div class="score-info">
                <div class="score-row">
                  <span class="score-label">名称得分</span>
                  <span class="score-value" :style="{ color: getScoreColor(row.bestMatch.nameScore) }">
                    {{ row.bestMatch.nameScore }}
                  </span>
                </div>
                <div class="score-row">
                  <span class="score-label">地址得分</span>
                  <span class="score-value" :style="{ color: getScoreColor(row.bestMatch.addrScore) }">
                    {{ row.bestMatch.addrScore }}
                  </span>
                </div>
                <div class="score-row total">
                  <span class="score-label">综合得分</span>
                  <span class="score-value total-score">
                    {{ Math.round((row.bestMatch.nameScore + row.bestMatch.addrScore) / 2) }}
                  </span>
                </div>
                <div class="score-row" v-if="row.bestMatch.dist > 0">
                  <span class="score-label">距离</span>
                  <span class="score-value">{{ row.bestMatch.dist }}m</span>
                </div>
                <div class="conflict-tag" v-if="row.bestMatch.conflict">
                  <el-tag size="small" type="warning">{{ row.bestMatch.conflict }}</el-tag>
                </div>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="selectedCount === 0" @click="handleApply">
          <el-icon><Check /></el-icon>
          一键确认匹配 ({{ selectedCount }})
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'

const matchStore = useMatchStore()
const {
  batchMatchDialogVisible,
  batchMatchResults,
  getSourceNameField,
  getSourceAddrField,
  getSourceLngField,
  getSourceLatField,
} = storeToRefs(matchStore)

const dialogVisible = batchMatchDialogVisible
const results = batchMatchResults

const sourceNameField = computed(() => matchStore.getSourceNameField())
const sourceAddrField = computed(() => matchStore.getSourceAddrField())
const sourceLngField = computed(() => matchStore.getSourceLngField())
const sourceLatField = computed(() => matchStore.getSourceLatField())

const selectAll = computed({
  get: () => results.value.length > 0 && results.value.every(r => r.selected),
  set: (val) => {
    matchStore.selectAllBatchMatches(val)
  }
})

const selectedCount = computed(() => results.value.filter(r => r.selected).length)

function handleSelectAll(val) {
  matchStore.selectAllBatchMatches(val)
}

function getScoreColor(score) {
  if (score >= 80) return '#00b42a'
  if (score >= 60) return '#1677ff'
  return '#ff7d00'
}

function handleApply() {
  if (selectedCount.value === 0) {
    ElMessage.warning('请至少选择一条匹配结果')
    return
  }
  const count = selectedCount.value
  matchStore.applyBatchMatch()
  ElMessage.success(`已确认 ${count} 条匹配结果`)
}
</script>

<style scoped>
.batch-match-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.batch-match-content {
  display: flex;
  flex-direction: column;
  height: 60vh;
}

.batch-match-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid #e5e6eb;
  background: #f7f8fa;
}

.match-count {
  font-size: 13px;
  color: #4e5969;
}

.match-count.selected {
  color: #1677ff;
  font-weight: 500;
}

.batch-match-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.source-info,
.match-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: #86909c;
  white-space: nowrap;
  flex-shrink: 0;
}

.info-value {
  font-size: 12px;
  color: #1d2129;
  word-break: break-all;
}

.id-value {
  color: #1677ff;
  font-weight: 500;
}

.score-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.score-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.score-row.total {
  padding-top: 4px;
  border-top: 1px dashed #e5e6eb;
  margin-top: 2px;
}

.score-label {
  font-size: 12px;
  color: #86909c;
}

.score-value {
  font-size: 13px;
  font-weight: 500;
  color: #1d2129;
}

.total-score {
  color: #1677ff;
  font-size: 14px;
}

.conflict-tag {
  margin-top: 4px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
