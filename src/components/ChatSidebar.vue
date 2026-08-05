<script setup>
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Plus, Delete, Fold, Expand } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chatStore'
import logoUrl from '../assets/sgjt_logo.png'

const store = useChatStore()

const sessions = computed(() =>
  [...store.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
)

async function onDelete(id, e) {
  e.stopPropagation()
  try {
    await ElMessageBox.confirm('确定删除该会话？此操作不可恢复。', '删除会话', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    store.deleteSession(id)
  } catch {
    /* 取消 */
  }
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: store.sidebarCollapsed }">
    <div class="brand" v-show="!store.sidebarCollapsed">
      <img :src="logoUrl" alt="首自信公司" class="brand-logo" />
      <span class="brand-name">首自信公司</span>
    </div>
    <div class="sidebar-head">
      <el-button type="primary" class="new-btn" @click="store.createSession()">
        <el-icon><Plus /></el-icon>
        新建对话
      </el-button>
      <el-button text class="fold-btn" @click="store.toggleSidebar()">
        <el-icon><Fold v-if="!store.sidebarCollapsed" /><Expand v-else /></el-icon>
      </el-button>
    </div>

    <div v-show="!store.sidebarCollapsed" class="session-list">
      <div
        v-for="s in sessions"
        :key="s.id"
        class="session-item"
        :class="{ active: s.id === store.currentSessionId }"
        @click="store.selectSession(s.id)"
      >
        <span class="title" :title="s.title">{{ s.title }}</span>
        <el-button
          class="del"
          text
          size="small"
          @click="onDelete(s.id, $event)"
        >
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-lighter);
  background: #f7f8fa;
  transition: width 0.2s ease;
}
.sidebar.collapsed {
  width: 52px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 10px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.brand-logo {
  display: block;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  object-fit: contain;
}
.brand-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #1f2a37;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 10px 12px;
}
.new-btn {
  flex: 1;
}
.sidebar.collapsed .new-btn {
  display: none;
}
.fold-btn {
  flex-shrink: 0;
}
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
}
.session-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #303133;
}
.session-item:hover {
  background: #eceef2;
}
.session-item.active {
  background: #e8f3ff;
  color: #409eff;
}
.session-item .title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-item .del {
  opacity: 0;
}
.session-item:hover .del {
  opacity: 1;
}
</style>
