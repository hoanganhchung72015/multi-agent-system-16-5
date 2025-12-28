import { Subject, AgentType } from "../types";
import React from 'react';

// ĐỊA CHỈ SERVER RENDER CỦA BẠN
const BACKEND_URL = 'https://giaibaitap-backend.onrender.com/;

// CACHING LAYER
const cache = new Map<string, string>();
const audioCache = new Map<string, string>();

// Tạo key dựa trên nội dung đề bài để không bị trùng lặp
const getCacheKey = (subject: string, agent: string, input: string, hasImage: boolean) => 
  `${subject}|${agent}|${input.trim().substring(0, 100)}|${hasImage ? 'img' : 'no-img'}`;

const SYSTEM_PROMPTS: Record<AgentType, string> = {
  [AgentType.SPEED]: `Trả về JSON: { "finalAnswer": "đáp án", "casioSteps": "bước bấm máy" }. Ngắn gọn, dùng LaTeX.`,
  [AgentType.SOCRATIC]: `Giải chi tiết, logic, cực kỳ ngắn gọn, dùng LaTeX.`,
  [AgentType.PERPLEXITY]: `Liệt kê 2 dạng bài tập nâng cao liên quan. Chỉ đề bài, không lời giải.`,
};

// Hàm gửi yêu cầu sang Render
async function callRender(payload: any) {
  const response = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Lỗi server phụ');
  }

  const data = await response.json();
  return data.answer; // Server Render trả về trường 'answer'
}

export const processTask = async (subject: Subject, agent: AgentType, input: string, image?: string) => {
  const cacheKey = getCacheKey(subject, agent, input, !!image);
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  try {
    const prompt = `Yêu cầu: ${SYSTEM_PROMPTS[agent]}. \nNội dung: ${input}`;
    
    // Gửi toàn bộ dữ liệu sang Render
    const resultText = await callRender({
      subject,
      prompt,
      image // Base64 của ảnh
    });

    if (resultText) cache.set(cacheKey, resultText);
    return resultText;
  } catch (error: any) {
    console.error("Lỗi xử lý:", error);
    throw new Error("Đầu bếp Render đang bận hoặc ảnh quá nặng. Thử lại nhé!");
  }
};

// Các hàm bổ trợ khác cũng trỏ về Render hoặc xử lý đơn giản
export const generateSummary = async (content: string) => {
  if (!content) return "";
  const prompt = `Tóm tắt ngắn gọn 1 câu nội dung sau: ${content}`;
  return await callRender({ subject: 'Tóm tắt', prompt });
};

// Giữ nguyên logic Audio Player vì nó chạy ở phía trình duyệt người dùng (Client)
let globalAudioContext: AudioContext | null = null;
let globalSource: AudioBufferSourceNode | null = null;

export const playStoredAudio = async (base64Audio: string, audioSourceRef: React.MutableRefObject<AudioBufferSourceNode | null>) => {
  if (!base64Audio) return;

  if (globalSource) {
    try { globalSource.stop(); } catch(e) {}
    globalSource.disconnect();
    globalSource = null;
  }

  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  
  if (globalAudioContext.state === 'suspended') await globalAudioContext.resume();

  const audioData = atob(base64Audio);
  const bytes = new Uint8Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) bytes[i] = audioData.charCodeAt(i);
  
  const dataInt16 = new Int16Array(bytes.buffer);
  const buffer = globalAudioContext.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

  const source = globalAudioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(globalAudioContext.destination);
  
  globalSource = source;
  audioSourceRef.current = source;

  return new Promise((resolve) => { 
    source.onended = () => {
      if (globalSource === source) globalSource = null;
      if (audioSourceRef.current === source) audioSourceRef.current = null;
      resolve(void 0);
    }; 
    source.start(); 
  });
};