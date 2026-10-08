import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  User, 
  Copy, 
  Check, 
  Send, 
  LogOut, 
  Link as LinkIcon, 
  Share2,
  ExternalLink,
  QrCodeIcon,
  X,
  BellOff,
  Bell,
  UploadCloud,
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

const getClipType = (content = '') => {
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

export default function Room({ username, setUsername }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [clips, setClips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [usersOnline, setUsersOnline] = useState(0);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [isQrCodeOpen, setIsQrCodeOpen] = useState(false);
  const [isNotificationsMuted, setIsNotificationsMuted] = useState(false);
  const isMutedRef = useRef(false);
  isMutedRef.current = isNotificationsMuted;
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);


  if(theme === "dark"){
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  const handleSaveUsername = (clean) => {
    setUsername(clean);
    localStorage.setItem("username", clean);
  };

   useEffect(() => {
      window.scrollTo(0, 0);
      if (!username) return; 
     socket.connect();
    socket.on("connect", () => {
      console.log("Connected:", socket.id);
    });

    socket.emit("join-room", { roomId, username });


    socket.on("room-users-count", (count) => {
      setUsersOnline(count);
    });

    socket.on("get-clips", (clips) => {
      setClips(clips);
      setIsLoading(false);
    });

    socket.on("receive-clip", (clip) => {
      setClips((prev) => [clip, ...prev].slice(0, 100));

      if (!isMutedRef.current && clip.sender !== username) {
        playNotificationSound();
      }
    });

    socket.on("room-not-found", ({ message }) => {
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

    return () => {
      socket.off("connect");
      socket.off("room-users-count");
      socket.off("get-clips");
      socket.off("receive-clip");
      socket.off("room-not-found");
      socket.disconnect();
    };
  }, [roomId, username, navigate]);

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

  const processFiles = (files) => {
    if (!username) return;
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB limit

    files.forEach((file) => {
      if (file.size > MAX_SIZE) {
        toast.error(`"${file.name}" exceeds the 5MB size limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const isImage = file.type.startsWith('image/');
        const newClip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          sender: username,
          type: isImage ? 'image' : 'file',
          content: '',
          file: {
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
            dataUrl: reader.result,
          },
          createdAt: Date.now(),
        };

        socket.emit("send-clip", newClip);
      };

      reader.readAsDataURL(file);
    });
  };

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

  const playNotificationSound = () => {
    try {
      if (notificationAudio) {
        notificationAudio.currentTime = 0;
        notificationAudio.play().catch(() => {});
      }
    } catch (err) {
      console.error(err);
    }
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
          Images, documents, or PDFs up to 5MB each
        </p>
      </div>
    </div>
  </div>
)}

{ isQrCodeOpen &&
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-xs sm:max-w-sm bg-white rounded-2xl border border-slate-200 p-6 shadow-xl relative">
              <X onClick={()=> setIsQrCodeOpen(false)} className="absolute cursor-pointer top-3 right-3 w-5 h-5 text-black" />
                <p className="mt-4 mb-2 text-center font-semibold text-slate-900">Scan the QR code to join the room</p>
             <div className='mt-4 mb-4 flex items-center justify-center'> 
               <QRCodeSVG value={window.location.href} size={220} />
               </div>
      </div>
    </div>
}

      <div className={`flex-1 flex flex-col transition-all duration-200 ${!username ? 'pointer-events-none select-none blur-xs opacity-50' : ''}`}>
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
                <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-[85px] sm:max-w-none">
                  #{roomId}
                </span>
                <button
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

              <div className="hidden md:flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/50 dark:border-emerald-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{usersOnline} Online</span>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button 
                type="button"
                className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition cursor-pointer"
                title={isNotificationsMuted ? "Unmute Notifications" : "Mute Notifications"}
                onClick={()=>setIsNotificationsMuted(!isNotificationsMuted)}
              >
                {isNotificationsMuted ? <BellOff className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4" />}
              </button>

              <button 
                type="button"
                className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition cursor-pointer"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onClick={()=>{
                  if(theme === "dark"){
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
                <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:inline max-w-[90px] truncate">
                  {username}
                </span>
              </div>

              <button
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
                className="w-full pl-3 pr-18 sm:pr-22 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 resize-none sleek-scrollbar transition-all font-sans min-h-[46px] disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
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

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePaperclipClick}
                disabled={!username}
                className="p-2.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
                title="Attach file or image (Max 5MB)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="submit"
                disabled={!username || !newContent.trim()}
                className="flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm rounded-xl shadow-xs shadow-indigo-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Share Clip</span>
              </button>
            </div>
          </form>
        </div>

        {isLoading ? (
          <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="break-inside-avoid bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs animate-pulse space-y-3"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
                <div className="space-y-2 pt-1">
                  <div className="h-3 w-full bg-slate-200/70 dark:bg-slate-800/70 rounded" />
                  <div className="h-3 w-4/5 bg-slate-200/70 dark:bg-slate-800/70 rounded" />
                  <div className="h-3 w-2/3 bg-slate-200/50 dark:bg-slate-800/50 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : clips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mb-3">
              <Clipboard className="w-6 h-6" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">
              No clips shared yet
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
              Paste text, code snippets, or drag & drop files to share instantly with anyone in room #{roomId}.
            </p>
          </div>
        ) : (
          <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
            {clips.map((clip) => {
              const isCopied = copiedId === clip.id;
              const isImage = clip.type === 'image' || (clip.file && clip.file.mimeType?.startsWith('image/'));
              const isFile = clip.type === 'file' || (clip.file && !isImage);
              const clipType = getClipType(clip.content || '');

              return (
                <div
                  key={clip.id}
                  className="break-inside-avoid bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
                >
                  <div className="p-3 pb-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-5 h-5 rounded-full ${getSenderColor(clip.sender || '')} text-white flex items-center justify-center font-bold text-[10px] shrink-0`}>
                        {(clip.sender || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {clip.sender || 'Anonymous'}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                          &bull; {typeof clip.createdAt === 'number' ? new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : clip.createdAt}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5">
                      {clip.file ? (
                        <a
                          href={clip.file.dataUrl}
                          download={clip.file.name || 'download'}
                          className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition flex items-center gap-1 text-xs cursor-pointer"
                          title="Download file"
                        >
                          <Download className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                        </a>
                      ) : (
                        <button
                          onClick={() => handleCopy(clip.id, clip.content)}
                          className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition flex items-center gap-1 text-xs cursor-pointer"
                          title="Copy to clipboard"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 max-h-95 overflow-y-auto sleek-scrollbar">
                    {isImage && clip.file ? (
                      <div className="space-y-2">
                        <div className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 group/img">
                          <img 
                            src={clip.file.dataUrl} 
                            alt={clip.file.name || 'Shared Image'} 
                            loading="lazy"
                            decoding="async"
                            className="w-full max-h-72 object-contain rounded-xl"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="truncate max-w-[70%] font-medium">{clip.file.name}</span>
                          <span>{formatFileSize(clip.file.size)}</span>
                        </div>
                      </div>
                    ) : isFile && clip.file ? (
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/50">
                          <FileText className="w-4 h-4" />
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
