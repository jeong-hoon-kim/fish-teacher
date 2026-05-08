import React from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { CatchRecord } from '../types';
import { useState } from 'react';
import { Fish, MapPin, Calendar, Clock, Ruler } from 'lucide-react';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface MapBoardProps {
  records: CatchRecord[];
}

function MarkerWithInfoWindow({ record }: { record: CatchRecord }) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: record.location.latitude, lng: record.location.longitude }}
        onClick={() => setOpen(true)}
      >
        <div className="relative group">
          <div className="absolute -inset-2 bg-sky-500/20 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="w-10 h-10 bg-white rounded-2xl shadow-xl flex items-center justify-center border-2 border-sky-500 transform hover:scale-110 transition-transform cursor-pointer relative z-10 overflow-hidden">
             {record.image ? (
               <img src={record.image} alt={record.species} className="w-full h-full object-cover" />
             ) : (
               <Fish className="w-5 h-5 text-sky-500" />
             )}
          </div>
          <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full -translate-y-1/3 translate-x-1/3 z-20 shadow-sm"></div>
        </div>
      </AdvancedMarker>
      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="p-2 min-w-[180px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
                <Fish className="w-6 h-6 text-sky-500" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 leading-tight">{record.species}</h4>
                <p className="text-[10px] text-slate-500 font-bold">{new Date(record.capturedAt).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
               <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">크기</p>
                  <p className="text-sm font-black text-sky-600 leading-none mt-1">{record.length}cm</p>
               </div>
               <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">위치</p>
                  <p className="text-[10px] font-bold text-slate-700 leading-tight mt-1 truncate max-w-[80px]">
                    {record.location.name}
                  </p>
               </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function MapBoard({ records }: MapBoardProps) {
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
              'GOOGLE_MAPS_PLATFORM_KEY' 추가
            </li>
          </ul>
        </div>
        <p className="mt-8 text-xs text-sky-800 font-bold opacity-60">키 등록 후 앱이 자동으로 재빌드됩니다.</p>
      </div>
    );
  }

  // Calculate default center (average of records or current location)
  const defaultCenter = records.length > 0 
    ? { 
        lat: records.reduce((acc, r) => acc + r.location.latitude, 0) / records.length, 
        lng: records.reduce((acc, r) => acc + r.location.longitude, 0) / records.length 
      }
    : { lat: 36.5, lng: 127.5 }; // South Korea center

  return (
    <div className="h-full relative">
      <APIProvider apiKey={API_KEY} version="weekly">
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={7}
          mapId="FISH_MAP_ID"
          className="w-full h-full"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          gestureHandling={'greedy'}
          disableDefaultUI={true}
        >
          {records.map((record) => (
            <MarkerWithInfoWindow key={record.id} record={record} />
          ))}
        </Map>
      </APIProvider>
      
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
