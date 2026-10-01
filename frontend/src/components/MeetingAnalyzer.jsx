import { useState } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import { formatHMS, formatRange } from "../utils/time";
import { apiUrl, downloadResponseBlob, readApiError } from "../config/api";

const SUPPORTED_UPLOAD_EXTENSIONS = ["mp3", "wav", "mp4", "avi", "mov"];


export default function MeetingAnalyzer() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState('');
  const [sentiment, setSentiment] = useState([]);
  const [videoResult, setVideoResult] = useState(null);
  const [frameDetails, setFrameDetails] = useState([]);
  const [frameSetId, setFrameSetId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const [notice, setNotice] = useState({ type: '', message: '' });
  const showNotice = (type, message, ms = 6000) => {
    setNotice({ type, message });
    if (ms) {
      clearTimeout(showNotice._t);
      showNotice._t = setTimeout(() => setNotice({ type: '', message: '' }), ms);
    }
  };

  // Colors for charts (Positive / Neutral / Negative)
  const COLORS = ['#4caf50', '#8884d8', '#ff6b6b'];

  // Build data for Sentiment Pie Chart
  const sentimentData = sentiment.length
    ? [
        { name:'Positive', value: sentiment.filter(s=>s.sentiment==='positive').length },
        { name:'Neutral',  value: sentiment.filter(s=>s.sentiment==='neutral').length },
        { name:'Negative', value: sentiment.filter(s=>s.sentiment==='negative').length },
      ]
    : [];

  // Build data for Deepfake Pie Chart
  const videoPieData = videoResult
    ? [
        { name:'Fake Frames', value: videoResult.fakeFrames },
        { name:'Real Frames', value: videoResult.framesChecked - videoResult.fakeFrames }
      ]
    : [];

  // -------------------- Upload & Analyze --------------------
  const handleUpload = async () => {
    if (!file) {
      showNotice('warning', 'Please select a file to analyze.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(extension)) {
      showNotice('warning', 'Supported formats: MP3, WAV, MP4, AVI, and MOV.');
      return;
    }
    setLoading(true);

    // Reset previous results
    setTranscript([]);
    setSummary('');
    setSentiment([]);
    setVideoResult(null);
    setFrameDetails([]);
    setFrameSetId(null);

    const form = new FormData();
    form.append('file', file); 
    try {
      const res = await axios.post(apiUrl('/analyze'), form, {
        headers: { 'Content-Type':'multipart/form-data' }
      });
      const d = res.data;
      if (d.type==='audio' || d.type==='video') {
        setTranscript(d.transcript||[]);
        setSummary(d.summary||'');
        setSentiment(d.sentiment||[]);
        if (d.type==='video') {
          setVideoResult({
            framesChecked: d.frames_checked,
            fakeFrames: d.fake_frames
          });
          setFrameDetails(d.frame_details||[]);
          setFrameSetId(typeof d.frame_set_id === 'string' ? d.frame_set_id : null);
        }
        showNotice('success', 'Analysis completed.');
      } else {
        showNotice('error', 'Unknown return type.');
      }
    } catch(e) {
      console.error(e);
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : 'Failed to analyze.');
      showNotice('error', msg);
    } finally {
      setLoading(false);
    }
  };

  // -------------------- Export Report as PDF (via backend) --------------------
  const handleExport = async () => {
    try {
      // Capture sentiment chart
      const chartElement = document.getElementById("pie-chart");
      let chartImage = null;
      if (chartElement) {
        const canvas = await html2canvas(chartElement);
        chartImage = canvas.toDataURL("image/png");
      }

      // Capture deepfake chart
      const deepfakeElement = document.getElementById("deepfake-chart");
      let deepfakeChartImage = null;
      if (deepfakeElement) {
        const canvas = await html2canvas(deepfakeElement);
        deepfakeChartImage = canvas.toDataURL("image/png");
      }

      // Compose final result
      const finalAnalysisResult = {
        summary: summary ? summary.split('\n').map((line, i) => ({
          time: `S${i + 1}`, text: line
        })) : [],
        transcript: transcript.map((t, i) => ({
          time: formatRange(t.start, t.end),
          text: t.text,
          sentiment:
            sentiment[i] && sentiment[i].sentiment && sentiment[i].score !== undefined
              ? `${sentiment[i].sentiment} (${(sentiment[i].score * 100).toFixed(1)}%)`
              : "unknown"
        })),
        deepfake: videoResult ? {
          total_frames: videoResult.framesChecked,
          fake_frames: videoResult.fakeFrames,
          fake_percentage: ((videoResult.fakeFrames / videoResult.framesChecked) * 100).toFixed(2)
        } : null,
        sentiment_chart: chartImage,
        deepfake_chart: deepfakeChartImage
      };

      const res = await fetch(apiUrl("/generate_pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalAnalysisResult)
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "PDF generation failed."));
      }

      await downloadResponseBlob(
        res,
        (file?.name?.replace(/\.[^.]+$/, '') || 'meeting') + '_report.pdf'
      );

      showNotice('success', 'Report downloaded.');
    } catch (e) {
      console.error("Failed to export PDF:", e);
      showNotice('error', e?.message || 'Export failed.');
    }
  };

  const handleFramesExport = async () => {
    if (!frameSetId) {
      showNotice('warning', 'Analyze a video before exporting frames.');
      return;
    }

    try {
      const res = await fetch(
        apiUrl(`/export_frames_zip?frame_set_id=${encodeURIComponent(frameSetId)}`)
      );
      if (!res.ok) {
        throw new Error(await readApiError(res, "Frames export failed."));
      }
      await downloadResponseBlob(res, `frames_${frameSetId}.zip`);
      showNotice('success', 'Frames ZIP downloaded.');
    } catch (e) {
      console.error("Failed to export frames:", e);
      showNotice('error', e?.message || 'Frames export failed.');
    }
  };

  // -------------------- Main UI Rendering --------------------
  return (
    <div style={{padding:'2rem',maxWidth:800,margin:'auto',fontFamily:'Arial'}}>
      <h1>🎙 Meeting Analyzer</h1>

      {/* Page notification */}
      {notice.message && (
        <div
          style={{
            margin: '0 0 1rem',
            padding: '10px 14px',
            borderRadius: 8,
            background:
              notice.type === 'error' ? '#fdecea' :
              notice.type === 'warning' ? '#fff8e1' :
              notice.type === 'success' ? '#e8f5e9' : '#e3f2fd',
            border:
              notice.type === 'error' ? '1px solid #f44336' :
              notice.type === 'warning' ? '1px solid #ff9800' :
              notice.type === 'success' ? '1px solid #4caf50' : '1px solid #2196f3',
            color: '#333'
          }}
          role="status"
        >
          {notice.message}
        </div>
      )}

      <input
        type="file" accept=".mp3,.wav,.mp4,.avi,.mov"
        onChange={e=>{
          setFile(e.target.files[0] || null);
          setFrameSetId(null);
        }}
        style={{margin:'1rem 0'}}
      />

      <button
        onClick={handleUpload}
        disabled={loading}
        style={{padding:'0.5rem 1rem',background:'#4caf50',color:'#fff',border:'none',borderRadius:6}}
      >
        {loading ? 'Analyzing…' : 'Upload & Analyze'}
      </button>

      {/* Transcript + Sentiment */}
      {transcript.length>0 && (
        <section style={{marginTop:20}}>
          <h2>📝 Transcript + Sentiment</h2>
          <button onClick={()=>setShowTranscript(!showTranscript)}>
            {showTranscript ? 'Hide' : 'Show'}
          </button>
          {showTranscript && transcript.map((seg,i)=>(
            <p key={i}>
              <strong>{formatRange(seg.start, seg.end)}</strong>: {seg.text}
              {sentiment[i] && ` → ${sentiment[i].sentiment} (${(sentiment[i].score*100).toFixed(1)}%)`}
            </p>
          ))}
        </section>
      )}

      {/* Summary */}
      {summary && (
        <section style={{marginTop:20}}>
          <h2>📌 Summary</h2>
          <pre style={{whiteSpace:'pre-wrap'}}>{summary}</pre>
        </section>
      )}

      {/* Sentiment Pie Chart */}
      {sentimentData.length > 0 && (
        <section id="pie-chart" style={{marginTop: 20}}>
          <h2>🧠 Sentiment Overview</h2>
          <PieChart width={300} height={250}>
            <Pie
              data={sentimentData}
              dataKey="value"
              cx={150}
              cy={120}
              innerRadius={50}
              outerRadius={90}
              label
            >
              {sentimentData.map((e, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </section>
      )}

      {/* Deepfake Detection Pie Chart */}
      {videoResult && (
        <section id="deepfake-chart" style={{marginTop:20}}>
          <h2>🎥 Deepfake Detection</h2>
          <p>Total Frames: {videoResult.framesChecked}</p>
          <p>Fake Frames: {videoResult.fakeFrames}</p>
          <p>Fake %: {((videoResult.fakeFrames/videoResult.framesChecked)*100).toFixed(2)}%</p>
          <PieChart width={300} height={250}>
            <Pie data={videoPieData} dataKey="value" cx={150} cy={120}
                 innerRadius={50} outerRadius={90} label>
              {videoPieData.map((e,i)=><Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
            </Pie>
            <Tooltip/><Legend/>
          </PieChart>

          {/* Frame Thumbnails */}
          <div style={{marginTop:20,display:'flex',flexWrap:'wrap',gap:12}}>
            {frameDetails.map((f,i)=>(
              <div key={i} style={{textAlign:'center',cursor:'pointer'}}>
                <img
                  src={apiUrl(f.image_url)}
                  alt={`frame-${i}`} width={120} style={{border:'1px solid #ccc'}}
                  onClick={()=>window.open(apiUrl(f.image_url))}
                />
                <div>{f.label} ({f.score}%)</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Export Buttons */}
      {(summary || sentimentData.length || videoResult) && (
        <div style={{ marginTop: 20, display: 'flex', gap: '1rem' }}>
          <button
            onClick={handleExport}
            style={{ padding: '0.5rem 1rem', background: '#2196F3', color: '#fff', border: 'none', borderRadius: 6 }}
          >
            ⬇️ Export Report
          </button>

          {videoResult && (
            <button
              onClick={handleFramesExport}
              disabled={!frameSetId}
              style={{ padding: '0.5rem 1rem', background: '#FF9800', color: '#fff', border: 'none', borderRadius: 6 }}
            >
              📁 Export Frames ZIP
            </button>
          )}
        </div>
      )}
    </div>
  );
}
