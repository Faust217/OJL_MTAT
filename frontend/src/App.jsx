import { useState } from 'react';
import axios from 'axios';

function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [sentiment, setSentiment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sentimentLoading, setSentimentLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert("Please select a file!");
    setLoading(true);
    setTranscript('');
    setSummary('');
    setSentiment(null); 

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Transcription
      const transRes = await axios.post('http://localhost:8000/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setTranscript(transRes.data.text);

      // Summarization
      const sumRes = await axios.post('http://localhost:8000/summarize', {
        text: transRes.data.text
      });
      setSummary(sumRes.data.summary);

      // Sentiment Analysis
      setSentimentLoading(true);
      const sentiRes = await axios.post('http://localhost:8000/sentiment', {
        text: transRes.data.text
      });
      console.log("Sentiment result:", sentiRes.data);
      setSentiment(sentiRes.data);
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setLoading(false);
      setSentimentLoading(false);
    }
  };

  return (
    <div id="app" style={{ padding: '2rem', fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: 'auto' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>🎙 AI Meeting Transcriber</h1>

      <input
        type="file"
        accept="audio/*"
        onChange={e => setFile(e.target.files[0])}
        style={{ marginBottom: '1rem' }}
      />
      <br />

      <button
        onClick={handleUpload}
        style={{
          padding: '0.5rem 1.5rem',
          fontSize: '1rem',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer'
        }}
      >
        Upload & Analyze
      </button>

      {loading && <p style={{ marginTop: '1rem' }}>⏳ Transcribing and summarizing, please wait...</p>}
      {sentimentLoading && <p style={{ marginTop: '1rem' }}>🧠 Analyzing sentiment...</p>}

      {transcript && (
        <div className="result-box" style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
          <h2>📝 Transcription Result</h2>
          <p>{transcript}</p>
        </div>
      )}

      {summary && (
        <div className="result-box" style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
          <h2>📌 Summarization Result</h2>
          <p>{summary}</p>
        </div>
      )}

      {sentiment && !sentimentLoading && (
        <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#e0f7fa' }}>
          <h2>🧠 Sentiment Analysis Result</h2>
          <ul>
            {Object.entries(sentiment).map(([label, count]) => (
              <li key={label}><strong>{label}</strong>: {count}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
