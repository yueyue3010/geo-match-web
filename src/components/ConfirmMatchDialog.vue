<template>
  <el-dialog
    v-model="visible"
    width="460px"
    class="confirm-match-dialog"
    :show-close="false"
    :close-on-click-modal="false"
  >
    <div class="dialog-content">
      <div class="confirm-icon">
        <el-icon :size="32" color="#1677ff"><QuestionFilled /></el-icon>
      </div>
      <div class="confirm-text">
        <p class="confirm-title">确认匹配</p>
        <div class="confirm-info">
          <div class="info-block source-block">
            <div class="info-label">
              <span class="dot blue"></span>
              待匹配点
            </div>
            <div class="info-name">{{ currentSourcePoint?.[sourceNameField] || '-' }}</div>
            <div class="info-addr">{{ currentSourcePoint?.[sourceAddrField] || '-' }}</div>
          </div>
          <div class="info-arrow">
            <el-icon><Right /></el-icon>
          </div>
          <div class="info-block target-block">
            <div class="info-label">
              <span class="dot orange"></span>
              候选点
            </div>
            <div class="info-name">{{ selectedCandidate?.[targetNameField] || '-' }}</div>
            <div class="info-addr">{{ selectedCandidate?.[targetAddrField] || '-' }}</div>
          </div>
        </div>
        <p class="confirm-desc">
          确认将 <span class="highlight">{{ targetUvField }} = {{ selectedCandidate?.[targetUvField] }}</span><br/>
          写入该待匹配点的 <span class="highlight">{{ sourceUvField }}</span> 吗？
        </p>
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button size="default" @click="handleCancel">取消</el-button>
        <el-button type="primary" size="default" @click="handleConfirm">确认匹配</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'

const matchStore = useMatchStore()
const { confirmDialogVisible, selectedCandidate, currentSourcePoint } = storeToRefs(matchStore)

const sourceNameField = computed(() => matchStore.getSourceNameField())
const sourceAddrField = computed(() => matchStore.getSourceAddrField())
const sourceUvField = computed(() => matchStore.getSourceUvField())
const targetNameField = computed(() => matchStore.getTargetNameField())
const targetAddrField = computed(() => matchStore.getTargetAddrField())
const targetUvField = computed(() => matchStore.getTargetUvField())

const visible = computed({
  get: () => confirmDialogVisible.value,
  set: (val) => {
    if (!val) confirmDialogVisible.value = false
  },
})

function handleCancel() {
  confirmDialogVisible.value = false
}

function handleConfirm() {
  matchStore.doConfirmMatch()
  ElMessage.success('匹配成功')
}
</script>

<style scoped>
.confirm-match-dialog :deep(.el-dialog) {
  border-radius: 12px;
  margin: 0 !important;
}

.confirm-match-dialog :deep(.el-dialog__header) {
  display: none;
}

.confirm-match-dialog :deep(.el-dialog__body) {
  padding: 24px 24px 20px;
}

.confirm-match-dialog :deep(.el-dialog__footer) {
  padding: 0 24px 24px;
}

.dialog-content {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.confirm-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  background: #e8f3ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.confirm-text {
  flex: 1;
  min-width: 0;
}

.confirm-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
  margin: 0 0 12px 0;
}

.confirm-info {
  display: flex;
  align-items: stretch;
  gap: 8px;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.info-block {
  flex: 1;
  min-width: 0;
}

.info-label {
  font-size: 12px;
  color: #86909c;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}

.dot.blue {
  background: #1677ff;
}

.dot.orange {
  background: #ff7d00;
}

.info-name {
  font-size: 13px;
  font-weight: 500;
  color: #1d2129;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-addr {
  font-size: 12px;
  color: #4e5969;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-arrow {
  display: flex;
  align-items: center;
  color: #86909c;
  font-size: 16px;
  flex-shrink: 0;
}

.confirm-desc {
  font-size: 14px;
  color: #4e5969;
  line-height: 1.6;
  margin: 0;
}

.highlight {
  color: #1677ff;
  font-weight: 500;
  font-family: 'Monaco', 'Consolas', monospace;
}

.dialog-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.dialog-footer .el-button {
  min-width: 100px;
  border-radius: 6px;
}
</style>
