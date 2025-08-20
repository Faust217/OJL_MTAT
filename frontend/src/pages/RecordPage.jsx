import React, { useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
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

  // Page notice
  const [notice, setNotice] = useState({ type: "", message: "" });
  const showNotice = (type, message, ms = 6000) => {
    setNotice({ type, message });
    if (ms) {
      clearTimeout(showNotice._t);
      showNotice._t = setTimeout(() => setNotice({ type: "", message: "" }), ms);
    }
  };

  const [showTS, setShowTS] = useState(false);

  const resetSessionUI = () => {
    try {
      deepfakeResults.forEach((f) => f?.imageUrl && URL.revokeObjectURL(f.imageUrl));
    } catch {}
    setTranscript([]);
    setSummary("");
    setSentiment([]);
    setDeepfakeResults([]);
    setSelectedFrameIndex(null);
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    audioChunksRef.current = [];
    setLoading(false);
  };

  const COLORS = ["#00C49F", "#FF6B6B", "#8884D8"];

  const sentimentChartData = sentiment.length
    ? [
        { name: "Positive", value: sentiment.filter((s) => s.sentiment === "positive").length },
        { name: "Neutral", value: sentiment.filter((s) => s.sentiment === "neutral").length },
        { name: "Negative", value: sentiment.filter((s) => s.sentiment === "negative").length },
      ]
    : [];

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

  const startRecording = async () => {
    resetSessionUI();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioCtxRef?.current && audioCtxRef.current.state !== "closed") {
      try {
        await audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
      mixedDestRef.current = null;
    }

    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (videoRef.current) videoRef.current.srcObject = screen;

      const sysTrack = screen.getAudioTracks()[0];
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ac;
      const dest = ac.createMediaStreamDestination();
      mixedDestRef.current = dest;

      const micSrc = ac.createMediaStreamSource(mic);
      micSrc.connect(dest);
      if (sysTrack) {
        const sysStream = new MediaStream([sysTrack]);
        const sysSrc = ac.createMediaStreamSource(sysStream);
        sysSrc.connect(dest);
      } else {
        showNotice("info", "Cannot detect system audio。If need to record audio，Please choose Chrome Tab and click “Share tab audio”。");
      }

      const mixedStream = dest.stream;
      const mr = new MediaRecorder(mixedStream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      if (ac.state === "suspended") {
        try {
          await ac.resume();
        } catch {}
      }
      mr.start();

      setIsRecording(true);
      startTimeRef.current = Date.now();
      captureIntervalRef.current = setInterval(captureAndAnalyzeFrame, 10000);

      showNotice("success", "Star recording。Notice：Select Chrome Tab and click “Share tab audio” can record system audio");
    } catch (err) {
      showNotice(
        "error",
        "Mic/Screen authorization failed. Please allow browser permissions. To record system audio, select the chrome tab and check share tab audio. "
      );
    }
  };

  const captureAndAnalyzeFrame = async () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    try {
      ctx.drawImage(video, 0, 0);
    } catch {
      return;
    }

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const form = new FormData();
      form.append("file", blob, "frame.jpg");
      try {
        const res = await axios.post("http://localhost:8000/analyze_frame", form);
        const secs = (Date.now() - startTimeRef.current) / 1000;
        const timeLabel = formatHMS(secs);
        const blobUrl = URL.createObjectURL(blob);
        setDeepfakeResults((prev) => [
          ...prev,
          {
            time: timeLabel,
            label: res.data.label,
            score: (res.data.score * 100).toFixed(1),
            imageBlob: blob,
            imageUrl: blobUrl,
          },
        ]);
      } catch (e) {
      }
    }, "image/jpeg");
  };

  const stopRecording = async () => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) return;

      mr.onstop = async () => {
        clearInterval(captureIntervalRef.current);
        if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        mr.stream.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size < 200 * 1024) {
          showNotice(
            "warning",
            "Audio is barely captured. To record system sound, select the Chrome tab and check 'Share tab audio' when you start sharing."
          );
        }

        const formData = new FormData();
        formData.append("file", audioBlob, "full_recording.webm");

        try {
          setLoading(true);
          const res = await axios.post("http://localhost:8000/transcribe_chunk", formData);
          const data = res.data;
          const rawTranscript = Array.isArray(data) ? data : data.transcript || [];
          const rawSentiment = Array.isArray(data) ? [] : data.sentiment || [];
          const summaryText = Array.isArray(data) ? "" : data.summary || "";

          const cleanedTranscript = (rawTranscript || []).filter(
            (s) => s && s.text && s.text.trim() && s.text.trim() !== "."
          );
          setTranscript(cleanedTranscript);

          const cleanedSentiment = cleanedTranscript.map((_, i) => rawSentiment[i]).filter(Boolean);
          setSentiment(cleanedSentiment);

          setSummary(summaryText);
          showNotice("success", "Complete analysis");
        } catch (err) {
          const detail = err?.response?.data?.detail;
          const msg =
            typeof detail === "string"
              ? detail
              : detail
              ? JSON.stringify(detail)
              : err?.message || "Unknown error";
          setTranscript([{ start: 0, end: 0, text: `⚠️ ${msg}` }]);
          setSummary("");
          setSentiment([]);
          showNotice("error", `Transcript / analysis failed : ${msg}`);
        } finally {
          setLoading(false);
        }

        if (audioCtxRef?.current && audioCtxRef.current.state !== "closed") {
          try {
            await audioCtxRef.current.close();
          } catch {}
          audioCtxRef.current = null;
          mixedDestRef.current = null;
        }
        setIsRecording(false);
        resolve();
      };

      mr.stop();
    });
  };

  const handleExportPDF = async () => {
    try {
      const sentimentEl = document.getElementById("sentiment-chart");
      let sentimentChartBase64 = null;
      if (sentimentEl) {
        const canvas = await html2canvas(sentimentEl);
        sentimentChartBase64 = canvas.toDataURL("image/png");
      }
      const deepfakeEl = document.getElementById("deepfake-chart");
      let deepfakeChartBase64 = null;
      if (deepfakeEl) {
        const canvas = await html2canvas(deepfakeEl);
        deepfakeChartBase64 = canvas.toDataURL("image/png");
      }

      const exportData = {
        summary: summary ? summary.split("\n").map((line, i) => ({ time: `S${i + 1}`, text: line })) : [],
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

      const res = await fetch("http://localhost:8000/generate_pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportData),
      });
      if (!res.ok) throw new Error("PDF generation failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "meeting_report.pdf";
      a.click();
      window.URL.revokeObjectURL(url);

      showNotice("success", "Report downloaded");
    } catch (e) {
      console.error("PDF export error:", e);
      showNotice("error", "Export PDF failed");
    }
  };

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
            color: "inherit",
          }}
          aria-label="Back to Home"
          title="Back to Home"
        >
          ⬅️ Back to Home
        </Link>

        <h2 style={{ textAlign: "center", fontSize: "1.8rem", marginBottom: "1.5rem", color: "#333" }}>
          🎥 Record & Analyze Meeting
        </h2>

        {/* Page notification */}
        {notice.message && (
          <div
            style={{
              margin: "0 auto 1rem",
              maxWidth: 900,
              padding: "10px 14px",
              borderRadius: 8,
              background:
                notice.type === "error"
                  ? "#fdecea"
                  : notice.type === "warning"
                  ? "#fff8e1"
                  : notice.type === "success"
                  ? "#e8f5e9"
                  : "#e3f2fd",
              border:
                notice.type === "error"
                  ? "1px solid #f44336"
                  : notice.type === "warning"
                  ? "1px solid #ff9800"
                  : notice.type === "success"
                  ? "1px solid #4caf50"
                  : "1px solid #2196f3",
              color: "#333",
            }}
            role="status"
          >
            {notice.message}
          </div>
        )}

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

        {/* Transcript + Sentiment */}
        {(transcript.length > 0 || sentiment.length > 0) && (
          <section id="ts-panel" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>📝</span> Transcript + Sentiment
              <button onClick={() => setShowTS((v) => !v)} style={{ marginLeft: 12 }}>
                {showTS ? "Hide" : "Show"}
              </button>
            </h3>

            {showTS && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
                <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: 14 }}>
                  {(transcript || []).map((seg, i) => (
                    <div key={i} style={{ marginBottom: 8, fontFamily: "ui-monospace, Menlo, Consolas" }}>
                      <strong>{formatRange(seg.start, seg.end)}:</strong>{" "}
                      {seg.text}{" "}
                      {sentiment[i] && (
                        <em style={{ color: "#666" }}>
                          → {sentiment[i].sentiment} ({(sentiment[i].score * 100).toFixed(1)}%)
                        </em>
                      )}
                    </div>
                  ))}
                </div>

                <div id="sentiment-chart" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PieChart width={320} height={240}>
                    <Pie data={sentimentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {sentimentChartData.map((e, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Summary */}
        {summary && (
          <section style={{ marginTop: "1.5rem" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>🧠</span> Summary
            </h3>
            <pre style={{ whiteSpace: "pre-wrap", background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: 14 }}>
{summary}
            </pre>
          </section>
        )}

        {/* Deepfake  */}
        {deepfakeResults.length > 0 && (
          <>
            <h3 style={{ marginTop: "1.5rem" }}>🕵️ Deepfake Snapshot Results</h3>
            <ul>
              {deepfakeResults.map((d, i) => (
                <li key={i}>
                  [{d.time}] ▶ {d.label} ({d.score}%)
                  &nbsp;<button onClick={() => setSelectedFrameIndex(i)}>🔍 View Frame</button>
                </li>
              ))}
            </ul>

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

            <section id="deepfake-chart" style={{ marginTop: "1rem" }}>
              <h3>🎥 Deepfake Detection Overview</h3>
              <p>Total Frames Captured: {deepfakeResults.length}</p>
              <p>Fake Frames Detected: {deepfakeFakeCount}</p>
              <p>
                Fake Percentage:{" "}
                {deepfakeResults.length ? ((deepfakeFakeCount / deepfakeResults.length) * 100).toFixed(2) : "0.00"}%
              </p>

              <PieChart width={320} height={240}>
                <Pie data={videoPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {videoPieData.map((e, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </section>
          </>
        )}

        {(transcript.length > 0 || deepfakeResults.length > 0) && (
          <div style={{ marginTop: "2rem", textAlign: "center" }}>
            <button onClick={handleExportPDF}>📄 Export PDF Report</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordPage;
