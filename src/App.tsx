import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { Home } from './pages/Home'
import { CourseBuilder } from './pages/CourseBuilder'
import { CoursePreview } from './pages/CoursePreview'
import { RoundList } from './pages/RoundList'
import { RoundActive } from './pages/RoundActive'
import { Scorecard } from './pages/Scorecard'
import { Stats } from './pages/Stats'
import { Settings } from './pages/Settings'
import { isDriveConnected, pullBackupFromDrive } from './lib/googleDrive'

function App() {
  useEffect(() => {
    // Best-effort, silent, and non-blocking: local data must always work
    // even if Drive is unreachable, the token needs a fresh interactive
    // sign-in (common on iOS Safari), or the user isn't connected at all.
    if (isDriveConnected()) {
      pullBackupFromDrive(false).catch(() => {})
    }
  }, [])

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/courses/new" element={<CourseBuilder />} />
        <Route path="/courses/:courseId/edit" element={<CourseBuilder />} />
        <Route path="/courses/:courseId/preview" element={<CoursePreview />} />
        <Route path="/rounds" element={<RoundList />} />
        <Route path="/round/:roundId" element={<RoundActive />} />
        <Route path="/round/:roundId/scorecard" element={<Scorecard />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <BottomNav />
    </div>
  )
}

export default App
