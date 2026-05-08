import React from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { CatchRecord } from '../types';
import { useEffect, useState } from 'react';
import { Fish, MapPin, Calendar, Clock, Ruler } from 'lucide-react';

// API Key detection logic
const getApiKey = () => {
  // Check common locations for the key
  const viteKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY;
  const envKey = (process.env as any)?.GOOGLE_MAPS_PLATFORM_KEY;
  const windowKey = (window as any)?._env_?.VITE_GOOGLE_MAPS_PLATFORM_KEY;
 
  const key = viteKey || envKey || windowKey || '';
  return key.replace(/["']/g, '').trim(); // Remove any accidental quotes
};

const API_KEY = getApiKey();
const hasValidKey = Boolean(API_KEY) &&
                   API_KEY !== 'YOUR_API_KEY' &&
                   API_KEY !== 'undefined' &&
                   API_KEY.length > 20; // Most GMP keys are long

interface MapBoardProps {
  records: CatchRecord[];
  onDelete?: (id: string) => void;
}

const MarkerWithInfoWindow: React.FC<{ records: CatchRecord[]; onDelete?: (id: string) => void }> = ({ records, onDelete }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);
  const firstRecord = records[0];
  const count = records.length;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: firstRecord.location.latitude, lng: firstRecord.location.longitude }}
        onClick={() => setOpen(true)}
      >
        <div className="relative group">
          <div className="absolute -inset-2 bg-sky-500/20 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="w-10 h-10 bg-white rounded-2xl shadow-xl flex items-center justify-center border-2 border-sky-500 transform hover:scale-110 transition-transform cursor-pointer relative z-10 overflow-hidden">
             {firstRecord.image ? (
               <img src={firstRecord.image} alt={firstRecord.species} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
             ) : (
               <Fish className="w-5 h-5 text-sky-500" />
             )}
          </div>
          {count > 1 ? (
             <div className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-30">
               {count}
             </div>
          ) : (
             <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full -translate-y-1/3 translate-x-1/3 z-20 shadow-sm"></div>
          )}
        </div>
      </AdvancedMarker>
      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="p-1 max-w-[240px]">
            <div className="mb-2 pb-2 border-b border-slate-100">
               <h4 className="text-xs font-black text-slate-400 uppercase tracking-tight truncate max-w-[200px]">
                 {firstRecord.location.name}
               </h4>
               <p className="text-[10px] font-bold text-slate-500">{count}개의 기록</p>
            </div>
            <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
             {records.map((r) => (
                  <div key={r.id} className="group/item flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-sky-200 transition-all">
                     <div className="w-10 h-10 rounded-lg bg-white overflow-hidden flex-shrink-0 border border-slate-200">
                        {r.image ? (
                           <img src={r.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                           <div className="w-full h-full flex items-center justify-center">
                              <Fish className="w-4 h-4 text-sky-400" />
                           </div>
                        )}
                     </div>
                     <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-start gap-1">
                           <p className="font-black text-slate-900 text-sm truncate">{r.species}</p>
                           <p className="text-sky-600 font-black text-xs whitespace-nowrap">{r.length}cm</p>
                        </div>
                        <div className="flex justify-between items-center mt-0.5">
                           <p className="text-[10px] text-slate-500 font-bold">{new Date(r.capturedAt).toLocaleDateString()}</p>
                           {onDelete && (
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if(confirm('이 기록을 삭제하시겠습니까?')) onDelete(r.id);
                               }}
                               className="text-[9px] font-black text-rose-400 hover:text-rose-600 opacity-0 group-hover/item:opacity-100 transition-opacity uppercase"
                             >
                               삭제
                             </button>
                           )}
                        </div>
                     </div>
                  </div>
               ))}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function MapBoard({ records, onDelete }: MapBoardProps) {
  useEffect(() => {
    if (hasValidKey) {
      const maskedKey = `${API_KEY.substring(0, 4)}...${API_KEY.substring(API_KEY.length - 4)}`;
      console.log('📍 Google Maps API Key Loaded:', maskedKey);
    } else {
      console.warn('⚠️ Google Maps API Key is missing or invalid.');
    }
  }, []);

  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50">
        <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center mb-8 border border-sky-100">
           <MapPin className="w-10 h-10 text-sky-400 shadow-sky-100" />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-4 tracking-tighter">Google Maps API 키가 필요합니다</h2>
        <div className="bg-white p-6 rounded-3xl border border-sky-100 shadow-sm text-left w-full max-w-sm">
          <p className="text-sm font-bold text-slate-700 mb-4 leading-relaxed">
            지도를 활성화하려면 API 키를 등록해주세요.
          </p>
          <ul className="space-y-3 text-[11px] font-black text-slate-500 uppercase tracking-tight">
            <li className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0">1</div>
              설정(톱니바퀴 아이콘) 클릭
            </li>
            <li className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0">2</div>
              'Secrets' 탭 선택
            </li>
            <li className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0">3</div>
              'VITE_GOOGLE_MAPS_PLATFORM_KEY' 추가
            </li>
          </ul>
        </div>
        <p className="mt-8 text-xs text-sky-800 font-bold opacity-60">키 등록 후 앱이 자동으로 재빌드됩니다.</p>
      </div>
    );
  }

  // Group records by identical coordinates (approx. 1 meter precision)
  const groupedSpots = records.reduce((acc, record) => {
    // 0.00001 degrees is approximately 1.1 meters
    const key = `${record.location.latitude.toFixed(5)},${record.location.longitude.toFixed(5)}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {} as Record<string, CatchRecord[]>);

  // Calculate default center (average of all records or default to Korea)
  const defaultCenter = records.length > 0
    ? {
        lat: records.reduce((acc, r) => acc + r.location.latitude, 0) / records.length,
        lng: records.reduce((acc, r) => acc + r.location.longitude, 0) / records.length
      }
    : { lat: 36.5, lng: 127.5 };

  return (
    <div className="flex-1 relative w-full h-full min-h-[500px] bg-slate-100 overflow-hidden">
      <div className="absolute inset-0 z-0 text-slate-400 flex items-center justify-center italic text-xs">
        지도 로딩 중...
        <APIProvider apiKey={API_KEY} version="weekly" onLoad={() => console.log('🗺️ Google Maps API Loaded successfully')}>
          <Map
            defaultCenter={defaultCenter}
            defaultZoom={7}
            mapId="DEMO_MAP_ID"
            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            gestureHandling={'greedy'}
            disableDefaultUI={true}
          >
            {Object.entries(groupedSpots).map(([key, spotRecords]) => (
              <MarkerWithInfoWindow key={key} records={spotRecords} onDelete={onDelete} />
            ))}
          </Map>
        </APIProvider>
      </div>
     
      <div className="absolute top-6 left-6 right-6 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md px-6 py-4 rounded-3xl shadow-2xl border border-white/50 pointer-events-auto flex items-center justify-between">
           <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tighter leading-none">나만의 조과 지도</h3>
              <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest mt-1.5 opacity-80">낚시 포인트 데이터</p>
           </div>
           <div className="bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-100">
              <span className="text-xs font-black text-sky-800 tracking-tighter">{records.length} 포인트</span>
           </div>
        </div>
      </div>
    </div>
  );
}
