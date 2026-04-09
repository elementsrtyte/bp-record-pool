import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PlayerProvider } from "./components/PlayerContext";
import { AccountPage } from "./pages/AccountPage";
import { HomePage } from "./pages/HomePage";
import { TracksPage } from "./pages/TracksPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { PlaylistPage } from "./pages/PlaylistPage";

export function App() {
  return (
    <PlayerProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/releases" element={<Navigate to="/tracks" replace />} />
          <Route path="/releases/:id" element={<Navigate to="/tracks" replace />} />
          <Route path="/tracks" element={<TracksPage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/playlists/:id" element={<PlaylistPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </Layout>
    </PlayerProvider>
  );
}
