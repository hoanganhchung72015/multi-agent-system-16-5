import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Subject, AgentType } from '../types';
import { Layout } from '../components/Layout';
import { processTask, generateSimilarQuiz, fetchTTSAudio, playStoredAudio, generateSummary } from '../services/geminiService';

// --- CUSTOM HOOK: Quản lý logic chuyên gia ---
const useAgentSystem = (selectedSubject: Subject | null) => {
  const [allResults, setAllResults] = useState<Partial<Record<AgentType, string>>>({});
  const [allAudios, setAllAudios] = useState<Partial<Record<AgentType, string>>>({});
  const [parsedSpeedResult, setParsedSpeedResult] = useState<{ finalAnswer: string, casioSteps: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [quiz, setQuiz] = useState<any>(null);

  const resetResults = useCallback(() => {
    setAllResults({});
    setAllAudios({});
    setParsedSpeedResult(null);
    setQuiz(null);
    setLoading(false);
    setLoadingStatus('');
  }, []);

  const runAgents = useCallback(async (
    primaryAgent: AgentType,
    allAgents: AgentType[],
    voiceText: string,
    image: string | null
  ) => {
    if (!selectedSubject || (!image && !voiceText)) return;

    setLoading(true);
    setLoadingStatus(`Đang kết nối chuyên gia...`);

    const processAgent = async (agent: AgentType) => {
      try {
        const res = await processTask(selectedSubject, agent, voiceText, image || undefined);
        setAllResults(prev => ({ ...prev, [agent]: res }));

        if (agent === AgentType.SPEED) {
          try {
            const parsed = JSON.parse(res);
            setParsedSpeedResult(parsed);
            generateSimilarQuiz(parsed.finalAnswer).then(q => q && setQuiz(q));
          } catch (e) {
            setAllResults(prev => ({ ...prev, [agent]: res })); // Fallback nếu không phải JSON
          }
        }
        
        // Tạo âm thanh đọc bài (TTS)
        generateSummary(res).then(sum => sum && fetchTTSAudio(sum).then(aud => aud && setAllAudios(p => ({...p, [agent]: aud}))));
      } catch (error: any) {
        setAllResults(prev => ({ ...prev, [agent]: `Lỗi: ${error.message}. Vui lòng thử lại.` }));
      }
    };

    // 1. Chạy chuyên gia ưu tiên
    await processAgent(primaryAgent);
    setLoading(false);

    // 2. Chạy các chuyên gia còn lại ngầm
    const others = allAgents.filter(a => a !== primaryAgent);
    Promise.allSettled(others.map(processAgent));
  }, [selectedSubject]);

  return { allResults, allAudios, parsedSpeedResult, loading, loadingStatus, quiz, resetResults, runAgents };
};

// --- COMPONENT CHÍNH ---
const App: React.FC = () => {
  const [screen, setScreen] = useState<'HOME' | 'INPUT' | 'ANALYSIS' | 'DIARY'>('HOME');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>(AgentType.SPEED);
  
  // Dữ liệu đầu vào
  const [image, setImage] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  
  // Camera & Preview
  const [showCamera, setShowCamera] = useState(false);
  const [isCounting, setIsCounting] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [capturedImagePreview, setCapturedImagePreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const { allResults, allAudios, parsedSpeedResult, loading, loadingStatus, quiz, resetResults, runAgents } = useAgentSystem(selectedSubject);
  const agents = useMemo(() => Object.values(AgentType), []);

  // Hàm nén ảnh dùng chung
  const compressImage = (videoOrImg: HTMLVideoElement | HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const MAX_WIDTH = 1024;
    let w = videoOrImg instanceof HTMLVideoElement ? videoOrImg.videoWidth : videoOrImg.width;
    let h = videoOrImg instanceof HTMLVideoElement ? videoOrImg.videoHeight : videoOrImg.height;

    if (w > MAX_WIDTH) {
      h = (MAX_WIDTH / w) * h;
      w = MAX_WIDTH;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(videoOrImg, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7);
  };

  // Xử lý Camera Countdown
  useEffect(() => {
    let timer: any;
    if (isCounting && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (isCounting && countdown === 0) {
      if (videoRef.current) {
        const compressed = compressImage(videoRef.current);
        setCapturedImagePreview(compressed);
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
        setShowCamera(false);
        setIsCounting(false);
      }
    }
    return () => clearTimeout(timer);
  }, [isCounting, countdown]);

  const handleRunAnalysis = () => {
    if (!image && !voiceText) return alert("Vui lòng chụp ảnh hoặc nói đề bài");
    setScreen('ANALYSIS');
    runAgents(selectedAgent, agents, voiceText, image);
  };

  const resetAll = useCallback(() => {
    resetResults();
    setImage(null);
    setVoiceText('');
    setCapturedImagePreview(null);
    setShowCamera(false);
    setIsCounting(false);
  }, [resetResults]);

  return (
    <Layout 
      onBack={() => {
        if (screen === 'ANALYSIS') setScreen('INPUT');
        else { resetAll(); setScreen('HOME'); }
      }}
      title={selectedSubject || (screen === 'DIARY' ? 'Nhật ký' : 'Symbiotic AI')}
    >
      {/* SCREEN: HOME */}
      {screen === 'HOME' && (
        <div className="grid grid-cols-2 gap-4 mt-6">
          {[Subject.MATH, Subject.PHYSICS, Subject.CHEMISTRY, Subject.DIARY].map((sub) => (
            <button key={sub} onClick={() => { setSelectedSubject(sub === Subject.DIARY ? null : sub); setScreen(sub === Subject.DIARY ? 'DIARY' : 'INPUT'); }} 
                    className="aspect-square bg-indigo-600 rounded-[2.5rem] text-white font-black text-xl shadow-xl active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
              <span>{sub === Subject.MATH ? '📐' : sub === Subject.PHYSICS ? '⚛️' : sub === Subject.CHEMISTRY ? '🧪' : '📔'}</span>
              <span className="uppercase text-sm tracking-widest">{sub}</span>
            </button>
          ))}
        </div>
      )}

      {/* SCREEN: INPUT */}
      {screen === 'INPUT' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="w-full aspect-video bg-slate-100 rounded-[2.5rem] overflow-hidden relative border-2 border-dashed border-slate-300">
            {showCamera ? (
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : capturedImagePreview ? (
              <img src={capturedImagePreview} className="w-full h-full object-contain" alt="Preview" />
            ) : image ? (
              <img src={image} className="w-full h-full object-contain" alt="Input" />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 font-bold p-6 text-center">
                {voiceText || "Sẵn sàng nhận đề bài..."}
              </div>
            )}
            {isCounting && <div className="absolute inset-0 flex items-center justify-center text-8xl font-black text-white drop-shadow-2xl">{countdown}</div>}
          </div>

          <div className="flex justify-around items-center">
            {capturedImagePreview ? (
              <>
                <button onClick={() => { setCapturedImagePreview(null); setShowCamera(true); setIsCounting(true); setCountdown(3); }} className="w-16 h-16 bg-rose-500 rounded-full text-2xl shadow-lg">🔄</button>
                <button onClick={() => { setImage(capturedImagePreview); setCapturedImagePreview(null); }} className="w-16 h-16 bg-emerald-500 rounded-full text-2xl shadow-lg">✅</button>
              </>
            ) : (
              <>
                <button onClick={() => { setShowCamera(true); setIsCounting(true); setCountdown(3); }} className="w-16 h-16 bg-blue-600 rounded-2xl text-2xl shadow-lg">📸</button>
                <button onClick={handleRunAnalysis} className="w-20 h-20 bg-indigo-700 rounded-3xl text-3xl shadow-2xl active:scale-90 transition-transform">🚀</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* SCREEN: ANALYSIS */}
      {screen === 'ANALYSIS' && (
        <div className="space-y-4 pb-10">
          <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
            {agents.map(ag => (
              <button key={ag} onClick={() => setSelectedAgent(ag)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${selectedAgent === ag ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>{ag}</button>
            ))}
          </div>

          <div className="bg-white rounded-[2.5rem] p-6 shadow-sm min-h-[400px] border border-slate-100">
            {loading && !allResults[selectedAgent] ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{loadingStatus}</p>
              </div>
            ) : (
              <div className="prose prose-slate max-w-none math-font animate-in fade-in">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {parsedSpeedResult && selectedAgent === AgentType.SPEED ? parsedSpeedResult.finalAnswer : allResults[selectedAgent] || "Đang chuẩn bị nội dung..."}
                </ReactMarkdown>
                
                {selectedAgent === AgentType.SPEED && parsedSpeedResult?.casioSteps && (
                  <div className="mt-6 p-4 bg-emerald-50 rounded-2xl border-l-4 border-emerald-500">
                    <p className="text-[10px] font-black text-emerald-600 uppercase mb-2">Bấm máy Casio:</p>
                    <div className="text-sm whitespace-pre-wrap">{parsedSpeedResult.casioSteps}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </Layout>
  );
};

export default App;