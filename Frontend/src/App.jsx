import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import Home from './pages/Home';
import Room from './pages/Room';
import { useState, useEffect } from 'react';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  
  return (
    <Router>
      <ScrollToTop />
      <ToastContainer theme="colored" />
      <Routes>
        <Route path="/" element={<Home username={username} setUsername={setUsername} />} />
        <Route path="/room/:roomId" element={<Room username={username} setUsername={setUsername} />} />
      </Routes>
    </Router>
  );
}

export default App;
