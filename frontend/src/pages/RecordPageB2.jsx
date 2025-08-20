import React, { useRef, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
// Charts & screenshot for embedding into PDF
import html2canvas from "html2canvas";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatHMS, formatRange } from "../utils/time";

const RecordPage = () => {
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const videoRef = useRef(null);
  const startTimeRef = useRef(0);
  const captureIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const mixedDestRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState("");
  const [sentiment, setSentiment] = useState([]);
  const [deepfakeResults, setDeepfakeResults] = useState([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(null);

  // Clean up previous session's UI + resources
  const resetSessionUI = () => {
    // revoke old frame blob URLs to free memory
    try {
      deepfakeResults.forEach(f => f?.imageUrl && URL.revokeObjectURL(f.imageUrl));
    } catch (_) {}

    setTranscript([]);
    setSummary("");
    setSentiment([]);
    setDeepfakeResults([]);
    setSelectedFrameIndex(null);

    // stop leftover interval if any
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    // stop any leftover media tracks in <video>
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }

    // reset chunks and flags
    audioChunksRef.current = [];
    setLoading(false);
  };

  // Colors for charts 
  const COLORS = ["#00C49F", "#FF6B6B", "#8884D8"];

  // Build Sentiment pie data from sentiment array
  const sentimentChartData = sentiment.length
    ? [
        { name: "Positive", value: sentiment.filter((s) => s.sentiment === "positive").length },
        { name: "Neutral",  value: sentiment.filter((s) => s.sentiment === "neutral").length },
        { name: "Negative", value: sentiment.filter((s) => s.sentiment === "negative").length },
      ]
    : [];

  // Build Deepfake pie data from deepfakeResults
  const deepfakeFakeCount = deepfakeResults.filter((d) =>
    String(d.label || "").toLowerCase().includes("fake")
  ).length;
  const deepfakeRealCount = Math.max(0, deepfakeResults.length - deepfakeFakeCount);
  const videoPieData = deepfakeResults.length
    ? [
        { name: "Fake Frames", value: deepfakeFakeCount },
        { name: "Real Frames", value: deepfakeRealCount },
      ]
    : [];

  // Start recording audio and attach display stream to <video> N also start periodic frame capture
  const startRecording = async () => {
    // clear previous run
    resetSessionUI();

    // If a previous recorder exists and is still active, stop it safely
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }

    // Close previous AudioContext if any
    if (audioCtxRef?.current && audioCtxRef.current.state !== "closed") {
      try { await audioCtxRef.current.close(); } catch (_) {}
      audioCtxRef.current = null;
      mixedDestRef.current = null;
    }
    try {
      // 1) Mic (with some basic voice-friendly constraints)
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      // 2) Screen + System audio  ← 在弹窗里选择「Chrome Tab」并勾选「Share tab audio」
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      // Show the shared screen in <video> (as before)
      if (videoRef.current) videoRef.current.srcObject = screen;

      // 3) Inspect if screen has an audio track
      const sysTracks = screen.getAudioTracks();
      console.log("screen audio tracks:", sysTracks.map(t => ({
        label: t.label, enabled: t.enabled, muted: t.muted, readyState: t.readyState
      })));

      // If a screen audio track exists, make sure it's enabled
      if (sysTracks[0]) {
        try { sysTracks[0].enabled = true; } catch (_) {}
      } else {
        // No system audio case — give a helpful hint
        alert(
          "No system audio detected from the shared screen.\n" +
          "Tips:\n" +
          "• Choose a specific Chrome Tab and check 'Share tab audio'.\n" +
          "• On macOS, system audio is generally available only for a shared Tab.\n" +
          "• On Windows, 'Entire screen' + 'Share system audio' can work."
        );
      }

      // 4) WebAudio: mix mic + system into ONE audio stream
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ac;
      const dest = ac.createMediaStreamDestination();
      mixedDestRef.current = dest;

      // Create sources
      const micSrc = ac.createMediaStreamSource(mic);
      micSrc.connect(dest);

      if (sysTracks[0]) {
        const sysStream = new MediaStream([sysTracks[0]]);
        const sysSrc = ac.createMediaStreamSource(sysStream);
        sysSrc.connect(dest);
      }

      // 5) Recorder records the MIXED stream (one unified track)
      const mixedStream = dest.stream;
      const mediaRecorder = new MediaRecorder(mixedStream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      // Some browsers require a user gesture to start/resume the context
      if (ac.state === "suspended") {
        try { await ac.resume(); } catch (_) {}
      }

      mediaRecorder.start(); // 可选：传 timeslice 5000 做分片

      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Keep your deepfake frame snapshots
      captureIntervalRef.current = setInterval(captureAndAnalyzeFrame, 10000);
    } catch (err) {
      alert(
        "Mic/Display permission error: " + err.message +
        "\nMake sure you select a Chrome Tab and check 'Share tab audio'."
      );
    }
  };

  // Grab a frame from the display <video>, send to /analyze_frame, append result to deepfakeResults
  const captureAndAnalyzeFrame = async () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const form = new FormData();
        form.append("file", blob, "frame.jpg");

        try {
          const res = await axios.post("http://localhost:8000/analyze_frame", form);
          const secs = (Date.now() - startTimeRef.current) / 1000;
          const timeLabel = formatHMS(secs);
          const blobUrl = URL.createObjectURL(blob);

          setDeepfakeResults((prev) => [
            ...prev, // keep existing frames
            {
              time: timeLabel,
              label: res.data.label,
              score: (res.data.score * 100).toFixed(1),
              imageBlob: blob,
              imageUrl: blobUrl,
            },
          ]);
        } catch (e) {
          console.error("Frame analysis error", e);
        }
      },
      "image/jpeg"
    );
  };

  // Stop recording, stop timers and streams, POST audio to /transcribe_chunk for transcript/summary/sentiment
const stopRecording = async () => {
  return new Promise((resolve) => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return;

    mediaRecorder.onstop = async () => {
      clearInterval(captureIntervalRef.current);

      // Stop display stream and audio stream tracks
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());

      // Combine recorded audio chunks and send to backend
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

      // quick size check (helps catch "system audio not shared")
      if (audioBlob.size < 200 * 1024) {
        alert(
          "It looks like no audio was captured. " +
          "Please enable 'Share system audio' when starting screen sharing."
        );
      }

      const formData = new FormData();
      formData.append("file", audioBlob, "full_recording.webm");

      try {
        setLoading(true);
        const res = await axios.post("http://localhost:8000/transcribe_chunk", formData);

        // be robust to both shapes (array early-return vs object)
        const data = res.data;
        const rawTranscript = Array.isArray(data) ? data : (data.transcript || []);
        const rawSentiment = Array.isArray(data) ? []   : (data.sentiment  || []);
        const summaryText  = Array.isArray(data) ? ""   : (data.summary    || "");

        // filter out blank / dot-only segments
        const cleanedTranscript = (rawTranscript || []).filter(
          (s) => s && s.text && s.text.trim() && s.text.trim() !== "."
        );
        setTranscript(cleanedTranscript);

        // keep sentiment aligned with cleaned transcript length
        const cleanedSentiment = cleanedTranscript.map((_, i) => rawSentiment[i]).filter(Boolean);
        setSentiment(cleanedSentiment);

        setSummary(summaryText);
      } catch (err) {
        setTranscript([
          {
            start: 0,
            end: 0,
            text: `⚠️ ${err.response?.data?.detail || err.message}`,
          },
        ]);
        setSummary("");
        setSentiment([]);
      } finally {
        setLoading(false);
      }

      if (audioCtxRef?.current && audioCtxRef.current.state !== "closed") {
        try { await audioCtxRef.current.close(); } catch (_) {}
        audioCtxRef.current = null;
        mixedDestRef.current = null;
      }
      setIsRecording(false);
      resolve();
    };

    mediaRecorder.stop();
  });
};


  // (Kept for safety; button removed from UI)
  const handleDownloadReport = () => {
    const report = {
      transcript,
      summary,
      sentiment,
      deepfake: deepfakeResults.map(({ time, label, score }) => ({ time, label, score })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meeting_report.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // -------------------- Export PDF --------------------
  // Capture both charts to base64 and send full payload to /generate_pdf
  const handleExportPDF = async () => {
    try {
      // Capture Sentiment Pie
      const sentimentEl = document.getElementById("sentiment-chart");
      let sentimentChartBase64 = null;
      if (sentimentEl) {
        const canvas = await html2canvas(sentimentEl);
        sentimentChartBase64 = canvas.toDataURL("image/png");
      }

      // Capture Deepfake Pie
      const deepfakeEl = document.getElementById("deepfake-chart");
      let deepfakeChartBase64 = null;
      if (deepfakeEl) {
        const canvas = await html2canvas(deepfakeEl);
        deepfakeChartBase64 = canvas.toDataURL("image/png");
      }

      // Build export payload 
      const exportData = {
        summary: summary
          ? summary.split("\n").map((line, i) => ({ time: `S${i + 1}`, text: line }))
          : [],
        transcript: (transcript || []).map((t, i) => ({
          time: formatRange(t.start, t.end),
          text: t.text,
          sentiment:
            sentiment[i] && sentiment[i].sentiment && sentiment[i].score !== undefined
              ? `${sentiment[i].sentiment} (${(sentiment[i].score * 100).toFixed(1)}%)`
              : "unknown",
        })),
        deepfake: {
          total_frames: deepfakeResults.length,
          fake_frames: deepfakeFakeCount,
          fake_percentage: deepfakeResults.length
            ? ((deepfakeFakeCount / deepfakeResults.length) * 100).toFixed(2)
            : "0.00",
        },
        sentiment_chart: sentimentChartBase64,
        deepfake_chart: deepfakeChartBase64,
      };

      // Request backend to generate PDF
      const res = await fetch("http://localhost:8000/generate_pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportData),
      });

      if (!res.ok) throw new Error("PDF generation failed");

      // Trigger browser download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "meeting_report.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF export error:", e);
      alert("PDF export failed ❌");
    }
  };

  // -------------------- UI --------------------
    return (
    <div style={{ backgroundColor: "#f7f9fa", minHeight: "100vh", padding: "2rem" }}>
      <div
        style={{
          maxWidth: "900px",
          margin: "auto",
          backgroundColor: "white",
          padding: "2rem",
          borderRadius: "10px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
        }}
      >
        {/* Back navigation (same style as UploadPage) */}
        <Link
          to="/"
          style={{
            backgroundColor: "#e0e0e0",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "6px",
            cursor: "pointer",
            marginBottom: "1rem",
            display: "inline-block",
            textDecoration: "none",
            color: "inherit"
          }}
          aria-label="Back to Home"
          title="Back to Home"
        >
          ⬅️ Back to Home
        </Link>

        <h2 style={{ textAlign: "center", fontSize: "1.8rem", marginBottom: "1.5rem", color: "#333" }}>
          🎥 Record & Analyze Meeting
        </h2>

        <div style={{ textAlign: "center" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", maxWidth: "720px", maxHeight: "420px", background: "#000", borderRadius: 8 }}
          />
        </div>

        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <button onClick={isRecording ? stopRecording : startRecording} style={{ padding: "0.75rem 1.1rem" }}>
            {isRecording ? "⏹ Stop & Analyze" : "▶️ Start Recording"}
          </button>
        </div>

        {loading && <p style={{ textAlign: "center" }}>⏳ Processing audio…</p>}

        <div style={{ textAlign: "left", maxWidth: "700px", margin: "1rem auto" }}>
          {/* Transcript */}
          <h3>📝 Transcript</h3>
          <ul>
            {transcript.map((seg, i) => (
              <li key={i}>
                {formatRange(seg.start, seg.end)}: {seg.text}
              </li>
            ))}
          </ul>

          {/* Summary */}
          {summary && (
            <>
              <h3>🧠 Summary</h3>
              <p>{summary}</p>
            </>
          )}

          {/* Sentiment list */}
          {sentiment.length > 0 && (
            <>
              <h3>💬 Sentiment Analysis</h3>
              <ul>
                {sentiment.map((seg, i) => (
                  <li key={i}>
                    {new Date(seg.start * 1000).toISOString().substr(14, 5)} -{" "}
                    {new Date(seg.end * 1000).toISOString().substr(14, 5)}: {seg.sentiment} (
                    {(seg.score * 100).toFixed(1)}%)
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Sentiment Pie Chart (for PDF capture) */}
          {sentimentChartData.length > 0 && (
            <section id="sentiment-chart" style={{ marginTop: "1rem" }}>
              <h3>🧠 Sentiment Overview</h3>
              <PieChart width={300} height={250}>
                <Pie data={sentimentChartData} dataKey="value" cx={150} cy={120} innerRadius={50} outerRadius={90} label>
                  {sentimentChartData.map((e, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </section>
          )}

          {/* Deepfake list */}
          {deepfakeResults.length > 0 && (
            <>
              <h3>🕵️ Deepfake Snapshot Results</h3>
              <ul>
                {deepfakeResults.map((d, i) => (
                  <li key={i}>
                    [{d.time}] ▶ {d.label} ({d.score}%)
                    &nbsp;
                    <button onClick={() => setSelectedFrameIndex(i)}>🔍 View Frame</button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Deepfake frame preview */}
          {selectedFrameIndex !== null && (
            <div style={{ marginTop: "1rem" }}>
              <h4>Frame Preview</h4>
              <img
                src={deepfakeResults[selectedFrameIndex].imageUrl}
                alt="frame"
                style={{ maxWidth: "90%", border: "1px solid #ccc", borderRadius: 6 }}
              />
              <br />
              <button onClick={() => setSelectedFrameIndex(null)}>Close</button>
            </div>
          )}

          {/* Deepfake Pie Chart (for PDF capture) */}
          {deepfakeResults.length > 0 && (
            <section id="deepfake-chart" style={{ marginTop: "1rem" }}>
              <h3>🎥 Deepfake Detection Overview</h3>
              <p>Total Frames Captured: {deepfakeResults.length}</p>
              <p>Fake Frames Detected: {deepfakeFakeCount}</p>
              <p>
                Fake Percentage:{" "}
                {deepfakeResults.length ? ((deepfakeFakeCount / deepfakeResults.length) * 100).toFixed(2) : "0.00"}%
              </p>

              <PieChart width={300} height={250}>
                <Pie data={videoPieData} dataKey="value" cx={150} cy={120} innerRadius={50} outerRadius={90} label>
                  {videoPieData.map((e, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </section>
          )}

          {/* Export PDF button */}
          {(transcript.length > 0 || deepfakeResults.length > 0) && (
            <div style={{ marginTop: "2rem", textAlign: "center" }}>
              <button onClick={handleExportPDF}>📄 Export PDF Report</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordPage;
