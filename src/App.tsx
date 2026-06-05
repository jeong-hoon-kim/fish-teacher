/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Upload, Fish, Waves, 
  Info, AlertCircle, RotateCcw, 
  ChevronRight, AlertTriangle, HelpCircle,
  Check, X, ChevronLeft, MapPin, Calendar, Clock,
  History, Map as MapIcon, LogIn, LogOut, Save, User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import regulationData from './regulation.json';
import { db, auth, signInWithGoogle, signOut } from './lib/firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { CatchRecord } from './types';
import HistoryBoard from './components/HistoryBoard';
import MapBoard from './components/MapBoard';

  // --- Constants & Types ---
const CARD_STANDARD_CM = 8.56; 
const MAX_IMAGE_DIMENSION = 800; // Resize large images for Firestore 1MB limit

const compressImage = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_IMAGE_DIMENSION) {
          height *= MAX_IMAGE_DIMENSION / width;
          width = MAX_IMAGE_DIMENSION;
        }
      } else {
        if (height > MAX_IMAGE_DIMENSION) {
          width *= MAX_IMAGE_DIMENSION / height;
          height = MAX_IMAGE_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to JPEG
    };
  });
};

const SPECIES_MAP: Record<string, string> = {
  // 기존 5종 및 영문/학명 매핑
  "Korea rockfish": "조피볼락(우럭)",
  "Rockfish": "조피볼락(우럭)",
  "Korean rockfish": "조피볼락(우럭)",
  "Sebastes schlegelii": "조피볼락(우럭)",
  "Rock bream": "돌돔",
  "Rockbream": "돌돔",
  "Oplegnathus fasciatus": "돌돔",
  "Olive flounder": "넙치(광어)",
  "Flounder": "넙치(광어)",
  "Paralichthys olivaceus": "넙치(광어)",
  "Red seabream": "참돔",
  "Red sea bream": "참돔",
  "Pagrus major": "참돔",
  "Black porgy": "감성돔",
  "Blackporgy": "감성돔",
  "Acanthopagrus schlegelii": "감성돔",

  // 신규 추가 어종 (갈치 제외 16종 매핑)
  "Chub mackerel": "고등어",
  "Scomber japonicus": "고등어",
  "Snakehead": "가물치",
  "Channa argus": "가물치",
  "White trevally": "흑점줄전갱이",
  "Pseudocaranx dentex": "흑점줄전갱이",
  "Flathead grey mullet": "숭어",
  "Mugil cephalus": "숭어",
  "Freshwater Eel": "뱀장어(민물장어)",
  "Anguilla japonica": "뱀장어(민물장어)",
  "belone belone": "학꽁치",
  "Hyporhamphus sajori": "학꽁치",
  "Japanese amberjack": "방어",
  "Seriola quinqueradiata": "방어",
  "Black Scraper": "말쥐치",
  "Thamnaconus modestus": "말쥐치",
  "Japanese Spanish mackerel": "삼치",
  "Scomberomorus niphonius": "삼치",
  "Silver sillago": "보리멸",
  "Sillago sihama": "보리멸",
  "Bluefin gurnard": "성대",
  "Chelidonichthys spinosus": "성대",

  // 기타 기존 어종
  "Sea bass": "농어",
  "Seabass": "농어",
  "Common octopus": "참문어",
  "Octopus": "낙지",
  "Squid": "살오징어"
};

const MEASUREMENT_GUIDE: Record<string, { icon: string, text: string }> = {
  "전장": { icon: "🐟↔️", text: "입 끝부터 꼬리 끝까지 측정해주세요." },
  "체반폭": { icon: "↔️", text: "지느러미 양 끝의 가장 넓은 폭을 측정해주세요." },
  "항문장": { icon: "🐟-🍑", text: "입 끝부터 항문까지의 길이를 측정해주세요." },
  "외투장": { icon: "🦑", text: "다리를 제외한 몸통(외투막) 길이를 측정해주세요." },
  "두흉갑장": { icon: "🦀", text: "게나 새우의 등껍질 길이를 측정해주세요." },
  "각장": { icon: "🐚", text: "껍데기의 가장 긴 길이를 측정해주세요." },
  "각고": { icon: "🐚↕️", text: "껍데기의 높이(가장 높은 부분)를 측정해주세요." },
};

const FORK_FACTORS: Record<string, number> = {
  "참돔": 1.08,
  "감성돔": 1.08,
  "돌돔": 1.05,
  "고등어": 1.10,
  "삼치": 1.10,
  "방어": 1.10,
  "흑점줄전갱이": 1.10,
  "숭어": 1.08,
  "보리멸": 1.03,
  "성대": 1.02
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
  const [activeTab, setActiveTab] = useState<'capture' | 'history' | 'map'>('capture');
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<CatchRecord[]>([]);

  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [species, setSpecies] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [points, setPoints] = useState<{ card: Point[]; fish: Point[] }>({ card: [], fish: [] });
  const [clickMode, setClickMode] = useState<ClickMode>('card');
  const [draggedPoint, setDraggedPoint] = useState<{ type: 'card' | 'fish'; index: number } | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const [result, setResult] = useState<RegulationResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationName, setLocationName] = useState<string>("위치 확인 중...");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Firebase Auth & Data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Save user to users collection for reference
        setDoc(doc(db, 'users', u.uid), {
          userId: u.uid,
          email: u.email,
          displayName: u.displayName
        }, { merge: true });

        // Listen to catches
        const q = query(
          collection(db, 'catches'),
          where('userId', '==', u.uid),
          orderBy('capturedAt', 'desc')
        );
        return onSnapshot(q, (snapshot) => {
          const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CatchRecord));
          setRecords(list);
        });
      } else {
        setRecords([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchLocation = (highAccuracy = true) => {
    if (!navigator.geolocation) {
      setLocationName("GPS 미지원 브라우저");
      return;
    }

    setLocationName("위치 확인 중...");
    
    // 타임아웃을 겹쳐서 시도 (고정밀 -> 저정밀)
    const options: PositionOptions = {
      enableHighAccuracy: highAccuracy,
      timeout: highAccuracy ? 6000 : 15000,
      maximumAge: highAccuracy ? 0 : 60000
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=ko`);
          if (response.ok) {
            const data = await response.json();
            const addr = data.address;
            const province = addr.province || addr.city || addr.state || "";
            const district = addr.borough || addr.suburb || addr.city_district || addr.county || "";
            if (province || district) {
              setLocationName(`${province} ${district}`.trim());
            } else {
              setLocationName(data.display_name.split(',')[0]);
            }
          } else {
            setLocationName(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
          }
        } catch (e) {
          setLocationName(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
        }
      },
      (error) => {
        console.warn("Geolocation error:", error);
        
        // 고정밀 시도에서 실패한 경우 저정밀로 자동 재시도
        if (highAccuracy && error.code !== 1) {
          console.log("Retrying with low accuracy...");
          fetchLocation(false);
          return;
        }

        if (error.code === 1) { // PERMISSION_DENIED
          setLocationName("권한 거부됨 (설명보기)");
        } else if (error.code === 3) { // TIMEOUT
          setLocationName("위치 찾기 시간 초과");
        } else {
          setLocationName("위치 정보 오류");
        }
      },
      options
    );
  };

  // Time and Location updates
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    fetchLocation(true);
    return () => clearInterval(timer);
  }, []);

  // 4. Drag & Drop for Points
  useEffect(() => {
    if (!draggedPoint) return;

    const handleMove = (clientX: number, clientY: number) => {
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

      setPoints(prev => {
        const updatedList = [...prev[draggedPoint.type]];
        if (draggedPoint.index < updatedList.length) {
          updatedList[draggedPoint.index] = { x, y };
        }
        return {
          ...prev,
          [draggedPoint.type]: updatedList
        };
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      if (e.cancelable) {
        e.preventDefault();
      }
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleMouseUp = () => {
      setDraggedPoint(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [draggedPoint]);

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

    // AI 분석 요청
    try {
      const startTime = Date.now();
      console.log("🚀 AI 분석 시작...");

      // 1. 이미지 압축 및 변환 (속도 향상을 위해 필요)
      const readerForCompress = new FileReader();
      const compressedFile: File = await new Promise((resolve) => {
        readerForCompress.onload = async (event) => {
          const compressedDataUrl = await compressImage(event.target?.result as string);
          const response = await fetch(compressedDataUrl);
          const blob = await response.blob();
          resolve(new File([blob], 'analyzing.jpg', { type: 'image/jpeg' }));
        };
        readerForCompress.readAsDataURL(file);
      });

      console.log(`📦 이미지 압축 완료 (${(compressedFile.size / 1024).toFixed(1)}KB)`);

      const formData = new FormData();
      formData.append('file', compressedFile);
      
      const response = await fetch("/predict", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ AI 분석 완료 (${duration}초):`, data);
        
        const rawSpecies = data.species;
        let korName = rawSpecies;

        const cleanRaw = (rawSpecies || "").replace(/_/g, ' ').toLowerCase().trim();
        const matchedKey = Object.keys(SPECIES_MAP).find(
          key => key.replace(/_/g, ' ').toLowerCase().trim() === cleanRaw
        );

        if (matchedKey) {
          korName = SPECIES_MAP[matchedKey];
        } else {
          korName = rawSpecies || MOCK_SPECIES;
        }
        
        setSpecies(korName);
        setConfidence(data.confidence || null);

        // 자동 검출된 카드 및 물고기 점 좌표 자동 설정
        if (data.card_points && data.card_points.length === 2) {
          setPoints(prev => ({ ...prev, card: data.card_points }));
          setClickMode('fish');
        }
        if (data.fish_points && data.fish_points.length === 2) {
          setPoints(prev => ({ ...prev, fish: data.fish_points }));
        }
      } else {
        console.warn("Prediction failed, using fallback.");
        setSpecies(MOCK_SPECIES);
        setConfidence(null);
      }
      setStep(2);
      setShowGuide(true);
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

    // V자형 꼬리 어종 보정 계수 적용 (가랑이체장 -> 전장 변환)
    const speciesKeyForFactor = Object.keys(FORK_FACTORS).find(key => 
      species.includes(key) || key.includes(species)
    );
    const forkFactor = speciesKeyForFactor ? FORK_FACTORS[speciesKeyForFactor] : 1.00;

    const calculatedLengthValue = ((fishDist / cardDist) * CARD_STANDARD_CM) * forkFactor;
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
        status: 'unknown',
        message: `규정 확인 중 오류가 발생했습니다: ${species} (측정: ${calculatedLength}cm)`
      });
      setStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRecord = async () => {
    if (!user || !result || !coords) return;
    setIsSaving(true);
    try {
      // Compress image before saving to fit in Firestore 1MB limit
      const finalImage = imageSrc ? await compressImage(imageSrc) : null;

      await addDoc(collection(db, 'catches'), {
        userId: user.uid,
        species,
        length: parseFloat(result.length),
        location: {
          latitude: coords.lat,
          longitude: coords.lng,
          name: locationName
        },
        capturedAt: new Date().toISOString(),
        image: finalImage, 
        status: result.status
      });
      alert("성공적으로 기록되었습니다! '기록' 탭에서 확인하세요.");
      restart();
      setActiveTab('history');
    } catch (err: any) {
      console.error("Save catch error:", err);
      if (err.message?.includes('permission-denied')) {
        alert("기록 저장 권한이 없습니다. 보안 규칙 문제이거나 사진 용량이 너무 클 수 있습니다.");
      } else if (err.message?.includes('quota-exceeded')) {
        alert("파이어베이스 무료 사용량이 초과되었습니다. 내일 다시 시도해주세요.");
      } else {
        alert("기록 저장 중 오류가 발생했습니다: " + (err.message || "알 수 없는 오류"));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!window.confirm("기록을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(db, 'catches', id));
    } catch (err) {
      console.error("Delete record error:", err);
    }
  };

  const restart = () => {
    setStep(1);
    setImageSrc(null);
    setPoints({ card: [], fish: [] });
    setClickMode('card');
    setResult(null);
    setSpecies("");
    setImageAspectRatio(null);
  };

  return (
    <div className="min-h-screen bg-[#010a1a] flex flex-col items-center justify-start font-sans relative overflow-x-hidden selection:bg-sky-200">
      <main className="w-full max-w-[420px] min-h-[700px] sm:min-h-[850px] bg-gradient-to-b from-white via-white to-sky-50 rounded-none sm:rounded-[3.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] border-0 sm:border-[1px] border-white/20 flex flex-col relative z-20 overflow-hidden sm:my-8 transform-gpu transition-all pb-24">
        
        {activeTab === 'capture' ? (
          <>
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
              {user ? (
                <button 
                  onClick={signOut}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-500 mb-2 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              ) : (
                <button 
                  onClick={signInWithGoogle}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/80 rounded-xl border border-sky-100 mb-2 shadow-sm active:scale-95 transition-transform"
                >
                  <LogIn className="w-3 h-3 text-sky-600" />
                  <span className="text-[10px] font-black text-sky-900">로그인</span>
                </button>
              )}
              <button 
                onClick={() => fetchLocation(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/80 rounded-xl border border-sky-100 mb-2 shadow-sm active:scale-95 transition-transform group relative"
              >
                <MapPin className={`w-3 h-3 ${locationName.includes('거부') ? 'text-rose-500' : 'text-sky-500'}`} />
                <span className={`text-[10px] font-bold truncate max-w-[90px] ${locationName.includes('거부') ? 'text-rose-600' : 'text-sky-800'}`}>
                  {locationName}
                </span>
                {locationName.includes('거부') && (
                  <HelpCircle className="w-2.5 h-2.5 text-rose-400 opacity-60" />
                )}
                
                {locationName.includes('거부') && (
                  <div className="absolute top-12 right-0 z-[100] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl text-[11px] w-[240px] pointer-events-none animate-in fade-in zoom-in font-medium leading-relaxed">
                    <p className="flex items-center gap-2 mb-2 text-rose-300 font-bold">
                      <AlertCircle className="w-4 h-4" /> 위치 설정 안내
                    </p>
                    <div className="space-y-2 opacity-95">
                      <p>
                        <span className="text-sky-300 font-bold">아이폰:</span> 설정 &gt; 사파리 &gt; 위치 &gt; '허용'
                      </p>
                      <p>
                        <span className="text-sky-300 font-bold">갤럭시:</span> 설정 &gt; 애플리케이션 &gt; 브라우저 &gt; 권한 &gt; 위치 &gt; '허용'
                      </p>
                      <p className="border-t border-white/10 pt-2 text-[10px] text-slate-400">
                        설정 변경 후 반드시 앱을 새로고침 해주세요!
                      </p>
                    </div>
                    <div className="absolute -top-1.5 right-6 w-3 h-3 bg-slate-900 rotate-45"></div>
                  </div>
                )}
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
                  <h2 className="text-xl font-black text-slate-900 leading-tight tracking-tight">쉽고 빠르게 금어기,<br />금지체장을 확인하세요! 🎣</h2>
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
                    <p className="text-sm font-black text-slate-900 leading-tight tracking-tight">
                      판독 대상: 
                      <span className="ml-2 text-sky-600 underline underline-offset-4 decoration-2">{species}</span>
                      {confidence && (
                        <span className="ml-2 text-[10px] bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full">
                          AI 신뢰도: {(confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-700 mt-1.5 font-bold italic leading-none">
                      {clickMode === 'card' 
                        ? "📍 카드의 세로 끝부분을 순서대로 터치하세요." 
                        : "🎯 물고기의 머리와 꼬리를 터치하세요!"}
                    </p>
                  </div>
                </div>

                {/* Main Interaction Area */}
                <div 
                  style={{ aspectRatio: imageAspectRatio ? `${imageAspectRatio}` : '4/5' }}
                  className="relative w-full bg-slate-900 rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.2)] border-4 border-white cursor-crosshair group transition-all duration-300"
                >
                  {imageSrc ? (
                    <img 
                      src={imageSrc} 
                      onLoad={(e) => {
                        const { naturalWidth, naturalHeight } = e.currentTarget;
                        if (naturalWidth && naturalHeight) {
                          setImageAspectRatio(naturalWidth / naturalHeight);
                        }
                      }}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0 opacity-90" 
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
                        className="absolute w-8 h-8 bg-amber-500 rounded-full border-2 border-white shadow-lg -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-transform scale-110 pointer-events-auto cursor-grab active:cursor-grabbing select-none"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        onMouseDown={(e) => { e.stopPropagation(); setDraggedPoint({ type: 'card', index: i }); }}
                        onTouchStart={(e) => { e.stopPropagation(); setDraggedPoint({ type: 'card', index: i }); }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[12px] text-white font-black">{i+1}</span>
                      </div>
                    ))}
                    {points.fish.map((p, i) => (
                      <div 
                        key={`f-${i}`}
                        className="absolute w-8 h-8 bg-sky-500 rounded-full border-2 border-white shadow-xl -translate-x-1/2 -translate-y-1/2 animate-pulse flex items-center justify-center transition-transform scale-110 pointer-events-auto cursor-grab active:cursor-grabbing select-none"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        onMouseDown={(e) => { e.stopPropagation(); setDraggedPoint({ type: 'fish', index: i }); }}
                        onTouchStart={(e) => { e.stopPropagation(); setDraggedPoint({ type: 'fish', index: i }); }}
                        onClick={(e) => e.stopPropagation()}
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
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-wider text-sky-600">판독 어종</span>
                        {confidence && (
                          <span className="text-[9px] font-bold text-sky-400 mt-0.5">AI 신뢰도: {(confidence * 100).toFixed(0)}%</span>
                        )}
                      </div>
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
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-400 relative z-10 leading-none">실제 측정 체장</span>
                      <span className={`text-5xl font-black relative z-10 tracking-tighter ${result.status === 'pass' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {result.length}<span className="text-xl ml-1 font-bold">cm</span>
                      </span>
                    </div>
                    {(() => {
                      const speciesKeyForFactor = Object.keys(FORK_FACTORS).find(key => 
                        species.includes(key) || key.includes(species)
                      );
                      const forkFactor = speciesKeyForFactor ? FORK_FACTORS[speciesKeyForFactor] : 1.00;
                      if (forkFactor > 1.00) {
                        return (
                          <div className="text-[10px] text-slate-500 font-bold text-center mt-1 px-4 leading-normal flex items-center justify-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            <span>V자 꼬리 보정 계수({forkFactor.toFixed(2)}배)가 반영된 전장(TL) 기준입니다.</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
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
                  {result.status === 'pass' && (
                    <button 
                      disabled={isSaving || !user}
                      onClick={saveRecord}
                      className={`w-full font-black py-6 rounded-[2.5rem] shadow-xl transform active:scale-95 flex items-center justify-center gap-4 text-xl border-b-4 transition-all
                        ${!user 
                          ? 'bg-slate-200 text-slate-400 border-slate-300' 
                          : 'bg-emerald-500 text-white border-emerald-700 hover:brightness-110 shadow-emerald-200'}`}
                    >
                      {isSaving ? (
                         <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <Save className="w-6 h-6" />
                          기록하기
                          {!user && <span className="text-[10px] opacity-60">(로그인 필요)</span>}
                        </>
                      )}
                    </button>
                  )}
                  <button 
                    onClick={restart}
                    className="w-full bg-slate-100 text-slate-500 font-black py-5 rounded-[2.5rem] shadow-sm transition-all transform active:scale-95 flex items-center justify-center gap-3 text-lg border-b-4 border-slate-200"
                  >
                    <RotateCcw className="w-5 h-5" />
                    다시 측정하기
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </>
    ) : activeTab === 'history' ? (
      <HistoryBoard records={records} onDelete={deleteRecord} />
    ) : (
      <MapBoard records={records} onDelete={deleteRecord} />
    )}

        {/* Bottom Tab Navigation */}
        <div className="absolute bottom-0 w-full h-24 bg-white/80 backdrop-blur-xl border-t border-sky-100 z-[60] px-6 flex items-center justify-between shadow-[0_-10px_30px_rgba(0,0,0,0.05)] rounded-t-[3.5rem] sm:rounded-b-[3.5rem]">
           <button 
            onClick={() => setActiveTab('capture')}
            className={`flex flex-col items-center justify-center gap-1.5 transition-all flex-1 ${activeTab === 'capture' ? 'text-sky-600' : 'text-slate-400 opacity-60'}`}
           >
             <div className={`p-2 rounded-2xl transition-all ${activeTab === 'capture' ? 'bg-sky-50 shadow-inner' : ''}`}>
               <Camera className={`w-6 h-6 transition-transform ${activeTab === 'capture' ? 'scale-110' : ''}`} />
             </div>
             <span className="text-[10px] font-black uppercase tracking-widest">측정</span>
           </button>
           
           <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center gap-1.5 transition-all flex-1 ${activeTab === 'history' ? 'text-sky-600' : 'text-slate-400 opacity-60'}`}
           >
             <div className={`p-2 rounded-2xl transition-all ${activeTab === 'history' ? 'bg-sky-50 shadow-inner' : ''}`}>
               <History className={`w-6 h-6 transition-transform ${activeTab === 'history' ? 'scale-110' : ''}`} />
             </div>
             <span className="text-[10px] font-black uppercase tracking-widest">기록</span>
           </button>

           <button 
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center justify-center gap-1.5 transition-all flex-1 ${activeTab === 'map' ? 'text-sky-600' : 'text-slate-400 opacity-60'}`}
           >
             <div className={`p-2 rounded-2xl transition-all ${activeTab === 'map' ? 'bg-sky-50 shadow-inner' : ''}`}>
               <MapIcon className={`w-6 h-6 transition-transform ${activeTab === 'map' ? 'scale-110' : ''}`} />
             </div>
             <span className="text-[10px] font-black uppercase tracking-widest">지도</span>
           </button>
        </div>

        {/* Footer Waves (Hide on step 1 or other tabs) */}
        {(activeTab === 'capture' && step !== 1) && (
          <div className="absolute bottom-24 w-full h-48 pointer-events-none z-10">
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
                      return MEASUREMENT_GUIDE[standard]?.text || "물고기의 가장 긴 부분(머리 끝 ~ 꼬리 끝)을 측정합니다.";
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
