<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="420px"
    class="db-connect-dialog"
    :close-on-click-modal="false"
  >
    <div class="dialog-content">
      <div class="connection-status">
        <el-icon :size="16" color="#00b42a"><Connection /></el-icon>
        <span class="status-text">已连接 MongoDB: geo-match</span>
      </div>

      <div class="collections-section">
        <div class="section-label">选择数据集合</div>
        <div v-if="loading" class="loading-wrap">
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

      <div v-if="selectedCollection" class="selected-info">
        已选择: <span class="highlight">{{ selectedCollection }}</span>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button size="default" @click="handleCancel">取消</el-button>
        <el-button
          type="primary"
          size="default"
          :disabled="!selectedCollection || loading"
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
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
  type: {
    type: String,
    default: 'source', // 'source' 或 'target'
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

const collections = ref([])
const selectedCollection = ref('')
const loading = ref(false)
const importing = ref(false)

watch(visible, (val) => {
  if (val) {
    selectedCollection.value = ''
    loadCollections()
  }
})

async function loadCollections() {
  loading.value = true
  try {
    const res = await api.getCollections()
    collections.value = res.data || []
  } catch (err) {
    ElMessage.error('获取集合列表失败: ' + err.message)
    collections.value = []
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  visible.value = false
}

async function handleConfirm() {
  if (!selectedCollection.value) return
  importing.value = true
  try {
    emit('select', {
      collection: selectedCollection.value,
      type: props.type,
    })
    visible.value = false
  } catch (err) {
    ElMessage.error('导入失败: ' + err.message)
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.db-connect-dialog :deep(.el-dialog) {
  border-radius: 12px;
}

.db-connect-dialog :deep(.el-dialog__header) {
  padding: 18px 24px;
  border-bottom: 1px solid #f0f0f0;
  margin-right: 0;
}

.db-connect-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}

.db-connect-dialog :deep(.el-dialog__body) {
  padding: 20px 24px;
}

.db-connect-dialog :deep(.el-dialog__footer) {
  padding: 0 24px 20px;
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
  max-height: 300px;
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
