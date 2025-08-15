import { useState } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

export default function MeetingAnalyzer() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState('');
  const [sentiment, setSentiment] = useState([]);
  const [videoResult, setVideoResult] = useState(null);
  const [frameDetails, setFrameDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const COLORS = ['#ff6b6b', '#4caf50', '#8884d8'];

  const formatTime = secs => {
    const m = String(Math.floor(secs/60)).padStart(2,'0');
    const s = String(Math.floor(secs%60)).padStart(2,'0');
    return `${m}:${s}`;
  };

  const sentimentData = sentiment.length
    ? [
        { name:'Positive', value: sentiment.filter(s=>s.sentiment==='positive').length },
        { name:'Neutral',  value: sentiment.filter(s=>s.sentiment==='neutral').length },
        { name:'Negative', value: sentiment.filter(s=>s.sentiment==='negative').length },
      ]
    : [];

  const videoPieData = videoResult
    ? [
        { name:'Fake Frames', value: videoResult.fakeFrames },
        { name:'Real Frames', value: videoResult.framesChecked - videoResult.fakeFrames }
      ]
    : [];

  const handleUpload = async () => {
    if (!file) return alert("Please select file！");
    setLoading(true);
    setTranscript([]); setSummary(''); setSentiment([]); setVideoResult(null); setFrameDetails([]);

    const form = new FormData();
    form.append('file', file);
    try {
      const res = await axios.post('http://localhost:8000/analyze', form, {
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
        }
      } else {
        alert("Unknown return type");
      }
    } catch(e) {
      console.error(e);
      alert("Failed to analysis ❌");
    } finally {
      setLoading(false);
    }
  };

const captureChartAsBase64 = async () => {
  const chartElement = document.getElementById("pie-chart");
  if (!chartElement) return null;

  const canvas = await html2canvas(chartElement);
  return canvas.toDataURL("image/png");
};


const handleExport = async () => {
  try {
    // 1️⃣ 截图情绪分析饼图
    const chartElement = document.getElementById("pie-chart");
    let chartImage = null;
    if (chartElement) {
      const canvas = await html2canvas(chartElement);
      chartImage = canvas.toDataURL("image/png");
    }

    // 2️⃣ 截图 Deepfake 检测饼图
    const deepfakeElement = document.getElementById("deepfake-chart");
    let deepfakeChartImage = null;
    if (deepfakeElement) {
      const canvas = await html2canvas(deepfakeElement);
      deepfakeChartImage = canvas.toDataURL("image/png");
    }

    // 3️⃣ 整合导出内容
    const finalAnalysisResult = {
      summary: summary ? summary.split('\n').map((line, i) => ({
        time: `S${i + 1}`, text: line
      })) : [],
      transcript: transcript.map((t, i) => ({
        time: `${formatTime(t.start)} - ${formatTime(t.end)}`,
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

    // 4️⃣ 发送请求生成 PDF
    const res = await fetch("http://localhost:8000/generate_pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalAnalysisResult)
    });

    if (!res.ok) throw new Error("PDF generation failed");

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (file?.name?.split('.')[0] || 'meeting') + '_report.pdf';
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Failed to export PDF:", e);
    alert("Export failed ❌");
  }
};


  return (
    <div style={{padding:'2rem',maxWidth:800,margin:'auto',fontFamily:'Arial'}}>
      <h1>🎙 Meeting Analyzer</h1>
      <input 
        type="file" accept="audio/*,video/*"
        onChange={e=>setFile(e.target.files[0])}
        style={{margin:'1rem 0'}}
      />
      <button onClick={handleUpload} disabled={loading}
        style={{padding:'0.5rem 1rem',background:'#4caf50',color:'#fff',border:'none',borderRadius:6}}
      >{loading?'Analyzing…':'Upload & Analyze'}</button>

      {/* 文字转录 + 情感 */}
      {transcript.length>0 && (
        <section style={{marginTop:20}}>
          <h2>📝 Transcript + Sentiment</h2>
          <button onClick={()=>setShowTranscript(!showTranscript)}>
            {showTranscript?'Hide':'Show'}
          </button>
          {showTranscript && transcript.map((seg,i)=>(
            <p key={i}>
              <strong>{formatTime(seg.start)} - {formatTime(seg.end)}</strong>: {seg.text}
              {sentiment[i] && ` → ${sentiment[i].sentiment} (${(sentiment[i].score*100).toFixed(1)}%)`}
            </p>
          ))}
        </section>
      )}

      {/* 摘要 */}
      {summary && (
        <section style={{marginTop:20}}>
          <h2>📌 Summary</h2>
          <pre style={{whiteSpace:'pre-wrap'}}>{summary}</pre>
        </section>
      )}

      {/* 情感概览 */}
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
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </section>
      )}


      {/* Deepfake 概览 */}
      {videoResult && (
        <section  id="deepfake-chart" style={{marginTop:20}}>
          <h2>🎥 Deepfake Detection</h2>
          <p>Total Frames: {videoResult.framesChecked}</p>
          <p>Fake Frames: {videoResult.fakeFrames}</p>
          <p>Fake %: {((videoResult.fakeFrames/videoResult.framesChecked)*100).toFixed(2)}%</p>
          <PieChart width={300} height={250}>
            <Pie data={videoPieData} dataKey="value" cx={150} cy={120}
                 innerRadius={50} outerRadius={90} label>
              {videoPieData.map((e,i)=><Cell key={i} fill={COLORS[i]}/>)}
            </Pie>
            <Tooltip/><Legend/>
          </PieChart>

          {/* 帧列表 */}
          <div style={{marginTop:20,display:'flex',flexWrap:'wrap',gap:12}}>
            {frameDetails.map((f,i)=>(
              <div key={i} style={{textAlign:'center',cursor:'pointer'}}>
                <img 
                  src={`http://localhost:8000${f.image_url}`} 
                  alt={`frame-${i}`} width={120} style={{border:'1px solid #ccc'}}
                  onClick={()=>window.open(`http://localhost:8000${f.image_url}`)}
                />
                <div>{f.label} ({f.score}%)</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 导出 */}
      {(summary||sentimentData.length||videoResult) && (
        <div style={{ marginTop: 20, display: 'flex', gap: '1rem' }}>
          <button onClick={handleExport}
            style={{ padding: '0.5rem 1rem', background: '#2196F3', color: '#fff', border: 'none', borderRadius: 6 }}
          >⬇️ Export Report</button>

          {videoResult && (
            <button onClick={() => window.open("http://localhost:8000/export_frames_zip")}
              style={{ padding: '0.5rem 1rem', background: '#FF9800', color: '#fff', border: 'none', borderRadius: 6 }}
            >📁 Export Frames ZIP</button>
          )}
        </div>
      )}
    </div>
  );
}
