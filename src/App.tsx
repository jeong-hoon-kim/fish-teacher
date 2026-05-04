/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Upload, Fish, Waves, 
  Info, AlertCircle, RotateCcw, 
  ChevronRight, AlertTriangle, HelpCircle,
  Check, X, ChevronLeft, MapPin, Calendar, Clock
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationName, setLocationName] = useState<string>("위치 확인 중...");

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const locationRetryInterval = useRef<NodeJS.Timeout | null>(null);

  const fetchLocation = () => {
    if (navigator.geolocation) {
      setLocationName("위치 확인 중...");
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=ko`);
            if (response.ok) {
              const data = await response.json();
              const addr = data.address;
              const province = addr.province || addr.city || addr.state || "";
              const district = addr.borough || addr.suburb || addr.city_district || addr.county || "";
              if (province || district) {
                setLocationName(`${province} ${district}`.trim() || "위치 정보 없음");
              } else {
                setLocationName(data.display_name.split(',')[0]);
              }
            } else {
              setLocationName(`위도:${latitude.toFixed(2)} 경도:${longitude.toFixed(2)}`);
            }
          } catch (e) {
            setLocationName(`위도:${latitude.toFixed(2)} 경도:${longitude.toFixed(2)}`);
          }
        },
        (error) => {
          console.error("Geolocation error:", error);
          if (error.code === 1) { // PERMISSION_DENIED
            setLocationName("권한 거부됨 (터치하여 재시도)");
          } else {
            setLocationName("위치 정보 오류 (터치하여 재시도)");
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationName("GPS 미지원");
    }
  };

  // Time and Location updates
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    fetchLocation();
    return () => clearInterval(timer);
  }, []);

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
    <div className="min-h-screen bg-[#010a1a] flex flex-col items-center justify-start font-sans relative overflow-x-hidden selection:bg-sky-200">
      <main className="w-full max-w-[420px] min-h-[700px] sm:min-h-[850px] bg-gradient-to-b from-white via-white to-sky-50 rounded-none sm:rounded-[3.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] border-0 sm:border-[1px] border-white/20 flex flex-col relative z-20 overflow-hidden sm:my-8 transform-gpu transition-all">
        
        {/* Internal Sea Background Elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden h-full z-0">
          <div className="absolute top-[-5%] left-[-10%] w-[70%] h-[40%] bg-sky-200/30 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[0%] right-[-10%] w-[60%] h-[40%] bg-teal-100/40 rounded-full blur-[100px]"></div>
          
          {/* Internal God Rays */}
          <div className="absolute top-0 left-1/4 w-1 h-full bg-gradient-to-b from-sky-400/10 to-transparent -rotate-12 blur-[2px]"></div>
          <div className="absolute top-0 left-1/2 w-2 h-full bg-gradient-to-b from-teal-400/10 to-transparent -rotate-12 blur-[4px]"></div>

          {/* Rising Bubbles inside the frame */}
          {[...Array(6)].map((_, i) => (
            <motion.div 
              key={i}
              initial={{ y: "100%", x: `${10 + i * 15}%`, opacity: 0 }}
              animate={{ 
                y: "-10%",
                opacity: [0, 0.4, 0],
                x: [`${10 + i * 15}%`, `${12 + i * 15}%`, `${8 + i * 15}%`] 
              }}
              transition={{ 
                duration: 8 + i * 2, 
                repeat: Infinity, 
                delay: i * 1.5,
                ease: "linear" 
              }}
              className="absolute rounded-full border border-sky-300/30 blur-[0.5px]"
              style={{ width: `${6 + (i % 3) * 4}px`, height: `${6 + (i % 3) * 4}px` }}
            />
          ))}
        </div>

        {/* App Header */}
        <div className="px-6 pt-10 pb-6 bg-white/60 backdrop-blur-md border-b border-sky-100 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step === 2 && (
                <button 
                  onClick={handleBack}
                  className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-sky-100 text-sky-500 hover:bg-sky-50 transition-all mr-1"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-200/50 transform -rotate-3 transition-transform hover:rotate-0">
                <Fish className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-slate-900 font-black text-2xl tracking-tighter leading-none">생선선생</h1>
                <p className="text-[10px] text-teal-600 font-black uppercase tracking-[0.2em] mt-1.5 opacity-80">Ocean AI Assistant</p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <button 
                onClick={fetchLocation}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/80 rounded-xl border border-sky-100 mb-2 shadow-sm active:scale-95 transition-transform"
              >
                <MapPin className="w-3 h-3 text-sky-500" />
                <span className="text-[10px] font-bold text-sky-800 truncate max-w-[90px]">{locationName}</span>
              </button>
              <div className="flex flex-col items-end leading-none space-y-1.5">
                <div className="flex items-center gap-1 text-[11px] font-black text-slate-900 uppercase tracking-tight">
                  <Calendar className="w-3 h-3 text-sky-500" />
                  {currentTime.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                </div>
                <div className="flex items-center gap-1 text-[11px] font-black text-slate-900 uppercase tracking-tight">
                  <Clock className="w-3 h-3 text-sky-500" />
                  {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
              </div>
            </div>
          </div>
          
          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-8">
            <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= 1 ? 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.4)]' : 'bg-sky-100'}`}></div>
            <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.4)]' : 'bg-sky-100'}`}></div>
            <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= 3 ? 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.4)]' : 'bg-sky-100'}`}></div>
          </div>
          <p className="text-sky-700 text-[10px] font-bold mt-4 uppercase tracking-[0.2em] leading-none text-center">
            {step === 1 ? 'Step 1: 사진 업로드' : step === 2 ? 'Step 2: 정밀 측정' : 'Step 3: 판독 결과'}
          </p>
        </div>

        <div className="flex-1 px-4 py-4 overflow-y-auto relative z-10">
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
                <div className="mb-6 relative z-10">
                  <h2 className="text-2xl font-black text-slate-900 leading-tight tracking-tight">쉽고 빠르게 금어기,<br />금지체장을 확인하세요! 🎣</h2>
                  <p className="text-sm text-sky-800 mt-2 font-bold leading-relaxed">실시간 AI와 정밀 측정을 통해 어종과 크기를<br />정확하게 분석해드립니다.</p>
                </div>

                <div className="relative group aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[3.5rem] bg-slate-50/50 hover:bg-sky-50 transition-all cursor-pointer overflow-hidden p-8 shadow-inner shadow-slate-100/50">
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
                        className="mb-6 relative"
                      >
                        <div className="absolute inset-0 bg-sky-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                        <RotateCcw className="w-16 h-16 text-sky-500 relative z-10" />
                      </motion.div>
                      <p className="text-slate-800 font-black animate-pulse text-center text-lg">물고기를 판독하는 중... 🐟✨</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-24 h-24 bg-white rounded-[2.5rem] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] flex items-center justify-center mx-auto mb-8 group-hover:scale-110 transition-transform duration-500 border border-slate-50">
                        <Camera className="w-10 h-10 text-indigo-500" />
                      </div>
                      <p className="text-slate-900 font-black text-xl">사진 촬영 또는 업로드</p>
                      <p className="text-sky-800 text-xs mt-4 bg-white/80 backdrop-blur-sm px-5 py-2 rounded-2xl border border-sky-100 shadow-sm inline-block font-bold">정확한 측정 팁: 수직으로 촬영하고,<br />물고기 옆에 신용카드를 꼭 두세요! 📸</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* --- Step 2: Measurement --- */}
            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="h-full flex flex-col pt-2"
              >
                <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-4 mb-6 flex items-center gap-4 shadow-sm">
                  <div className="bg-sky-100 text-sky-600 rounded-xl p-2.5 shrink-0 shadow-inner">
                    <Fish className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900 leading-tight tracking-tight">판독 대상: <span className="text-sky-600 underline underline-offset-4 decoration-2">{species}</span></p>
                    <p className="text-[11px] text-slate-700 mt-1.5 font-bold italic leading-none">
                      {clickMode === 'card' 
                        ? "📍 카드의 세로 끝부분을 순서대로 터치하세요." 
                        : "🎯 물고기의 머리와 꼬리를 터치하세요!"}
                    </p>
                  </div>
                </div>

                {/* Main Interaction Area */}
                <div className="relative w-full aspect-[4/5] bg-slate-900 rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.2)] border-4 border-white cursor-crosshair group">
                  {imageSrc ? (
                    <img 
                      src={imageSrc} 
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none z-0 opacity-90" 
                      alt="uploaded fish"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 gap-2">
                       <Upload className="w-8 h-8 opacity-20" />
                       <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-20">이미지 로딩 중...</p>
                    </div>
                  )}

                  {/* Click Detector Canvas / Area */}
                  <div 
                    ref={canvasContainerRef}
                    onClick={handleCanvasClick}
                    className="absolute inset-0 z-20"
                  />

                  {/* Visual Points Overlay */}
                  <div className="absolute inset-0 pointer-events-none z-30">
                    {points.card.map((p, i) => (
                      <div 
                        key={`c-${i}`}
                        className="absolute w-6 h-6 bg-amber-500 rounded-full border-2 border-white shadow-lg -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-transform scale-110"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      >
                        <span className="text-[10px] text-white font-black">{i+1}</span>
                      </div>
                    ))}
                    {points.fish.map((p, i) => (
                      <div 
                        key={`f-${i}`}
                        className="absolute w-8 h-8 bg-sky-500 rounded-full border-2 border-white shadow-xl -translate-x-1/2 -translate-y-1/2 animate-pulse flex items-center justify-center transition-transform scale-110"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      >
                        <span className="text-[12px] text-white font-black">{i+1}</span>
                      </div>
                    ))}

                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      {points.card.length === 2 && (
                        <line 
                          x1={`${points.card[0].x}%`} y1={`${points.card[0].y}%`} 
                          x2={`${points.card[1].x}%`} y2={`${points.card[1].y}%`} 
                          stroke="#F59E0B" strokeWidth="2" strokeDasharray="6,4"
                        />
                      )}
                      {points.fish.length === 2 && (
                        <line 
                          x1={`${points.fish[0].x}%`} y1={`${points.fish[0].y}%`} 
                          x2={`${points.fish[1].x}%`} y2={`${points.fish[1].y}%`} 
                          stroke="#6366F1" strokeWidth="6" strokeLinecap="round" opacity="0.8"
                        />
                      )}
                    </svg>
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); resetPoints(); }}
                    className="absolute top-6 right-6 bg-white/90 backdrop-blur-md p-3.5 rounded-2xl shadow-xl hover:bg-white transition-all z-40 active:scale-95 group/btn border border-white/50"
                  >
                    <RotateCcw className="w-5 h-5 text-indigo-600 group-hover/btn:rotate-[-45deg] transition-transform" />
                  </button>
                </div>

                {/* Mode Toggles */}
                <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => setClickMode('card')}
                    className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${clickMode === 'card' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-2 ring-offset-2 ring-indigo-500' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    카드 측정 {points.card.length}/2
                  </button>
                  <button 
                    onClick={() => setClickMode('fish')}
                    className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${clickMode === 'fish' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-2 ring-offset-2 ring-indigo-500' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    물고기 측정 {points.fish.length}/2
                  </button>
                </div>

                <div className="mt-8 mb-6">
                  <button 
                    disabled={points.fish.length < 2 || isLoading}
                    onClick={checkRegulation}
                    className={`w-full font-black py-5 rounded-[2rem] shadow-2xl transition-all flex items-center justify-center gap-3 transform active:scale-95 text-lg
                      ${points.fish.length < 2 
                        ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-sky-600 to-teal-600 text-white shadow-sky-200 hover:shadow-sky-300 hover:brightness-110'}`}
                  >
                    {isLoading ? (
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>측정 결과 확인하기 <ChevronRight className="w-6 h-6" /></>
                    )}
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
                <div className={`rounded-[3.5rem] p-8 mb-6 border-b-[6px] shadow-2xl relative overflow-hidden transition-all duration-500 ${
                  result.status === 'pass' 
                    ? 'bg-emerald-50/80 border-emerald-500/20' 
                    : 'bg-rose-50/80 border-rose-500/20'
                }`}>
                  {/* Floating Bubbles Decor */}
                  <div className={`absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[80px] opacity-40 ${
                    result.status === 'pass' ? 'bg-emerald-300' : 'bg-rose-300'
                  }`}></div>

                  <div className="flex flex-col items-center text-center relative z-10">
                    <motion.div 
                      initial={{ scale: 0, rotate: -20 }} 
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", damping: 12, delay: 0.2 }}
                      className={`w-36 h-36 rounded-[3rem] flex items-center justify-center mb-10 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] border-4 border-white ${
                        result.status === 'pass' ? 'bg-emerald-100' : 'bg-rose-100'
                      }`}
                    >
                      {result.status === 'pass' ? (
                        <span className="text-7xl">🐟</span>
                      ) : (
                        <span className="text-7xl">🚫</span>
                      )}
                    </motion.div>

                    <h3 className={`text-4xl font-black mb-4 leading-none tracking-tighter ${
                        result.status === 'pass' ? 'text-emerald-900' : 'text-rose-900'
                    }`}>
                      {result.status === 'pass' ? '방생 불필요' : '방생 필요'}
                    </h3>
                    <p className={`text-[13px] font-bold leading-relaxed px-6 py-3 rounded-2xl bg-white/40 border border-white/50 ${
                        result.status === 'pass' ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {result.message}
                    </p>
                  </div>

                  <div className="mt-12 space-y-3">
                    <div className="flex justify-between items-center bg-white/80 backdrop-blur px-8 py-5 rounded-[2rem] shadow-sm border border-white/60">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">판독 어종</span>
                      <span className="font-black text-slate-900 text-xl">{species}</span>
                    </div>
                    {result.closedSeasonInfo && (
                      <div className="bg-amber-50/80 backdrop-blur border border-amber-200/50 px-8 py-5 rounded-[2rem] shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 mb-2">금어기 정보</p>
                        <p className="text-sm font-bold text-amber-900 leading-snug">{result.closedSeasonInfo}</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center bg-slate-900 px-8 py-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/20 blur-3xl rounded-full"></div>
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 relative z-10 leading-none">실제 측정 체장</span>
                      <span className={`text-6xl font-black relative z-10 tracking-tighter ${result.status === 'pass' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {result.length}<span className="text-xl ml-1 font-bold">cm</span>
                      </span>
                    </div>
                  </div>

                  {(result.status === 'violation') && (
                    <div className="mt-8 flex items-start gap-4 bg-rose-900/5 p-6 rounded-3xl border border-rose-100">
                      <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0" />
                      <p className="text-[12px] font-bold leading-relaxed text-rose-800">
                      수산자원 관리법에 따라 금지된 개체 채취 시 과태료가 부과될 수 있습니다. 미래의 바다를 위해 즉시 방생해주세요.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-auto space-y-4 pb-8 px-2">
                  <button 
                    onClick={restart}
                    className="w-full bg-gradient-to-r from-sky-600 via-teal-600 to-sky-600 bg-[length:200%_auto] hover:bg-right text-white font-black py-7 rounded-[2.5rem] shadow-[0_20px_40px_-10px_rgba(14,165,233,0.3)] transition-all transform active:scale-95 flex items-center justify-center gap-4 text-xl"
                  >
                    <RotateCcw className="w-6 h-6" />
                    다시 측정하기
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Waves (Hide on step 1) */}
        {step !== 1 && (
          <div className="absolute bottom-0 w-full h-48 pointer-events-none z-10">
            <motion.div 
              animate={{ x: [0, -100, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-0 w-[200%] h-full opacity-30"
            >
              <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                <path fill="#0891B2" d="M0,160L48,176C96,192,192,224,288,224C384,224,480,192,576,170.7C672,149,768,139,864,144C960,149,1056,171,1152,181.3C1248,192,1344,192,1392,192L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
              </svg>
            </motion.div>
            <motion.div 
              animate={{ x: [-100, 0, -100] }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-0 w-[200%] h-full opacity-20"
            >
              <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                <path fill="#22D3EE" d="M0,224L60,208C120,192,240,160,360,165.3C480,171,600,213,720,229.3C840,245,960,235,1080,213.3C1200,192,1320,160,1380,144L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"></path>
              </svg>
            </motion.div>
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
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 30 }}
              className="bg-white rounded-[3.5rem] w-full max-w-sm overflow-hidden shadow-[0_40px_80px_-15px_rgba(0,0,0,0.5)] border border-slate-100"
            >
              <div className="p-10 text-center">
                <div className="w-24 h-24 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <span className="text-5xl">
                    {(() => {
                      const reg: any = (regulationData as any)[species];
                      const standard = reg?.measurement_standard || "전장";
                      return MEASUREMENT_GUIDE[standard]?.icon || "📏";
                    })()}
                  </span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tighter">올바른 측정 방법 안내</h3>
                <p className="text-slate-800 font-black mb-8 leading-relaxed">
                  {species}의 측정 기준은 <br />
                  <span className="inline-block mt-3 bg-indigo-50 px-6 py-2 rounded-full text-indigo-600 italic text-xl border border-indigo-100 font-black shadow-sm">
                    " {(() => {
                      const reg: any = (regulationData as any)[species];
                      return reg?.measurement_standard || "전장";
                    })()} "
                  </span>
                  <br /> 입니다.
                </p>
                <div className="bg-slate-50 rounded-3xl p-6 mb-10 border border-slate-100 text-left">
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">
                    {(() => {
                      const reg: any = (regulationData as any)[species];
                      const standard = reg?.measurement_standard || "전장";
                      return MEASUREMENT_GUIDE[standard]?.desc || "물고기의 가장 긴 부분(머리 끝 ~ 꼬리 끝)을 측정합니다.";
                    })()}
                  </p>
                </div>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-[2rem] shadow-xl hover:bg-slate-800 transition-all active:scale-95 text-lg"
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

