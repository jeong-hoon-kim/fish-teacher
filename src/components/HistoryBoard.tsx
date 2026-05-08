import React, { useState } from 'react';
import { CatchRecord, SortOption } from '../types';
import { 
  Calendar, Ruler, Fish, MapPin, 
  ArrowUpDown, Search, ChevronRight,
  TrendingDown, TrendingUp, Trash2, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HistoryBoardProps {
  records: CatchRecord[];
  onDelete: (id: string) => void;
}

export default function HistoryBoard({ records, onDelete }: HistoryBoardProps) {
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [search, setSearch] = useState('');

  const sortedRecords = [...records]
    .filter(r => r.species.includes(search))
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
      if (sortBy === 'length') return b.length - a.length;
      if (sortBy === 'species') return a.species.localeCompare(b.species);
      return 0;
    });

  return (
    <div className="flex flex-col h-full bg-slate-50/30">
      <div className="p-6 bg-white border-b border-sky-100 shadow-sm sticky top-0 z-10">
        <h2 className="text-2xl font-black text-slate-900 tracking-tighter mb-4">나의 조과 기록</h2>
        
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="어종 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            {[
              { id: 'date', label: '날짜', icon: Calendar },
              { id: 'length', label: '길이', icon: Ruler },
              { id: 'species', label: '어종', icon: Fish }
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSortBy(opt.id as SortOption)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  sortBy === opt.id ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <opt.icon className="w-3 h-3" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex justify-between items-center px-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            총 {sortedRecords.length}개의 기록
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {sortedRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 grayscale opacity-40">
            <Fish className="w-16 h-16 mb-4" />
            <p className="text-sm font-bold">아직 기록이 없습니다.</p>
          </div>
        ) : (
          sortedRecords.map((record, index) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              key={record.id}
              className="bg-white rounded-3xl p-5 border border-sky-50 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden"
            >
              {/* Background gradient hint */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-sky-50 to-transparent opacity-50 -z-0"></div>
              
              <div className="flex gap-4 relative z-10">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden border border-slate-50 flex-shrink-0">
                  {record.image ? (
                     <img src={record.image} alt={record.species} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-sky-50 text-sky-200">
                      <Fish className="w-8 h-8" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 flex flex-col justify-between py-0.5">
                  <div>
                    <h4 className="font-black text-slate-900 leading-none mb-1.5">{record.species}</h4>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold">
                      <MapPin className="w-3 h-3 text-sky-400" />
                      {record.location.name}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl font-black text-sky-600 tracking-tighter">{record.length}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">cm</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-black">
                      <Clock className="w-3 h-3 text-slate-300" />
                      {new Date(record.capturedAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end justify-between py-1">
                   <button 
                    onClick={() => onDelete(record.id)}
                    className="p-2.5 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 hover:text-rose-600 transition-all active:scale-90 shadow-sm"
                    title="기록 삭제"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                   <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                     record.status === 'pass' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                   }`}>
                     {record.status === 'pass' ? '기록 완료' : '규정 위반'}
                   </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
