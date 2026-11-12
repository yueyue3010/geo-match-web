<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="480px"
    class="import-dialog"
    :close-on-click-modal="false"
  >
    <div class="dialog-content">
      <div class="mode-selector">
        <div
          v-if="!IS_DEMO"
          class="mode-card"
          :class="{ active: importMode === 'db' }"
          @click="importMode = 'db'"
        >
          <el-icon :size="28"><Coin /></el-icon>
          <div class="mode-info">
            <div class="mode-title">数据库导入</div>
            <div class="mode-desc">从 MongoDB 数据库选择集合</div>
          </div>
          <el-icon v-if="importMode === 'db'" class="check-icon"><Check /></el-icon>
        </div>
        <div
          class="mode-card"
          :class="{ active: importMode === 'local' }"
          @click="importMode = 'local'"
        >
          <el-icon :size="28"><Document /></el-icon>
          <div class="mode-info">
            <div class="mode-title">本地文件导入</div>
            <div class="mode-desc">从本地选择 CSV 文件</div>
          </div>
          <el-icon v-if="importMode === 'local'" class="check-icon"><Check /></el-icon>
        </div>
      </div>

      <div v-if="importMode === 'db'" class="db-section">
        <div class="connection-status">
          <el-icon :size="16" color="#00b42a"><Connection /></el-icon>
          <span class="status-text">已连接 MongoDB: geo-match</span>
        </div>

        <div class="collections-section">
          <div class="section-label">选择数据集合</div>
          <div v-if="loadingCollections" class="loading-wrap">
            <el-icon class="loading-icon"><Loading /></el-icon>
            <span>加载中...</span>
          </div>
          <div v-else-if="collections.length === 0" class="empty-collections">
            数据库中没有集合
          </div>
          <div v-else class="collection-list">
            <div
              v-for="name in collections"
              :key="name"
              class="collection-item"
              :class="{ active: selectedCollection === name }"
              @click="selectedCollection = name"
            >
              <el-icon :size="16"><Collection /></el-icon>
              <span class="collection-name">{{ name }}</span>
              <el-icon v-if="selectedCollection === name" class="check-icon" :size="16"><Check /></el-icon>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="importMode === 'local'" class="local-section">
        <div class="section-label">选择 CSV 文件</div>
        <div
          class="upload-area"
          :class="{ 'is-dragover': isDragover }"
          @click="triggerFileInput"
          @dragover.prevent="isDragover = true"
          @dragleave.prevent="isDragover = false"
          @drop.prevent="handleDrop"
        >
          <input
            ref="fileInputRef"
            type="file"
            accept=".csv"
            style="display: none"
            @change="handleFileChange"
          />
          <el-icon :size="40" color="#86909c"><UploadFilled /></el-icon>
          <div class="upload-text">
            <div class="upload-title">点击或拖拽文件到此处</div>
            <div class="upload-hint">支持 CSV 格式文件</div>
          </div>
          <div v-if="selectedFile" class="selected-file">
            <el-icon :size="16" color="#1677ff"><Document /></el-icon>
            <span class="file-name">{{ selectedFile.name }}</span>
            <span class="file-size">{{ formatFileSize(selectedFile.size) }}</span>
          </div>
        </div>
      </div>

      <div v-if="hasSelection" class="selected-info">
        已选择: <span class="highlight">{{ selectedName }}</span>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button size="default" @click="handleCancel">取消</el-button>
        <el-button
          type="primary"
          size="default"
          :disabled="!hasSelection || importing"
          :loading="importing"
          @click="handleConfirm"
        >
          确认导入
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../utils/api'
import { IS_DEMO } from '../demo/config'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
  type: {
    type: String,
    default: 'source',
  },
})

const emit = defineEmits(['update:modelValue', 'select'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const dialogTitle = computed(() => {
  return props.type === 'source' ? '导入待匹配点数据' : '导入候选点数据'
})

const importMode = ref(IS_DEMO ? 'local' : 'db')
const collections = ref([])
const selectedCollection = ref('')
const loadingCollections = ref(false)
const selectedFile = ref(null)
const isDragover = ref(false)
const importing = ref(false)
const fileInputRef = ref(null)

const hasSelection = computed(() => {
  if (importMode.value === 'db') return !!selectedCollection.value
  return !!selectedFile.value
})

const selectedName = computed(() => {
  if (importMode.value === 'db') return selectedCollection.value
  return selectedFile.value?.name || ''
})

watch(visible, (val) => {
  if (val) {
    selectedCollection.value = ''
    selectedFile.value = null
    if (importMode.value === 'db') {
      loadCollections()
    }
  }
})

watch(importMode, (val) => {
  if (val === 'db' && collections.value.length === 0) {
    loadCollections()
  }
})

async function loadCollections() {
  loadingCollections.value = true
  try {
    const res = await api.getCollections()
    collections.value = res.data || []
  } catch (err) {
    ElMessage.error('获取集合列表失败: ' + err.message)
    collections.value = []
  } finally {
    loadingCollections.value = false
  }
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileChange(e) {
  const file = e.target.files?.[0]
  if (file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      ElMessage.warning('请选择 CSV 格式文件')
      return
    }
    selectedFile.value = file
  }
  e.target.value = ''
}

function handleDrop(e) {
  isDragover.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      ElMessage.warning('请选择 CSV 格式文件')
      return
    }
    selectedFile.value = file
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function handleCancel() {
  visible.value = false
}

async function handleConfirm() {
  if (!hasSelection.value) return
  importing.value = true
  try {
    if (importMode.value === 'db') {
      emit('select', {
        mode: 'db',
        collection: selectedCollection.value,
        type: props.type,
      })
    } else {
      emit('select', {
        mode: 'local',
        file: selectedFile.value,
        fileName: selectedFile.value.name,
        type: props.type,
      })
    }
    visible.value = false
  } catch (err) {
    ElMessage.error('导入失败: ' + err.message)
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.import-dialog :deep(.el-dialog) {
  border-radius: 12px;
}

.import-dialog :deep(.el-dialog__header) {
  padding: 18px 24px;
  border-bottom: 1px solid #f0f0f0;
  margin-right: 0;
}

.import-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}

.import-dialog :deep(.el-dialog__body) {
  padding: 20px 24px;
}

.import-dialog :deep(.el-dialog__footer) {
  padding: 0 24px 20px;
}

.mode-selector {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.mode-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: 2px solid #e5e6eb;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  background: #ffffff;
}

.mode-card:hover {
  border-color: #1677ff;
  background: #f0f7ff;
}

.mode-card.active {
  border-color: #1677ff;
  background: #e8f3ff;
}

.mode-card .check-icon {
  position: absolute;
  top: 8px;
  right: 8px;
  color: #1677ff;
  font-size: 16px;
}

.mode-info {
  flex: 1;
}

.mode-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 2px;
}

.mode-desc {
  font-size: 12px;
  color: #86909c;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 8px;
  margin-bottom: 16px;
}

.status-text {
  font-size: 13px;
  color: #389e0d;
  font-weight: 500;
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 10px;
}

.loading-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 30px 0;
  color: #86909c;
  font-size: 13px;
}

.loading-icon {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.empty-collections {
  text-align: center;
  padding: 30px 0;
  color: #86909c;
  font-size: 13px;
}

.collection-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}

.collection-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.collection-item:hover {
  background: #f7f8fa;
  border-color: #e5e6eb;
}

.collection-item.active {
  background: #e8f3ff;
  border-color: #1677ff;
}

.collection-name {
  flex: 1;
  font-size: 14px;
  color: #1d2129;
}

.collection-item.active .collection-name {
  color: #1677ff;
  font-weight: 500;
}

.check-icon {
  color: #1677ff;
}

.local-section {
  margin-top: 8px;
}

.upload-area {
  border: 2px dashed #e5e6eb;
  border-radius: 10px;
  padding: 30px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: #fafbfc;
}

.upload-area:hover {
  border-color: #1677ff;
  background: #f0f7ff;
}

.upload-area.is-dragover {
  border-color: #1677ff;
  background: #e8f3ff;
}

.upload-text {
  margin-top: 10px;
}

.upload-title {
  font-size: 14px;
  color: #1d2129;
  font-weight: 500;
  margin-bottom: 4px;
}

.upload-hint {
  font-size: 12px;
  color: #86909c;
}

.selected-file {
  margin-top: 16px;
  padding: 10px 14px;
  background: #e8f3ff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-name {
  flex: 1;
  font-size: 13px;
  color: #1677ff;
  font-weight: 500;
  text-align: left;
}

.file-size {
  font-size: 12px;
  color: #86909c;
}

.selected-info {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #f0f0f0;
  font-size: 13px;
  color: #4e5969;
}

.highlight {
  color: #1677ff;
  font-weight: 600;
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
