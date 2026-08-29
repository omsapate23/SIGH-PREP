"use client";

import React, { useState, useEffect } from 'react';
import { Search, UploadCloud, User, Smartphone, Car, Landmark, MapPin, Info, X, ShieldAlert } from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import NetworkGraph from '@/components/NetworkGraph';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function SnareDashboard() {
  const [elements, setElements] = useState<{nodes: any[], edges: any[]}>({nodes: [], edges: []});
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchGraph();
  }, []);

  const fetchGraph = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/graph');
      setElements(res.data);
    } catch (err) {
      console.error("Failed to fetch graph:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    setIsUploading(true);
    try {
      await axios.post('http://localhost:8000/api/ingest', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchGraph();
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const toggleFilter = (type: string) => {
    setActiveFilters(prev => 
      prev.includes(type) ? prev.filter(f => f !== type) : [...prev, type]
    );
  };

  return (
    <div className="flex flex-col h-screen bg-black text-slate-200 font-mono overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0a0a0a] z-10">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-red-600 text-white flex items-center justify-center font-bold text-xl"><ShieldAlert className="w-5 h-5"/></div>
          <h1 className="text-xl tracking-widest font-bold">S.N.A.R.E. <span className="text-slate-500 font-normal">// TACTICAL INTELLIGENCE COMMAND</span></h1>
          <div className="flex gap-2 ml-4">
            <span className="px-2 py-0.5 bg-green-900/30 text-green-500 border border-green-800 text-xs rounded-sm">SYS_ONLINE</span>
            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-sm border border-slate-700">SEC_LEVEL_OMEGA</span>
          </div>
        </div>
        <div className="relative w-72">
          <input 
            type="text" 
            placeholder="Search targets or dossiers..." 
            className="w-full bg-slate-900 border border-slate-700 rounded-none py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:border-red-800 focus:bg-slate-800 transition-colors placeholder:text-slate-600"
          />
          <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-500" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar */}
        <aside className="w-72 border-r border-slate-800 bg-[#050505] flex flex-col z-10">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-xs uppercase text-slate-500 font-semibold mb-3 tracking-wider flex items-center gap-2">Data Ingestion</h2>
            <label className={cn(
              "flex flex-col items-center justify-center h-28 border border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-900 transition-colors cursor-pointer group bg-black",
              isUploading && "opacity-50 cursor-not-allowed"
            )}>
              <UploadCloud className="w-6 h-6 text-slate-600 group-hover:text-slate-400 mb-2" />
              <span className="text-xs text-slate-500 group-hover:text-slate-400">
                {isUploading ? "PARSING INTELLIGENCE..." : "DROP FILE (PDF/TXT/CSV)"}
              </span>
              <input type="file" accept=".pdf,.txt,.csv" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
            </label>
          </div>

          <div className="p-4 flex-1">
            <h2 className="text-xs uppercase text-slate-500 font-semibold mb-3 tracking-wider">Target Filters</h2>
            <div className="space-y-1">
              {[
                { type: 'Person', icon: User, color: 'text-blue-400' },
                { type: 'Phone', icon: Smartphone, color: 'text-emerald-400' },
                { type: 'Vehicle', icon: Car, color: 'text-amber-400' },
                { type: 'Account', icon: Landmark, color: 'text-purple-400' },
                { type: 'Location', icon: MapPin, color: 'text-rose-400' }
              ].map(filter => {
                const Icon = filter.icon;
                const isActive = activeFilters.includes(filter.type);
                return (
                  <button 
                    key={filter.type}
                    onClick={() => toggleFilter(filter.type)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 border text-sm transition-colors uppercase tracking-wider", 
                      isActive 
                        ? "bg-slate-800/50 border-slate-600 text-white" 
                        : "border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/50"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", filter.color)} /> {filter.type}S
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Center Canvas */}
        <main className="flex-1 relative bg-black">
          {(elements.nodes && elements.nodes.length > 0) ? (
            <NetworkGraph 
              elements={elements}
              activeFilters={activeFilters}
              onNodeClick={(data) => setSelectedNode(data)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-600 bg-[#000000] z-0">
              <div className="text-center">
                <div className="w-16 h-16 border border-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse bg-slate-900/20">
                  <ShieldAlert className="w-6 h-6 text-slate-700" />
                </div>
                <p className="tracking-widest">AWAITING INTEL DATA</p>
              </div>
            </div>
          )}
        </main>

        {/* Right Drawer - Target Dossier */}
        <aside className={cn(
          "absolute right-0 top-0 h-full w-80 bg-[#050505] border-l border-slate-800 transform transition-transform duration-300 z-20 shadow-2xl",
          selectedNode ? "translate-x-0" : "translate-x-full"
        )}>
          {selectedNode && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-black">
                <h3 className="font-semibold text-white tracking-wider flex items-center gap-2 uppercase text-sm">
                  <Info className="w-4 h-4 text-slate-400" /> Target Dossier
                </h3>
                <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-6 flex-1 overflow-y-auto">
                <div className="mb-6 flex justify-between items-start">
                  <div>
                    <div className="text-[10px] uppercase text-slate-500 tracking-widest mb-1">Threat Score</div>
                    <div className={cn(
                      "text-3xl font-bold font-sans",
                      selectedNode.risk >= 80 ? "text-red-500" :
                      selectedNode.risk >= 50 ? "text-amber-500" : "text-green-500"
                    )}>
                      {selectedNode.risk || 0}
                    </div>
                  </div>
                  <div className="text-right">
                     <div className="text-[10px] uppercase text-slate-500 tracking-widest mb-1">Class</div>
                     <div className="inline-block px-2 py-0.5 bg-slate-900 border border-slate-700 text-xs text-slate-300">
                      {selectedNode.type}
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="text-[10px] uppercase text-slate-500 tracking-widest mb-1">Designation</div>
                  <div className="text-lg text-white font-medium bg-slate-900/50 p-3 border border-slate-800 rounded-sm">
                    {selectedNode.label}
                  </div>
                </div>

                <div className="mb-6">
                  <div className="text-[10px] uppercase text-slate-500 tracking-widest mb-1">Entity ID</div>
                  <div className="font-mono text-xs text-slate-400 break-all bg-black p-2 border border-slate-800">
                    {selectedNode.id}
                  </div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-slate-800">
                  <div className="text-xs text-slate-500 uppercase tracking-widest mb-3">Evidence Provenance</div>
                  <div className="text-sm text-slate-400 italic bg-slate-900/30 p-3 border-l-2 border-slate-700">
                    Automatically extracted via LLM parsing sequence. Citation pending manual review.
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-800 bg-black">
                <div className="text-[10px] text-slate-600 flex items-center justify-center gap-2 tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                  MONITORING ACTIVE
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
