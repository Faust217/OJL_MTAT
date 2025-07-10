import { useState, useRef } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function MeetingAnalyzer() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState('');
  const [sentiment, setSentiment] = useState(null);
  const [videoResult, setVideoResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showSentiment, setShowSentiment] = useState(false);
  const sentimentChartRef = useRef(null);
  const videoChartRef = useRef(null);

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
      if (resultType === "audio") {
        setTranscript(res.data.transcript);
        setSummary(res.data.summary);
        setSentiment(res.data.sentiment);
      } else if (resultType === "video") {
        setVideoResult({
          framesChecked: res.data.frames_checked,
          fakeFrames: res.data.fake_frames
        });
      } else {
        alert("Unexpected response type.");
      }
    } catch (err) {
      console.error(err);
      alert("❌ Upload or analysis failed.");
    } finally {
      setLoading(false);
      setSentimentLoading(false);
    }
  };

  const sentimentData = sentiment ? [
    { name: 'Positive', value: sentiment.filter(s => s.sentiment === 'positive').length },
    { name: 'Neutral', value: sentiment.filter(s => s.sentiment === 'neutral').length },
    { name: 'Negative', value: sentiment.filter(s => s.sentiment === 'negative').length },
  ] : [];

  const pieData = videoResult ? [
    { name: 'Fake Frames', value: videoResult.fakeFrames },
    { name: 'Real Frames', value: videoResult.framesChecked - videoResult.fakeFrames }
  ] : [];

  const COLORS = ['#ff6b6b', '#4caf50', '#8884d8'];

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="file"
          accept="audio/*,video/*"
          onChange={e => setFile(e.target.files[0])}
          style={{ padding: '0.4rem', marginRight: '1rem' }}
        />
        <button
          onClick={handleUpload}
          style={{ padding: '0.5rem 1.5rem', fontSize: '1rem', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Upload & Analyze
        </button>
      </div>

      {loading && <p style={{ marginTop: '1rem' }}>⏳ Analyzing file, please wait...</p>}

      {transcript.length > 0 && (
        <div style={{ marginTop: '2rem', textAlign: 'left', border: '1px solid #ddd', padding: '1rem', borderRadius: '8px' }}>
          <h3>📄 Transcript</h3>
          <button onClick={() => setShowTranscript(!showTranscript)}>{showTranscript ? 'Hide Transcript' : 'Show Transcript'}</button>
          {showTranscript && transcript.map((seg, idx) => (
            <p key={idx}><strong>🕒 {formatTime(seg.start)} - {formatTime(seg.end)}:</strong> {seg.text}</p>
          ))}
        </div>
      )}

      {summary && (
        <div style={{ marginTop: '2rem', textAlign: 'left', border: '1px solid #ddd', padding: '1rem', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
          <h3>📌 Summary</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{summary}</pre>
        </div>
      )}

      {sentiment && !sentimentLoading && (
        <div style={{ marginTop: '2rem', textAlign: 'left', border: '1px solid #ccc', padding: '1rem', borderRadius: '8px', backgroundColor: '#e0f7fa' }}>
          <h3>🧠 Sentiment Analysis</h3>
          <button onClick={() => setShowSentiment(!showSentiment)}>{showSentiment ? 'Hide Details' : 'Show Details'}</button>
          {showSentiment && (
            <div>
              {sentiment.map((seg, idx) => (
                <p key={idx}><strong>{formatTime(seg.start)} - {formatTime(seg.end)}:</strong> {seg.sentiment} ({seg.score.toFixed(2)})</p>
              ))}
              <div ref={sentimentChartRef} style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                <PieChart width={300} height={250}>
                  <Pie data={sentimentData} cx={150} cy={120} innerRadius={50} outerRadius={90} dataKey="value" label>
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </div>
            </div>
          )}
        </div>
      )}

      {videoResult && (
        <div style={{ marginTop: '2rem', textAlign: 'left', border: '2px solid #ffc107', padding: '1rem', borderRadius: '8px', backgroundColor: '#fff8e1' }}>
          <h3>🎥 Deepfake Video Analysis</h3>
          <p><strong>Total Frames Analyzed:</strong> {videoResult.framesChecked}</p>
          <p><strong>Fake Frames Detected:</strong> {videoResult.fakeFrames}</p>
          <p><strong>Fake Percentage:</strong> {(videoResult.fakeFrames / videoResult.framesChecked * 100).toFixed(2)}%</p>

          <div ref={videoChartRef} style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
            <PieChart width={300} height={250}>
              <Pie data={pieData} cx={150} cy={120} innerRadius={50} outerRadius={90} dataKey="value" label>
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </div>

          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#333' }}>
            ⚠️ This result is for reference only. Please verify the authenticity of the meeting participants yourself. The goal is to reduce potential risks and raise user awareness.
          </p>
        </div>
      )}

      {(summary || sentiment || videoResult) && (
        <div style={{ marginTop: '2rem' }}>
          <button
            onClick={async () => {
              const doc = new jsPDF();
              let y = 10;
              doc.setFontSize(14);
              doc.text("📌 Meeting Summary", 10, y);
              y += 10;
              doc.setFontSize(10);
              doc.text(summary, 10, y);

              if (sentimentChartRef.current) {
                const canvas = await html2canvas(sentimentChartRef.current);
                const img = canvas.toDataURL("image/png");
                doc.addPage();
                doc.text("🧠 Sentiment Chart", 10, 10);
                doc.addImage(img, "PNG", 10, 20, 180, 100);
              }

              if (videoChartRef.current) {
                const canvas = await html2canvas(videoChartRef.current);
                const img = canvas.toDataURL("image/png");
                doc.addPage();
                doc.text("🎥 Deepfake Chart", 10, 10);
                doc.addImage(img, "PNG", 10, 20, 180, 100);
              }

              const fileName = file ? `${file.name.replace(/\.[^/.]+$/, "")}_Report.pdf` : 'meeting_report.pdf';
              doc.save(fileName);
            }}
            style={{ padding: '0.6rem 2rem', fontSize: '1rem', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            ⬇️ Export PDF Report
          </button>
        </div>
      )}
    </div>
  );
}

export default MeetingAnalyzer;
