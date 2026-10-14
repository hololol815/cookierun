import RunnerGame from './components/RunnerGame.jsx'
import './App.css'

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>Cookie Run</h1>
        <p>장애물을 피해 끝없이 달리는 횡스크롤 러너</p>
      </header>
      <RunnerGame />
    </main>
  )
}

export default App
