import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { socket } from '../socket';
import UsernameModal from '../components/UsernameModal';
import { 
  Clipboard, 
  Moon, 
  Sun,
  User, 
  Copy, 
  Check, 
  Send, 
  LogOut, 
  Link as LinkIcon, 
  Share2,
  ExternalLink
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

export default function Room({ username, setUsername }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [clips, setClips] = useState([]);
  const [newContent, setNewContent] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [usersOnline, setUsersOnline] = useState(0);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

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
    });

    socket.on("receive-clip", (clip) => {
      setClips((prev) => [clip, ...prev]);
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
        theme: theme,
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
  }, [roomId, username, theme, navigate]);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 relative">
      <UsernameModal 
        isOpen={!username} 
        username="" 
        onSave={handleSaveUsername} 
        onClose={() => navigate('/')} 
      />

      <div className={`flex-1 flex flex-col transition-all duration-200 ${!username ? 'pointer-events-none select-none blur-xs opacity-50' : ''}`}>
        <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span  className="flex items-center gap-2 text-slate-900 dark:text-white font-bold tracking-tight hover:opacity-80 transition">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-500/20">
                  <Clipboard className="w-4 h-4" />
                </div>
                <span className="hidden sm:inline text-sm font-bold">Shared Clipboard</span>
              </span>

              <span className="text-slate-300 dark:text-slate-700">/</span>

              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg">
                <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                  #{roomId}
                </span>
                <button
                  onClick={handleCopyRoomLink}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded transition cursor-pointer"
                  title="Copy Room Link"
                >
                  {copiedRoomLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="hidden md:flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/50 dark:border-emerald-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{usersOnline} Online</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                type="button"
                className="p-1.5 sm:p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition cursor-pointer"
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

              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-semibold text-xs border border-indigo-200 dark:border-indigo-800">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:inline">
                  {username}
                </span>
              </div>

              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200/60 dark:border-red-800/60 transition cursor-pointer"
                title="Leave Room"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Leave</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <form onSubmit={handlePostClip} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="flex-1 relative">
              <textarea
                value={newContent}
                disabled={!username}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Paste your text, code snippet, or link here to share with the room..."
                rows={1}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 resize-none sleek-scrollbar transition font-sans min-h-10.5 disabled:opacity-50 disabled:cursor-not-allowed"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePostClip(e);
                  }
                }}
              />
            </div>
            <button
              type="submit"
              disabled={!username || !newContent.trim()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm rounded-xl shadow-xs shadow-indigo-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Share Clip</span>
            </button>
          </form>
        </div>

        <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
          {clips.map((clip) => {
            const isCopied = copiedId === clip.id;
            const clipType = getClipType(clip.content);

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
                  </div>
                </div>

                <div className="p-3.5 max-h-95 overflow-y-auto sleek-scrollbar">
                  {clipType === 'code' ? (
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
      </main>
      </div>
    </div>
  );
}
