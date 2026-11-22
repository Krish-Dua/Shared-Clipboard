import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { socket } from '../socket';
import UsernameModal from '../components/UsernameModal';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Clipboard, 
  ClipboardPaste,
  Paperclip,
  Download,
  FileText,
  Moon, 
  Sun,
  Copy, 
  Check, 
  Send, 
  LogOut, 
  Link as LinkIcon, 
  Share2,
  ExternalLink,
  QrCodeIcon,
  X,
  ChevronDown,
  BellOff,
  Bell,
  UploadCloud,
  Trash2,
  Loader2,
  Crown,
  UserX,
  Lock,
  Unlock,
  Zap,
} from 'lucide-react';

const COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500',   'bg-cyan-500',    'bg-teal-500',   'bg-blue-500'
];

const getSenderColor = (name = '') => {
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return COLORS[sum % COLORS.length];
};

const detectContentType = (content) => {
  const trimmed = content.trim();
  if (/^(http|https):\/\/[^ "]+$/.test(trimmed)) return 'link';
  if (
    trimmed.includes('const ') || 
    trimmed.includes('function') || 
    trimmed.includes('{') || 
    trimmed.includes('=>') || 
    trimmed.includes('import ') || 
    trimmed.includes('export ') ||
    trimmed.includes('npm ') ||
    trimmed.includes('git ')
  ) {
    return 'code';
  }
  return 'text';
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const notificationAudio = typeof window !== 'undefined' ? new Audio('/notification-tone.mp3') : null;
const userConnectAudio = typeof window !== 'undefined' ? new Audio('/userConnect.mp3') : null;
const userDisconnectAudio = typeof window !== 'undefined' ? new Audio('/userDisconnect.mp3') : null;

export default function Room({ username, setUsername }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [clips, setClips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [usersOnline, setUsersOnline] = useState([]);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [isQrCodeOpen, setIsQrCodeOpen] = useState(false);
  const [isNotificationsMuted, setIsNotificationsMuted] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const isMutedRef = useRef(false);
  isMutedRef.current = isNotificationsMuted;
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const [isRoomCreator, setIsRoomCreator] = useState(false);
  const [currentSocketId, setCurrentSocketId] = useState(socket.id || null);
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);
  const [knockRequests, setKnockRequests] = useState([]);
  const localP2PFiles = useRef(new Map());
  const activePeers = useRef(new Map());
  const [p2pProgress, setP2PProgress] = useState({});
  const clipsRef = useRef([]);
  clipsRef.current = clips;

  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  const handleSaveUsername = (clean) => {
    setUsername(clean);
    localStorage.setItem("username", clean);
  };

  const getMemberKey = () => {
    const storageKey = `room_member_${roomId}`;
    let key = localStorage.getItem(storageKey);
    if (!key) {
      key = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(storageKey, key);
    }
    return key;
  };

  const playSound = (audio) => {
    try {
      if (audio && !isMutedRef.current) {
        audio.currentTime = 0;
        audio.volume = 1.0;
        audio.play().catch(() => {});
      }
    } catch (err) {
      console.error(err);
    }
  };

  const playNotificationSound = () => {
    playSound(notificationAudio);
  };

  const handlePaste = (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const pastedFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      event.preventDefault();
      processFiles(pastedFiles);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!username) return; 

    const handleConnect = () => {
      console.log("Connected / Reconnected:", socket.id);
      setCurrentSocketId(socket.id);
      const creatorKey = localStorage.getItem(`room_creator_${roomId}`);
      const memberKey = getMemberKey();
      socket.emit("join-room", { roomId, username, creatorKey, memberKey });
    };

    socket.connect();
    socket.on("connect", handleConnect);
    if (socket.connected) {
      handleConnect();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (!socket.connected) {
          socket.connect();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    socket.on("room-users-count", (onlineUsers) => {
      setUsersOnline((prev) => {
        if (prev.length > 0) {
          if (onlineUsers.length > prev.length) {
            playSound(userConnectAudio);
          } else if (onlineUsers.length < prev.length) {
            playSound(userDisconnectAudio);
          }
        }
        return onlineUsers;
      });
    });

    socket.on("get-clips", (clips) => {
      setClips(clips);
      setIsLoading(false);
    });

    socket.on("receive-clip", (clip) => {
      setClips((prev) => {
        const index = prev.findIndex((c) => c.id === clip.id);
        if (index !== -1) {
          if (prev[index].file?.dataUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(prev[index].file.dataUrl);
          }
          const updated = [...prev];
          updated[index] = clip;
          return updated;
        }
        return [clip, ...prev].slice(0, 100);
      });

      if (!isMutedRef.current && clip.sender !== username) {
        playNotificationSound();
      }
    });

    socket.on("room-creator-status", ({ isCreator }) => {
      setIsRoomCreator(isCreator);
      if (!isCreator) {
        localStorage.removeItem(`room_creator_${roomId}`);
      }
    });

    socket.on("room-lock-status", ({ isLocked }) => {
      setIsRoomLocked(Boolean(isLocked));
    });

    socket.on("room-locked-waiting", () => {
      setIsWaitingApproval(true);
      setIsLoading(false);
    });

    socket.on("knock-approved", () => {
      setIsWaitingApproval(false);
      setIsLoading(false);
      toast.success("Host admitted you to the room!");
    });

    socket.on("knock-denied", ({ message }) => {
      setIsWaitingApproval(false);
      localStorage.removeItem(`room_member_${roomId}`);
      toast.error(message || "The host declined your request to join.");
      navigate('/');
    });

    socket.on("knock-request", ({ socketId: requesterId, username: requesterName, memberKey: requesterMemberKey, isNew }) => {
      setKnockRequests((prev) => {
        const key = requesterMemberKey || requesterId;
        const filtered = prev.filter((r) => (r.memberKey || r.socketId) !== key);
        return [
          ...filtered,
          { socketId: requesterId, username: requesterName, memberKey: requesterMemberKey },
        ];
      });
      setShowUsers(true);
      if (isNew) {
        playNotificationSound();
      }
    });

    socket.on("knock-canceled", ({ socketId: canceledId, memberKey: canceledMemberKey }) => {
      setKnockRequests((prev) =>
        prev.filter((r) => {
          if (canceledMemberKey && r.memberKey === canceledMemberKey) return false;
          if (canceledId && r.socketId === canceledId) return false;
          return true;
        })
      );
    });

    socket.on("clip-deleted", ({ clipId }) => {
      setClips((prev) => prev.filter((c) => c.id !== clipId));
    });

    socket.on("room-not-found", ({ message }) => {
      localStorage.removeItem(`room_creator_${roomId}`);
      localStorage.removeItem(`room_member_${roomId}`);
      toast.error(message || `Room #${roomId} does not exist or has expired.`, {
        toastId: 'room-not-found',
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: false,
      });
      navigate('/');
    });

    socket.on("username-taken", ({ message }) => {
      toast.error(message || "This username is already taken in the room.", {
        toastId: 'username-taken',
        position: "top-right",
        autoClose: 3500,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: false,
      });
      setUsername("");
      localStorage.removeItem("username");
    });

    socket.on("kicked-from-room", ({ message }) => {
      localStorage.removeItem(`room_member_${roomId}`);
      toast.error(message || "You have been kicked from this room.", {
        toastId: 'kicked-from-room',
        position: "top-right",
        autoClose: 3500,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: false,
      });
      navigate('/');
    });

    socket.on("p2p-request-file", async ({ clipId, senderName, requesterSocketId }) => {
      if (senderName !== username) return;
      const file = localP2PFiles.current.get(clipId);
      if (!file) return;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      activePeers.current.set(`${clipId}-${requesterSocketId}`, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("p2p-signal", { targetSocketId: requesterSocketId, signalData: { candidate: e.candidate }, clipId });
      };

      const dc = pc.createDataChannel("fileTransfer");
      dc.binaryType = "arraybuffer";
      dc.bufferedAmountLowThreshold = 1024 * 1024;

      dc.onopen = async () => {
        const CHUNK_SIZE = 64 * 1024;
        let offset = 0;
        while (offset < file.size) {
          if (dc.bufferedAmount > 4 * 1024 * 1024) {
            await new Promise((r) => { dc.onbufferedamountlow = r; });
          }
          const slice = file.slice(offset, offset + CHUNK_SIZE);
          const buf = await slice.arrayBuffer();
          if (dc.readyState !== "open") return;
          dc.send(buf);
          offset += buf.byteLength;
        }
        if (dc.readyState === "open") dc.send(JSON.stringify({ type: "EOF" }));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("p2p-signal", { targetSocketId: requesterSocketId, signalData: { sdp: offer }, clipId });
    });

    socket.on("p2p-signal", async ({ senderSocketId, signalData, clipId }) => {
      let peer = activePeers.current.get(clipId) || activePeers.current.get(`${clipId}-${senderSocketId}`);

      if (signalData.sdp && signalData.sdp.type === "offer") {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        activePeers.current.set(clipId, pc);
        activePeers.current.set(`${clipId}-${senderSocketId}`, pc);

        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit("p2p-signal", { targetSocketId: senderSocketId, signalData: { candidate: e.candidate }, clipId });
        };

        const receivedChunks = [];
        let receivedBytes = 0;

        pc.ondatachannel = (e) => {
          const dc = e.channel;
          dc.binaryType = "arraybuffer";

          dc.onmessage = (event) => {
            if (typeof event.data === "string") {
              try {
                const msg = JSON.parse(event.data);
                if (msg.type === "EOF") {
                  const clip = clipsRef.current.find((c) => c.id === clipId);
                  const fileName = clip?.file?.name || "downloaded-file";
                  const mimeType = clip?.file?.mimeType || "application/octet-stream";

                  const blob = new Blob(receivedChunks, { type: mimeType });
                  receivedChunks.length = 0; // Immediately clear chunks from RAM

                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 10000);

                  setP2PProgress((prev) => ({ ...prev, [clipId]: { progress: 100, status: "completed" } }));
                  toast.success(`"${fileName}" downloaded!`);
                  try { pc.close(); } catch {}
                  activePeers.current.delete(clipId);
                  activePeers.current.delete(`${clipId}-${senderSocketId}`);
                  return;
                }
              } catch {}
            }

            receivedChunks.push(event.data);
            receivedBytes += event.data.byteLength || 0;
            const clip = clipsRef.current.find((c) => c.id === clipId);
            const total = clip?.file?.size || 1;
            setP2PProgress((prev) => ({
              ...prev,
              [clipId]: { progress: Math.min(99, Math.round((receivedBytes / total) * 100)), status: "downloading" }
            }));
          };
        };

        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("p2p-signal", { targetSocketId: senderSocketId, signalData: { sdp: answer }, clipId });
        return;
      }

      if (peer) {
        if (signalData.sdp) {
          await peer.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        } else if (signalData.candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(signalData.candidate)).catch(() => {});
        }
      }
    });

    window.addEventListener("paste", handlePaste);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      socket.off("connect", handleConnect);
      socket.off("username-taken");
      socket.off("room-creator-status");
      socket.off("room-lock-status");
      socket.off("room-locked-waiting");
      socket.off("knock-approved");
      socket.off("knock-denied");
      socket.off("knock-request");
      socket.off("knock-canceled");
      socket.off("room-users-count");
      socket.off("get-clips");
      socket.off("receive-clip");
      socket.off("clip-deleted");
      socket.off("room-not-found");
      socket.off("kicked-from-room");
      socket.off("p2p-request-file");
      socket.off("p2p-signal");
      activePeers.current.forEach((p) => {
        try { p.close(); } catch {}
      });
      activePeers.current.clear();
      window.removeEventListener("paste", handlePaste);
      socket.disconnect();
    };
  }, [roomId, username, navigate]);

  const handleToggleLock = () => {
    const creatorKey = localStorage.getItem(`room_creator_${roomId}`);
    socket.emit("toggle-lock-room", { creatorKey });
  };

  const handleApproveKnock = (targetSocketId, memberKey) => {
    const creatorKey = localStorage.getItem(`room_creator_${roomId}`);
    socket.emit("approve-knock", { targetSocketId, memberKey, creatorKey });
    setKnockRequests((prev) =>
      prev.filter((r) => (memberKey ? r.memberKey !== memberKey : r.socketId !== targetSocketId))
    );
  };

  const handleDenyKnock = (targetSocketId, memberKey) => {
    const creatorKey = localStorage.getItem(`room_creator_${roomId}`);
    socket.emit("deny-knock", { targetSocketId, memberKey, creatorKey });
    setKnockRequests((prev) =>
      prev.filter((r) => (memberKey ? r.memberKey !== memberKey : r.socketId !== targetSocketId))
    );
  };

  const handleKickUser = (targetSocketId, targetName) => {
    if (!window.confirm(`Kick "${targetName}" from the room?`)) return;
    const creatorKey = localStorage.getItem(`room_creator_${roomId}`);
    socket.emit("kick-user", { targetSocketId, creatorKey });
    toast.info(`Kicked ${targetName}`);
  };

  const handleDeleteClip = (clipId) => {
    const creatorKey = localStorage.getItem(`room_creator_${roomId}`);
    socket.emit("delete-clip", { clipId, creatorKey });
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedRoomLink(true);
    setTimeout(() => setCopiedRoomLink(false), 2000);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setNewContent((prev) => (prev ? `${prev}\n${text}` : text));
        textareaRef.current?.focus();
      } else {
        toast.info("Clipboard is empty.", {
          autoClose: 1500,
          hideProgressBar: true,
        });
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      toast.error("Permission to access clipboard was denied.", {
        autoClose: 2000,
        hideProgressBar: true,
      });
    }
  };

  const handlePaperclipClick = () => {
    if (!username) return;
    fileInputRef.current?.click();
  };

  const handleP2PDownload = (clip) => {
    const clipId = clip.id;
    setP2PProgress((prev) => ({ ...prev, [clipId]: { progress: 0, status: 'connecting' } }));
    socket.emit("p2p-request-file", { clipId, senderName: clip.sender });
  };

  function processFiles(files) {
    if (!username) return;
    const MAX_SERVER_SIZE = 500 * 1024 * 1024; // 500 MB server limit
    const MAX_BROWSER_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB browser memory limit

    files.forEach((file) => {
      if (file.size > MAX_BROWSER_SIZE) {
        toast.error(`"${file.name}" exceeds 2GB browser limit.`);
        return;
      }

      const isP2P = file.size > MAX_SERVER_SIZE;
      if (isP2P) {
        const clipId = `p2p-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        localP2PFiles.current.set(clipId, file);

        const p2pClip = {
          id: clipId,
          sender: username,
          type: 'file',
          content: '',
          file: {
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            isP2P: true,
          },
          createdAt: Date.now(),
        };

        setClips((prev) => [p2pClip, ...prev]);
        socket.emit("send-clip", p2pClip);
        toast.info(`"${file.name}" shared via P2P. Keep tab open.`);
        return;
      }

      const clipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isMedia = isImage || isVideo;
      const previewUrl = isMedia ? URL.createObjectURL(file) : null;

      setClips((prev) => [
        {
          id: clipId,
          sender: username,
          type: isImage ? 'image' : isVideo ? 'video' : 'file',
          content: '',
          file: {
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            dataUrl: previewUrl,
          },
          createdAt: Date.now(),
          isUploading: true,
          progress: 0,
        },
        ...prev,
      ]);

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/upload?roomId=${encodeURIComponent(roomId)}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setClips((prev) =>
            prev.map((c) => (c.id === clipId ? { ...c, progress } : c))
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            setClips((prev) =>
              prev.map((c) => (c.id === clipId ? { ...c, progress: 100 } : c))
            );

            socket.emit("send-clip", {
              id: clipId,
              sender: username,
              type: isImage ? 'image' : isVideo ? 'video' : 'file',
              content: '',
              file: {
                name: file.name,
                size: file.size,
                mimeType: file.type || 'application/octet-stream',
                dataUrl: data.fileUrl,
              },
              createdAt: Date.now(),
            });
          } catch (err) {
            toast.error(`Failed to process upload response for "${file.name}"`);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setClips((prev) => prev.filter((c) => c.id !== clipId));
          }
        } else {
          try {
            const errRes = JSON.parse(xhr.responseText);
            toast.error(errRes.message || `Failed to upload "${file.name}"`);
          } catch {
            toast.error(`Failed to upload "${file.name}"`);
          }
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setClips((prev) => prev.filter((c) => c.id !== clipId));
        }
      };

      xhr.onerror = () => {
        toast.error(`Network error uploading "${file.name}"`);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setClips((prev) => prev.filter((c) => c.id !== clipId));
      };

      xhr.send(formData);
    });
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    processFiles(files);
    e.target.value = '';
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!username) return;
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!username) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (!username) return;

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      processFiles(droppedFiles);
    }
  };

  const handlePostClip = (e) => {
    e.preventDefault();
    if (!username) return;
    if (!newContent.trim()) return;

    const newClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sender: username,
      content: newContent.trim(),
      createdAt: Date.now()
    };

    socket.emit("send-clip", newClip);
    setNewContent('');
  };

  return (
    <div 
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 relative overflow-x-hidden"
    >
      <UsernameModal 
        isOpen={!username} 
        username="" 
        onSave={handleSaveUsername} 
        onClose={() => navigate('/')} 
      />

      {isDragging && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-none transition-all">
          <div className="w-full max-w-md bg-white/95 dark:bg-slate-900/95 border-2 border-dashed border-indigo-500 rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center animate-bounce shadow-sm">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Drop files anywhere to share
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Images, documents, or PDFs up to 500MB each
              </p>
            </div>
          </div>
        </div>
      )}

      {isQrCodeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-xs sm:max-w-sm bg-white rounded-2xl border border-slate-200 p-6 shadow-xl relative">
            <X onClick={() => setIsQrCodeOpen(false)} className="absolute cursor-pointer top-3 right-3 w-5 h-5 text-black" />
            <p className="mt-4 mb-2 text-center font-semibold text-slate-900">Scan the QR code to join the room</p>
            <div className="mt-4 mb-4 flex items-center justify-center"> 
              <QRCodeSVG value={window.location.href} size={220} />
            </div>
          </div>
        </div>
      )}

      {/* Waiting Room Modal (when room is locked) */}
      {isWaitingApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center animate-pulse">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Room is Locked
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Waiting for the host to admit you into <span className="font-mono font-semibold text-indigo-500">#{roomId}</span>...
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                socket.emit("cancel-knock", { roomId, memberKey: getMemberKey() });
                navigate('/');
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              Cancel and Leave
            </button>
          </div>
        </div>
      )}

      <div className={`flex-1 flex flex-col transition-all duration-200 ${!username || isWaitingApproval ? 'pointer-events-none select-none blur-xs opacity-50' : ''}`}>
        <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-2.5 sm:px-6 h-14 flex items-center justify-between gap-1.5 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-3 shrink min-w-0">

              <span className="flex items-center gap-1.5 text-slate-900 dark:text-white font-bold tracking-tight shrink-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shadow-indigo-500/20">
                  <Clipboard className="w-4 h-4" />
                </div>
                <span className="hidden md:inline text-sm font-bold">Shared Clipboard</span>
              </span>

              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">/</span>

              <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 sm:px-2.5 py-1 rounded-lg shrink-0">
                <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-21.25 sm:max-w-none">
                  #{roomId}
                </span>
                <button
                  type="button"
                  onClick={handleCopyRoomLink}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded transition cursor-pointer shrink-0"
                  title="Copy Room Link"
                >
                  {copiedRoomLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsQrCodeOpen(true)}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg transition cursor-pointer shrink-0"
                title="Show QR Code"
              >
                <QrCodeIcon className="w-4 h-4" />
              </button>

              <div className="flex select-none items-center flex-col relative">
                <div 
                  onClick={() => setShowUsers(!showUsers)} 
                  className={`cursor-pointer flex items-center gap-1 sm:gap-1.5 text-xs font-medium px-2 sm:px-2.5 py-1 rounded-full border transition ${
                    knockRequests.length > 0 && isRoomCreator
                      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 shadow-xs'
                      : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/50 dark:border-emerald-800/50'
                  }`}
                  title="Click to view online users"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${knockRequests.length > 0 && isRoomCreator ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
                  <span>{usersOnline.length} <span className="hidden sm:inline">Online</span></span>
                  {knockRequests.length > 0 && isRoomCreator && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[10px] leading-none animate-pulse">
                      {knockRequests.length} waiting
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUsers ? 'rotate-180' : ''}`} />
                </div>
                {showUsers && (
                  <div className="absolute top-8 left-0 sm:left-auto w-64 sm:w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-1.5 max-h-72 overflow-y-auto sleek-scrollbar space-y-1 z-50">
                    {/* Knock Requests Section for Host */}
                    {knockRequests.length > 0 && isRoomCreator && (
                      <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-1.5 space-y-1">
                        <div className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 flex items-center justify-between">
                          <span>Requests to Join</span>
                          <span className="text-[10px] font-normal normal-case text-amber-500">
                            {knockRequests.length} pending
                          </span>
                        </div>
                        {knockRequests.map((req) => (
                          <div
                            key={req.memberKey || req.socketId}
                            className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-2xs">
                                {req.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {req.username}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDenyKnock(req.socketId, req.memberKey)}
                                className="px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-md transition cursor-pointer"
                              >
                                Deny
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApproveKnock(req.socketId, req.memberKey)}
                                className="px-2.5 py-0.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-md shadow-xs transition cursor-pointer"
                              >
                                Admit
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {usersOnline.map((userItem, index) => {
                      const userObj = typeof userItem === 'string'
                        ? { socketId: '', username: userItem, isAdmin: false }
                        : userItem;
                      const name = userObj.username || 'Unknown';
                      const isMe = userObj.socketId ? userObj.socketId === currentSocketId : name === username;
                      const isAdmin = Boolean(userObj.isAdmin);
                      const canKick = isRoomCreator && !isMe && !isAdmin;

                      return (
                        <div 
                          key={userObj.socketId || index} 
                          className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group"
                        >
                          <div className={`w-6 h-6 rounded-full ${getSenderColor(name)} text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-2xs`}>
                            {(name).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex items-center justify-between min-w-0 flex-1 gap-1.5">
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                              {name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {isAdmin && (
                                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded-md border border-amber-200/40 dark:border-amber-800/40" title="Room Admin">
                                  <Crown className="w-2.5 h-2.5 text-amber-500" />
                                  Admin
                                </span>
                              )}
                              {isMe && (
                                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded-md border border-indigo-200/40 dark:border-indigo-800/40">
                                  You
                                </span>
                              )}
                              {canKick && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleKickUser(userObj.socketId, name);
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition cursor-pointer"
                                  title={`Kick ${name}`}
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Admin Lock / Unlock Room Button */}
              {isRoomCreator && (
                <button
                  type="button"
                  onClick={handleToggleLock}
                  className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border transition cursor-pointer shrink-0 flex items-center justify-center ${
                    isRoomLocked
                      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800'
                  }`}
                  title={isRoomLocked ? "Room is Locked (New users must ask to join). Click to Unlock" : "Room is Open. Click to Lock"}
                >
                  {isRoomLocked ? <Lock className="w-4 h-4 text-amber-500" /> : <Unlock className="w-4 h-4" />}
                </button>
              )}

              <button 
                type="button"
                className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition cursor-pointer"
                title={isNotificationsMuted ? "Unmute Notifications" : "Mute Notifications"}
                onClick={() => setIsNotificationsMuted(!isNotificationsMuted)}
              >
                {isNotificationsMuted ? <BellOff className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4" />}
              </button>

              <button 
                type="button"
                className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition cursor-pointer"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onClick={() => {
                  if (theme === "dark") {
                    setTheme("light");
                    localStorage.setItem("theme", "light");
                  } else {
                    setTheme("dark");
                    localStorage.setItem("theme", "dark");
                  }
                }}
              >
                {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>

              <div className="flex items-center gap-1.5 pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800" title={`Logged in as ${username}`}>
                <div className={`w-7 h-7 rounded-full ${getSenderColor(username || '')} text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0`}>
                  {(username || '?').charAt(0).toUpperCase()}
                </div>
                <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:inline max-w-22.5 truncate">
                  {username}
                </span>
              </div>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200/60 dark:border-red-800/60 transition cursor-pointer"
                title="Leave Room"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Leave</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-2.5 sm:p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <form onSubmit={handlePostClip} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:gap-2.5">
              <div className="flex-1 relative flex items-center">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  multiple 
                  className="hidden" 
                />
                <textarea
                  ref={textareaRef}
                  value={newContent}
                  disabled={!username}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Type or paste text, code, or link..."
                  rows={Math.min(Math.max(newContent.split('\n').length, 1), 6)}
                  className="w-full pl-3 pr-18 sm:pr-22 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 resize-none sleek-scrollbar transition-all font-sans min-h-11.5 disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handlePostClip(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  disabled={!username}
                  className="absolute right-2 top-2.5 px-2 sm:px-2.5 py-1 text-xs font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-600 shadow-2xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Paste from device clipboard"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span className="text-[11px] sm:text-xs">Paste</span>
                </button>
              </div>

              <div className="flex items-center gap-2 justify-end sm:justify-start shrink-0">
                <button
                  type="button"
                  onClick={handlePaperclipClick}
                  disabled={!username}
                  className="h-11.5 px-3 sm:px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium shrink-0"
                  title="Attach file (up to 2GB; files over 500MB stream via P2P)"
                >
                  <Paperclip className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="hidden sm:inline">Attach</span>
                </button>

                <button
                  type="submit"
                  disabled={!username || !newContent.trim()}
                  className="h-11.5 px-4 sm:px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold shrink-0 shadow-sm shadow-indigo-500/20 active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
              </div>
            </form>
          </div>

          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <p className="text-sm">Loading clips...</p>
            </div>
          ) : clips.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 flex items-center justify-center mb-4">
                <Clipboard className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No clips shared yet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Be the first to share text, code, images, or files in this room!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {clips.map((clip) => {
                const isImage = clip.type === 'image';
                const isVideo = clip.type === 'video';
                const isFile = clip.type === 'file';
                const isUploading = Boolean(clip.isUploading);
                const clipType = clip.type || detectContentType(clip.content || '');

                return (
                  <div
                    key={clip.id}
                    className={`bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3 group relative transition hover:border-slate-300 dark:hover:border-slate-700 ${
                      isUploading
                        ? 'border-2 border-dashed border-indigo-400 dark:border-indigo-500/80 bg-indigo-50/20 dark:bg-indigo-950/20'
                        : 'border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full ${getSenderColor(clip.sender)} text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs`}>
                          {(clip.sender || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex items-center gap-1.5 leading-none">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {clip.sender}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 font-medium leading-none">
                            {isUploading 
                              ? (clip.progress >= 100 ? "Syncing..." : "Uploading...") 
                              : (typeof clip.createdAt === 'number' 
                                  ? new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                                  : (clip.createdAt || 'Just now'))}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isUploading ? (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 leading-none">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span>{clip.progress >= 100 ? "Syncing..." : `${clip.progress || 0}%`}</span>
                          </div>
                        ) : (
                          <>
                            {isRoomCreator && (
                              <button
                                type="button"
                                onClick={() => handleDeleteClip(clip.id)}
                                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition cursor-pointer"
                                title="Delete Clip (Admin only)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {clip.file?.dataUrl && (
                              <a
                                href={`${clip.file.dataUrl}?download=true`}
                                download={clip.file.name}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded transition cursor-pointer"
                                title="Download original file"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}

                            {clip.content && (
                              <button
                                type="button"
                                onClick={() => handleCopy(clip.id, clip.content)}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                                title="Copy text"
                              >
                                {copiedId === clip.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                      {clip.file?.isP2P ? (
                        <div className="space-y-2.5">
                          <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800/50">
                              <Zap className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {clip.file.name}
                                </p>
                                <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-200/70 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded shrink-0">
                                  P2P Direct
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                                {formatFileSize(clip.file.size)} • Direct P2P Stream
                              </p>
                            </div>
                          </div>

                          {clip.sender === username ? (
                            <div className="p-2 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                              <span>Hosting file on your device (Keep this tab open)</span>
                            </div>
                          ) : (
                            <div className="pt-0.5">
                              {p2pProgress[clip.id]?.status === 'downloading' ? (
                                <div className="space-y-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                  <div className="flex justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                    <span className="flex items-center gap-1.5">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                                      Receiving via P2P...
                                    </span>
                                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                      {p2pProgress[clip.id]?.progress || 0}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                                    <div
                                      className="bg-emerald-500 h-full rounded-full transition-all duration-150"
                                      style={{ width: `${p2pProgress[clip.id]?.progress || 0}%` }}
                                    />
                                  </div>
                                </div>
                              ) : p2pProgress[clip.id]?.status === 'connecting' ? (
                                <div className="space-y-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                  <div className="flex items-center gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                                    <span>Connecting to sender via P2P...</span>
                                  </div>
                                </div>
                              ) : p2pProgress[clip.id]?.status === 'completed' ? (
                                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-between border border-emerald-200 dark:border-emerald-800/50">
                                  <span className="flex items-center gap-1.5">
                                    <Check className="w-4 h-4 text-emerald-500" /> Downloaded successfully
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleP2PDownload(clip)}
                                    className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
                                  >
                                    Re-download
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleP2PDownload(clip)}
                                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Download via P2P ({formatFileSize(clip.file.size)})
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : isImage && clip.file?.dataUrl ? (
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 max-h-60 flex items-center justify-center">
                            <img
                              src={clip.file.dataUrl}
                              alt={clip.file.name}
                              className="w-full h-auto max-h-60 object-contain"
                            />
                            {isUploading && (
                              <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="truncate max-w-[70%] font-medium">{clip.file.name}</span>
                            <span>{formatFileSize(clip.file.size)}</span>
                          </div>
                          {isUploading && (
                            <div className="px-1 space-y-1">
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-150 ease-out"
                                  style={{ width: `${clip.progress || 0}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                <span>{clip.progress >= 100 ? "Syncing to room..." : "Uploading..."}</span>
                                <span className="font-mono">{clip.progress || 0}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : isVideo && clip.file?.dataUrl ? (
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden bg-black max-h-64 flex items-center justify-center">
                            <video
                              src={clip.file.dataUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full h-auto max-h-64 rounded-xl"
                            />
                            {isUploading && (
                              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                                <Loader2 className="w-6 h-6 animate-spin text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="truncate max-w-[70%] font-medium">{clip.file.name}</span>
                            <span>{formatFileSize(clip.file.size)}</span>
                          </div>
                          {isUploading && (
                            <div className="px-1 space-y-1">
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-150 ease-out"
                                  style={{ width: `${clip.progress || 0}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                <span>{clip.progress >= 100 ? "Syncing to room..." : "Uploading..."}</span>
                                <span className="font-mono">{clip.progress || 0}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : isFile && clip.file ? (
                        <div className="space-y-2">
                          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/50">
                              {isUploading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {clip.file.name}
                              </p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                {formatFileSize(clip.file.size)}
                              </p>
                            </div>
                          </div>

                          {clip.file?.dataUrl && !isUploading && (
                            <a
                              href={`${clip.file.dataUrl}?download=true`}
                              download={clip.file.name}
                              className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download File
                            </a>
                          )}

                          {isUploading && (
                            <div className="px-1 space-y-1">
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-150 ease-out"
                                  style={{ width: `${clip.progress || 0}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                <span>{clip.progress >= 100 ? "Syncing to room..." : "Uploading..."}</span>
                                <span className="font-mono">{clip.progress || 0}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : clipType === 'code' ? (
                        <div className="bg-slate-950 rounded-xl p-3 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800/80">
                          <pre><code>{clip.content}</code></pre>
                        </div>
                      ) : clipType === 'link' ? (
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                          <a
                            href={clip.content}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline break-all flex items-center gap-1.5 font-medium"
                          >
                            <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                            <span className="flex-1">{clip.content}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {clip.content}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
