/**
 * 对话 API：SSE 流式（fetch + ReadableStream），健康检查（axios）。
 */

import axios from "axios";

/** 后端地址配置（由 .env.development 统一管理） */
const BASE = import.meta.env.VITE_BASE_URL || "";
const HEALTH_PREFIX = import.meta.env.VITE_HEALTH_PREFIX || "";

/** 流式接口：统一走 Vite 代理（相对路径，已配置 SSE 禁用缓冲） */
function streamChatUrl() {
  return "/api/chat-stream";
}

function apiPrefix() {
  return `${HEALTH_PREFIX}/api`;
}

/**
 * @param {object} params
 * @param {(chunk: string) => void} [params.onToken] 普通聊天 token / message 文本
 * @param {(payload: {columns: any[], rows: any[]}) => void} [params.onTable]
 * @param {(payload: {chartType: string, chartId: string, option: object}) => void} [params.onChart]
 * @param {(content: string) => void} [params.onSummary]
 * @param {(sql: string) => void} [params.onSql]
 * @param {(payload: {value?: string, message?: string}) => void} [params.onMode]
 * @param {() => void} [params.onDone]
 * @param {(msg: string) => void} [params.onError]
 */
export async function streamChat({ messages, temperature, num_ctx, signal, onToken, onTable, onChart, onSummary, onSql, onMode, onDone, onError }) {
  let response;
  try {
    response = await fetch(streamChatUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, temperature, num_ctx }),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      onDone?.();
      return;
    }
    onError?.("网络请求失败，请检查后端是否已启动");
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    onError?.(text || `请求失败 (${response.status})`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError?.("浏览器不支持流式读取");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const handleEvent = (payload) => {
    // 兼容旧格式 { error, done, content }
    if (payload.error && !payload.type) {
      onError?.(typeof payload.error === "string" ? payload.error : "请求失败");
      return "error";
    }
    if (payload.done) {
      onDone?.();
      return "done";
    }

    const type = payload.type;
    if (type === "error") {
      onError?.(payload.message || "查询失败");
      return "error";
    }
    if (type === "table") {
      onTable?.({
        columns: payload.columns || [],
        rows: payload.rows || [],
      });
      return "ok";
    }
    if (type === "chart") {
      onChart?.({
        chartType: payload.chartType,
        chartId: payload.chartId,
        option: payload.option || {},
      });
      return "ok";
    }
    if (type === "summary") {
      if (payload.content) onSummary?.(payload.content);
      return "ok";
    }
    if (type === "sql") {
      if (payload.sql) onSql?.(payload.sql);
      return "ok";
    }
    if (type === "mode") {
      onMode?.({ value: payload.value, message: payload.message });
      return "ok";
    }
    if (type === "message") {
      if (payload.content) onToken?.(payload.content);
      return "ok";
    }

    // 无 type 的纯文本流（兼容）
    if (payload.content) {
      onToken?.(payload.content);
    }
    return "ok";
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          continue;
        }
        const status = handleEvent(payload);
        if (status === "error" || status === "done") return;
      }
    }
    onDone?.();
  } catch (err) {
    if (err.name === "AbortError") {
      onDone?.();
      return;
    }
    onError?.(err.message || "流式读取中断");
  } finally {
    reader.releaseLock();
  }
}

export async function fetchHealth() {
  const { data } = await axios.get(`${apiPrefix()}/health`, { timeout: 8000 });
  return data;
}
