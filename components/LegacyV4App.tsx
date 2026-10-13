import React, { useRef, useEffect, useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Staff, TrainingSession, ViewMode, Signature, CloudConfig, SessionType } from '../types';
import { legacyAdminKey, legacySchoolStorage, saveLegacyConnection } from '../services/legacyStorageService';
import { schoolEndpoint } from '../services/schoolEndpoint.mjs';
import * as CloudService from '../services/cloudServiceV4';
import SignaturePad from './SignaturePad';
import PrintReport from './PrintReport';
import CloudSetup from './LegacyV4Connection';
import ConfirmModal, { ConfirmRequest } from './ConfirmModal';
import EditTitleModal from './EditTitleModal';
import AuthModal from './AuthModal';
import DeleteModal from './DeleteModal';
import LandingView from '../views/LandingView';
import AdminView from './LegacyV4AdminView';
import SignerView from '../views/SignerView';

// @ts-ignore
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';


// Simple ID generator
const generateId = () => Math.random().toString(36).substring(2, 9);

interface DeleteConfirmInfo {
    staffId: string;
    staffName: string;
    targetSessionId: string;
    relatedSessionIds: string[];
    targetDate: string;
}

interface ExportResult {
    id: string;
    filename: string;
    blobUrl: string;
}

interface LegacyV4AppProps {
    endpoint: string;
    onCheckVersion: () => void;
    onChangeSchool: () => void;
}

// Preserve the v4 screens and native v4 API. The selected school is authoritative.
const LegacyV4SchoolApp: React.FC<LegacyV4AppProps> = ({ endpoint, onCheckVersion, onChangeSchool }) => {
    const selectedEndpoint = schoolEndpoint(endpoint);
    const participantAccess = new URLSearchParams(window.location.search).has('sessionId');
    const Storage = useMemo(() => legacySchoolStorage(selectedEndpoint, !participantAccess), [selectedEndpoint, participantAccess]);
    const [savedKey] = useState(() => !participantAccess ? legacyAdminKey(selectedEndpoint) : '');
    const [connectionError, setConnectionError] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('landing');
    const [sessions, setSessions] = useState<TrainingSession[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [selectedAdminSessions, setSelectedAdminSessions] = useState<Set<string>>(new Set());
    const [isBulkExporting, setIsBulkExporting] = useState(false);
    const [exportResults, setExportResults] = useState<ExportResult[]>([]);

    // App Initialization State
    const [isInitializing, setIsInitializing] = useState(true);
    const [isLinkAccess, setIsLinkAccess] = useState(false);

    // Cloud Config
    const [cloudConfig, setCloudConfig] = useState<CloudConfig>({ enabled: true, scriptUrl: selectedEndpoint, ...(savedKey ? { adminKey: savedKey } : {}) });
    const [participantToken, setParticipantToken] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Admin Create State
    const [newSessionType, setNewSessionType] = useState<SessionType>('school');
    const [newTitle, setNewTitle] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [newSchool, setNewSchool] = useState(() => participantAccess ? '' : Storage.getLastSchool());
    const [enableAuth, setEnableAuth] = useState(false);
    const [newAuthCode, setNewAuthCode] = useState('');

    // Parents Session Config State
    const [newParentGrades, setNewParentGrades] = useState('1학년, 2학년, 3학년, 4학년, 5학년, 6학년');
    const [newParentClasses, setNewParentClasses] = useState('1반, 2반, 3반, 4반, 5반');

    const [shareModalSession, setShareModalSession] = useState<TrainingSession | null>(null);

    // Delete Modal State
    const [deleteConfirmInfo, setDeleteConfirmInfo] = useState<DeleteConfirmInfo | null>(null);

    // Generic confirm modal (replaces window.confirm)
    const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

    // Edit Title State
    const [editModeSession, setEditModeSession] = useState<{id: string, title: string} | null>(null);

    // App Base URL State
    const [appBaseUrl, setAppBaseUrl] = useState('');

    // Staff Management State
    const [globalStaffList, setGlobalStaffList] = useState<Staff[]>([]);

    // Signer State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

    // Office Mode Signer State
    const [manualInput, setManualInput] = useState({
        department: '',
        position: '',
        name: ''
    });

    // Parents Mode Signer State
    const [parentsInput, setParentsInput] = useState({
        grade: '',
        classNumber: '',
        childName: '',
        parentName: ''
    });

    // Auth & Signing Flow State
    const [pendingStaff, setPendingStaff] = useState<Staff | null>(null);
    const [isSigning, setIsSigning] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authInput, setAuthInput] = useState('');
    const [authError, setAuthError] = useState(false);
    const [isSessionAuthenticated, setIsSessionAuthenticated] = useState(false);

    useEffect(() => {
        setIsSessionAuthenticated(false);
    }, [selectedSessionId]);

    // Notification
    const [notification, setNotification] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);

    // Hidden file input for session staff update
    const sessionFileInputRef = useRef<HTMLInputElement>(null);
    const [updatingSessionId, setUpdatingSessionId] = useState<string | null>(null);

    const APP_VERSION = "v4.0";
    const [showUpdateGuide, setShowUpdateGuide] = useState(false);

    useEffect(() => {
        let active = true;
        const initApp = async () => {
            resetBaseUrl();
            const params = new URLSearchParams(window.location.search);
            const sessionId = params.get('sessionId');
            if (!selectedEndpoint) {
                setConnectionError('학교 GAS 웹앱의 /exec 주소를 확인해주세요.');
                setIsInitializing(false);
                return;
            }
            if (participantAccess) {
                setIsLinkAccess(true);
                setViewMode('signer');
                setSelectedSessionId(sessionId);
                const token = params.get('token') || '';
                setParticipantToken(token);
                // A participant link selects its own school and never uses saved credentials.
                if (schoolEndpoint(params.get('endpoint')) !== selectedEndpoint || !sessionId || !token) {
                    setNotification({ msg: '[ERR-PARTICIPANT-LINK] 참여 링크를 확인해주세요. 담당자에게 새 QR을 요청하세요.', type: 'error' });
                } else {
                    await loadParticipantSession(selectedEndpoint, sessionId, token);
                }
            } else {
                setIsLinkAccess(false);
                setGlobalStaffList(Storage.getStaffList());
                if (savedKey) {
                    const data = await loadSessions(true, selectedEndpoint, savedKey);
                    if (!Storage.hasStaffList()) setGlobalStaffList(data.find(session => session.staffList?.length)?.staffList || []);
                } else {
                    setConnectionError('이 브라우저에는 기존 v4 연결 설정이 없습니다. 학교에서 사용하던 관리자 연결키를 입력하면 기존 자료를 불러옵니다.');
                }
            }
            if (active) setIsInitializing(false);
        };
        initApp();
        return () => { active = false; };
    }, [selectedEndpoint]);

    useEffect(() => {
        const defaultTitle = '교직원 연수 등록부';
        if (selectedSessionId && sessions.length > 0) {
            const session = sessions.find(s => s.id === selectedSessionId);
            if (session) {
                document.title = session.title;
                return;
            }
        }
        document.title = defaultTitle;
    }, [selectedSessionId, sessions]);

    const resetBaseUrl = () => {
        let currentUrl = window.location.href.split('?')[0];
        if (currentUrl.startsWith('blob:')) currentUrl = currentUrl.replace('blob:', '');
        if (currentUrl.endsWith('/')) currentUrl = currentUrl.slice(0, -1);
        setAppBaseUrl(currentUrl);
    };

    const showNotification = (msg: string, type: 'success' | 'error') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const loadSessions = async (_isCloud: boolean, url = selectedEndpoint, adminKey = cloudConfig.adminKey) => {
        if (participantAccess) return [];
        setIsLoading(true);
        try {
            if (!selectedEndpoint || schoolEndpoint(url) !== selectedEndpoint) throw new Error('선택한 학교 주소를 확인해주세요.');
            if (!adminKey) throw new Error('기존 v4 연결 설정에서 학교 관리자 연결키를 입력해주세요.');
            const data = await CloudService.fetchAdminSessions(selectedEndpoint, adminKey);
            setSessions(data);
            setConnectionError('');
            return data;
        } catch (error: any) {
            const raw = error?.message || '학교 서버에 연결하지 못했습니다. 잠시 후 다시 확인해주세요.';
            const msg = /ERR-ADMIN-(KEY|SETUP)/.test(raw)
                ? '기존 v4 연결 설정에서 학교 관리자 연결키를 확인해주세요. 학교 자료나 연결키를 새로 만들 필요는 없습니다.'
                : raw;
            setConnectionError(msg);
            return [];
        } finally {
            setIsLoading(false);
        }
    };

    const loadParticipantSession = async (url: string, sessionId: string, token: string, code = '') => {
        setIsLoading(true);
        try {
            if (schoolEndpoint(url) !== selectedEndpoint || !sessionId || !token) throw new Error('[ERR-PARTICIPANT-LINK] 참여 링크를 확인해주세요.');
            const session = await CloudService.fetchParticipantSession(selectedEndpoint, sessionId, token, code);
            setSessions([session]);
            return session;
        } catch (e: any) {
            console.error(e);
            showNotification(e.message || '[ERR-PARTICIPANT-LOAD] 연수 정보를 불러오지 못했습니다.', 'error');
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    const handleCloudSetupSave = (adminKey: string, existingSessions: TrainingSession[]) => {
        if (participantAccess || !selectedEndpoint) return;
        const newConfig = { enabled: true, scriptUrl: selectedEndpoint, adminKey };
        setCloudConfig(newConfig);
        saveLegacyConnection(selectedEndpoint, adminKey);
        setSessions(existingSessions);
        setConnectionError('');
        if (!Storage.hasStaffList()) setGlobalStaffList(current => current.length ? current : existingSessions.find(session => session.staffList?.length)?.staffList || []);
        setViewMode('admin');
        showNotification('기존 구글 드라이브에 연결되었습니다.', 'success');
    };

    const handleCreateSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (participantAccess || !cloudConfig.adminKey || connectionError) return;
        if (!newTitle || !newDate || !newSchool) {
            showNotification('[ERR-VAL-01] 필수 정보를 입력해주세요.', 'error');
            return;
        }
        if (newSessionType === 'school' && globalStaffList.length === 0) {
            showNotification('[ERR-VAL-02] 등록된 교직원 명단이 없습니다.', 'error');
            return;
        }

        const newSession: TrainingSession = {
            id: generateId(),
            type: newSessionType,
            title: newTitle,
            date: newDate,
            time: newTime || undefined,
            schoolName: newSchool,
            maxParticipants: newSessionType === 'school' ? 200 : newSessionType === 'parents' ? 1000 : 500,
            authCode: enableAuth ? newAuthCode : undefined,
            staffList: newSessionType === 'school' ? [...globalStaffList] : [],
            signatures: [],
            createdAt: Date.now(),
            participantToken: uuidv4().replace(/-/g, ''),
            parentGrades: newSessionType === 'parents' ? newParentGrades.split(',').map(s => s.trim()).filter(Boolean) : undefined,
            parentClasses: newSessionType === 'parents' ? newParentClasses.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        };

        if (cloudConfig.enabled) {
            setIsLoading(true);
            const success = await CloudService.createCloudSession(cloudConfig.scriptUrl, cloudConfig.adminKey || '', newSession);
            setIsLoading(false);
            if (success) {
                showNotification('연수가 구글 드라이브에 저장되었습니다.', 'success');
                loadSessions(true, cloudConfig.scriptUrl, cloudConfig.adminKey);
                Storage.saveLastSchool(newSchool);
            }
        }

        setNewTitle('');
        setNewDate('');
        setNewTime('');
        setEnableAuth(false);
        setNewAuthCode('');
        setNewParentGrades('1학년, 2학년, 3학년, 4학년, 5학년, 6학년');
        setNewParentClasses('1반, 2반, 3반, 4반, 5반');
    };

    const handleEditTitleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (participantAccess || !cloudConfig.adminKey || connectionError) return;
        if(!editModeSession || !editModeSession.title.trim()) return;
        const targetSession = sessions.find(s => s.id === editModeSession.id);
        if(!targetSession) return;

        const updatedSession = { ...targetSession, title: editModeSession.title.trim() };
        setIsLoading(true);
        if (cloudConfig.enabled) {
            const success = await CloudService.createCloudSession(cloudConfig.scriptUrl, cloudConfig.adminKey || '', updatedSession);
            if (success) {
                await loadSessions(true, cloudConfig.scriptUrl, cloudConfig.adminKey);
                showNotification('연수 제목이 수정되었습니다.', 'success');
            } else {
                showNotification('서버 오류로 변경에 실패했습니다.', 'error');
            }
        }
        setIsLoading(false);
        setEditModeSession(null);
    };

    const handleDeleteSession = async (id: string) => {
        if (participantAccess || !cloudConfig.adminKey || connectionError) return;
        const doDelete = async () => {
            if (cloudConfig.enabled) {
                setIsLoading(true);
                const success = await CloudService.deleteCloudSession(cloudConfig.scriptUrl, cloudConfig.adminKey || '', id);
                if (success) {
                    await loadSessions(true, cloudConfig.scriptUrl, cloudConfig.adminKey);
                    showNotification('연수가 삭제되었습니다.', 'success');
                }
                setIsLoading(false);
            }
        };
        setConfirmRequest({
            title: '이 연수를 삭제하시겠습니까?',
            message: '서명 데이터도 모두 삭제됩니다.',
            danger: true,
            confirmLabel: '삭제',
            onConfirm: doDelete,
        });
    };

    const handleBulkDelete = async () => {
        if (participantAccess || !cloudConfig.adminKey || connectionError) return;
        if (selectedAdminSessions.size === 0) return;

        const doBulkDelete = async () => {
            const ids = Array.from(selectedAdminSessions) as string[];
            setIsLoading(true);

            if (cloudConfig.enabled) {
                let successCount = 0;
                for (const id of ids) {
                    const success = await CloudService.deleteCloudSession(cloudConfig.scriptUrl, cloudConfig.adminKey || '', id);
                    if (success) successCount++;
                }
                if (successCount > 0) {
                    await loadSessions(true, cloudConfig.scriptUrl, cloudConfig.adminKey);
                    setSelectedAdminSessions(new Set());
                    showNotification(`총 ${successCount}개의 연수가 삭제되었습니다.`, 'success');
                }
            }
            setIsLoading(false);
        };

        setConfirmRequest({
            title: `선택한 ${selectedAdminSessions.size}개의 연수를 일괄 삭제하시겠습니까?`,
            message: '서명 데이터도 모두 삭제됩니다.',
            danger: true,
            confirmLabel: '일괄 삭제',
            onConfirm: doBulkDelete,
        });
    };

    const handleBulkDownloadPDF = async () => {
        if (selectedAdminSessions.size === 0) return;
        setIsBulkExporting(true);
        setIsLoading(true);
        setExportResults([]);

        const newResults: ExportResult[] = [];

        try {
            const ids = Array.from(selectedAdminSessions) as string[];
            for (const id of ids) {
                const session = sessions.find(s => s.id === id);
                if (!session) continue;
                
                const element = document.getElementById(`export-report-${id}`);
                if (!element) {
                    console.warn(`Element export-report-${id} not found.`);
                    continue;
                }

                // Wait briefly to ensure element is properly rendered and dimensions are calc'd
                await new Promise(r => setTimeout(r, 200));

                const opt = {
                    margin: 0,
                    filename: `${session.date} ${session.title}.pdf`,
                    image: { type: 'jpeg' as const, quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
                };
                
                showNotification(`[${session.title}] 임시 렌더링 시작... 환경에 따라 시간이 소요될 수 있습니다.`, 'success');
                
                try {
                    const worker = html2pdf().set(opt).from(element);
                    
                    // Promise chain for output is standard in v0.10+
                    const pdfOutput: any = await worker.output('blob');
                    let blobUrl = '';
                    if (pdfOutput instanceof Blob) {
                        blobUrl = URL.createObjectURL(pdfOutput);
                    } else if (typeof pdfOutput === 'string') {
                        // Some versions return raw string for blob output
                        if (pdfOutput.startsWith('blob:')) {
                            blobUrl = pdfOutput;
                        } else {
                            const blob = new Blob([pdfOutput], { type: 'application/pdf' });
                            blobUrl = URL.createObjectURL(blob);
                        }
                    } else {
                        throw new Error('PDF output returned invalid format');
                    }
                    
                    newResults.push({
                        id: session.id,
                        filename: opt.filename,
                        blobUrl: blobUrl
                    });
                } catch (internalErr: any) {
                    console.error("PDF Blob extraction failed", internalErr);
                    throw new Error(`렌더링 오류: ${internalErr.message || '알 수 없음'}`);
                }
            }
            if (newResults.length > 0) {
                setExportResults(newResults);
                showNotification('생성이 완료되었습니다. 화면의 다운로드 버튼을 클릭해 파일을 받아주세요.', 'success');
            }
            setSelectedAdminSessions(new Set()); // 성공 후 선택 해제
        } catch (error: any) {
            console.error("PDF Export error:", error);
            showNotification(`PDF 생성 중 오류가 발생했습니다: ${error.message || '알 수 없음'}`, 'error');
        } finally {
            setIsBulkExporting(false);
            setIsLoading(false);
        }
    };

    const parseStaffFromFile = async (file: File): Promise<Staff[]> => {
        let parsedStaff: Staff[] = [];
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'xlsx' || extension === 'xls') {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            if (jsonData.length === 0) return [];

            let nameCol = -1, jobCol = -1;
            for (let i = 0; i < Math.min(10, jsonData.length); i++) {
                jsonData[i].forEach((cell: any, idx: number) => {
                    if (typeof cell === 'string') {
                        if (cell.includes('성명') || cell.includes('이름')) nameCol = idx;
                        if (cell.includes('직위') || cell.includes('직급')) jobCol = idx;
                    }
                });
                if (nameCol !== -1) break;
            }

            const startRow = nameCol !== -1 ? 1 : 0;
            for (let i = startRow; i < jsonData.length; i++) {
                const row = jsonData[i];
                const name = nameCol !== -1 ? row[nameCol] : row[1];
                const dept = jobCol !== -1 ? row[jobCol] : (row[0] || '교직원');
                if (name && String(name).trim()) {
                    parsedStaff.push({ id: generateId(), department: String(dept).trim(), name: String(name).trim() });
                }
            }
        } else {
            const text = await file.text();
            text.split('\n').forEach(line => {
                const parts = line.trim().split(/[,\t]/);
                if (parts.length >= 2) parsedStaff.push({ id: generateId(), department: parts[0].trim(), name: parts[1].trim() });
                else if (parts[0].trim()) parsedStaff.push({ id: generateId(), department: '교직원', name: parts[0].trim() });
            });
        }
        return parsedStaff;
    };

    const handleGlobalStaffUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsLoading(true);
        try {
            const parsed = await parseStaffFromFile(file);
            if (parsed.length > 0) {
                Storage.saveStaffList(parsed);
                setGlobalStaffList(parsed);
                showNotification(`기본 명단 ${parsed.length}명이 등록되었습니다.`, 'success');
            }
        } catch (err) {
            showNotification('[ERR-FILE-01] 파일 읽기 오류', 'error');
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    const handleResetStaffList = () => {
        setConfirmRequest({
            title: '모든 교직원 명단을 삭제하시겠습니까?',
            message: '이미 등록된 연수의 명단은 영향을 받지 않습니다.',
            danger: true,
            confirmLabel: '초기화',
            onConfirm: () => {
                Storage.saveStaffList([]);
                setGlobalStaffList([]);
                showNotification('교직원 명단이 초기화되었습니다.', 'success');
            },
        });
    };

    const openSessionStaffUpdate = (sessionId: string) => {
        setUpdatingSessionId(sessionId);
        sessionFileInputRef.current?.click();
    };

    const handleSessionStaffUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (participantAccess || !cloudConfig.adminKey || connectionError) return;
        const file = e.target.files?.[0];
        const sessionId = updatingSessionId;
        if (!file || !sessionId) return;

        setIsLoading(true);
        try {
            const newStaff = await parseStaffFromFile(file);
            if (newStaff.length === 0) throw new Error("유효한 명단이 없습니다.");

            const session = sessions.find(s => s.id === sessionId);
            if (!session) throw new Error("업데이트할 연수 세션을 찾을 수 없습니다.");

            const signedStaffIds = new Set(session.signatures.map(sig => sig.staffId));
            const updatedStaffList: Staff[] = [];

            newStaff.forEach(ns => {
                const existing = session.staffList.find(os => os.name === ns.name && os.department === ns.department);
                if (existing) {
                    updatedStaffList.push(existing);
                } else {
                    updatedStaffList.push(ns);
                }
            });

            session.staffList.forEach(os => {
                if (signedStaffIds.has(os.id)) {
                    const alreadyAdded = updatedStaffList.some(ns => ns.id === os.id);
                    if (!alreadyAdded) updatedStaffList.push(os);
                }
            });

            const updatedSession = { ...session, staffList: updatedStaffList };

            if (cloudConfig.enabled) {
                const success = await CloudService.createCloudSession(cloudConfig.scriptUrl, cloudConfig.adminKey || '', updatedSession);
                if (success) {
                    showNotification('연수 명단이 업데이트되었습니다.', 'success');
                    await loadSessions(true, cloudConfig.scriptUrl, cloudConfig.adminKey);
                }
            }
        } catch (err: any) {
            showNotification((err.message && err.message.startsWith('[ERR')) ? err.message : `[ERR-UPDATE-01] ${err.message || '업데이트 실패'}`, 'error');
        } finally {
            setIsLoading(false);
            setUpdatingSessionId(null);
            e.target.value = '';
        }
    };

    const handleSchoolStaffSelect = (staff: Staff) => {
        const session = sessions.find(s => s.id === selectedSessionId);
        if (!session) return;
        const alreadySigned = session.signatures.some(sig => sig.staffId === staff.id);
        if (alreadySigned) {
            setConfirmRequest({
                title: '이미 서명하셨습니다.',
                message: '다시 서명하시겠습니까?',
                confirmLabel: '다시 서명',
                onConfirm: () => {
                    setSelectedStaff(staff);
                    setIsSigning(true);
                },
            });
            return;
        }
        setSelectedStaff(staff);
        setIsSigning(true);
    };

    const handleOfficeInfoSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualInput.department || !manualInput.position || !manualInput.name) {
            showNotification('[ERR-VAL-03] 정보를 입력해주세요.', 'error');
            return;
        }
        const displayStaff: Staff = {
            id: `office:${[manualInput.department, manualInput.position, manualInput.name].map(v => v.trim()).join('|')}`,
            name: manualInput.name,
            department: manualInput.position,
            affiliation: manualInput.department
        };
        setSelectedStaff(displayStaff);
        setIsSigning(true);
    };

    const handleParentsInfoSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!parentsInput.grade || !parentsInput.classNumber || !parentsInput.childName || !parentsInput.parentName) {
            showNotification('[ERR-VAL-04] 정보를 모두 입력해주세요.', 'error');
            return;
        }
        const displayStaff: Staff = {
            id: `parent:${[parentsInput.grade, parentsInput.classNumber, parentsInput.childName, parentsInput.parentName].map(v => v.trim()).join('|')}`,
            name: parentsInput.parentName,
            department: '학부모',
            grade: parentsInput.grade,
            classNumber: parentsInput.classNumber,
            childName: parentsInput.childName
        };
        setSelectedStaff(displayStaff);
        setIsSigning(true);
    };

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const session = sessions.find(s => s.id === selectedSessionId);

        if (session && isLinkAccess && cloudConfig.enabled && selectedSessionId) {
            const verifiedSession = await loadParticipantSession(cloudConfig.scriptUrl, selectedSessionId, participantToken, authInput);
            if (verifiedSession?.authVerified) {
                setIsSessionAuthenticated(true);
                setAuthError(false);
            } else {
                setAuthError(true);
            }
            return;
        }

        if (session && session.authCode === authInput) {
            setIsAuthModalOpen(false);
            if (pendingStaff) {
                setSelectedStaff(pendingStaff);
                setPendingStaff(null);
                setIsSigning(true);
            } else {
                setIsSessionAuthenticated(true);
            }
            setAuthInput('');
            setAuthError(false);
        } else {
            setAuthError(true);
            setAuthInput('');
        }
    };

    const handleSignatureSave = async (dataUrl: string) => {
        if (!selectedSessionId || !selectedStaff) return;
        const currentSession = sessions.find(s => s.id === selectedSessionId);
        if (!currentSession) return;

        const signature: Signature = {
            staffId: selectedStaff.id,
            staffName: selectedStaff.name,
            department: selectedStaff.department,
            affiliation: selectedStaff.affiliation,
            grade: selectedStaff.grade,
            classNumber: selectedStaff.classNumber,
            childName: selectedStaff.childName,
            signatureData: dataUrl,
            timestamp: Date.now()
        };

        const targetDate = currentSession.date;
        const targetSessions = sessions.filter(s =>
            s.date === targetDate
            && s.type === currentSession.type
            && (s.type !== 'school' || s.staffList.some(staff => staff.id === selectedStaff.id))
        );
        const targetSessionIds = targetSessions.map(s => s.id);

        setIsLoading(true);
        if (cloudConfig.enabled) {
            const success = isLinkAccess
                ? await CloudService.sendParticipantSignature(cloudConfig.scriptUrl, currentSession.id, participantToken, authInput, signature)
                : await CloudService.addSignatureBatch(cloudConfig.scriptUrl, cloudConfig.adminKey || '', targetSessionIds, signature);
            if (success) {
                showNotification(`${selectedStaff.name}님 서명 전송 완료.`, 'success');
                if (isLinkAccess) {
                    await loadParticipantSession(cloudConfig.scriptUrl, currentSession.id, participantToken, authInput);
                } else {
                    await loadSessions(true, cloudConfig.scriptUrl, cloudConfig.adminKey);
                }
            } else {
                showNotification('[ERR-SAVE-01] 서명 전송 실패. 접속자가 많아 일시적으로 차단되었을 수 있습니다. 잠시 후 다시 "서명 완료"를 눌러주세요.', 'error');
                setIsLoading(false);
                return;
            }
        }
        setIsLoading(false);
        setIsSigning(false);
        setSelectedStaff(null);
        setSearchTerm('');
        setManualInput({ department: '', position: '', name: '' });
        setParentsInput({ grade: '', classNumber: '', childName: '', parentName: '' });
    };

    const handleSignatureDelete = async (staffId: string) => {
        const currentSession = sessions.find(s => s.id === selectedSessionId);
        if (!currentSession) return;
        const staffName = currentSession.signatures.find(s => s.staffId === staffId)?.staffName || '사용자';
        const sameDateSessions = sessions.filter(s => s.date === currentSession.date && s.type === currentSession.type);
        setDeleteConfirmInfo({
            staffId, staffName,
            targetSessionId: currentSession.id,
            relatedSessionIds: sameDateSessions.map(s => s.id),
            targetDate: currentSession.date
        });
    };

    const executeDelete = async (scope: 'all' | 'single') => {
        if (participantAccess || !cloudConfig.adminKey || connectionError) return;
        if (!deleteConfirmInfo) return;
        setIsLoading(true);
        const { staffId, targetSessionId, relatedSessionIds } = deleteConfirmInfo;
        const deleteTargets = scope === 'all' ? relatedSessionIds : [targetSessionId];

        if (cloudConfig.enabled) {
            const success = await CloudService.removeSignatureBatch(cloudConfig.scriptUrl, cloudConfig.adminKey || '', deleteTargets, staffId);
            if (!success) {
                setIsLoading(false);
                showNotification('[ERR-DELETE-01] 서명 삭제에 실패했습니다.', 'error');
                return;
            }
            await loadSessions(true, cloudConfig.scriptUrl, cloudConfig.adminKey);
        }
        setIsLoading(false);
        setDeleteConfirmInfo(null);
        showNotification('서명이 삭제되었습니다.', 'success');
    };

    const getShareUrl = (sessionId: string) => {
        const baseUrl = appBaseUrl || window.location.href.split('?')[0];
        const session = sessions.find(item => item.id === sessionId);
        const params = new URLSearchParams({ sessionId, endpoint: selectedEndpoint, token: session?.participantToken || '' });
        return `${baseUrl}?${params.toString()}`;
    };

    const getTargetSessionTitles = () => {
        if (!selectedSessionId) return [];
        const current = sessions.find(s => s.id === selectedSessionId);
        if (!current) return [];
        return current.relatedSessionTitles || sessions.filter(s => s.date === current.date && s.type === current.type).map(s => s.title);
    };

    const renderNotification = () => notification && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] px-6 py-3 rounded-lg shadow-lg text-white font-medium animate-fade-in-down text-center max-w-[90vw] break-keep ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {notification.msg}
        </div>
    );

    const renderGlobalLoading = () => isLoading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center z-[150] animate-fade-in">
            <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-4 shadow-xl"></div>
            <div className="bg-white/10 px-6 py-2 rounded-full border border-white/20">
                <p className="text-white font-bold text-lg tracking-wider animate-pulse">데이터 반영 중...</p>
            </div>
        </div>
    );


    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([{ '직위': '교사', '성명': '홍길동' }], { header: ['직위', '성명'] });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "양식");
        XLSX.writeFile(wb, "명단양식.xlsx");
    };

    if (isInitializing) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400 font-bold">시스템 초기화 중...</div>;

    return (
        <>
            {viewMode === 'landing' && (
                <LandingView appVersion={APP_VERSION} cloudEnabled={cloudConfig.enabled} onNavigate={setViewMode} />
            )}
            {viewMode === 'admin' && !participantAccess && connectionError && (
                <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
                    <section className="bg-white rounded-2xl shadow max-w-xl w-full p-6 space-y-4">
                        <h1 className="text-2xl font-bold">기존 v4 학교 연결</h1>
                        <p role="alert" className="text-gray-700 break-keep">{connectionError}</p>
                        <div className="flex flex-wrap gap-3">
                            <button onClick={() => setViewMode('cloud_setup')} className="bg-blue-600 text-white rounded-lg px-4 py-3 font-bold">구글 연동 설정</button>
                            {cloudConfig.adminKey && <button onClick={() => loadSessions(true)} className="border rounded-lg px-4 py-3">다시 확인</button>}
                            <button onClick={() => setViewMode('landing')} className="border rounded-lg px-4 py-3">처음 화면</button>
                        </div>
                        <button onClick={() => setShowUpdateGuide(true)} className="text-indigo-700 underline text-sm">v5 업데이트 안내</button>
                    </section>
                </main>
            )}
            {viewMode === 'admin' && !participantAccess && !connectionError && (
                <AdminView
                    onNavigate={setViewMode}
                    onShowUpdate={() => setShowUpdateGuide(value => !value)}
                    globalStaffList={globalStaffList}
                    onResetStaffList={handleResetStaffList}
                    onDownloadTemplate={handleDownloadTemplate}
                    onGlobalStaffUpload={handleGlobalStaffUpload}
                    newSessionType={newSessionType}
                    onChangeSessionType={setNewSessionType}
                    newTitle={newTitle}
                    onChangeTitle={setNewTitle}
                    newSchool={newSchool}
                    onChangeSchool={setNewSchool}
                    newDate={newDate}
                    onChangeDate={setNewDate}
                    newTime={newTime}
                    onChangeTime={setNewTime}
                    newParentGrades={newParentGrades}
                    onChangeParentGrades={setNewParentGrades}
                    newParentClasses={newParentClasses}
                    onChangeParentClasses={setNewParentClasses}
                    enableAuth={enableAuth}
                    onChangeEnableAuth={setEnableAuth}
                    newAuthCode={newAuthCode}
                    onChangeAuthCode={setNewAuthCode}
                    onCreateSession={handleCreateSession}
                    isLoading={isLoading}
                    isBulkExporting={isBulkExporting}
                    sessions={sessions}
                    selectedAdminSessions={selectedAdminSessions}
                    onChangeSelectedAdminSessions={setSelectedAdminSessions}
                    onBulkDelete={handleBulkDelete}
                    cloudConfig={cloudConfig}
                    onRefresh={() => loadSessions(cloudConfig.enabled, cloudConfig.scriptUrl, cloudConfig.adminKey)}
                    onEditTitle={setEditModeSession}
                    onShare={setShareModalSession}
                    onOpenSessionStaffUpdate={openSessionStaffUpdate}
                    onViewReport={(sessionId) => { setSelectedSessionId(sessionId); setViewMode('report'); }}
                    onDeleteSession={handleDeleteSession}
                    sessionFileInputRef={sessionFileInputRef}
                    onSessionStaffUpdate={handleSessionStaffUpdate}
                    shareModalSession={shareModalSession}
                    onCloseShareModal={() => setShareModalSession(null)}
                    getShareUrl={getShareUrl}
                    showNotification={showNotification}
                />
            )}
            {viewMode === 'admin' && !participantAccess && showUpdateGuide && (
                <section aria-label="v5 업데이트 안내" className="fixed inset-0 z-[120] bg-black/40 p-4 flex items-center justify-center">
                    <div className="bg-white rounded-2xl p-6 max-w-xl w-full space-y-4">
                        <h2 className="text-xl font-bold">v5 업데이트 안내</h2>
                        <p>업데이트 전까지 지금의 v4 화면에서 계속 사용할 수 있습니다.</p>
                        <ol className="list-decimal ml-5 space-y-2">
                            <li>기존 코드와 Drive 자료를 백업하고 업데이트 ZIP을 받습니다.</li>
                            <li>기존 학교 Apps Script의 Code.gs와 Index.html을 교체·저장합니다.</li>
                            <li>기존 웹앱을 새 버전으로 배포하고 아래에서 확인합니다.</li>
                        </ol>
                        <p className="text-sm text-gray-600">v5에서 기존 자료 연결을 확인한 뒤 사용하세요. 기존 학교의 주소와 자료를 보존합니다.</p>
                        <div className="flex flex-wrap gap-3">
                            <a href="https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-GAS.zip" className="text-blue-600 underline">업데이트 ZIP 다운로드</a>
                            <a href="https://github.com/skonT151216/teachersign-improved#학교에-설치하기" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">자세한 안내</a>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onCheckVersion} className="bg-blue-600 text-white rounded-lg px-4 py-3 font-bold">업데이트 완료 확인</button>
                            <button onClick={() => setShowUpdateGuide(false)} className="border rounded-lg px-4 py-3">닫기</button>
                        </div>
                    </div>
                </section>
            )}
            {viewMode === 'signer' && !participantAccess && connectionError && (
                <div role="alert" className="max-w-2xl mx-auto p-4 bg-blue-50 text-blue-900">
                    <p>이 브라우저의 학교 연결 설정을 확인하거나 담당자가 보낸 서명 링크로 접속해주세요.</p>
                    <button onClick={() => setViewMode('landing')} className="mt-2 underline font-bold">처음 화면</button>
                </div>
            )}
            {viewMode === 'signer' && (
                <SignerView
                    isLoading={isLoading}
                    sessions={sessions}
                    selectedSessionId={selectedSessionId}
                    onSelectSession={setSelectedSessionId}
                    cloudConfig={cloudConfig}
                    onReloadSessions={() => isLinkAccess && selectedSessionId
                        ? loadParticipantSession(cloudConfig.scriptUrl, selectedSessionId, participantToken, authInput)
                        : loadSessions(cloudConfig.enabled, cloudConfig.scriptUrl, cloudConfig.adminKey)}
                    isLinkAccess={isLinkAccess}
                    isSessionAuthenticated={isSessionAuthenticated}
                    authInput={authInput}
                    onChangeAuthInput={setAuthInput}
                    authError={authError}
                    onAuthSubmit={handleAuthSubmit}
                    searchTerm={searchTerm}
                    onChangeSearchTerm={setSearchTerm}
                    onSelectStaff={handleSchoolStaffSelect}
                    parentsInput={parentsInput}
                    onChangeParentsInput={setParentsInput}
                    onParentsInfoSubmit={handleParentsInfoSubmit}
                    manualInput={manualInput}
                    onChangeManualInput={setManualInput}
                    onOfficeInfoSubmit={handleOfficeInfoSubmit}
                />
            )}

            {viewMode === 'report' && !participantAccess && selectedSessionId && sessions.some(session => session.id === selectedSessionId) && (
                <PrintReport
                    session={sessions.find(s => s.id === selectedSessionId)!}
                    staffList={sessions.find(s => s.id === selectedSessionId)?.staffList || []}
                    onClose={() => setViewMode('admin')}
                    onDeleteSignature={handleSignatureDelete}
                />
            )}
            {viewMode === 'cloud_setup' && !participantAccess && <CloudSetup endpoint={selectedEndpoint} currentAdminKey={cloudConfig.adminKey || ''} onSave={handleCloudSetupSave} onCancel={() => setViewMode('admin')} onChangeSchool={onChangeSchool} />}
            {isSigning && selectedStaff && <SignaturePad name={selectedStaff.name} sessionTitles={getTargetSessionTitles()} onSave={handleSignatureSave} onCancel={() => { setIsSigning(false); setSelectedStaff(null); }} />}

            {/* Export Results Modal */}
            {exportResults.length > 0 && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setExportResults([])}>
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-800">PDF 생성 완료</h2>
                            <button onClick={() => setExportResults([])} className="text-gray-400 hover:text-red-500 font-bold p-1 px-2 text-xl active:scale-95 transition-all">&times;</button>
                        </div>
                        <div className="overflow-y-auto flex-1 mb-4 flex flex-col gap-3">
                            <p className="text-sm text-gray-500 mb-2 font-bold">생성된 파일을 확인하고 다운로드 버튼을 눌러주세요.</p>
                            {exportResults.map(res => (
                                <div key={res.id} className="bg-blue-50/50 p-4 rounded-xl flex flex-col sm:flex-row gap-3 sm:items-center border border-blue-100/50 shadow-sm">
                                    <span className="font-bold text-gray-700 text-sm truncate flex-1" title={res.filename}>{res.filename}</span>
                                    <a 
                                        href={res.blobUrl} 
                                        download={res.filename}
                                        className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow hover:bg-blue-700 active:scale-95 transition-all whitespace-nowrap text-center"
                                        onClick={() => showNotification(`[${res.filename}] 안전하게 다운로드가 시작되었습니다.`, 'success')}
                                    >
                                        파일 다운로드
                                    </a>
                                </div>
                            ))}
                        </div>
                        <div className="pt-4 border-t border-gray-100 mt-auto">
                            <button onClick={() => setExportResults([])} className="w-full bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-bold hover:bg-gray-200 active:scale-95 transition-all">
                                창 닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden component for bulk PDF export */}
            {viewMode === 'admin' && (selectedAdminSessions.size > 0 || isBulkExporting) && (
                <div style={{ position: 'absolute', left: 0, top: 0, width: '210mm', zIndex: -9999, visibility: 'visible' }}>
                    {Array.from(selectedAdminSessions).map(id => {
                        const session = sessions.find(s => s.id === id);
                        if (!session) return null;
                        return (
                            <PrintReport
                                key={`export-${id}`}
                                isExportMode={true}
                                session={session}
                                staffList={session.staffList || []}
                                onClose={() => {}}
                                onDeleteSignature={() => {}}
                            />
                        );
                    })}
                </div>
            )}

            {renderGlobalLoading()}
            {renderNotification()}
            {isAuthModalOpen && (
                <AuthModal
                    isLoading={isLoading}
                    authInput={authInput}
                    onChangeAuthInput={setAuthInput}
                    authError={authError}
                    onSubmit={handleAuthSubmit}
                    onCancel={() => { setIsAuthModalOpen(false); setPendingStaff(null); }}
                />
            )}
            <DeleteModal
                info={deleteConfirmInfo}
                isLoading={isLoading}
                onDeleteAll={() => executeDelete('all')}
                onDeleteSingle={() => executeDelete('single')}
                onCancel={() => setDeleteConfirmInfo(null)}
            />
            <EditTitleModal
                session={editModeSession}
                isLoading={isLoading}
                onChange={setEditModeSession}
                onCancel={() => setEditModeSession(null)}
                onSubmit={handleEditTitleSubmit}
            />
            <ConfirmModal request={confirmRequest} onClose={() => setConfirmRequest(null)} />
        </>
    );

};

// Reset all school-private UI state whenever the authoritative endpoint changes.
const LegacyV4App: React.FC<LegacyV4AppProps> = props => <LegacyV4SchoolApp key={schoolEndpoint(props.endpoint)} {...props} />;

export default LegacyV4App;
