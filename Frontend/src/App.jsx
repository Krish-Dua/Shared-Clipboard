import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Room from './pages/Room';
import { useState, useEffect } from 'react';

function App() {
  const [username,setUsername]= useState("")
  useEffect(() => {
    const user = localStorage.getItem("usernamee")
    if(user){
      setUsername(user)
    }
  }, []);
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home username={username} setUsername={setUsername} />} />
        <Route path="/room/:roomId" element={<Room username={username} setUsername={setUsername} />} />
      </Routes>
    </Router>
  );
}

export default App;
