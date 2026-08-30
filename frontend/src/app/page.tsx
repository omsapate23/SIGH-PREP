"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  ShieldAlert,
  Search,
  X,
  Trash2,
  UploadCloud,
  Terminal,
  User,
  Smartphone,
  Car,
  CreditCard,
  MapPin,
  Building2,
  ExternalLink,
  FileText,
  AlertTriangle,
  Activity,
  Filter,
  Briefcase,
  Globe,
  FolderGit2,
  PlusCircle,
  Clock,
  Layers,
  ChevronRight,
} from 'lucide-react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import NetworkGraph from '@/components/NetworkGraph';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FILTER_CONFIG = [
  { type: 'Person', label: 'Persons', icon: User },
  { type: 'Phone', label: 'Phones', icon: Smartphone },
  { type: 'Vehicle', label: 'Vehicles', icon: Car },
  { type: 'Account', label: 'Accounts', icon: CreditCard },
  { type: 'Location', label: 'Locations', icon: MapPin },
  { type: 'Organization', label: 'Organizations', icon: Building2 },
  { type: 'Digital_Artifact', label: 'Artifacts & Apps', icon: Terminal },
  { type: 'Crime_Event', label: 'Crime Events', icon: ShieldAlert },
];

const formatNomenclature = (str: string) => {
  if (!str) return '';
  return str.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function SnareDashboard() {
  const [cases, setCases] = useState<any[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'case' | 'global'>('case');

  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  });
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Case creation modal state
  const [caseTitleModalOpen, setCaseTitleModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [customCaseTitle, setCustomCaseTitle] = useState('');

  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([
    '[SYSTEM_BOOT] S.N.A.R.E. Engine active. Dual-Database architecture initialized.',
    '[SQLITE_READY] Case Management repository connected (snare_cases.db).',
    '[NEO4J_READY] Global cross-case knowledge graph link analysis online.',
    '[IDLE] Awaiting case selection or new payload ingestion...',
  ]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    setTelemetryLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [telemetryLogs]);

  // Load cases on mount
  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async (autoSelectId?: string) => {
    try {
      const res = await axios.get('http://localhost:8000/api/cases');
      const caseList = res.data || [];
      setCases(caseList);

      if (autoSelectId) {
        setActiveCaseId(autoSelectId);
        setViewMode('case');
        await fetchCaseGraph(autoSelectId);
      } else if (caseList.length > 0 && !activeCaseId) {
        const firstCase = caseList[0];
        setActiveCaseId(firstCase.id);
        setViewMode('case');
        await fetchCaseGraph(firstCase.id);
      } else if (activeCaseId && viewMode === 'case') {
        await fetchCaseGraph(activeCaseId);
      } else if (viewMode === 'global') {
        await fetchGlobalGraph();
      }
    } catch (err: any) {
      console.error('Failed to load cases:', err);
      addLog(`[ERROR] Case repository fetch failed: ${err.message || err}`);
    }
  };

  const fetchCaseGraph = async (caseId: string) => {
    try {
      const res = await axios.get(`http://localhost:8000/api/cases/${caseId}/graph`);
      const data = res.data;
      setGraphData({
        nodes: data?.nodes || [],
        edges: data?.edges || [],
      });
      setSelectedNode(null);
      setSelectedEdge(null);
    } catch (err: any) {
      console.error('Failed to fetch case graph:', err);
      addLog(`[ERROR] Case graph retrieval failed: ${err.message || err}`);
    }
  };

  const fetchGlobalGraph = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/graph/global');
      const data = res.data;
      setGraphData({
        nodes: data?.nodes || [],
        edges: data?.edges || [],
      });
      setSelectedNode(null);
      setSelectedEdge(null);
    } catch (err: any) {
      console.error('Failed to fetch global graph:', err);
      addLog(`[ERROR] Global graph retrieval failed: ${err.message || err}`);
    }
  };

  const handleSelectCase = async (caseId: string) => {
    setActiveCaseId(caseId);
    setViewMode('case');
    setSelectedNode(null);
    setSelectedEdge(null);
    const targetCase = cases.find((c) => c.id === caseId);
    addLog(`[CASE_SELECT] Activated Case Dossier: ${targetCase?.title || caseId}`);
    await fetchCaseGraph(caseId);
  };

  const handleSwitchViewMode = async (mode: 'case' | 'global') => {
    setViewMode(mode);
    setSelectedNode(null);
    setSelectedEdge(null);

    if (mode === 'global') {
      addLog('[VIEW_SWITCH] Switched to GLOBAL SANDBOX (Unified Cross-Case Knowledge Graph).');
      await fetchGlobalGraph();
    } else {
      if (activeCaseId) {
        const targetCase = cases.find((c) => c.id === activeCaseId);
        addLog(`[VIEW_SWITCH] Switched to ACTIVE CASE view: ${targetCase?.title || activeCaseId}`);
        await fetchCaseGraph(activeCaseId);
      } else if (cases.length > 0) {
        await handleSelectCase(cases[0].id);
      } else {
        setGraphData({ nodes: [], edges: [] });
      }
    }
  };

  const handleDeleteCase = async (caseId: string, caseTitle: string) => {
    if (!confirm(`CONFIRM CASE ARCHIVAL / REMOVAL:\nDelete "${caseTitle}" from SQLite & unlink from Neo4j?`)) {
      return;
    }
    try {
      addLog(`[CASE_PURGE] Archiving case ${caseTitle}...`);
      await axios.delete(`http://localhost:8000/api/cases/${caseId}`);
      addLog(`[CASE_PURGED] Case ${caseTitle} removed.`);
      
      const remainingCases = cases.filter((c) => c.id !== caseId);
      setCases(remainingCases);

      if (activeCaseId === caseId) {
        if (remainingCases.length > 0) {
          const nextCase = remainingCases[0];
          setActiveCaseId(nextCase.id);
          await fetchCaseGraph(nextCase.id);
        } else {
          setActiveCaseId(null);
          setGraphData({ nodes: [], edges: [] });
        }
      }
    } catch (err: any) {
      console.error('Failed to delete case:', err);
      addLog(`[ERROR] Failed to delete case: ${err.message || err}`);
    }
  };

  const processUploadFile = async (file: File, title: string) => {
    setIsProcessing(true);
    setSelectedNode(null);
    setSelectedEdge(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

    const ext = file.name.split('.').pop()?.toLowerCase();
    addLog(`[CASE_INIT] Initializing Case Dossier: "${title}" (${(file.size / 1024).toFixed(1)} KB)`);

    if (ext === 'csv') {
      addLog('[CDR_PARSER] Fast-path: Processing Call Detail Record via Pandas engine...');
    } else if (ext === 'wav' || ext === 'mp3') {
      addLog('[FASTER_WHISPER] Transcribing offline audio via GPU Faster-Whisper...');
    } else {
      addLog('[QWEN_GPU] Dispatched text segment to local Qwen 2.5 7B model...');
    }

    try {
      const res = await axios.post('http://localhost:8000/api/cases', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const responseData = res.data;
      const createdCase = responseData.case;
      const graphResult = responseData.graph;

      addLog(`[PERSIST_SQLITE] Created CaseRecord in SQLite database (ID: ${createdCase?.id?.slice(0, 8)}...).`);
      addLog(`[NEO4J_LINK] Merged entities & indexed (Entity)-[:CITED_IN]->(Case).`);

      const nodeCount = graphResult?.nodes?.length || 0;
      const edgeCount = graphResult?.edges?.length || 0;
      addLog(`[RESOLUTION_COMPLETE] Extracted ${nodeCount} entities and ${edgeCount} relationships for this case.`);

      // Update case list & switch view to new case
      await loadCases(createdCase?.id);
    } catch (err: any) {
      console.error('Ingestion failed:', err);
      addLog(`[ERROR] Ingestion sequence failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setPendingFile(file);
      const sanitizedDefaultTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setCustomCaseTitle(sanitizedDefaultTitle);
      setCaseTitleModalOpen(true);
    }
  }, []);

  const handleConfirmCaseCreation = () => {
    if (!pendingFile) return;
    const titleToUse = customCaseTitle.trim() || pendingFile.name;
    setCaseTitleModalOpen(false);
    processUploadFile(pendingFile, titleToUse);
    setPendingFile(null);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: isProcessing,
  });

  const handlePurgeGraph = async () => {
    if (!confirm('CONFIRM MASTER PURGE:\nWipe all criminal network graphs from Neo4j AND clear all SQLite Case Records?')) {
      return;
    }
    try {
      addLog('[PURGE_DISPATCH] Sending complete purge sequence to Neo4j & SQLite...');
      await axios.delete('http://localhost:8000/api/graph');
      setCases([]);
      setActiveCaseId(null);
      setGraphData({ nodes: [], edges: [] });
      setSelectedNode(null);
      setSelectedEdge(null);
      setActiveFilters([]);
      setSearchQuery('');
      addLog('[PURGE_COMPLETE] Dual database cleared. Canvas memory flushed.');
    } catch (err: any) {
      console.error('Purge failed:', err);
      addLog(`[ERROR] Failed to purge databases: ${err.response?.data?.detail || err.message}`);
    }
  };

  const toggleFilter = (type: string) => {
    setActiveFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Entity Counts for Badges
  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Person: 0,
      Phone: 0,
      Vehicle: 0,
      Account: 0,
      Location: 0,
      Organization: 0,
      Digital_Artifact: 0,
      Crime_Event: 0,
    };
    (graphData.nodes || []).forEach((n: any) => {
      const type = n.data?.type || 'Unknown';
      if (counts[type] !== undefined) {
        counts[type]++;
      }
    });
    return counts;
  }, [graphData.nodes]);

  // Compute 1-Hop Connected Neighbors for Selected Node
  const connectedLinks = useMemo(() => {
    if (!selectedNode || !selectedNode.id) return [];
    const nodeId = String(selectedNode.id);
    const links: Array<{
      targetId: string;
      targetLabel: string;
      targetType: string;
      relation: string;
      direction: 'outgoing' | 'incoming';
      nodeData: any;
    }> = [];

    const nodeMap = new Map<string, any>();
    (graphData.nodes || []).forEach((n: any) => {
      if (n.data?.id) {
        nodeMap.set(String(n.data.id), n.data);
      }
    });

    (graphData.edges || []).forEach((e: any) => {
      const src = String(e.data?.source);
      const tgt = String(e.data?.target);
      const label = e.data?.label || 'CONNECTED';

      if (src === nodeId) {
        const targetNode = nodeMap.get(tgt);
        links.push({
          targetId: tgt,
          targetLabel: targetNode?.label || tgt,
          targetType: targetNode?.type || 'Unknown',
          relation: label,
          direction: 'outgoing',
          nodeData: targetNode,
        });
      } else if (tgt === nodeId) {
        const srcNode = nodeMap.get(src);
        links.push({
          targetId: src,
          targetLabel: srcNode?.label || src,
          targetType: srcNode?.type || 'Unknown',
          relation: label,
          direction: 'incoming',
          nodeData: srcNode,
        });
      }
    });

    return links;
  }, [selectedNode, graphData]);

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'Suspect':
        return 'bg-red-950/80 text-red-400 border-red-800';
      case 'Victim':
        return 'bg-blue-950/80 text-blue-400 border-blue-800';
      case 'Officer':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800';
      case 'Witness':
        return 'bg-amber-950/80 text-amber-400 border-amber-800';
      case 'Mule_Account':
        return 'bg-pink-950/80 text-pink-400 border-pink-800';
      case 'Tool':
      case 'Digital_Artifact':
        return 'bg-purple-950/80 text-purple-400 border-purple-800';
      case 'Infrastructure':
        return 'bg-slate-900 text-slate-300 border-slate-700';
      default:
        return 'bg-[#111827] text-slate-300 border-[#333333]';
    }
  };

  const activeCase = useMemo(() => {
    return cases.find((c) => c.id === activeCaseId) || null;
  }, [cases, activeCaseId]);

  const hasNodes = graphData.nodes && graphData.nodes.length > 0;

  return (
    <div className="flex flex-col h-screen bg-[#000000] text-slate-200 font-mono overflow-hidden select-none">
      {/* 1. TOP BAR (48px) */}
      <header className="h-12 border-b border-[#1E293B] bg-[#000000] px-4 flex items-center justify-between z-20 shrink-0">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-[#FFFFFF] text-[#000000] flex items-center justify-center font-bold text-sm rounded-[2px]">
            <ShieldAlert className="w-4 h-4 text-black" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-[#FFFFFF]">
              S.N.A.R.E. <span className="text-[#94A3B8] font-normal">// TACTICAL COMMAND</span>
            </span>
            <span className="px-1.5 py-0.5 bg-[#111827] border border-[#333333] text-[9px] text-[#94A3B8] font-mono tracking-wider rounded-[2px]">
              DUAL-DB ARCHITECTURE
            </span>
          </div>
        </div>

        {/* Center-Left: View Mode Switcher (Active Case vs Global Sandbox) */}
        <div className="flex items-center bg-[#0B0F19] border border-[#1E293B] p-0.5 rounded-[2px] gap-1">
          <button
            onClick={() => handleSwitchViewMode('case')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold tracking-wider rounded-[2px] transition-all',
              viewMode === 'case'
                ? 'bg-[#FFFFFF] text-[#000000] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#1E293B]/50'
            )}
          >
            <Briefcase className="w-3 h-3" />
            <span>
              ACTIVE CASE
              {activeCase ? `: ${activeCase.title.slice(0, 18)}${activeCase.title.length > 18 ? '...' : ''}` : ''}
            </span>
          </button>
          <button
            onClick={() => handleSwitchViewMode('global')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold tracking-wider rounded-[2px] transition-all',
              viewMode === 'global'
                ? 'bg-purple-600 text-[#FFFFFF] shadow-sm shadow-purple-900/50'
                : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#1E293B]/50'
            )}
          >
            <Globe className="w-3 h-3" />
            <span>GLOBAL SANDBOX {cases.length > 0 ? `(${cases.length})` : ''}</span>
          </button>
        </div>

        {/* Center-Right: Omnibar Search */}
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#94A3B8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search targets, identifiers, roles..."
            className="w-full bg-[#0B0F19] border border-[#1E293B] focus:border-[#FFFFFF] rounded-[2px] py-1 pl-8 pr-7 text-xs text-[#FFFFFF] placeholder:text-[#475569] font-mono focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-[#94A3B8] hover:text-[#FFFFFF]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right: Graph Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-[#94A3B8] mr-2">
            <Activity className="w-3.5 h-3.5 text-green-500 animate-pulse" />
            <span>NODES: {graphData.nodes?.length || 0}</span>
            <span>EDGES: {graphData.edges?.length || 0}</span>
          </div>
          <button
            onClick={handlePurgeGraph}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-transparent border border-[#333333] hover:border-[#FFFFFF] hover:bg-[#FFFFFF] hover:text-[#000000] text-[11px] text-[#94A3B8] tracking-wider transition-all rounded-[2px]"
            title="Wipe Neo4j Graph Database & SQLite Cases"
          >
            <Trash2 className="w-3.5 h-3.5" />
            MASTER PURGE
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 2. LEFT SIDEBAR (300px) */}
        <aside className="w-[300px] border-r border-[#1E293B] bg-[#000000] flex flex-col z-10 shrink-0 overflow-y-auto">
          {/* SECTION 0: CASE DIRECTORY */}
          <div className="p-3.5 border-b border-[#1E293B]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase text-[#FFFFFF] tracking-widest font-bold flex items-center gap-1.5">
                <FolderGit2 className="w-3.5 h-3.5 text-[#FFFFFF]" />
                CASE DIRECTORY ({cases.length})
              </span>
              {cases.length > 0 && (
                <span className="text-[9px] text-[#94A3B8] font-mono">
                  {viewMode === 'global' ? 'CROSS-CASE VIEW' : 'ISOLATED VIEW'}
                </span>
              )}
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {cases.length > 0 ? (
                cases.map((c) => {
                  const isSelected = viewMode === 'case' && activeCaseId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCase(c.id)}
                      className={cn(
                        'p-2 rounded-[2px] border cursor-pointer transition-all flex items-center justify-between group',
                        isSelected
                          ? 'bg-[#1E293B] border-[#FFFFFF] text-[#FFFFFF]'
                          : 'bg-[#0B0F19] border-[#1E293B] text-[#94A3B8] hover:border-slate-500 hover:text-[#FFFFFF]'
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              isSelected ? 'bg-emerald-400' : 'bg-[#475569]'
                            )}
                          />
                          <span className="text-[11px] font-semibold truncate">{c.title}</span>
                        </div>
                        <div className="text-[9px] text-[#64748B] font-mono mt-0.5 flex items-center gap-2">
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'}
                          </span>
                          <span className="uppercase text-[8px] px-1 py-0.2 bg-[#000000] border border-[#1E293B] rounded-[1px]">
                            {c.status || 'Active'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCase(c.id, c.title);
                        }}
                        className="text-[#475569] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        title="Delete Case Dossier"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-2.5 bg-[#0B0F19] border border-[#1E293B] text-center text-[10px] text-[#64748B] rounded-[2px]">
                  No active cases. Ingest a document below to create a case dossier.
                </div>
              )}
            </div>
          </div>

          {/* SECTION 1: DATA INGESTION */}
          <div className="p-3.5 border-b border-[#1E293B]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase text-[#FFFFFF] tracking-widest font-bold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#FFFFFF]" />
                DATA INGESTION
              </span>
            </div>

            {/* React Dropzone Native Drag & Drop */}
            <div
              {...getRootProps()}
              className={cn(
                'flex flex-col items-center justify-center h-20 border border-dashed transition-all cursor-pointer rounded-[2px] group mb-3',
                isDragActive
                  ? 'border-[#FFFFFF] bg-[#1E293B] scale-[0.99]'
                  : 'border-[#1E293B] hover:border-slate-500 hover:bg-[#0B0F19] bg-[#000000]',
                isProcessing && 'opacity-50 cursor-not-allowed'
              )}
            >
              <input {...getInputProps()} />
              <UploadCloud
                className={cn(
                  'w-5 h-5 mb-1 transition-colors',
                  isDragActive ? 'text-white scale-110' : 'text-[#94A3B8] group-hover:text-[#FFFFFF]'
                )}
              />
              <span className="text-[10px] text-[#94A3B8] group-hover:text-[#FFFFFF] tracking-wider uppercase font-medium text-center px-2">
                {isDragActive
                  ? 'DROP FILE TO INITIALIZE CASE'
                  : isProcessing
                  ? 'EXTRACTING INTELLIGENCE...'
                  : 'DROP FIR / CDR CSV / AUDIO (.WAV)'}
              </span>
            </div>

            {/* Real-time Telemetry Stream Terminal */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase text-[#94A3B8] tracking-wider font-semibold flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-[#FFFFFF]" />
                  Telemetry Stream
                </span>
                {isProcessing && (
                  <span className="text-[8px] text-amber-400 bg-amber-950/40 border border-amber-800 px-1 py-0.2 rounded-[2px] animate-pulse">
                    PARSING
                  </span>
                )}
              </div>
              <div
                ref={logContainerRef}
                className="bg-[#0B0F19] border border-[#1E293B] p-2 max-h-40 overflow-y-auto font-mono text-[10px] leading-relaxed text-[#94A3B8] space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800 rounded-[2px]"
              >
                {telemetryLogs.map((log, index) => (
                  <div
                    key={index}
                    className={cn(
                      'break-words',
                      log.includes('[ERROR]') && 'text-red-400 font-semibold',
                      log.includes('[NEO4J_') && 'text-[#FFFFFF] font-semibold',
                      log.includes('[PERSIST_') && 'text-purple-400 font-semibold',
                      log.includes('[CASE_') && 'text-cyan-400 font-semibold',
                      log.includes('[CDR_PARSER]') && 'text-cyan-400 font-semibold',
                      log.includes('[FASTER_WHISPER]') && 'text-emerald-400 font-semibold',
                      log.includes('[QWEN_GPU]') && 'text-[#FFFFFF]',
                      log.includes('[RESOLUTION') && 'text-emerald-400',
                      log.includes('[PURGE') && 'text-amber-400'
                    )}
                  >
                    {log}
                  </div>
                ))}
                <div className="flex items-center text-[#FFFFFF] pt-0.5">
                  <span className="text-[9px]">&gt;</span>
                  <span className="inline-block w-1.5 h-2.5 bg-[#FFFFFF] animate-pulse ml-1" />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: CANVAS FILTERS */}
          <div className="p-3.5 flex-1">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] uppercase text-[#FFFFFF] tracking-widest font-bold flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#FFFFFF]" />
                CANVAS FILTERS
              </span>
              {activeFilters.length > 0 && (
                <button
                  onClick={() => setActiveFilters([])}
                  className="text-[9px] text-[#94A3B8] hover:text-[#FFFFFF] uppercase underline"
                >
                  RESET
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {FILTER_CONFIG.map(({ type, label, icon: Icon }) => {
                const isActive = activeFilters.includes(type);
                const count = entityCounts[type] || 0;

                return (
                  <button
                    key={type}
                    onClick={() => toggleFilter(type)}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 text-xs transition-all border rounded-[2px]',
                      isActive
                        ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF] font-semibold'
                        : 'bg-[#000000] text-[#94A3B8] border-[#1E293B] hover:border-[#475569] hover:text-[#FFFFFF]'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-black' : 'text-[#94A3B8]')} />
                      <span>{label}</span>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded-[2px] font-mono',
                        isActive
                          ? 'bg-[#000000] text-[#FFFFFF]'
                          : 'bg-[#111827] text-[#94A3B8] border border-[#1E293B]'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 3. CENTER CANVAS (Cytoscape Graph Area) */}
        <main className="flex-1 h-full relative bg-[#000000] flex flex-col">
          {/* Subtle Grid Background */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: `linear-gradient(to right, #1E293B 1px, transparent 1px), linear-gradient(to bottom, #1E293B 1px, transparent 1px)`,
              backgroundSize: '32px 32px',
            }}
          />

          {/* Active View Indicator Banner */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#000000]/90 backdrop-blur-sm border border-[#1E293B] px-3 py-1.5 rounded-[2px] text-[10px] font-mono">
            {viewMode === 'global' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-purple-300 font-bold uppercase tracking-wider">
                  GLOBAL SANDBOX // MULTI-CASE CROSS-LINK ANALYSIS
                </span>
                <span className="text-[#64748B]">({cases.length} Cases Integrated)</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[#FFFFFF] font-bold uppercase tracking-wider">
                  CASE DOSSIER: {activeCase ? activeCase.title : 'None Selected'}
                </span>
                {activeCase && (
                  <span className="text-[#64748B]">
                    (ID: {activeCase.id.slice(0, 8)}...)
                  </span>
                )}
              </>
            )}
          </div>

          {/* Graph Visualization */}
          <div className="flex-1 w-full h-full relative">
            <NetworkGraph
              elements={graphData}
              activeFilters={activeFilters}
              searchQuery={searchQuery}
              onSelectNode={(nodeData) => {
                setSelectedNode(nodeData);
                setSelectedEdge(null);
              }}
              onSelectEdge={(edgeData) => {
                setSelectedEdge(edgeData);
                setSelectedNode(null);
              }}
            />
          </div>

          {/* Empty State Overlay */}
          {!hasNodes && !isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <div className="p-6 border border-[#1E293B] bg-[#000000]/80 backdrop-blur-md rounded-[2px] flex flex-col items-center text-center max-w-sm">
                <ShieldAlert className="w-8 h-8 text-[#475569] mb-3" />
                <div className="text-xs font-bold text-[#FFFFFF] tracking-widest uppercase mb-1">
                  NO ACTIVE INTELLIGENCE GRAPH
                </div>
                <div className="text-[11px] text-[#94A3B8] leading-relaxed mb-4">
                  Select a case from the directory or drop a police report / FIR to generate entity graph.
                </div>
                <div className="text-[9px] text-[#475569] border border-[#1E293B] px-2 py-1 rounded-[2px]">
                  CYTOSCAPE COLA FORCE-DIRECTED LAYOUT READY
                </div>
              </div>
            </div>
          )}

          {/* Processing Loading Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-20">
              <div className="p-6 border border-[#1E293B] bg-[#000000] rounded-[2px] flex flex-col items-center text-center max-w-sm">
                <div className="w-8 h-8 border-2 border-t-[#FFFFFF] border-r-transparent border-b-[#FFFFFF] border-l-transparent rounded-full animate-spin mb-3" />
                <div className="text-xs font-bold text-[#FFFFFF] tracking-widest uppercase mb-1">
                  EXTRACTING ENTITY KNOWLEDGE GRAPH
                </div>
                <div className="text-[10px] text-[#94A3B8] leading-relaxed">
                  Executing NLP entity extraction, case indexing, and Neo4j graph linking...
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 4. RIGHT DRAWER (320px) */}
        <aside className="w-[320px] border-l border-[#1E293B] bg-[#000000] flex flex-col z-10 shrink-0 overflow-y-auto">
          {/* VIEW A: TARGET DOSSIER (NODE SELECTED) */}
          {selectedNode && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-3.5 border-b border-[#1E293B] flex items-center justify-between bg-[#000000]">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-[#FFFFFF] text-[#000000] text-[9px] font-bold tracking-widest uppercase rounded-[2px]">
                    TARGET
                  </span>
                  <h3 className="text-xs font-bold text-[#FFFFFF] tracking-wider uppercase">
                    Target Dossier
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-[#94A3B8] hover:text-[#FFFFFF] transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 flex-1 overflow-y-auto space-y-4 font-mono">
                {/* Target Name & Role Badge */}
                <div className="bg-[#000000] p-3 border border-[#1E293B] rounded-[2px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] uppercase text-[#475569] tracking-widest">
                      Classification
                    </span>
                    {selectedNode.role && (
                      <span
                        className={cn(
                          'text-[9px] font-bold px-1.5 py-0.2 rounded-[2px] uppercase border tracking-wider',
                          getRoleBadgeStyle(selectedNode.role)
                        )}
                      >
                        [{selectedNode.role}]
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] uppercase text-[#475569] tracking-widest mb-1">
                    Designation
                  </div>
                  <div className="text-sm text-[#FFFFFF] font-bold tracking-wide">
                    {selectedNode.label || selectedNode.id}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] mt-1 break-all">
                    ID: {selectedNode.id}
                  </div>

                  {/* Threat Score Bar */}
                  <div className="mt-3 pt-3 border-t border-[#1E293B]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] uppercase text-[#94A3B8] tracking-widest">
                        Threat Assessment
                      </span>
                      <span className="text-xs font-bold text-[#FFFFFF]">
                        {(selectedNode.threat_score ??
                          selectedNode.data?.threat_score ??
                          selectedNode.risk ??
                          selectedNode.data?.risk) ?? 0}
                        /100
                      </span>
                    </div>
                    <div className="w-full bg-[#111827] h-2 rounded-[1px] overflow-hidden border border-[#333333]">
                      <div
                        className="h-full bg-[#FFFFFF] transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              Number(
                                selectedNode.threat_score ??
                                  selectedNode.data?.threat_score ??
                                  selectedNode.risk ??
                                  selectedNode.data?.risk
                              ) || 0
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="text-[8px] font-mono text-[#64748B] mt-1.5 tracking-wider uppercase">
                      [CALCULATED VIA STRUCTURAL DEGREE CENTRALITY]
                    </div>
                  </div>
                </div>

                {/* Section 1: Attributes & Identifiers */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2">
                    Attributes &amp; Identifiers
                  </div>
                  <div className="bg-[#000000] border border-[#1E293B] text-[10px] divide-y divide-[#1E293B] rounded-[2px]">
                    <div className="p-2 flex justify-between">
                      <span className="text-[#475569] uppercase">Classification</span>
                      <span className="text-[#FFFFFF]">{selectedNode.type || 'Unknown'}</span>
                    </div>
                    {selectedNode.role && (
                      <div className="p-2 flex justify-between">
                        <span className="text-[#475569] uppercase">Assigned Role</span>
                        <span className="text-[#FFFFFF] font-semibold">{selectedNode.role}</span>
                      </div>
                    )}
                    {selectedNode.aliases && (
                      <div className="p-2 flex justify-between">
                        <span className="text-[#475569] uppercase">Known Aliases</span>
                        <span className="text-[#FFFFFF]">{selectedNode.aliases}</span>
                      </div>
                    )}
                    {selectedNode.last_seen && (
                      <div className="p-2 flex justify-between">
                        <span className="text-[#475569] uppercase">Last Known Loc</span>
                        <span className="text-[#FFFFFF]">{selectedNode.last_seen}</span>
                      </div>
                    )}
                    {selectedNode.details && (
                      <div className="p-2">
                        <div className="text-[#475569] uppercase mb-1">Involvement Summary</div>
                        <div className="text-[#94A3B8] leading-relaxed">{selectedNode.details}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 2: Connected Links (1-Hop Neighbors) */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2 flex items-center justify-between">
                    <span>1-Hop Connected Neighbors</span>
                    <span className="text-[#475569]">({connectedLinks.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {connectedLinks.length > 0 ? (
                      connectedLinks.map((link, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            if (link.nodeData) {
                              setSelectedNode(link.nodeData);
                              setSelectedEdge(null);
                            }
                          }}
                          className="bg-[#000000] border border-[#1E293B] hover:border-[#FFFFFF] p-2 flex items-center justify-between text-[10px] cursor-pointer transition-colors rounded-[2px]"
                        >
                          <div className="flex flex-col">
                            <span className="text-[#FFFFFF] font-semibold">{link.targetLabel}</span>
                            <span className="text-[#475569] text-[9px] uppercase">
                              {link.direction === 'outgoing' ? '→' : '←'} {formatNomenclature(link.relation)} ({link.targetType})
                            </span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-[#94A3B8]" />
                        </div>
                      ))
                    ) : (
                      <div className="bg-[#000000] border border-[#1E293B] p-2 text-[10px] text-[#475569] text-center rounded-[2px]">
                        No direct links mapped.
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Evidence Provenance (Explainable AI) */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-[#FFFFFF]" />
                    Evidence Provenance (XAI Citation)
                  </div>
                  <div className="bg-[#000000] border-l-2 border-[#FFFFFF] border-y border-r border-[#1E293B] p-2.5 text-[10px] leading-relaxed text-[#94A3B8] italic rounded-[2px]">
                    {selectedNode.evidence ? (
                      <span>&ldquo;{selectedNode.evidence}&rdquo;</span>
                    ) : (
                      <span className="text-[#475569]">
                        Automated inference from report text. Primary citation pending manual forensic log review.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-3 border-t border-[#1E293B] bg-[#000000] flex items-center justify-between text-[9px] text-[#475569]">
                <span className="tracking-widest uppercase">CASE FILE ACTIVE</span>
                <span className="text-[#94A3B8]">CONFIDENTIAL // AGY-ENCLAVE</span>
              </div>
            </div>
          )}

          {/* VIEW B: RELATIONSHIP DOSSIER (EDGE SELECTED) */}
          {selectedEdge && !selectedNode && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-3.5 border-b border-[#1E293B] flex items-center justify-between bg-[#000000]">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-[#c084fc] text-[#000000] text-[9px] font-bold tracking-widest uppercase rounded-[2px]">
                    RELATION
                  </span>
                  <h3 className="text-xs font-bold text-[#FFFFFF] tracking-wider uppercase">
                    Relationship Dossier
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEdge(null)}
                  className="text-[#94A3B8] hover:text-[#FFFFFF] transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 flex-1 overflow-y-auto space-y-4 font-mono">
                {/* Nature of Connection Banner */}
                <div className="bg-[#000000] p-3 border border-[#1E293B] rounded-[2px]">
                  <div className="text-[9px] uppercase text-[#475569] tracking-widest mb-1">
                    Nature of Connection
                  </div>
                  <div className="text-sm text-[#c084fc] font-bold tracking-wide break-words">
                    {formatNomenclature(selectedEdge.label || 'Connected To')}
                  </div>
                </div>

                {/* Interconnected Nodes Flow */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2">
                    Interconnected Nodes
                  </div>
                  <div className="space-y-2">
                    {/* Source Node */}
                    <div
                      onClick={() => {
                        const node = (graphData.nodes || []).find(
                          (n: any) => String(n.data?.id) === String(selectedEdge.source)
                        );
                        if (node?.data) {
                          setSelectedNode(node.data);
                          setSelectedEdge(null);
                        }
                      }}
                      className="bg-[#000000] border border-[#1E293B] hover:border-[#FFFFFF] p-2.5 rounded-[2px] cursor-pointer transition-colors"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-[#475569] uppercase tracking-wider">Source Entity</span>
                        <span className="text-[9px] px-1 py-0.2 bg-[#111827] text-slate-300 rounded-[2px]">
                          {selectedEdge.source_type || 'Unknown'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-[#FFFFFF] flex items-center justify-between">
                        <span>{selectedEdge.source_label || selectedEdge.source}</span>
                        <ExternalLink className="w-3 h-3 text-[#94A3B8]" />
                      </div>
                      {selectedEdge.source_role && (
                        <div className="text-[9px] text-[#94A3B8] mt-1">
                          Role: <span className="text-[#FFFFFF]">{selectedEdge.source_role}</span>
                        </div>
                      )}
                    </div>

                    {/* Flow Vector */}
                    <div className="flex items-center justify-center text-[#475569] text-[10px] font-mono py-0.5">
                      <span>↓ {formatNomenclature(selectedEdge.label || 'Connected')} ↓</span>
                    </div>

                    {/* Target Node */}
                    <div
                      onClick={() => {
                        const node = (graphData.nodes || []).find(
                          (n: any) => String(n.data?.id) === String(selectedEdge.target)
                        );
                        if (node?.data) {
                          setSelectedNode(node.data);
                          setSelectedEdge(null);
                        }
                      }}
                      className="bg-[#000000] border border-[#1E293B] hover:border-[#FFFFFF] p-2.5 rounded-[2px] cursor-pointer transition-colors"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-[#475569] uppercase tracking-wider">Target Entity</span>
                        <span className="text-[9px] px-1 py-0.2 bg-[#111827] text-slate-300 rounded-[2px]">
                          {selectedEdge.target_type || 'Unknown'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-[#FFFFFF] flex items-center justify-between">
                        <span>{selectedEdge.target_label || selectedEdge.target}</span>
                        <ExternalLink className="w-3 h-3 text-[#94A3B8]" />
                      </div>
                      {selectedEdge.target_role && (
                        <div className="text-[9px] text-[#94A3B8] mt-1">
                          Role: <span className="text-[#FFFFFF]">{selectedEdge.target_role}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Transaction / Interaction Details */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2">
                    Transaction &amp; Interaction Intel
                  </div>
                  <div className="bg-[#000000] border border-[#1E293B] p-2.5 rounded-[2px] text-[10px] text-slate-300 leading-relaxed">
                    {selectedEdge.details || 'No specific interaction metadata logged.'}
                  </div>
                </div>

                {/* Verbatim Evidence Citation */}
                <div>
                  <div className="text-[10px] uppercase text-[#94A3B8] tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-[#FFFFFF]" />
                    Evidence Citation (XAI)
                  </div>
                  <div className="bg-[#000000] border-l-2 border-[#c084fc] border-y border-r border-[#1E293B] p-2.5 text-[10px] leading-relaxed text-[#94A3B8] italic rounded-[2px]">
                    {selectedEdge.evidence ? (
                      <span>&ldquo;{selectedEdge.evidence}&rdquo;</span>
                    ) : (
                      <span className="text-[#475569]">
                        Verbatim quote pending forensic transcript reference.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-3 border-t border-[#1E293B] bg-[#000000] flex items-center justify-between text-[9px] text-[#475569]">
                <span className="tracking-widest uppercase">RELATIONSHIP ACTIVE</span>
                <span className="text-[#94A3B8]">CONFIDENTIAL // AGY-ENCLAVE</span>
              </div>
            </div>
          )}

          {/* VIEW C: DEFAULT / NO SELECTION */}
          {!selectedNode && !selectedEdge && (
            <div className="flex flex-col h-full items-center justify-center p-6 text-center text-[#475569]">
              <Layers className="w-8 h-8 mb-2 stroke-1 opacity-50" />
              <div className="text-xs uppercase font-bold tracking-widest text-[#94A3B8] mb-1">
                DOSSIER STANDBY
              </div>
              <div className="text-[10px] leading-relaxed">
                Click any Node or Connection Line on the canvas to inspect forensic intelligence dossiers.
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* 5. CASE TITLE CREATION MODAL */}
      {caseTitleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#000000] border border-[#FFFFFF] p-5 rounded-[2px] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[#FFFFFF]" />
                <h3 className="text-xs font-bold text-[#FFFFFF] tracking-wider uppercase">
                  INITIALIZE NEW CASE DOSSIER
                </h3>
              </div>
              <button
                onClick={() => {
                  setCaseTitleModalOpen(false);
                  setPendingFile(null);
                }}
                className="text-[#94A3B8] hover:text-[#FFFFFF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase text-[#94A3B8] tracking-widest block mb-1 font-semibold">
                  Case Title / FIR Reference
                </label>
                <input
                  type="text"
                  value={customCaseTitle}
                  onChange={(e) => setCustomCaseTitle(e.target.value)}
                  placeholder="e.g. Cyber Syndicate FIR 142/24 - Noida Sector 62"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleConfirmCaseCreation();
                    }
                  }}
                  className="w-full bg-[#0B0F19] border border-[#1E293B] focus:border-[#FFFFFF] rounded-[2px] p-2 text-xs text-[#FFFFFF] font-mono focus:outline-none"
                />
              </div>

              {pendingFile && (
                <div className="bg-[#0B0F19] border border-[#1E293B] p-2.5 rounded-[2px] text-[10px] space-y-1">
                  <div className="flex justify-between text-[#94A3B8]">
                    <span>Source Payload:</span>
                    <span className="text-[#FFFFFF] font-semibold">{pendingFile.name}</span>
                  </div>
                  <div className="flex justify-between text-[#94A3B8]">
                    <span>File Size:</span>
                    <span className="text-[#FFFFFF]">{(pendingFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E293B]">
              <button
                onClick={() => {
                  setCaseTitleModalOpen(false);
                  setPendingFile(null);
                }}
                className="px-3 py-1.5 border border-[#333333] hover:border-[#FFFFFF] text-[#94A3B8] hover:text-[#FFFFFF] text-[11px] rounded-[2px] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmCaseCreation}
                className="px-4 py-1.5 bg-[#FFFFFF] text-[#000000] font-bold text-[11px] hover:bg-slate-200 rounded-[2px] transition-colors"
              >
                INITIALIZE &amp; EXTRACT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
