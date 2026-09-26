import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Clipboard, 
  Moon, 
  User, 
  Sparkles, 
  Dices, 
  LogIn, 
  ArrowRight,
  X
} from 'lucide-react';

export default function Home({ username, setUsername }) {
  const [createRoomId, setCreateRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState(username || '');
  const navigate = useNavigate();

  const toggleModal = () => {
    setNameInput(username || '');
    setIsModalOpen(!isModalOpen);
  };

  const handleSaveUsername = (e) => {
    e.preventDefault();
    if (nameInput.trim()) {
      setUsername(nameInput.trim());
      setIsModalOpen(false);
      localStorage.setItem("username", nameInput.trim());
    } 
  };

  const handleGenerateRandomId = () => {
    const randomNum = Math.floor(1000 + Math.random() * 999999);
    setCreateRoomId(`${randomNum}`);
  };

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if(!username){
      toggleModal();
      return;
    }
    navigate(`/room/${createRoomId.trim()}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if(!username){
      toggleModal();
      return;
    }
    if (!joinRoomId.trim()) return;
    navigate(`/room/${joinRoomId.trim()}`);
  };

  return (
    <div className="h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-y-auto lg:overflow-hidden transition-colors duration-200">
      {/* Simple Username Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {username ? 'Change Username' : 'Register Username'}
              </h2>
              <button
                type="button"
                onClick={toggleModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUsername} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter your name"
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={!nameInput.trim()}
                className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition cursor-pointer"
              >
                Save
              </button>
            </form>
          </div>
        </div>
      )}

      <header className="shrink-0 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-500/20">
              <Clipboard className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white">
                Shared Clipboard
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button 
              type="button"
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition cursor-default"
              title="Theme toggle (coming soon)"
            >
              <Moon className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={toggleModal} 
              className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 cursor-pointer"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-semibold text-xs border border-slate-300/60 dark:border-slate-700/60">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
               {username ? (<span className="text-sm font-medium rounded-full hidden sm:inline">
                 {username}
              </span>):(
              <button className="text-sm font-medium bg-blue-700 px-2 py-1 text-white rounded-full hidden sm:inline">
                 Register Username
              </button>)}
            </button> 
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center max-w-4xl w-full mx-auto px-4 sm:px-6 pt-2 pb-4 sm:pt-4 sm:pb-6">
        <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-2 sm:mb-3 leading-tight">
            Share clipboard snippets <br className="hidden sm:inline" />
            <span className="bg-linear-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              effortlessly with your team.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl mx-auto">
            Paste text, code snippets, or links to share instantly with your team. Everything syncs in real time and disappears when the room is closed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6 w-full">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
            
            <div>
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/50 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Create Room
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Start a new session and invite peers
                  </p>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
                Pick a custom room name or generate a random code to get started.
              </p>

              <form onSubmit={handleCreateRoom} className="space-y-3.5">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Room Name / ID
                    </label>
                    <span className={`text-[11px] font-medium ${createRoomId.length >= 8 ? 'text-amber-500 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                      {createRoomId.length}/8
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      maxLength={8}
                      value={createRoomId}
                      onChange={(e) => setCreateRoomId(e.target.value)}
                      placeholder="Enter room code"
                      className={`w-full pl-3 pr-24 py-2 bg-slate-50 dark:bg-slate-800/60 border rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 transition ${
                        createRoomId.length >= 8 
                          ? 'border-amber-400 dark:border-amber-500 focus:ring-amber-500/40 focus:border-amber-500' 
                          : 'border-slate-300 dark:border-slate-700 focus:ring-indigo-500/40 focus:border-indigo-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleGenerateRandomId}
                      className="absolute right-1 px-2.5 py-1 text-xs font-medium bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-600 shadow-2xs transition flex items-center gap-1 cursor-pointer"
                    >
                      <Dices className="w-3.5 h-3.5 text-indigo-500" />
                      Random
                    </button>
                  </div>
                  {createRoomId.length >= 8 && (
                    <p className="text-[11px] text-amber-500 font-medium mt-1">
                      Maximum 8 characters reached
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm rounded-xl shadow-xs shadow-indigo-600/20 transition flex items-center justify-center gap-2 group cursor-pointer"
                >
                  <span>Create Room</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </form>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full pointer-events-none" />

            <div>
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center border border-violet-100 dark:border-violet-900/50 shrink-0">
                  <LogIn className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Join Room
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Connect to an existing workspace
                  </p>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
                Enter the room code or custom room name shared by your teammate.
              </p>

              <form onSubmit={handleJoinRoom} className="space-y-3.5">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Room Code / ID
                    </label>
                    <span className={`text-[11px] font-medium ${joinRoomId.length >= 8 ? 'text-amber-500 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                      {joinRoomId.length}/8
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={8}
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                    placeholder="Enter room code"
                    className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 transition ${
                      joinRoomId.length >= 8
                        ? 'border-amber-400 dark:border-amber-500 focus:ring-amber-500/40 focus:border-amber-500'
                        : 'border-slate-300 dark:border-slate-700 focus:ring-violet-500/40 focus:border-violet-500'
                    }`}
                  />
                  {joinRoomId.length >= 8 && (
                    <p className="text-[11px] text-amber-500 font-medium mt-1">
                      Maximum 8 characters reached
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!joinRoomId.trim()}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 text-white font-semibold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Join Room</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      <footer className="shrink-0 border-t border-slate-200/80 dark:border-slate-800/80 py-3.5 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-1.5">
          <span>Shared Clipboard &bull; Instant Real-Time Sharing</span>
          <span>No sign-up required &bull; Auto-cleans on exit</span>
        </div>
      </footer>
    </div>
  );
}
