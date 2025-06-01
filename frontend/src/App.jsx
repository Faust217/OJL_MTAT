import { useState } from 'react';
import axios from 'axios';

function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);  

  const handleUpload = async () => {
    if (!file) return alert("Please select a file!");

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true); 
      const response = await axios.post('http://localhost:8000/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setTranscript(response.data.text);
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setLoading(false); 
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>AI Meeting Transcriber</h1>
      <input type="file" accept="audio/*" onChange={e => setFile(e.target.files[0])} />
      <button onClick={handleUpload} disabled={loading}>
        {loading ? 'Transcribing...' : 'Upload & Transcribe'}
      </button>
      <div style={{ marginTop: '1rem' }}>
        <h2>Transcription Result:</h2>
        <p>{loading ? 'Please wait while the model processes...' : transcript}</p>
      </div>
    </div>
  );
}

export default App;
