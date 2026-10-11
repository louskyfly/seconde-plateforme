import { Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { db } from './lib/db';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Ideas from './pages/Ideas';
import Revisions from './pages/Revisions';
import Sheets from './pages/Sheets';
import Students from './pages/Students';
import Calendar from './pages/Calendar';
import Polls from './pages/Polls';
import Messages from './pages/Messages';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Layout from './components/Layout';
import './index.css';

function App() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    db.open().catch(console.error);
    setInitialized(true);
  }, []);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">Initialisation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/idees" element={<Ideas />} />
                <Route path="/revisions" element={<Revisions />} />
                <Route path="/fiches" element={<Sheets />} />
                <Route path="/eleves" element={<Students />} />
                <Route path="/calendrier" element={<Calendar />} />
                <Route path="/sondages" element={<Polls />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/parametres" element={<Settings />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </div>
  );
}

export default App;