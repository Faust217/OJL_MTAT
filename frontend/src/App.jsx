import { Link } from 'react-router-dom';

function App() {
  return (
    <div style={{ textAlign: 'center', paddingTop: '10%' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>🎙 AI Meeting Transcriber</h1>
      <Link to="/upload">
        <button style={{ margin: '1rem', padding: '1rem 2rem', fontSize: '1.1rem' }}>📤 Upload</button>
      </Link>
      <Link to="/record">
        <button style={{ margin: '1rem', padding: '1rem 2rem', fontSize: '1.1rem' }}>🎥 Record</button>
      </Link>
    </div>
  );
}

export default App;
