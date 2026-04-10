import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PlayerProvider } from "./components/PlayerContext";
import { LoginPage } from "./pages/LoginPage";
import { TracksPage } from "./pages/TracksPage";
import { TrackDetailPage } from "./pages/TrackDetailPage";
import { UploadPage } from "./pages/UploadPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { PlaylistDetailPage } from "./pages/PlaylistDetailPage";

export function App() {
  return (
    <PlayerProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/tracks" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/releases" element={<Navigate to="/tracks" replace />} />
          <Route path="/tracks" element={<TracksPage />} />
          <Route path="/tracks/:id" element={<TrackDetailPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
        </Routes>
      </Layout>
    </PlayerProvider>
  );
}
