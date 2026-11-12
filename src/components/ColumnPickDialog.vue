<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="520px"
    class="column-pick-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
  >
    <div class="dialog-desc">
      <el-alert
        title="检测到当前数据没有经纬度坐标列"
        type="warning"
        :closable="false"
        show-icon
        description="系统将切换为「地址匹配」模式（仅基于名称和地址文本匹配）。请选择对应列以便匹配算法正确识别。"
      />
    </div>

    <el-form :model="formData" label-width="110px" class="form-body">
      <el-form-item
        label="名称列"
        required
        :error="errors.nameField"
      >
        <el-select
          v-model="formData.nameField"
          placeholder="请选择表示名称/小区名的列"
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="h in headers"
            :key="h"
            :label="h"
            :value="h"
          />
        </el-select>
        <div class="form-hint">用于模糊匹配「小区名/点位名称」的列</div>
      </el-form-item>

      <el-form-item
        label="地址列"
        required
        :error="errors.addrField"
      >
        <el-select
          v-model="formData.addrField"
          placeholder="请选择表示详细地址的列"
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="h in headers"
            :key="h"
            :label="h"
            :value="h"
          />
        </el-select>
        <div class="form-hint">用于结构化匹配道路、弄号、门牌号的详细地址列</div>
      </el-form-item>

      <el-form-item
        v-if="type === 'source'"
        label="匹配结果列"
      >
        <el-select
          v-model="formData.uvField"
          placeholder="留空则自动创建一列「uv_communi」"
          filterable
          clearable
          style="width: 100%"
        >
          <el-option
            v-for="h in headers"
            :key="h"
            :label="h"
            :value="h"
          />
        </el-select>
        <div class="form-hint">选填。用于写入匹配结果的唯一标识列（候选点的 uv_community_id 将写入该列）</div>
      </el-form-item>

      <el-form-item
        v-if="type === 'target'"
        label="候选唯一列"
      >
        <el-select
          v-model="formData.uvField"
          placeholder="留空则自动识别"
          filterable
          clearable
          style="width: 100%"
        >
          <el-option
            v-for="h in headers"
            :key="h"
            :label="h"
            :value="h"
          />
        </el-select>
        <div class="form-hint">选填。候选点的唯一标识列，用于回填匹配结果</div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button size="default" @click="handleSkip">跳过（使用默认识别）</el-button>
        <el-button
          type="primary"
          size="default"
          @click="handleConfirm"
        >
          确认并导入
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { suggestNameColumn, suggestAddrColumn, suggestUvColumn } from '../utils/csvParser'

const props = defineProps({
  modelValue: Boolean,
  type: {
    type: String,
    default: 'source', // 'source' 待匹配 / 'target' 候选
  },
  headers: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const dialogTitle = computed(() => {
  return props.type === 'source'
    ? '待匹配数据 · 请选择关键列（无坐标模式）'
    : '候选点数据 · 请选择关键列（无坐标模式）'
})

const formData = reactive({
  nameField: '',
  addrField: '',
  uvField: '',
})

const errors = reactive({
  nameField: '',
  addrField: '',
})

watch(() => [props.headers, visible.value], ([h, v]) => {
  if (v && Array.isArray(h)) {
    // 默认选入建议值
    formData.nameField = suggestNameColumn(h) || h[0] || ''
    formData.addrField = suggestAddrColumn(h) || h[1] || h[0] || ''
    formData.uvField = suggestUvColumn(h) || ''
    errors.nameField = ''
    errors.addrField = ''
  }
})

function validate() {
  let ok = true
  if (!formData.nameField) {
    errors.nameField = '请选择名称列'
    ok = false
  } else {
    errors.nameField = ''
  }
  if (!formData.addrField) {
    errors.addrField = '请选择地址列'
    ok = false
  } else {
    errors.addrField = ''
  }
  if (formData.nameField && formData.addrField && formData.nameField === formData.addrField) {
    errors.addrField = '名称列和地址列不能相同'
    ok = false
  }
  return ok
}

function handleConfirm() {
  if (!validate()) return
  emit('confirm', {
    nameField: formData.nameField,
    addrField: formData.addrField,
    uvField: formData.uvField || null,
  })
  visible.value = false
}

function handleSkip() {
  // 跳过：给一个默认的列选择（兜底用前两列）
  emit('confirm', {
    nameField: formData.nameField || suggestNameColumn(props.headers) || props.headers[0] || '',
    addrField: formData.addrField || suggestAddrColumn(props.headers) || props.headers[1] || props.headers[0] || '',
    uvField: formData.uvField || suggestUvColumn(props.headers) || null,
  })
  visible.value = false
}
</script>

<style scoped>
.column-pick-dialog :deep(.el-dialog) {
  border-radius: 12px;
}

.column-pick-dialog :deep(.el-dialog__header) {
  padding: 18px 24px;
  border-bottom: 1px solid #f0f0f0;
  margin-right: 0;
}

.column-pick-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}

.column-pick-dialog :deep(.el-dialog__body) {
  padding: 20px 24px;
}

.column-pick-dialog :deep(.el-dialog__footer) {
  padding: 0 24px 20px;
}

.dialog-desc {
  margin-bottom: 16px;
}

.form-body {
  margin-top: 8px;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #86909c;
  line-height: 1.4;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
