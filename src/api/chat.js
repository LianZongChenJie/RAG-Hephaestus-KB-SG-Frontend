/**
 * 对话 API：SSE 流式（fetch + ReadableStream），健康检查（axios）。
 */

import axios from "axios";

/** 后端基础地址（由 .env.development 统一配置，仅 PROD 直连时使用） */
const BASE = import.meta.env.VITE_BASE_URL || "";
const HEALTH_PREFIX = import.meta.env.VITE_HEALTH_PREFIX || "";

/** 流式接口：统一走相对路径，DEV 由 Vite 代理转发（已配置 SSE 禁用缓冲） */
function streamChatUrl() {
  return "/api/chat-stream";
}

function apiPrefix() {
  return `${HEALTH_PREFIX}/api`;
}

/**
 * @param {object} params
 * @param {(chunk: string) => void} params.onToken
 */
export async function streamChat({ messages, temperature, num_ctx, signal, onToken, onDone, onError }) {
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
    if (payload.error) {
      onError?.(payload.error);
      return "error";
    }
    if (payload.done) {
      onDone?.();
      return "done";
    }
    if (payload.content) {
      onToken(payload.content);
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
