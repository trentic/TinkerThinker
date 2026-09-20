import { Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { Home } from './pages/Home'
import { CourseBuilder } from './pages/CourseBuilder'
import { RoundList } from './pages/RoundList'
import { RoundActive } from './pages/RoundActive'
import { Scorecard } from './pages/Scorecard'
import { Stats } from './pages/Stats'
import { Settings } from './pages/Settings'

function App() {
  return (
    <div className="min-h-screen pb-20">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/courses/new" element={<CourseBuilder />} />
        <Route path="/courses/:courseId/edit" element={<CourseBuilder />} />
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
