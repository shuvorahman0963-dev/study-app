import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/noto-sans-bengali/400.css'
import '@fontsource/noto-sans-bengali/600.css'
import '@fontsource/noto-sans-bengali/700.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Toaster from './components/Toast'
import Home from './pages/Home'
import Papers, { PaperExam } from './pages/Papers'
import Problems, { Practice, ProblemPage } from './pages/Problems'
import Progress from './pages/Progress'
import Quiz from './pages/Quiz'
import Timer from './pages/Timer'
import Weak from './pages/Weak'
import Review from './pages/Review'
import Settings from './pages/Settings'
import SubjectPage from './pages/SubjectPage'
import Subjects from './pages/Subjects'
import TopicPage from './pages/TopicPage'
import { requestPersistentStorage } from './lib/install'
import { applyTheme } from './theme'

applyTheme()
requestPersistentStorage()

// HashRouter so deep links work on GitHub Pages without server config.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="subject/:id" element={<SubjectPage />} />
          <Route path="topic/:id" element={<TopicPage />} />
          <Route path="review" element={<Review />} />
          <Route path="quiz" element={<Quiz />} />
          <Route path="weak" element={<Weak />} />
          <Route path="timer" element={<Timer />} />
          <Route path="progress" element={<Progress />} />
          <Route path="problems/:id" element={<Problems />} />
          <Route path="problem/:id" element={<ProblemPage />} />
          <Route path="practice" element={<Practice />} />
          <Route path="papers/:id" element={<Papers />} />
          <Route path="paper-exam/:id" element={<PaperExam />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
    <Toaster />
  </StrictMode>,
)
