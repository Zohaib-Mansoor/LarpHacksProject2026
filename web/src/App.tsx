import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import { SessionProvider } from './providers/SessionProvider';
import { ToastProvider } from './providers/ToastProvider';
import { TopBar } from './TopBar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Account from './pages/Account';
import Leaderboard from './pages/Leaderboard';
import Play from './pages/Play';
import Room from './pages/Room';
import Results from './pages/Results';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import NotFound from './pages/NotFound';

export default function App() {
  return <ThemeProvider><SessionProvider><ToastProvider>
    <BrowserRouter>
      <a className="skip-link" href="#main">Skip to content</a>
      <TopBar />
      <main id="main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/account" element={<Account />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/play" element={<Play />} />
          <Route path="/room/:code" element={<Room />} />
          <Route path="/results/:code" element={<Results />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </BrowserRouter>
  </ToastProvider></SessionProvider></ThemeProvider>;
}
