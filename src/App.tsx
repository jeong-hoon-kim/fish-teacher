/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Upload, Fish, Waves, 
  Info, AlertCircle, RotateCcw, 
  ChevronRight, AlertTriangle, HelpCircle,
  Check, X, ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import regulationData from './regulation.json';

// --- Constants & Types ---
const CARD_STANDARD_CM = 8.56; 

const SPECIES_MAP: Record<string, string> = {
  "Korea rockfish": "조피볼락",
  "Rock bream": "돌돔",
  "Olive flounder": "넙치",
  "Red seabream": "참돔",
  "Black porgy": "감성돔"
};

const MEASUREMENT_GUIDE: Record<string, { icon: string, text: string }> = {
  "전장": { icon: "🐟↔️", text: "입 끝부터 꼬리 끝까지 측정해주세요." },
  "체반폭": { icon: "↔️", text: "지느러미 양 끝의 가장 넓은 폭을 측정해주세요." },
  "항문장": { icon: "🐟-🍑", text: "입 끝부터 항문까지의 길이를 측정해주세요." },
  "외투장": { icon: "🦑", text: "다리를 제외한 몸통(외투막) 길이를 측정해주세요." },
  "두흉갑장": { icon: "🦀", text: "게나 새우의 등껍질 길이를 측정해주세요." },
  "각장": { icon: "🐚", text: "껍데기의 가장 긴 길이를 측정해주세요." },
};

type Step = 1 | 2 | 3;
type ClickMode = 'card' | 'fish';
type Point = { x: number; y: number };
type RegulationResult = {
  length: string;
  status: 'pass' | 'violation' | 'unknown';
  message: string;
  closedSeasonInfo?: string;
};

const MOCK_SPECIES = "참돔 (Red Sea Bream)";

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [species, setSpecies] = useState("");
  const [points, setPoints] = useState<{ card: Point[]; fish: Point[] }>({ card: [], fish: [] });
  const [clickMode, setClickMode] = useState<ClickMode>('card');
  const [result, setResult] = useState<RegulationResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // 1. Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);

    // Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Call Backend /predict
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch("http://localhost:8000/predict", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        // 영어 어종명을 한글로 변환
        const korName = SPECIES_MAP[data.species] || data.species || MOCK_SPECIES;
        setSpecies(korName);
      } else {
        setSpecies(MOCK_SPECIES);
      }
      setStep(2);
      setShowGuide(true); // 판독 완료 후 가이드 팝업 띄우기
    } catch (err) {
      console.error("Predict API Error:", err);
      setSpecies(MOCK_SPECIES);
      setStep(2);
      setShowGuide(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      resetPoints();
    }
  };

  // 2. Canvas Interaction
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (step !== 2) return;
    
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Direct calculation based on clientX/Y and rect
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newPoint = { x, y };

    if (clickMode === 'card') {
      if (points.card.length < 2) {
        setPoints(prev => {
          const nextCard = [...prev.card, newPoint];
          const updated = { ...prev, card: nextCard };
          if (nextCard.length === 2) setClickMode('fish');
          return updated;
        });
      }
    } else {
      if (points.fish.length < 2) {
        setPoints(prev => ({ ...prev, fish: [...prev.fish, newPoint] }));
      }
    }
  };

  const resetPoints = () => {
    setPoints({ card: [], fish: [] });
    setClickMode('card');
  };

  // 3. Measurement & Regulation Check
  const checkRegulation = async () => {
    if (points.card.length !== 2 || points.fish.length !== 2) return;

    setIsLoading(true);
    
    const cardDist = Math.sqrt(
      Math.pow(points.card[1].x - points.card[0].x, 2) + 
      Math.pow(points.card[1].y - points.card[0].y, 2)
    );
    const fishDist = Math.sqrt(
      Math.pow(points.fish[1].x - points.fish[0].x, 2) + 
      Math.pow(points.fish[1].y - points.fish[0].y, 2)
    );

    const calculatedLengthValue = ((fishDist / cardDist) * CARD_STANDARD_CM);
    const calculatedLength = calculatedLengthValue.toFixed(1);

    // Finding regulation data
    const speciesKey = Object.keys(regulationData).find(key => 
      species.includes(key) || key.includes(species)
    );
    const reg = speciesKey ? (regulationData as any)[speciesKey] : null;

    let status: 'pass' | 'violation' | 'unknown' = 'pass';
    let message = `${species}의 금지체장 기준을 통과했습니다.`;
    let closedSeasonInfo = "";

    if (reg) {
      const { min_length, closed_season, region_notes } = reg;
      const currentMonth = new Date().getMonth() + 1; // 1-12
      const [start, end] = closed_season;

      // 1. Check Length
      if (min_length !== null && calculatedLengthValue < min_length) {
        status = 'violation';
        message = `${speciesKey}의 금지체장은 ${min_length}cm입니다. 현재 ${calculatedLength}cm로 방생 대상입니다.`;
      }

      // 2. Check Closed Season
      if (start !== null && end !== null) {
        let isClosed = false;
        if (start <= end) {
          isClosed = currentMonth >= start && currentMonth <= end;
        } else {
          // Cross-year (e.g., 12 to 1)
          isClosed = currentMonth >= start || currentMonth <= end;
        }

        if (isClosed) {
          status = 'violation';
          message = min_length !== null && calculatedLengthValue < min_length
            ? `${message} 또한 현재 금어기(${region_notes})입니다.`
            : `현재 ${speciesKey}의 금어기(${region_notes})입니다. 즉시 방생해주세요.`;
          closedSeasonInfo = `금어기 안내: ${region_notes}`;
        }
      }
    } else {
      status = 'unknown';
      message = `어종(${species})에 대한 정확한 규정 정보를 찾을 수 없습니다. 현지 규정을 확인하세요.`;
    }

    try {
      setResult({
        length: calculatedLength,
        status,
        message,
        closedSeasonInfo
      });
      setStep(3);
    } catch (err) {
      console.error("Regulation check error:", err);
      setResult({
        length: calculatedLength,
        status: calculatedLengthValue >= 24 ? 'pass' : 'violation',
        message: `규정 확인 중 오류가 발생했습니다. (측정: ${calculatedLength}cm)`
      });
      setStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  const restart = () => {
    setStep(1);
    setImageSrc(null);
    setPoints({ card: [], fish: [] });
    setClickMode('card');
    setResult(null);
    setSpecies("");
  };

  return (
    <div className="min-h-screen bg-[#F0F9FF] flex flex-col items-center justify-start font-sans relative overflow-x-hidden selection:bg-sky-200">
      <main className="w-full max-w-[420px] min-h-[700px] sm:min-h-[850px] bg-white rounded-none sm:rounded-[3rem] shadow-2xl border-0 sm:border-[8px] border-white flex flex-col relative z-10 overflow-hidden sm:my-8 transform-gpu transition-all">
        
        {/* App Header */}
        <div className="px-6 pt-10 pb-4 bg-gradient-to-b from-sky-100 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step === 2 && (
                <button 
                  onClick={handleBack}
                  className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-sky-50 text-sky-500 hover:bg-sky-50 transition-colors mr-1"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              <div className="w-12 h-12 bg-sky-500 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-200">
                <Fish className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-sky-900 font-black text-2xl tracking-tight leading-none">생선선생</h1>
                <p className="text-[10px] text-sky-400 font-black uppercase tracking-widest mt-1">스마트 어종 판독기</p>
              </div>
            </div>
            <button className="p-2 text-sky-400 hover:text-sky-600 transition-colors">
              <HelpCircle className="w-6 h-6" />
            </button>
          </div>
          
          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-8">
            <div className={`h-2 flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-sky-500' : 'bg-sky-100'}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-sky-500' : 'bg-sky-100'}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all duration-300 ${step >= 3 ? 'bg-sky-500' : 'bg-sky-100'}`}></div>
          </div>
          <p className="text-sky-400 text-[11px] font-black mt-3 uppercase tracking-widest leading-none">
            {step === 1 ? 'Step 1: 사진 업로드' : step === 2 ? 'Step 2: 정밀 측정' : 'Step 3: 판독 결과'}
          </p>
        </div>

        <div className="flex-1 px-4 py-4 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* --- Step 1: Upload --- */}
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full flex flex-col pt-4"
              >
                <div className="mb-8">
                  <h2 className="text-2xl font-black text-sky-900 leading-tight">쉽고 빠르게 금어기,<br />금지체장을 확인하세요! 🎣</h2>
                  <p className="text-sm text-sky-500 mt-2 font-medium">실시간 AI가 어종과 크기를 분석해드립니다.</p>
                </div>

                <div className="relative group aspect-square flex flex-col items-center justify-center border-4 border-dashed border-sky-100 rounded-[3rem] bg-sky-50/20 hover:bg-sky-50/50 hover:border-sky-300 transition-all cursor-pointer overflow-hidden p-6">
                  <input 
                    type="file" accept="image/*" 
                    onChange={handleImageUpload}
                    className="absolute inset-0 opacity-0 z-30 cursor-pointer"
                  />
                  {isLoading ? (
                    <div className="flex flex-col items-center">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="mb-4"
                      >
                        <RotateCcw className="w-16 h-16 text-sky-500" />
                      </motion.div>
                      <p className="text-sky-600 font-bold animate-pulse text-center">물고기를 분석하고 있어요... 🐟💦</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-24 h-24 bg-white rounded-full shadow-2xl flex items-center justify-center mx-auto mb-8 group-hover:scale-105 transition-transform">
                        <Camera className="w-10 h-10 text-sky-500" />
                      </div>
                      <p className="text-sky-900 font-bold text-lg">사진 촬영 또는 업로드</p>
                      <p className="text-sky-400 text-xs mt-3 bg-white/50 px-4 py-1 rounded-full border border-sky-50 inline-block font-medium">정확한 측정을 위해 카드를 준비해주세요!</p>
                    </div>
                  )}
                </div>

                <div className="mt-8 bg-amber-50 rounded-2xl p-4 border border-amber-100 flex gap-3">
                  <div className="bg-amber-100 p-2 rounded-xl h-fit">
                    <Info className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-900 uppercase tracking-tighter">정확한 측정 팁</h4>
                    <p className="text-[11px] text-amber-700 leading-normal mt-1">
                      1. 수직 위에서 평행하게 촬영해주세요.<br />
                      2. 물고기 옆에 신용카드(8.56cm)를 꼭 두세요.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* --- Step 2: Measure --- */}
            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="h-full flex flex-col pt-2"
              >
                <div className="bg-sky-50 border border-sky-100 rounded-2xl p-3 mb-4 flex items-center gap-3">
                  <div className="bg-sky-200 text-sky-600 rounded-lg p-2 shrink-0">
                    <Fish className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-sky-900 leading-tight">분석 결과: <span className="text-sky-600 font-black">{species}</span></p>
                    <p className="text-[10px] text-sky-500 mt-1 font-medium leading-none">
                      {clickMode === 'card' 
                        ? "📍 카드의 양 끝을 순서대로 터치하세요." 
                        : "🎯 물고기의 머리와 꼬리를 터치하세요!"}
                    </p>
                  </div>
                </div>

                {/* Main Interaction Area */}
                <div className="relative w-full aspect-[4/5] bg-slate-100 rounded-[2.5rem] overflow-hidden shadow-inner border-[6px] border-white cursor-crosshair group">
                  {imageSrc ? (
                    <img 
                      src={imageSrc} 
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none z-0" 
                      alt="uploaded fish"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-2">
                       <Upload className="w-8 h-8 opacity-30" />
                       <p className="text-xs font-bold uppercase tracking-widest opacity-30">이미지 로딩 중...</p>
                    </div>
                  )}

                  {/* Click Detector Canvas / Area */}
                  <div 
                    ref={canvasContainerRef}
                    onClick={handleCanvasClick}
                    className="absolute inset-0 z-20"
                  />

                  {/* Visual Points Overlay - Pointer events disabled so they don't block clicks */}
                  <div className="absolute inset-0 pointer-events-none z-30">
                    {points.card.map((p, i) => (
                      <div 
                        key={`c-${i}`}
                        className="absolute w-5 h-5 bg-red-500 rounded-full border-2 border-white shadow-lg -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      >
                        <span className="text-[8px] text-white font-bold">{i+1}</span>
                      </div>
                    ))}
                    {points.fish.map((p, i) => (
                      <div 
                        key={`f-${i}`}
                        className="absolute w-7 h-7 bg-blue-500 rounded-full border-2 border-white shadow-xl -translate-x-1/2 -translate-y-1/2 animate-pulse flex items-center justify-center"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      >
                        <span className="text-[10px] text-white font-black">{i+1}</span>
                      </div>
                    ))}

                    {/* SVG Connecting Lines */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      {points.card.length === 2 && (
                        <line 
                          x1={`${points.card[0].x}%`} y1={`${points.card[0].y}%`} 
                          x2={`${points.card[1].x}%`} y2={`${points.card[1].y}%`} 
                          stroke="#ef4444" strokeWidth="2" strokeDasharray="5"
                        />
                      )}
                      {points.fish.length === 2 && (
                        <line 
                          x1={`${points.fish[0].x}%`} y1={`${points.fish[0].y}%`} 
                          x2={`${points.fish[1].x}%`} y2={`${points.fish[1].y}%`} 
                          stroke="#3b82f6" strokeWidth="4"
                        />
                      )}
                    </svg>
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); resetPoints(); }}
                    className="absolute top-4 right-4 bg-white/80 backdrop-blur p-3 rounded-full shadow-lg hover:bg-white transition-all z-40 active:scale-90"
                  >
                    <RotateCcw className="w-4 h-4 text-sky-600" />
                  </button>
                </div>

                <div className="mt-8 mb-6">
                  <button 
                    disabled={points.fish.length < 2 || isLoading}
                    onClick={checkRegulation}
                    className={`w-full font-black py-5 rounded-3xl shadow-2xl shadow-sky-100 transition-all flex items-center justify-center gap-2 transform active:scale-95
                      ${points.fish.length < 2 
                        ? 'bg-sky-100 text-sky-300 cursor-not-allowed shadow-none' 
                        : 'bg-sky-500 hover:bg-sky-600 text-white'}`}
                  >
                    {isLoading ? "분석 중..." : "측정 및 규정 확인하기"}
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* --- Step 3: Result --- */}
            {step === 3 && result && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="h-full flex flex-col pt-2"
              >
                <div className={`rounded-[3rem] p-8 mb-6 border-[3px] shadow-2xl relative overflow-hidden transition-all duration-500 ${
                  result.status === 'pass' 
                    ? 'bg-emerald-50 border-emerald-100' 
                    : 'bg-orange-50 border-orange-100'
                }`}>
                  {/* Floating Bubbles Decor */}
                  <div className={`absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl opacity-30 ${
                    result.status === 'pass' ? 'bg-emerald-400' : 'bg-orange-400'
                  }`}></div>

                  <div className="flex flex-col items-center text-center relative z-10">
                    <motion.div 
                      initial={{ scale: 0 }} 
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 12 }}
                      className={`w-32 h-32 rounded-full flex items-center justify-center mb-8 shadow-inner ${
                        result.status === 'pass' ? 'bg-emerald-100' : 'bg-orange-100'
                      }`}
                    >
                      {result.status === 'pass' ? (
                        <span className="text-6xl">😊</span>
                      ) : (
                        <span className="text-6xl">😭</span>
                      )}
                    </motion.div>

                    <h3 className={`text-3xl font-black mb-3 leading-none ${
                        result.status === 'pass' ? 'text-emerald-900' : result.status === 'violation' ? 'text-orange-900' : 'text-sky-900'
                    }`}>
                      {result.status === 'pass' ? '방생 불필요' : result.status === 'violation' ? '금지 체장 위반' : '정보 없음'}
                    </h3>
                    <p className={`text-sm font-bold opacity-80 leading-relaxed px-4 ${
                        result.status === 'pass' ? 'text-emerald-700' : result.status === 'violation' ? 'text-orange-700' : 'text-sky-700'
                    }`}>
                      {result.message}
                    </p>
                  </div>

                  <div className="mt-10 space-y-3">
                    <div className="flex justify-between items-center bg-white/70 backdrop-blur px-6 py-5 rounded-[2rem] border border-white">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">판독 어종</span>
                      <span className="font-bold text-slate-900 text-lg">{species}</span>
                    </div>
                    {result.closedSeasonInfo && (
                      <div className="bg-amber-50/50 border border-amber-100 px-6 py-4 rounded-2xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">금어기 정보</p>
                        <p className="text-xs font-bold text-amber-900">{result.closedSeasonInfo}</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center bg-white/70 backdrop-blur px-6 py-7 rounded-[2.5rem] border border-white">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">최종 체장</span>
                      <span className={`text-5xl font-black ${result.status === 'pass' ? 'text-emerald-600' : result.status === 'violation' ? 'text-orange-600' : 'text-sky-600'}`}>
                        {result.length} <span className="text-xl">cm</span>
                      </span>
                    </div>
                  </div>

                  {(result.status === 'violation') && (
                    <div className="mt-8 flex items-start gap-3 bg-white/50 p-5 rounded-2xl border border-orange-100">
                      <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] font-bold leading-relaxed text-orange-900">
                      수산자원 관리법에 따라 금지된 개체 채취 시 과태료가 부과될 수 있습니다. 미래의 바다를 위해 방생해주세요.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-auto space-y-4 pb-6 px-2">
                  <button 
                    onClick={restart}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white font-black py-6 rounded-[2.5rem] shadow-2xl shadow-sky-200 transition-all transform active:scale-95 flex items-center justify-center gap-3"
                  >
                    <RotateCcw className="w-5 h-5" />
                    다시 측정하기
                  </button>
                  <button className="w-full text-sky-400 font-black py-2 text-[11px] uppercase tracking-[0.2em] hover:text-sky-600 transition-colors">
                    Save to Gallery
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Wave (Hide on step 1) */}
        {step !== 1 && (
          <div className="absolute bottom-0 w-full h-32 bg-sky-500/5 pointer-events-none transform translate-y-16">
            <svg className="w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
              <path fill="#0EA5E9" fillOpacity="0.1" d="M0,192L48,176C96,160,192,128,288,133.3C384,139,480,181,576,181.3C672,181,768,139,864,138.7C960,139,1056,181,1152,181.3C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
          </div>
        )}
      </main>

      {/* Measurement Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-sky-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl">
                    {(() => {
                      const reg: any = (regulationData as any)[species];
                      const standard = reg?.measurement_standard || "전장";
                      return MEASUREMENT_GUIDE[standard]?.icon || "📏";
                    })()}
                  </span>
                </div>
                <h3 className="text-xl font-black text-sky-900 mb-2">올바른 측정 방법 안내</h3>
                <p className="text-sky-600 font-bold mb-6">
                  {species}의 측정 기준은 <br />
                  <span className="inline-block mt-2 bg-sky-100 px-4 py-1.5 rounded-full text-sky-700 italic text-lg shadow-sm border border-sky-200">
                    " {(() => {
                      const reg: any = (regulationData as any)[species];
                      return reg?.measurement_standard || "전장";
                    })()} "
                  </span>
                  <br /> 입니다.
                </p>
                <div className="bg-sky-50 rounded-2xl p-5 mb-8 border border-sky-100">
                  <p className="text-sm font-medium text-sky-800 leading-relaxed">
                    {(() => {
                      const reg: any = (regulationData as any)[species];
                      const standard = reg?.measurement_standard || "전장";
                      return MEASUREMENT_GUIDE[standard]?.text || "머리 끝부터 꼬리 끝까지 측정해주세요.";
                    })()}
                  </p>
                </div>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white font-black py-5 rounded-[2rem] shadow-xl shadow-sky-100 transition-all active:scale-95"
                >
                  확인했습니다
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        ::-webkit-scrollbar {
          width: 0px;
        }
        @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&family=Gowun+Dodum&display=swap');
        body {
          font-family: 'Quicksand', 'Gowun Dodum', sans-serif;
        }
      `}</style>
    </div>
  );
}

