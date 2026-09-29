import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { StudentLayout } from './components/layout/StudentLayout';
import DelegateLayout from './components/layout/DelegateLayout';
import { AuthProvider } from './hooks/useAuth';
import { PageLoader } from './components/ui/PageLoader';
import { MaintenanceGate } from './components/MaintenanceGate';

const Home = lazy(() => import('./pages/student/Home'));
const Announcements = lazy(() => import('./pages/student/Announcements'));
const Ideas = lazy(() => import('./pages/student/Ideas'));
const MessageDelegate = lazy(() => import('./pages/student/MessageDelegate'));
const Polls = lazy(() => import('./pages/student/Polls'));
const Calendar = lazy(() => import('./pages/student/Calendar'));
const Resources = lazy(() => import('./pages/student/Resources'));
const Projects = lazy(() => import('./pages/student/Projects'));
const StudentList = lazy(() => import('./pages/student/StudentList'));
const Chat = lazy(() => import('./pages/student/Chat'));
const Sheets = lazy(() => import('./pages/student/Sheets'));
const DelegateLogin = lazy(() => import('./pages/delegate/Login'));
const DelegateDashboard = lazy(() => import('./pages/delegate/Dashboard'));
const DelegateMessages = lazy(() => import('./pages/delegate/ManageMessages'));
const DelegateIdeas = lazy(() => import('./pages/delegate/ManageIdeas'));
const DelegatePolls = lazy(() => import('./pages/delegate/ManagePolls'));
const DelegateAnnouncements = lazy(() => import('./pages/delegate/ManageAnnouncements'));
const DelegateCalendar = lazy(() => import('./pages/delegate/ManageCalendar'));
const DelegateResources = lazy(() => import('./pages/delegate/ManageResources'));
const DelegateProjects = lazy(() => import('./pages/delegate/ManageProjects'));
const DelegateStudents = lazy(() => import('./pages/delegate/ManageStudents'));
const DelegateChat = lazy(() => import('./pages/delegate/ManageChat'));
const DelegateSheets = lazy(() => import('./pages/delegate/ManageSheets'));
const DelegateSettings = lazy(() => import('./pages/delegate/Settings'));

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <MaintenanceGate>
          <Routes>
            {/* Student space */}
            <Route element={<StudentLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/informations" element={<Announcements />} />
              <Route path="/idees" element={<Ideas />} />
              <Route path="/messagerie" element={<MessageDelegate />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/fiches" element={<Sheets />} />
              <Route path="/sondages" element={<Polls />} />
              <Route path="/calendrier" element={<Calendar />} />
              <Route path="/ressources" element={<Resources />} />
              <Route path="/projets" element={<Projects />} />
              <Route path="/classe" element={<StudentList />} />
            </Route>

            {/* Delegate space */}
            <Route path="/gestion" element={<DelegateLogin />} />
            <Route path="/gestion/:token" element={<DelegateLayout />}>
              <Route index element={<DelegateDashboard />} />
              <Route path="messages" element={<DelegateMessages />} />
              <Route path="chat" element={<DelegateChat />} />
              <Route path="idees" element={<DelegateIdeas />} />
              <Route path="sondages" element={<DelegatePolls />} />
              <Route path="annonces" element={<DelegateAnnouncements />} />
              <Route path="calendrier" element={<DelegateCalendar />} />
              <Route path="ressources" element={<DelegateResources />} />
              <Route path="fiches" element={<DelegateSheets />} />
              <Route path="projets" element={<DelegateProjects />} />
              <Route path="classe" element={<DelegateStudents />} />
              <Route path="parametres" element={<DelegateSettings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MaintenanceGate>
      </Suspense>
    </AuthProvider>
  );
}