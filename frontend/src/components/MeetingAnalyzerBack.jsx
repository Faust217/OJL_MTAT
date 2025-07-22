import { useState } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function MeetingAnalyzer() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState('');
  const [sentiment, setSentiment] = useState(null);
  const [videoResult, setVideoResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [mergedView, setMergedView] = useState(true);

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file!");
    setLoading(true);
    setTranscript([]);
    setSummary('');
    setSentiment(null);
    setVideoResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('http://localhost:8000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const resultType = res.data.type;

      if (resultType === "audio" || resultType === "video") {
        setTranscript(res.data.transcript || []);
        setSummary(res.data.summary || '');
        setSentiment(res.data.sentiment || null);
        setVideoResult(res.data.frames_checked ? {
          framesChecked: res.data.frames_checked,
          fakeFrames: res.data.fake_frames
        } : null);
      } else {
        alert("Unexpected response type.");
      }
    } catch (err) {
      console.error(err);
      alert("❌ Upload or analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#ff6b6b', '#4caf50', '#8884d8'];

  const sentimentData = sentiment ? [
    { name: 'Positive', value: sentiment.filter(s => s.sentiment === 'positive').length },
    { name: 'Neutral', value: sentiment.filter(s => s.sentiment === 'neutral').length },
    { name: 'Negative', value: sentiment.filter(s => s.sentiment === 'negative').length }
  ] : [];

  const videoPieData = videoResult ? [
    { name: 'Fake Frames', value: videoResult.fakeFrames },
    { name: 'Real Frames', value: videoResult.framesChecked - videoResult.fakeFrames }
  ] : [];

  const handleExport = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Meeting Analysis Report", 20, 20);

    if (summary) {
      doc.text("Summary:", 20, 30);
      doc.setFontSize(12);
      doc.text(summary, 20, 38, { maxWidth: 170 });
      doc.setFontSize(14);
    }

    if (sentiment) {
      doc.text("\nSentiment Segments:", 20, doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 80);
      autoTable(doc, {
        startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : 90,
        head: [['Time', 'Sentiment', 'Score']],
        body: sentiment.map(seg => [
          `${formatTime(seg.start)} - ${formatTime(seg.end)}`,
          seg.sentiment,
          seg.score.toFixed(2)
        ])
      });
    }

    doc.save((file?.name?.split('.')[0] || 'meeting') + '_Report.pdf');
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: 'auto' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>🎙 Meeting Analyzer</h1>

      <input
        type="file"
        accept="audio/*,video/*"
        onChange={e => setFile(e.target.files[0])}
        style={{ marginBottom: '1rem' }}
      />
      <br />

      <button onClick={handleUpload} style={{ padding: '0.5rem 1.5rem', fontSize: '1rem', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
        Upload & Analyze
      </button>

      {loading && <p style={{ marginTop: '1rem' }}>⏳ Analyzing file, please wait...</p>}

      {transcript.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2>📝 Transcription + Sentiment</h2>
          <button onClick={() => setShowTranscript(!showTranscript)} style={{ marginBottom: '1rem' }}>
            {showTranscript ? '⬆️ Hide' : '⬇️ Show'}
          </button>

          {showTranscript && (
            <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
              {transcript.map((seg, idx) => {
                const senti = sentiment?.[idx];
                return (
                  <p key={idx} style={{ marginBottom: '0.8rem' }}>
                    <strong>🕒 {formatTime(seg.start)} - {formatTime(seg.end)}</strong>: {seg.text}
                    {senti && (
                      <span> → <strong>{senti.sentiment}</strong> ({senti.score.toFixed(2)})</span>
                    )}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}

      {summary && (
        <div style={{ marginTop: '2rem' }}>
          <h2>📌 Summary</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{summary}</pre>
        </div>
      )}

      {sentimentData.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2>🧠 Sentiment Overview</h2>
          <PieChart width={300} height={250}>
            <Pie
              data={sentimentData}
              cx={150}
              cy={120}
              innerRadius={50}
              outerRadius={90}
              fill="#8884d8"
              paddingAngle={3}
              dataKey="value"
              label
            >
              {sentimentData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </div>
      )}

      {videoResult && (
        <div style={{ marginTop: '2rem' }}>
          <h2>🎥 Deepfake Detection</h2>
          <p>Total Frames Analyzed: {videoResult.framesChecked}</p>
          <p>Fake Frames Detected: {videoResult.fakeFrames}</p>
          <p>Fake Percentage: {(videoResult.fakeFrames / videoResult.framesChecked * 100).toFixed(2)}%</p>

          <PieChart width={300} height={250}>
            <Pie
              data={videoPieData}
              cx={150}
              cy={120}
              innerRadius={50}
              outerRadius={90}
              fill="#8884d8"
              paddingAngle={3}
              dataKey="value"
              label
            >
              {videoPieData.map((entry, index) => (
                <Cell key={`cell-video-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
          <p style={{ fontSize: '0.9rem', color: '#666' }}>⚠️ This result is for reference only. Please verify the authenticity of participants yourself.</p>
        </div>
      )}

      {(summary || sentiment || videoResult) && (
        <div style={{ marginTop: '2rem' }}>
          <button onClick={handleExport} style={{ padding: '0.5rem 1.5rem', fontSize: '1rem', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            ⬇️ Export Report
          </button>
        </div>
      )}
    </div>
  );
}

export default MeetingAnalyzer;
