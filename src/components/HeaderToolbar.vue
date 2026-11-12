<template>
  <div class="header-toolbar">
    <div class="header-left">
      <div class="logo-icon">
        <el-icon :size="22" color="#1677ff"><LocationFilled /></el-icon>
      </div>
      <div class="title-group">
        <div class="main-title">地理点位在线匹配平台</div>
        <div class="sub-title">
          <template v-if="IS_DEMO">网页演示版 · 纯前端运行 · 示例数据（虚构） · 人工确认写回</template>
          <template v-else>MongoDB · 地图辅助判别 · 人工确认写回</template>
        </div>
      </div>
    </div>

    <div class="header-actions">
      <el-button type="primary" class="btn btn-import-source" :loading="isLoadingSource" @click="openSourceDialog">
        <el-icon><Connection /></el-icon>
        <span>{{ sourceCollection || '导入 待匹配数据' }}</span>
      </el-button>

      <el-button type="warning" class="btn btn-import-target" :loading="isLoadingTarget" @click="openTargetDialog">
        <el-icon><Connection /></el-icon>
        <span>{{ targetCollection || '导入 候选点数据' }}</span>
      </el-button>

      <el-button type="success" class="btn btn-save" @click="handleSave">
        <el-icon><Download /></el-icon>
        <span>保存结果</span>
      </el-button>
      <el-button type="danger" class="btn btn-undo" @click="handleUndo">
        <el-icon><RefreshLeft /></el-icon>
        <span>撤回匹配</span>
      </el-button>
    </div>

    <div class="header-right">
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-dot blue"></span>
          <span class="stat-label">待匹配点</span>
          <span class="stat-value">{{ formatNumber(stats.totalSourcePoints) }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-dot orange"></span>
          <span class="stat-label">候选点库</span>
          <span class="stat-value">{{ formatNumber(stats.totalTargetPoints) }}</span>
        </div>
      </div>

      <div class="progress-widget">
        <div class="progress-top">
          <span class="progress-label">今日已匹配</span>
          <span class="progress-num">{{ stats.todayMatched }} 条</span>
        </div>
        <div class="progress-bottom">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: stats.completionRate * 100 + '%' }"></div>
          </div>
          <span class="progress-pct">{{ (stats.completionRate * 100).toFixed(0) }}%</span>
        </div>
      </div>

      <el-dropdown class="user-dropdown">
        <div class="user-block">
          <el-avatar :size="34" class="user-avatar">
            <el-icon :size="20"><User /></el-icon>
          </el-avatar>
          <div class="user-text">
            <div class="user-name">{{ userInfo.name }}</div>
            <div class="user-role">{{ userInfo.role }}</div>
          </div>
          <el-icon class="caret-icon"><CaretBottom /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item>个人中心</el-dropdown-item>
            <el-dropdown-item>修改密码</el-dropdown-item>
            <el-dropdown-item divided>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <ImportDialog
      v-model="sourceDialogVisible"
      type="source"
      @select="handleImportSelect"
    />
    <ImportDialog
      v-model="targetDialogVisible"
      type="target"
      @select="handleImportSelect"
    />

    <!-- 无坐标模式下的列选择弹窗 -->
    <ColumnPickDialog
      v-model="columnPickVisible"
      :type="pendingImport?.type || 'source'"
      :headers="pendingImport?.headers || []"
      @confirm="handleColumnPickConfirm"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useMatchStore } from '../stores/matchStore'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import ImportDialog from './ImportDialog.vue'
import ColumnPickDialog from './ColumnPickDialog.vue'
import { IS_DEMO } from '../demo/config'
import { parseCsvFile, detectHasCoordinates } from '../utils/csvParser'

const matchStore = useMatchStore()
const { stats, userInfo, sourceCollection, targetCollection, isLoadingSource, isLoadingTarget } = storeToRefs(matchStore)

const sourceDialogVisible = ref(false)
const targetDialogVisible = ref(false)
const columnPickVisible = ref(false)
// 待确认的 import 信息（无坐标模式下等待用户选择列后再确认导入）
const pendingImport = ref(null)

function formatNumber(num) {
  if (!num) return 0
  return num.toLocaleString()
}

function openSourceDialog() {
  sourceDialogVisible.value = true
}

function openTargetDialog() {
  targetDialogVisible.value = true
}

/**
 * 真正执行 store 导入动作
 * columnOverrides 可能为 null（有坐标 / DB导入 / 跳过选择的默认值）
 */
async function doImport({ mode, collection, file, fileName, type, columnOverrides = null }) {
  if (type === 'source') {
    if (mode === 'db') {
      await matchStore.loadSourceFromDb(collection)
      ElMessage.success(`成功导入待匹配数据: ${collection}`)
    } else {
      await matchStore.loadSourceFromLocal(file, fileName, columnOverrides)
      ElMessage.success(`成功导入待匹配数据: ${fileName}`)
    }
  } else {
    if (mode === 'db') {
      await matchStore.loadTargetFromDb(collection)
      ElMessage.success(`成功导入候选点数据: ${collection}`)
    } else {
      await matchStore.loadTargetFromLocal(file, fileName, columnOverrides)
      ElMessage.success(`成功导入候选点数据: ${fileName}`)
    }
  }
}

async function handleImportSelect({ mode, collection, file, fileName, type }) {
  try {
    // DB 导入：先预览检测坐标
    if (mode === 'db') {
      const { headers, detect } = await matchStore.previewDbCollection(collection)
      if (detect.hasCoordinates) {
        // 有坐标 → 直接导入
        await doImport({ mode, collection, type })
      } else {
        // 无坐标 → 弹窗让用户选择名称/地址列
        pendingImport.value = {
          mode,
          collection,
          type,
          headers,
        }
        columnPickVisible.value = true
      }
      return
    }

    // 本地 CSV：先解析并检测是否有坐标列
    const data = await parseCsvFile(file)
    const headers = Object.keys(data[0] || {})
    const detect = detectHasCoordinates(headers, data)

    if (detect.hasCoordinates) {
      // 有坐标 → 直接导入
      await doImport({ mode, file, fileName, type })
    } else {
      // 无坐标 → 弹窗让用户选择名称/地址列
      pendingImport.value = {
        mode,
        file,
        fileName,
        type,
        headers,
      }
      columnPickVisible.value = true
    }
  } catch (err) {
    ElMessage.error('导入失败: ' + err.message)
  }
}

async function handleColumnPickConfirm(overrides) {
  if (!pendingImport.value) return
  try {
    await doImport({
      ...pendingImport.value,
      columnOverrides: overrides,
    })
  } catch (err) {
    ElMessage.error('导入失败: ' + err.message)
  } finally {
    pendingImport.value = null
  }
}

async function handleSave() {
  try {
    const result = await matchStore.saveResults()
    if (result.type === 'db') {
      ElMessage.success(`已保存到数据库集合: ${result.name}`)
    } else {
      ElMessage.success(`已导出结果文件: ${result.name}`)
    }
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  }
}

function handleUndo() {
  matchStore.openUndoDialog()
}
</script>

<style scoped>
.header-toolbar {
  height: 56px;
  background: #ffffff;
  border-bottom: 1px solid #e5e6eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
  min-width: 1200px;
  overflow: hidden;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #e8f3ff 0%, #d1e8ff 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.title-group {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.main-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
  white-space: nowrap;
}

.sub-title {
  font-size: 11px;
  color: #86909c;
  margin-top: 2px;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
  overflow: hidden;
}

.header-actions :deep(.el-button) {
  flex-shrink: 0;
  margin: 0 !important;
}

.btn {
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
  white-space: nowrap;
  border: none;
}

.btn-import-source {
  background: #1677ff;
}
.btn-import-source:hover {
  background: #4096ff !important;
}

.btn-import-target {
  background: #ff7d00;
  border-color: #ff7d00;
}
.btn-import-target:hover {
  background: #ff9a2e !important;
  border-color: #ff9a2e !important;
}

.btn-save {
  background: #00b42a;
  border-color: #00b42a;
}
.btn-save:hover {
  background: #23c343 !important;
  border-color: #23c343 !important;
}

.btn-undo {
  background: #f53f3f;
  border-color: #f53f3f;
}
.btn-undo:hover {
  background: #ff6261 !important;
  border-color: #ff6261 !important;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.stats-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-right: 12px;
  border-right: 1px solid #e5e6eb;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  line-height: 1.2;
}

.stat-dot {
  display: none;
}

.stat-label {
  color: #86909c;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-label::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.stat-item:first-child .stat-label::before {
  background: #1677ff;
}

.stat-item:last-child .stat-label::before {
  background: #ff7d00;
}

.stat-value {
  color: #1d2129;
  font-weight: 600;
  font-size: 13px;
}

.progress-widget {
  background: #f7f8fa;
  border-radius: 6px;
  padding: 5px 10px;
  min-width: 110px;
}

.progress-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.progress-label {
  font-size: 11px;
  color: #86909c;
}

.progress-num {
  font-size: 14px;
  font-weight: 600;
  color: #1677ff;
}

.progress-bottom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: #e5e6eb;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1677ff 0%, #4096ff 100%);
  border-radius: 2px;
}

.progress-pct {
  font-size: 11px;
  color: #86909c;
  min-width: 26px;
  text-align: right;
}

.user-dropdown {
  cursor: pointer;
}

.user-block {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 6px;
  transition: background 0.2s;
}

.user-block:hover {
  background: #f7f8fa;
}

.user-avatar {
  background: #e8f3ff;
  color: #1677ff;
  flex-shrink: 0;
}

.user-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.user-name {
  font-size: 12px;
  font-weight: 500;
  color: #1d2129;
}

.user-role {
  font-size: 10px;
  color: #86909c;
  margin-top: 1px;
}

.caret-icon {
  color: #86909c;
  font-size: 10px;
}
</style>
