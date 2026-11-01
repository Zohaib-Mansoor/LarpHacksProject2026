import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import { SessionProvider, useSession } from './providers/SessionProvider';
import { ToastProvider } from './providers/ToastProvider';
import { TopBar } from './TopBar';
import { SmoothScroll } from './motion/SmoothScroll';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Account from './pages/Account';
import Leaderboard from './pages/Leaderboard';
import Play from './pages/Play';
import Setup from './pages/Setup';
import Demo from './pages/Demo';
import Room from './pages/Room';
import Results from './pages/Results';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import NotFound from './pages/NotFound';
import './styles/app.css';
import { GameConfigProvider } from './providers/GameConfigProvider';

function RequireAccount({children}: {children: React.ReactNode}) {
  const {user, ready} = useSession();
  if (!ready) return <p role="status">Loading your account…</p>;
  if (!user || user.isGuest) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <main id="main" key={location.pathname} className={location.pathname === '/' ? undefined : 'route-fade'}>
      <Routes location={location}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/account" element={<RequireAccount><Account /></RequireAccount>} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/play" element={<RequireAccount><Play /></RequireAccount>} />
        <Route path="/setup" element={<RequireAccount><Setup /></RequireAccount>} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/room/:code" element={<RequireAccount><Room /></RequireAccount>} />
        <Route path="/results/:code" element={<RequireAccount><Results /></RequireAccount>} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <GameConfigProvider>
        <ToastProvider>
          <BrowserRouter>
            <SmoothScroll />
            <a className="skip-link" href="#main">Skip to content</a>
            <TopBar />
            <AnimatedRoutes />
          </BrowserRouter>
        </ToastProvider>
        </GameConfigProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
