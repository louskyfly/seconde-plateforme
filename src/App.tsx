import { Routes, Route, Navigate } from 'react-router-dom';
import { StudentLayout } from './components/layout/StudentLayout';
import Home from './pages/student/Home';
import Announcements from './pages/student/Announcements';
import Ideas from './pages/student/Ideas';
import MessageDelegate from './pages/student/MessageDelegate';
import Polls from './pages/student/Polls';
import Calendar from './pages/student/Calendar';
import Resources from './pages/student/Resources';
import Projects from './pages/student/Projects';
import DelegateLogin from './pages/delegate/Login';
import DelegateLayout from './components/layout/DelegateLayout';
import DelegateDashboard from './pages/delegate/Dashboard';
import DelegateMessages from './pages/delegate/ManageMessages';
import DelegateIdeas from './pages/delegate/ManageIdeas';
import DelegatePolls from './pages/delegate/ManagePolls';
import DelegateAnnouncements from './pages/delegate/ManageAnnouncements';
import DelegateCalendar from './pages/delegate/ManageCalendar';
import DelegateResources from './pages/delegate/ManageResources';
import DelegateProjects from './pages/delegate/ManageProjects';
import DelegateSettings from './pages/delegate/Settings';
import { AuthProvider } from './hooks/useAuth';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Student space */}
        <Route element={<StudentLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/informations" element={<Announcements />} />
          <Route path="/idees" element={<Ideas />} />
          <Route path="/messagerie" element={<MessageDelegate />} />
          <Route path="/sondages" element={<Polls />} />
          <Route path="/calendrier" element={<Calendar />} />
          <Route path="/ressources" element={<Resources />} />
          <Route path="/projets" element={<Projects />} />
        </Route>

        {/* Delegate space */}
        <Route path="/gestion" element={<DelegateLogin />} />
        <Route path="/gestion/:token" element={<DelegateLayout />}>
          <Route index element={<DelegateDashboard />} />
          <Route path="messages" element={<DelegateMessages />} />
          <Route path="idees" element={<DelegateIdeas />} />
          <Route path="sondages" element={<DelegatePolls />} />
          <Route path="annonces" element={<DelegateAnnouncements />} />
          <Route path="calendrier" element={<DelegateCalendar />} />
          <Route path="ressources" element={<DelegateResources />} />
          <Route path="projets" element={<DelegateProjects />} />
          <Route path="parametres" element={<DelegateSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
